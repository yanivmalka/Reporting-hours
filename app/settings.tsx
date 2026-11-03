import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Button } from '../components/Button';
import { useConfirm } from '../components/ConfirmDialog';
import { Icon } from '../components/Icon';
import { Pressable } from '../components/Pressable';
import { Screen } from '../components/Screen';
import { SegmentedControl } from '../components/SegmentedControl';
import { useToast } from '../components/Toast';
import { ProgressBar } from '../components/Charts';
import {
  accumulatedTotal,
  entryOf,
  loadAccumulated,
  redeemedAcademicHours,
  resetAccumulated,
  type AccumulatedState,
} from '../lib/accumulated';
import { formatHours } from '../lib/pay';
import { loadPayrollStatus, periodTitle, type StatusMap } from '../lib/payroll';
import {
  minutesLabel,
  planRedeem,
  redeemIntoPayroll,
  redeemTarget,
  REDEEM_MODE_LABELS,
  useRedeemMode,
  type RedeemMode,
} from '../lib/redeem';
import { loadReports, type WorkReport } from '../lib/reports';
import { formatShekels } from '../lib/travel';
import { loadWorkplaces, type Workplace } from '../lib/workplaces';
import { useCancelHolidays } from '../lib/sessions';
import { ACADEMIC_HOUR_MINUTES } from '../lib/academic';
import { PAY_BASIS_LABELS, usePayBasis, type PayBasis } from '../lib/payBasis';
import { useTheme } from '../theme/ThemeContext';
import { useThemedStyles } from '../theme/useThemedStyles';
import { radius, spacing, type AppColors } from '../theme/colors';
import { TEXT_RIGHT } from '../theme/align';

export default function SettingsScreen() {
  const styles = useThemedStyles(makeStyles);
  const { colors } = useTheme();
  const { showToast } = useToast();
  const { basis, setBasis } = usePayBasis();
  const [state, setState] = useState<AccumulatedState | null>(null);
  const [workplaces, setWorkplaces] = useState<Workplace[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [reports, setReports] = useState<WorkReport[]>([]);
  const [statuses, setStatuses] = useState<StatusMap>({});
  const [mode, setMode] = useRedeemMode();
  const [cancelHolidays, setCancelHolidays] = useCancelHolidays();
  const confirm = useConfirm();

  useFocusEffect(
    useCallback(() => {
      let active = true;
      Promise.all([loadAccumulated(), loadWorkplaces(), loadReports(), loadPayrollStatus()]).then(
        ([next, list, reps, st]) => {
          if (!active) return;
          setState(next);
          setWorkplaces(list);
          setReports(reps);
          setStatuses(st);
        },
      );
      return () => {
        active = false;
      };
    }, []),
  );

  const nameOf = (id: string) => workplaces.find((w) => w.id === id)?.name ?? 'מקום עבודה שנמחק';

  /** תכנית הפדיון של מקום עבודה: לאיזה דוח, וכמה דקות — לפי האופן שנבחר. */
  function planFor(workplace: Workplace | undefined, counter: number) {
    if (!workplace || workplace.paymentType !== 'hourly' || basis !== 'academic') return null;
    const target = redeemTarget(workplace, reports, statuses);
    if (!target) return null;
    return { target, plan: planRedeem(counter, target.inReport, mode) };
  }

  async function handleRedeem(ids: string[]) {
    setBusy(ids.length === 1 ? ids[0] : 'all');
    let st = statuses;
    let total = 0;
    let next = state;
    for (const id of ids) {
      const w = workplaces.find((x) => x.id === id);
      const p = planFor(w, entryOf(next ?? { byWorkplace: {} }, id).minutes);
      if (!p || p.plan.minutes <= 0) continue;
      const res = await redeemIntoPayroll(id, p.target.period.start, p.plan.minutes, st);
      st = res.statuses;
      next = res.state;
      total += res.redeemed;
    }
    setStatuses(st);
    setState(next);
    setBusy(null);
    if (total > 0) {
      showToast(
        ids.length === 1
          ? `נפדו ${minutesLabel(total)} אקד׳ לדוח של ${nameOf(ids[0])}`
          : `נפדו ${minutesLabel(total)} אקד׳ בכל הסמינרים`,
      );
    }
  }

  function handleReset() {
    confirm({
      title: 'לאפס את כל המונים?',
      message: 'הדקות שנצברו והשעות שנפדו יימחקו בכל הסמינרים. הדיווחים עצמם לא ישתנו.',
      confirmLabel: 'איפוס המונים',
      onConfirm: async () => {
        setState(await resetAccumulated());
        showToast('כל המונים אופסו');
      },
    });
  }


  if (state === null) {
    return (
      <Screen scroll={false}>
        <View style={styles.center}>
          <ActivityIndicator color={colors.brand} />
        </View>
      </Screen>
    );
  }

  const total = accumulatedTotal(state);
  const exampleMinutes = mode === 'complete' ? 27 : 45;
  // כל מקומות העבודה הפעילים, וגם מונים של מקומות שנמחקו — מהגדול לקטן.
  const ids = [
    ...new Set([...workplaces.map((w) => w.id), ...Object.keys(state.byWorkplace)]),
  ];
  const rows = ids
    .map((id) => ({ id, entry: entryOf(state, id), workplace: workplaces.find((w) => w.id === id) }))
    .sort((a, b) => b.entry.minutes - a.entry.minutes || b.entry.redeemedHours - a.entry.redeemedHours)
    .map((r) => ({ ...r, p: planFor(r.workplace, r.entry.minutes) }));
  const readyIds = rows.filter((r) => (r.p?.plan.minutes ?? 0) > 0).map((r) => r.id);
  const totalRedeemable = rows.reduce((n, r) => n + (r.p?.plan.minutes ?? 0), 0);

  return (
    <Screen>
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>לו״ז וקורסים</Text>
        <Pressable
          onPress={() => {
            setCancelHolidays(!cancelHolidays);
            showToast(cancelHolidays ? 'ביטול אוטומטי בחגים כובה' : 'מפגשים בחגים ובימי שבתון סומנו כבוטלו');
          }}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: cancelHolidays }}
          style={({ pressed }) => [styles.checkRow, pressed && { opacity: 0.85 }]}
        >
          <Icon
            name={cancelHolidays ? 'checkbox-marked' : 'checkbox-blank-outline'}
            size={26}
            color={cancelHolidays ? colors.brand : colors.textMuted}
          />
          <View style={styles.checkTexts}>
            <Text style={styles.checkTitle}>ביטול אוטומטי של מפגשים בחגים ובימי שבתון</Text>
            <Text style={styles.note}>
              מפגשי קורסים שחלים בחג (ראש השנה, יום הכיפורים, סוכות, שמחת תורה, פסח, שבועות) או
              ביום העצמאות מסומנים בלו״ז כ"בוטל". הם לא נספרים בשעות המתוכננות ולא מופיעים כדיווח
              חסר. חל גם על קורסים קיימים. מפגש בודד אפשר להחזיר מהלו״ז.
            </Text>
          </View>
        </Pressable>
      </View>

      <View style={styles.intro}>
        <Text style={styles.title}>דקות מצטברות</Text>
        <Text style={styles.subtitle}>
          לכל סמינר מונה נפרד: דקות שאינן משלימות שעה אקדמית ({ACADEMIC_HOUR_MINUTES} דק׳), או
          שנבחר לא לדווח עליהן כרגע, נצברות במונה של אותו סמינר — ונפדות בתעריף שלו.
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>בסיס חישוב השכר השעתי</Text>
        <SegmentedControl<PayBasis>
          options={[
            { value: 'academic', label: PAY_BASIS_LABELS.academic },
            { value: 'regular', label: PAY_BASIS_LABELS.regular },
          ]}
          value={basis}
          onChange={setBasis}
        />
        <Text style={styles.note}>
          {basis === 'academic'
            ? 'התעריף השעתי מוכפל בשעות אקדמיות (45 דק׳). דקות שאינן משלימות שעה אקדמית נכנסות למונה של הסמינר.'
            : 'התעריף השעתי מוכפל בשעות רגילות (60 דק׳). כל זמן העבודה נטו נכנס לחישוב ללא עיגול.'}
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardLabel}>סה״כ בכל הסמינרים</Text>
        <Text style={styles.bigNumber}>{total.minutes}</Text>
        <Text style={styles.unit}>
          דקות · {formatHours(Math.round(redeemedAcademicHours(total) * 100) / 100)} שע׳ אקדמיות נפדו עד כה
        </Text>
        {basis !== 'academic' ? (
          <Text style={styles.cardHint}>
            בבסיס "שעות רגילות" כל זמן העבודה נטו כבר משולם — אין מה לפדות.
          </Text>
        ) : readyIds.length > 1 ? (
          <Button
            label={`פדיון בכל הסמינרים (${minutesLabel(totalRedeemable)})`}
            onPress={() => handleRedeem(readyIds)}
            loading={busy === 'all'}
            disabled={busy != null}
          />
        ) : readyIds.length === 0 ? (
          <Text style={styles.cardHint}>
            {mode === 'complete'
              ? 'אין כרגע מספיק דקות כדי להשלים דוח לשעה שלמה.'
              : `אין כרגע סמינר עם ${ACADEMIC_HOUR_MINUTES} דקות לפחות לפדיון.`}
          </Text>
        ) : null}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>אופן הפדיון</Text>
        <SegmentedControl<RedeemMode>
          options={[
            { value: 'complete', label: `${REDEEM_MODE_LABELS.complete} (מומלץ)` },
            { value: 'whole', label: REDEEM_MODE_LABELS.whole },
          ]}
          value={mode}
          onChange={setMode}
        />
        <View style={styles.explain}>
          <Text style={styles.note}>
            {mode === 'complete'
              ? 'מהמונה נלקחות קודם בדיוק הדקות שחסרות לדוח השכר כדי להגיע לשעה אקדמית שלמה, ורק אחר כך שעות שלמות נוספות. כך בדוח אין שבר עשרוני.'
              : `נפדות רק שעות שלמות (${ACADEMIC_HOUR_MINUTES} דק׳ כל אחת), בלי קשר לסך הדוח. שבר שכבר יש בדוח נשאר בו.`}
          </Text>
          <Text style={styles.example}>
            {`דוגמה: בדוח 22 שע׳ ו־18 דק׳ (22.4), במונה 70 דק׳ ← נפדות ${exampleMinutes} דק׳; הדוח: ${
              mode === 'complete' ? '23 שע׳ בדיוק' : '23.4 שע׳'
            }; נשארות במונה ${70 - exampleMinutes} דק׳.`}
          </Text>
          <Text style={styles.note}>
            הפדיון נכנס לדוח השכר הבא שיישלח (או לדוח של החודש הנוכחי) ומשולם בתעריף של הסמינר.
          </Text>
        </View>
      </View>

      <Text style={styles.sectionLabel}>פירוט לפי סמינר</Text>
      <View style={styles.list}>
        {rows.map(({ id, entry, workplace, p }) => {
          const toNext = ACADEMIC_HOUR_MINUTES - (entry.minutes % ACADEMIC_HOUR_MINUTES);
          const redeemedH = redeemedAcademicHours(entry);
          const value =
            workplace && workplace.paymentType === 'hourly' && redeemedH > 0
              ? ` · שווי ${formatShekels(redeemedH * workplace.rate)}`
              : '';
          const target = p ? `${p.target.closed ? 'לדוח ' : 'לדוח החודש · '}${periodTitle(p.target.period)}` : '';
          const status = !p
            ? entry.minutes > 0
              ? workplace?.paymentType === 'monthly'
                ? 'משכורת חודשית — אין פדיון לשכר'
                : `${entry.minutes} דק׳ במונה`
              : 'אין דקות במונה'
            : p.plan.minutes > 0
              ? `${minutesLabel(p.plan.minutes)} לפדיון ${target}`
              : p.plan.missing > 0
                ? `חסרות ${p.plan.missing} דק׳ להשלמת ${target} לשעה שלמה`
                : `עוד ${toNext} דק׳ לשעה אקדמית`;
          return (
            <View key={id} style={styles.row}>
              <View style={styles.rowHead}>
                <Text style={styles.rowLabel} numberOfLines={2}>
                  {workplace?.name ?? nameOf(id)}
                </Text>
                <Text style={styles.rowValue}>{entry.minutes} דק׳</Text>
              </View>
              <ProgressBar fraction={(entry.minutes % ACADEMIC_HOUR_MINUTES) / ACADEMIC_HOUR_MINUTES} thin />
              <Text style={styles.note}>
                {status}
                {` · נפדו ${formatHours(Math.round(redeemedH * 100) / 100)} שע׳${value}`}
              </Text>
              {p && p.plan.minutes > 0 ? (
                <Button
                  label={`פדיון ${minutesLabel(p.plan.minutes)} אקד׳`}
                  variant="secondary"
                  onPress={() => handleRedeem([id])}
                  loading={busy === id}
                  disabled={busy != null}
                />
              ) : null}
            </View>
          );
        })}
      </View>
      <Text style={styles.note}>
        השעות שנפדו ייכללו בסיכומים ובחישוב השכר בתעריף של כל סמינר.
      </Text>

      {total.minutes > 0 || total.redeemedHours > 0 ? (
        <Button
          label="איפוס כל המונים"
          variant="danger"
          onPress={handleReset}
          disabled={busy != null}
        />
      ) : null}
      {confirm.dialog}
    </Screen>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    checkRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.sm,
      padding: spacing.md,
      borderRadius: radius.md,
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    checkTexts: { flex: 1, gap: 4 },
    checkTitle: { fontSize: 15, fontWeight: '700', color: colors.text, textAlign: TEXT_RIGHT },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  intro: {
    gap: spacing.sm,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.text,
    textAlign: TEXT_RIGHT,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 21,
    color: colors.textMuted,
    textAlign: TEXT_RIGHT,
  },
  section: {
    gap: spacing.sm,
  },
  sectionLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    textAlign: TEXT_RIGHT,
  },
  card: {
    backgroundColor: colors.brandLight,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: spacing.xs,
    alignItems: 'center',
  },
  cardLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.brandDark,
  },
  bigNumber: {
    fontSize: 44,
    fontWeight: '800',
    color: colors.brandDark,
  },
  unit: {
    fontSize: 13,
    color: colors.brandDark,
    marginBottom: spacing.sm,
  },
  cardHint: {
    fontSize: 12,
    lineHeight: 18,
    color: colors.brandDark,
    textAlign: 'center',
  },
  list: {
    gap: spacing.sm,
  },
  rowHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  row: {
    gap: spacing.xs,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  rowLabel: {
    flex: 1,
    textAlign: TEXT_RIGHT,
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  rowValue: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.brandDark,
  },
  note: {
    fontSize: 12,
    color: colors.textMuted,
    textAlign: TEXT_RIGHT,
  },
  explain: {
    gap: spacing.xs,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  example: {
    fontSize: 12,
    lineHeight: 18,
    color: colors.text,
    textAlign: TEXT_RIGHT,
  },
});
