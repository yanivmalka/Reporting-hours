import { useCallback, useState } from 'react';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Linking, Modal, Share, StyleSheet, View } from 'react-native';
import { Text } from '../components/Text';
import { Button } from '../components/Button';
import { PaymentDialog } from '../components/PaymentDialog';
import { TextField } from '../components/TextField';
import { usePayBasis } from '../lib/payBasis';
import { loadProfile, type Profile } from '../lib/profile';
import { taxPercentOf, workplaceAt } from '../lib/workplaces';
import { Screen } from '../components/Screen';
import { useToast } from '../components/Toast';
import { ACADEMIC_HOUR_MINUTES } from '../lib/academic';
import { loadCourses } from '../lib/courses';
import { dateRange, shortDate } from '../lib/dashboard';
import {
  buildPayrollReport,
  expectedPayment,
  grossAmount,
  netAmount,
  loadPayrollStatus,
  payrollBody,
  payrollMailto,
  payrollSubject,
  periodStartingAt,
  periodTitle,
  statusKey,
  updatePayrollStatus,
  type PayrollReport,
  type PayrollStatus,
} from '../lib/payroll';
import { loadReports } from '../lib/reports';
import { formatShekels, hasTravelCost } from '../lib/travel';
import { formatDateWithHebrew, formatISODate } from '../lib/time';
import { hebrewDate } from '../lib/hebrewDate';
import { loadWorkplaces } from '../lib/workplaces';
import { TEXT_RIGHT } from '../theme/align';
import { useTheme } from '../theme/ThemeContext';
import { useThemedStyles } from '../theme/useThemedStyles';
import { radius, spacing, type AppColors } from '../theme/colors';

const academic = (m: number) => Math.round((m / ACADEMIC_HOUR_MINUTES) * 100) / 100;
const hm = (m: number) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
const WEEKDAYS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];
const weekday = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return WEEKDAYS[new Date(y, m - 1, d).getDay()];
};

/** דוח שכר חודשי למקום עבודה: תצוגה מקדימה, יצירת מייל, שיתוף וסימון כנשלח. */
export default function PayrollReportScreen() {
  const router = useRouter();
  const styles = useThemedStyles(makeStyles);
  const { colors } = useTheme();
  const { showToast } = useToast();
  const params = useLocalSearchParams<{ wp: string; start: string }>();
  const [report, setReport] = useState<PayrollReport | null>(null);
  const [status, setStatus] = useState<PayrollStatus>({});
  const [missing, setMissing] = useState(false);
  const { basis } = usePayBasis();
  const [profile, setProfile] = useState<Profile | undefined>(undefined);
  /** דיאלוג ביטול דוח שנשלח — עם סיבה */
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [payOpen, setPayOpen] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      Promise.all([
        loadWorkplaces(),
        loadReports(),
        loadCourses(),
        loadPayrollStatus(),
        loadProfile(),
      ]).then(
        ([workplaces, reports, courses, st, prof]) => {
          if (!active) return;
          setProfile(prof);
          const w = workplaces.find((x) => x.id === params.wp);
          if (!w || !params.start) {
            setMissing(true);
            return;
          }
          const period = periodStartingAt(w, params.start);
          const own = st[statusKey(w.id, period.start)] ?? {};
          setReport(buildPayrollReport(w, period, reports, courses, basis, own.redeemedMinutes ?? 0));
          setStatus(own);
        },
      );
      return () => {
        active = false;
      };
    }, [params.wp, params.start, basis]),
  );

  if (missing) {
    return (
      <Screen>
        <Text style={styles.subtitle}>הדוח לא נמצא.</Text>
      </Screen>
    );
  }
  if (!report) {
    return (
      <Screen scroll={false}>
        <View style={styles.center}>
          <ActivityIndicator color={colors.brand} />
        </View>
      </Screen>
    );
  }

  const { workplace, period } = report;
  const closed = period.end < new Date().toISOString().slice(0, 10);

  async function setSent(sent: boolean) {
    const map = await updatePayrollStatus(workplace.id, period.start, { sentAt: Date.now() });
    setStatus(map[statusKey(workplace.id, period.start)] ?? {});
    if (sent) showToast('הדוח סומן כנשלח — הדיווחים בחודש זה נעולים לעריכה');
  }

  /** ביטול דוח שנשלח — חובה לציין סיבה; פותח את הדיווחים לעריכה. */
  async function cancelSent() {
    const reason = cancelReason.trim();
    if (!reason) return;
    const map = await updatePayrollStatus(workplace.id, period.start, {
      sentAt: undefined,
      cancellations: [...(status.cancellations ?? []), { at: Date.now(), reason }],
    });
    setStatus(map[statusKey(workplace.id, period.start)] ?? {});
    setCancelOpen(false);
    setCancelReason('');
    showToast('הדוח בוטל — אפשר לערוך את הדיווחים ולשלוח מחדש');
  }

  async function savePayment(date: string, amount: number) {
    const map = await updatePayrollStatus(workplace.id, period.start, { paidAt: date, paidAmount: amount });
    setStatus(map[statusKey(workplace.id, period.start)] ?? {});
    setPayOpen(false);
    showToast('התשלום עודכן');
  }

  async function clearPayment() {
    const map = await updatePayrollStatus(workplace.id, period.start, {
      paidAt: undefined,
      paidAmount: undefined,
    });
    setStatus(map[statusKey(workplace.id, period.start)] ?? {});
    setPayOpen(false);
  }

  async function createEmail() {
    const url = payrollMailto(report as PayrollReport, profile);
    try {
      await Linking.openURL(url);
      const map = await updatePayrollStatus(workplace.id, period.start, { generatedAt: Date.now() });
      setStatus(map[statusKey(workplace.id, period.start)] ?? {});
    } catch {
      showToast('לא נמצאה תוכנת מייל במכשיר — אפשר להשתמש ב"שיתוף"');
    }
  }

  async function share() {
    try {
      await Share.share({
        title: payrollSubject(report as PayrollReport),
        message: `${payrollSubject(report as PayrollReport)}\n\n${payrollBody(report as PayrollReport, profile)}`,
      });
      const map = await updatePayrollStatus(workplace.id, period.start, { generatedAt: Date.now() });
      setStatus(map[statusKey(workplace.id, period.start)] ?? {});
    } catch {
      // המשתמש ביטל
    }
  }

  const empty = report.groups.length === 0;
  const termsNow = workplaceAt(workplace, period.end);
  const tax = taxPercentOf(termsNow);
  const expected = expectedPayment(workplace, period, status);
  const rateText =
    report.paymentType === 'monthly'
      ? `משכורת חודשית ${report.rates.map((r) => formatShekels(r)).join(' / ')}`
      : `${report.rates.map((r) => formatShekels(r)).join(' / ')} לשעה${
          basis === 'academic' ? ' אקדמית' : ''
        }`;

  return (
    <Screen>
      <Stack.Screen options={{ title: 'דוח שכר' }} />

      <View style={styles.header}>
        <Text style={styles.title}>{workplace.name}</Text>
        <Text style={styles.subtitle}>
          {periodTitle(period)} · {dateRange(period.start, period.end, true)}
        </Text>
        <Text
          style={[
            styles.status,
            status.sentAt ? styles.statusSent : closed ? styles.statusPending : null,
          ]}
        >
          {status.sentAt
            ? `✓ נשלח ב־${formatDateWithHebrew(new Date(status.sentAt).toISOString().slice(0, 10), false)}`
            : status.generatedAt
              ? 'נוצר מייל — טרם סומן כנשלח'
              : closed
                ? `לא נשלח עד היום האחרון לדיווח (${shortDate(period.end)}) — התשלום יידחה לחודש הבא`
                : period.daysToPayday <= 1
                  ? 'היום האחרון לדיווח שכר — יש לשלוח היום'
                  : `יום אחרון לדיווח: ${shortDate(period.end)} · עוד ${period.daysToPayday - 1} ימים`}
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>נמען</Text>
        {workplace.payrollEmail ? (
          <Text style={styles.email}>{workplace.payrollEmail}</Text>
        ) : (
          <Text style={styles.warn}>לא הוגדר מייל לשכר</Text>
        )}
        {(workplace.ccEmails ?? []).length > 0 ? (
          <Text style={styles.cc}>העתק: {(workplace.ccEmails ?? []).join(', ')}</Text>
        ) : null}
        <Button
          label={workplace.payrollEmail ? 'עריכת כתובות' : 'הגדרת מייל לשכר'}
          variant="secondary"
          onPress={() => router.push({ pathname: '/workplace-form', params: { id: workplace.id } })}
        />
      </View>

      {empty ? (
        <Text style={styles.subtitle}>אין דיווחים בחודש הזה.</Text>
      ) : (
        report.groups.map((g) => (
          <View key={g.name} style={styles.card}>
            <View style={styles.groupHead}>
              <Text style={styles.groupName}>{g.name}</Text>
              <Text style={styles.groupHours}>{academic(g.netMinutes)} שע׳ אקד׳</Text>
            </View>
            <Text style={styles.cc}>
              {g.sessions.length} מפגשים · {hm(g.netMinutes)} שעות נטו
            </Text>
            {g.sessions.map((s) => (
              <View key={`${s.date}${s.start}`} style={styles.session}>
                <View style={styles.sessionDateBox}>
                  <Text style={styles.sessionDate}>
                    {weekday(s.date)} {formatISODate(s.date).slice(0, 5)}
                  </Text>
                  <Text style={styles.sessionHeb}>{hebrewDate(s.date, false)}</Text>
                </View>
                <Text style={styles.sessionTime}>
                  {`⁦${s.start}–${s.end}⁩`}
                  {s.breakMinutes > 0 ? ` · הפסקה ${s.breakMinutes}` : ''}
                </Text>
                <Text style={styles.sessionHours}>{academic(s.netMinutes)}</Text>
              </View>
            ))}
          </View>
        ))
      )}

      {report.redeemedMinutes > 0 ? (
        <View style={styles.card}>
          <View style={styles.groupHead}>
            <Text style={styles.groupName}>פדיון דקות מצטברות</Text>
            <Text style={styles.groupHours}>{academic(report.redeemedMinutes)} שע׳ אקד׳</Text>
          </View>
          <Text style={styles.cc}>{report.redeemedMinutes} דק׳ מהמונה המצטבר נכללו בדוח</Text>
        </View>
      ) : null}

      <View style={styles.totals}>
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>סה״כ שעות</Text>
          <Text style={styles.totalValue}>
            {academic(report.netMinutes)} אקד׳ · {hm(report.netMinutes)} נטו
          </Text>
        </View>
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>ימי עבודה</Text>
          <Text style={styles.totalValue}>{report.days}</Text>
        </View>
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>סה״כ נסיעות</Text>
          <Text style={styles.totalValue}>
            {report.travel > 0 || hasTravelCost(termsNow) ? formatShekels(report.travel) : 'אין'}
          </Text>
        </View>
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>תעריף</Text>
          <Text style={styles.totalValue}>{rateText}</Text>
        </View>
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>שכר</Text>
          <Text style={styles.totalValue}>{formatShekels(Math.round(report.pay))}</Text>
        </View>
        <View style={styles.totalRow}>
          <Text style={styles.totalBig}>סכום לתשלום</Text>
          <Text style={styles.totalBig}>{formatShekels(grossAmount(report))}</Text>
        </View>
        {tax > 0 ? (
          <Text style={styles.totalNote}>
            בניכוי מס {tax}% ≈ {formatShekels(netAmount(report))} · התעריף לא מופיע במייל
          </Text>
        ) : (
          <Text style={styles.totalNote}>התעריף לא מופיע במייל הנשלח</Text>
        )}
      </View>

      {status.sentAt ? (
        <View style={styles.card}>
          <Text style={styles.label}>תשלום</Text>
          <Text style={[styles.email, status.paidAt ? styles.statusSent : null]}>
            {status.paidAt
              ? `✓ שולם ${formatShekels(status.paidAmount ?? 0)} ב־${formatDateWithHebrew(status.paidAt, false)}`
              : `טרם שולם · צפוי עד ${formatDateWithHebrew(expected, false)}`}
          </Text>
          <Button
            label={status.paidAt ? 'עריכת התשלום' : 'סימון כשולם'}
            variant="secondary"
            onPress={() => setPayOpen(true)}
          />
        </View>
      ) : null}

      {status.cancellations?.length ? (
        <View style={styles.card}>
          <Text style={styles.label}>ביטולים קודמים</Text>
          {status.cancellations.map((c) => (
            <Text key={c.at} style={styles.cc}>
              {formatDateWithHebrew(new Date(c.at).toISOString().slice(0, 10), false)} — {c.reason}
            </Text>
          ))}
        </View>
      ) : null}

      <Button label="יצירת מייל לשליחה" onPress={createEmail} disabled={empty} />
      <Button label="שיתוף / העתקה" variant="secondary" onPress={share} disabled={empty} />
      {status.sentAt ? (
        <Button label="ביטול הדוח שנשלח (לתיקון)" variant="danger" onPress={() => setCancelOpen(true)} />
      ) : (
        <Button label="סימון כנשלח" variant="secondary" onPress={() => setSent(true)} disabled={empty} />
      )}

      <PaymentDialog
        visible={payOpen}
        title={`תשלום — ${periodTitle(period)}`}
        gross={grossAmount(report)}
        net={netAmount(report)}
        taxPercent={tax}
        initialDate={status.paidAt}
        initialAmount={status.paidAmount}
        onSave={savePayment}
        onClear={status.paidAt ? clearPayment : undefined}
        onClose={() => setPayOpen(false)}
      />

      <Modal transparent animationType="fade" visible={cancelOpen} onRequestClose={() => setCancelOpen(false)}>
        <View style={styles.backdrop}>
          <View style={styles.dialog}>
            <Text style={styles.title}>ביטול הדוח שנשלח</Text>
            <Text style={styles.subtitle}>
              הדיווחים בחודש זה ייפתחו לעריכה, והדוח יחזור ל"ממתינים לשליחה". הסיבה נשמרת בהיסטוריה.
            </Text>
            <TextField
              value={cancelReason}
              onChangeText={setCancelReason}
              placeholder="למשל: תיקון שעות ביום 12/10"
            />
            <Button label="ביטול הדוח" variant="danger" onPress={cancelSent} disabled={!cancelReason.trim()} />
            <Button label="חזרה" variant="secondary" onPress={() => setCancelOpen(false)} />
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    totalBig: { fontSize: 17, fontWeight: '800', color: colors.brandDark, textAlign: TEXT_RIGHT },
    totalNote: { fontSize: 12, color: colors.brandDark, textAlign: TEXT_RIGHT },
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.45)',
      alignItems: 'center',
      justifyContent: 'center',
      padding: spacing.lg,
    },
    dialog: {
      width: '100%',
      maxWidth: 420,
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      padding: spacing.lg,
      gap: spacing.md,
    },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    header: { gap: 4 },
    title: { fontSize: 20, fontWeight: '800', color: colors.text, textAlign: TEXT_RIGHT },
    subtitle: { fontSize: 14, color: colors.textMuted, textAlign: TEXT_RIGHT },
    status: { fontSize: 13, fontWeight: '700', color: colors.brandDark, textAlign: TEXT_RIGHT },
    statusSent: { color: colors.success },
    statusPending: { color: colors.warning },
    card: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      padding: spacing.md,
      gap: spacing.xs,
    },
    label: { fontSize: 12, fontWeight: '700', color: colors.textMuted, textAlign: TEXT_RIGHT },
    email: { fontSize: 15, fontWeight: '700', color: colors.text, textAlign: TEXT_RIGHT },
    cc: { fontSize: 12, color: colors.textMuted, textAlign: TEXT_RIGHT },
    warn: { fontSize: 14, fontWeight: '700', color: colors.danger, textAlign: TEXT_RIGHT },
    groupHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    groupName: { flex: 1, fontSize: 15, fontWeight: '800', color: colors.text, textAlign: TEXT_RIGHT },
    groupHours: { fontSize: 15, fontWeight: '800', color: colors.brandDark },
    session: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingVertical: 4,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    sessionDateBox: { width: 84 },
    sessionHeb: { fontSize: 11, color: colors.textMuted, textAlign: TEXT_RIGHT },
    sessionDate: { fontSize: 13, fontWeight: '600', color: colors.text, textAlign: TEXT_RIGHT },
    sessionTime: { flex: 1, fontSize: 13, color: colors.textMuted, textAlign: TEXT_RIGHT },
    sessionHours: { fontSize: 13, fontWeight: '700', color: colors.brandDark },
    totals: {
      backgroundColor: colors.brandLight,
      borderRadius: radius.md,
      padding: spacing.md,
      gap: spacing.xs,
    },
    totalRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
    totalLabel: { fontSize: 14, fontWeight: '800', color: colors.brandDark, textAlign: TEXT_RIGHT },
    totalValue: { flexShrink: 1, fontSize: 14, fontWeight: '700', color: colors.brandDark },
  });
