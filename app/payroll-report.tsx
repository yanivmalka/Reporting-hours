import { useCallback, useState } from 'react';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Linking, Share, StyleSheet, Text, View } from 'react-native';
import { Button } from '../components/Button';
import { Screen } from '../components/Screen';
import { useToast } from '../components/Toast';
import { ACADEMIC_HOUR_MINUTES } from '../lib/academic';
import { loadCourses } from '../lib/courses';
import { dateRange } from '../lib/dashboard';
import {
  buildPayrollReport,
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
import { formatISODate } from '../lib/time';
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

  useFocusEffect(
    useCallback(() => {
      let active = true;
      Promise.all([loadWorkplaces(), loadReports(), loadCourses(), loadPayrollStatus()]).then(
        ([workplaces, reports, courses, st]) => {
          if (!active) return;
          const w = workplaces.find((x) => x.id === params.wp);
          if (!w || !params.start) {
            setMissing(true);
            return;
          }
          const period = periodStartingAt(w, params.start);
          setReport(buildPayrollReport(w, period, reports, courses));
          setStatus(st[statusKey(w.id, period.start)] ?? {});
        },
      );
      return () => {
        active = false;
      };
    }, [params.wp, params.start]),
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
    const map = await updatePayrollStatus(
      workplace.id,
      period.start,
      sent ? { sentAt: Date.now() } : { sentAt: undefined },
    );
    setStatus(map[statusKey(workplace.id, period.start)] ?? {});
    showToast(sent ? 'הדוח סומן כנשלח' : 'הסימון בוטל');
  }

  async function createEmail() {
    const url = payrollMailto(report as PayrollReport);
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
        message: `${payrollSubject(report as PayrollReport)}\n\n${payrollBody(report as PayrollReport)}`,
      });
      const map = await updatePayrollStatus(workplace.id, period.start, { generatedAt: Date.now() });
      setStatus(map[statusKey(workplace.id, period.start)] ?? {});
    } catch {
      // המשתמש ביטל
    }
  }

  const empty = report.groups.length === 0;

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
            ? `✓ נשלח ב־${formatISODate(new Date(status.sentAt).toISOString().slice(0, 10))}`
            : status.generatedAt
              ? 'נוצר מייל — טרם סומן כנשלח'
              : closed
                ? 'ממתין לשליחה'
                : `החודש עדיין פתוח — נסגר בעוד ${period.daysToPayday} ימים`}
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
                <Text style={styles.sessionDate}>
                  {weekday(s.date)} {formatISODate(s.date).slice(0, 5)}
                </Text>
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
            {hasTravelCost(workplace)
              ? `${formatShekels(report.travel)} (${report.days} × ${workplace.tripsPerDay} × ${formatShekels(workplace.travelCostPerDirection)})`
              : 'אין'}
          </Text>
        </View>
      </View>

      <Button label="יצירת מייל לשליחה" onPress={createEmail} disabled={empty} />
      <Button label="שיתוף / העתקה" variant="secondary" onPress={share} disabled={empty} />
      {status.sentAt ? (
        <Button label="ביטול סימון 'נשלח'" variant="secondary" onPress={() => setSent(false)} />
      ) : (
        <Button label="סימון כנשלח" variant="secondary" onPress={() => setSent(true)} disabled={empty} />
      )}
    </Screen>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
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
    sessionDate: { width: 70, fontSize: 13, fontWeight: '600', color: colors.text, textAlign: TEXT_RIGHT },
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
