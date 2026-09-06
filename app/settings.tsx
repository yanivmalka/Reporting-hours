import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Button } from '../components/Button';
import { Screen } from '../components/Screen';
import { useToast } from '../components/Toast';
import {
  loadAccumulated,
  redeemAccumulated,
  redeemableHours,
  resetAccumulated,
  type AccumulatedState,
} from '../lib/accumulated';
import { ACADEMIC_HOUR_MINUTES } from '../lib/academic';
import { useTheme } from '../theme/ThemeContext';
import { useThemedStyles } from '../theme/useThemedStyles';
import { radius, spacing, type AppColors } from '../theme/colors';

export default function SettingsScreen() {
  const styles = useThemedStyles(makeStyles);
  const { colors } = useTheme();
  const { showToast } = useToast();
  const [state, setState] = useState<AccumulatedState | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      loadAccumulated().then((next) => {
        if (active) setState(next);
      });
      return () => {
        active = false;
      };
    }, []),
  );

  async function handleRedeem() {
    setBusy(true);
    const { state: next, redeemed } = await redeemAccumulated();
    setState(next);
    setBusy(false);
    if (redeemed > 0) {
      showToast(
        `נפדו ${redeemed} שע׳ אקדמיות · נותרו ${next.minutes} דק׳ במונה`,
      );
    }
  }

  async function handleReset() {
    if (!confirmReset) {
      setConfirmReset(true);
      return;
    }
    setBusy(true);
    const next = await resetAccumulated();
    setState(next);
    setConfirmReset(false);
    setBusy(false);
    showToast('המונה אופס');
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

  const canRedeem = redeemableHours(state);

  return (
    <Screen>
      <View style={styles.intro}>
        <Text style={styles.title}>הגדרות ותגיות</Text>
        <Text style={styles.subtitle}>
          תגיות הסיכום החודשי — סכום עד חודש זה, שעות ונסיעות — יתווספו בשלב 6.
          כאן פועל כבר מונה "דקות עבודה מצטברות".
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardLabel}>דקות עבודה מצטברות</Text>
        <Text style={styles.bigNumber}>{state.minutes}</Text>
        <Text style={styles.unit}>דקות</Text>
        <Text style={styles.cardHint}>
          דקות שאינן משלימות שעה אקדמית ({ACADEMIC_HOUR_MINUTES} דק׳), או שנבחר
          לא לדווח עליהן כרגע, נצברות כאן מכל דיווח.
        </Text>

        {canRedeem > 0 ? (
          <Button
            label={`פדיון ${canRedeem} שע׳ אקדמיות`}
            onPress={handleRedeem}
            loading={busy}
          />
        ) : (
          <Text style={styles.cardHint}>
            צריך לפחות {ACADEMIC_HOUR_MINUTES} דקות כדי לפדות שעה אקדמית שלמה.
          </Text>
        )}
      </View>

      <View style={styles.row}>
        <Text style={styles.rowLabel}>שעות אקדמיות שנפדו</Text>
        <Text style={styles.rowValue}>{state.redeemedHours}</Text>
      </View>
      <Text style={styles.note}>
        השעות שנפדו ייכללו בסיכומים ובחישוב השכר בשלבים הבאים.
      </Text>

      {state.minutes > 0 || state.redeemedHours > 0 ? (
        <Button
          label={confirmReset ? 'לחצו שוב לאישור האיפוס' : 'איפוס המונה'}
          variant="danger"
          onPress={handleReset}
          disabled={busy}
        />
      ) : null}
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
    textAlign: 'right',
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 21,
    color: colors.textMuted,
    textAlign: 'right',
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  rowLabel: {
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
    textAlign: 'right',
  },
});
