import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Button } from '../components/Button';
import { useConfirm } from '../components/ConfirmDialog';
import { Screen } from '../components/Screen';
import { SegmentedControl } from '../components/SegmentedControl';
import { useToast } from '../components/Toast';
import { ProgressBar } from '../components/Charts';
import {
  accumulatedTotal,
  entryOf,
  loadAccumulated,
  redeemAccumulated,
  redeemableHours,
  resetAccumulated,
  type AccumulatedState,
} from '../lib/accumulated';
import { formatShekels } from '../lib/travel';
import { loadWorkplaces, type Workplace } from '../lib/workplaces';
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
  const confirm = useConfirm();

  useFocusEffect(
    useCallback(() => {
      let active = true;
      Promise.all([loadAccumulated(), loadWorkplaces()]).then(([next, list]) => {
        if (!active) return;
        setState(next);
        setWorkplaces(list);
      });
      return () => {
        active = false;
      };
    }, []),
  );

  const nameOf = (id: string) => workplaces.find((w) => w.id === id)?.name ?? 'מקום עבודה שנמחק';

  async function handleRedeem(workplaceId?: string) {
    setBusy(workplaceId ?? 'all');
    const { state: next, redeemed } = await redeemAccumulated(workplaceId);
    setState(next);
    setBusy(null);
    if (redeemed > 0) {
      showToast(
        workplaceId
          ? `נפדו ${redeemed} שע׳ אקדמיות ב${nameOf(workplaceId)}`
          : `נפדו ${redeemed} שע׳ אקדמיות בכל הסמינרים`,
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
  // כל מקומות העבודה הפעילים, וגם מונים של מקומות שנמחקו — מהגדול לקטן.
  const ids = [
    ...new Set([...workplaces.map((w) => w.id), ...Object.keys(state.byWorkplace)]),
  ];
  const rows = ids
    .map((id) => ({ id, entry: entryOf(state, id), workplace: workplaces.find((w) => w.id === id) }))
    .sort((a, b) => b.entry.minutes - a.entry.minutes || b.entry.redeemedHours - a.entry.redeemedHours);
  const totalRedeemable = rows.reduce((n, r) => n + redeemableHours(r.entry), 0);

  return (
    <Screen>
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
        <Text style={styles.unit}>דקות · {total.redeemedHours} שע׳ אקדמיות נפדו עד כה</Text>
        {totalRedeemable > 0 ? (
          <Button
            label={`פדיון כל השעות הזמינות (${totalRedeemable})`}
            onPress={() => handleRedeem()}
            loading={busy === 'all'}
            disabled={busy != null}
          />
        ) : (
          <Text style={styles.cardHint}>
            אין כרגע סמינר עם {ACADEMIC_HOUR_MINUTES} דקות לפחות לפדיון.
          </Text>
        )}
      </View>

      <Text style={styles.sectionLabel}>פירוט לפי סמינר</Text>
      <View style={styles.list}>
        {rows.map(({ id, entry, workplace }) => {
          const canRedeem = redeemableHours(entry);
          const toNext = ACADEMIC_HOUR_MINUTES - (entry.minutes % ACADEMIC_HOUR_MINUTES);
          const value =
            workplace && workplace.paymentType === 'hourly' && entry.redeemedHours > 0
              ? ` · שווי ${formatShekels(entry.redeemedHours * workplace.rate)}`
              : '';
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
                {canRedeem > 0
                  ? `${canRedeem} שע׳ זמינות לפדיון`
                  : entry.minutes > 0
                    ? `עוד ${toNext} דק׳ לשעה אקדמית`
                    : 'אין דקות במונה'}
                {` · נפדו ${entry.redeemedHours} שע׳${value}`}
              </Text>
              {canRedeem > 0 ? (
                <Button
                  label={`פדיון ${canRedeem} שע׳ אקדמיות`}
                  variant="secondary"
                  onPress={() => handleRedeem(id)}
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
});
