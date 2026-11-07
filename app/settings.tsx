import { useCallback, useState } from 'react';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useLeftoverMode } from '../lib/leftover';
import { EnterChevron } from '../components/Chevrons';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Text } from '../components/Text';
import { Button } from '../components/Button';
import { useConfirm } from '../components/ConfirmDialog';
import { Icon } from '../components/Icon';
import { Pressable } from '../components/Pressable';
import { Screen } from '../components/Screen';
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
  useRedeemMode,
} from '../lib/redeem';
import { loadReports, type WorkReport } from '../lib/reports';
import { formatShekels } from '../lib/travel';
import { loadWorkplaces, type Workplace } from '../lib/workplaces';
import { ACADEMIC_HOUR_MINUTES } from '../lib/academic';
import { basisFor, usePayBasis } from '../lib/payBasis';
import { Checkbox } from '../components/Checkbox';
import { FoldSection } from '../components/FoldSection';
import { useTheme } from '../theme/ThemeContext';
import { useThemedStyles } from '../theme/useThemedStyles';
import { radius, spacing, type AppColors } from '../theme/colors';
import { TEXT_RIGHT } from '../theme/align';


export default function SettingsScreen() {
  const styles = useThemedStyles(makeStyles);
  const router = useRouter();
  const { colors } = useTheme();
  const { showToast } = useToast();
  const { basis } = usePayBasis();
  const [state, setState] = useState<AccumulatedState | null>(null);
  const [workplaces, setWorkplaces] = useState<Workplace[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [reports, setReports] = useState<WorkReport[]>([]);
  const [statuses, setStatuses] = useState<StatusMap>({});
  const [mode, setMode] = useRedeemMode();
  const [leftover, setLeftover] = useLeftoverMode();
  /** ?focus=settings (מאשף הדיווח) — קבוצת "הגדרות" נפתחת */
  const { focus } = useLocalSearchParams<{ focus?: string }>();
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
    if (!workplace || workplace.paymentType !== 'hourly' || basisFor(workplace, basis) !== 'academic') return null;
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
  const anyAcademic = workplaces.some((w) => w.paymentType === 'hourly' && basisFor(w, basis) === 'academic');
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
      <View style={styles.intro}>
        <Text style={styles.title}>דקות מצטברות</Text>
        <Text style={styles.subtitle}>
          לכל סמינר מונה נפרד: דקות שאינן משלימות שעה אקדמית ({ACADEMIC_HOUR_MINUTES} דק׳), או
          שנבחר לא לדווח עליהן כרגע, נצברות במונה של אותו סמינר — ונפדות בתעריף שלו.
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardLabel}>סה״כ בכל הסמינרים</Text>
        <Text style={styles.bigNumber}>{total.minutes}</Text>
        <Text style={styles.unit}>
          דקות · {formatHours(Math.round(redeemedAcademicHours(total) * 100) / 100)} שע׳ אקדמיות נפדו עד כה
        </Text>
        {!anyAcademic ? (
          <Text style={styles.cardHint}>
            אין מקום עבודה שמשלם לפי שעה אקדמית — כל זמן העבודה נטו כבר משולם, ואין מה לפדות.
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

      <FoldSection
        key={focus === 'settings' ? 'open' : 'closed'}
        defaultOpen={focus === 'settings'}
        title="הגדרות"
        summary={`דקות עודפות ${leftover === 'carry' ? 'למונה' : 'בדיווח'} · ${mode === 'complete' ? 'השלמה לשעה שלמה' : 'שעות שלמות בלבד'} · בסיס השכר — בהגדרות כל מקום עבודה`}
      >
        <Checkbox
          checked={leftover === 'carry'}
          onChange={(on) => setLeftover(on ? 'carry' : 'include')}
          label="דקות עודפות למונה המצטבר"
          hint={
            leftover === 'carry'
              ? 'דקות שאינן משלימות שעה אקדמית נכנסות למונה, ונפדות כאן בהמשך.'
              : 'דקות שאינן משלימות שעה אקדמית נכללות בדיווח עצמו כשבר שעה.'
          }
        />
        <Checkbox
          checked={mode === 'complete'}
          onChange={(on) => setMode(on ? 'complete' : 'whole')}
          label="השלמה לשעה שלמה (מומלץ)"
          hint={
            mode === 'complete'
              ? 'מהמונה נלקחות קודם הדקות שחסרות לדוח השכר כדי להגיע לשעה אקדמית שלמה, ורק אחר כך שעות שלמות נוספות.'
              : `נפדות רק שעות שלמות (${ACADEMIC_HOUR_MINUTES} דק׳ כל אחת). שבר שכבר יש בדוח נשאר בו.`
          }
        />
        <Text style={styles.note}>
          תשלום לפי שעה אקדמית או רגילה נקבע בעריכת כל מקום עבודה, בקבוצה "שכר ותשלום".
        </Text>
      </FoldSection>

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
                {workplace ? (
                  <Pressable
                    onPress={() => router.push({ pathname: '/workplace', params: { id } })}
                    accessibilityRole="button"
                    style={({ pressed }) => [styles.nameLink, pressed && { opacity: 0.7 }]}
                  >
                    <Text style={styles.rowLabel} numberOfLines={2}>
                      {workplace.name}
                    </Text>
                    <EnterChevron size={16} />
                  </Pressable>
                ) : (
                  <Text style={styles.rowLabel} numberOfLines={2}>
                    {nameOf(id)}
                  </Text>
                )}
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
    nameLink: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 },
    checkGroup: {
      borderRadius: radius.md,
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      overflow: 'hidden',
    },
    checkRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.sm,
      padding: spacing.md,
    },
    checkRowDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
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
