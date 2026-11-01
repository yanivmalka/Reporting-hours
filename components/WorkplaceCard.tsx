import { Pressable, StyleSheet, Text, View } from 'react-native';
import { dateRange, type WorkplaceMonthStats } from '../lib/dashboard';
import { formatHours } from '../lib/pay';
import type { Workplace } from '../lib/workplaces';
import { useThemedStyles } from '../theme/useThemedStyles';
import { radius, spacing, type AppColors } from '../theme/colors';
import { ProgressBar } from './Charts';

type WorkplaceCardProps = {
  workplace: Workplace;
  /** סיכום החודש הנוכחי מול המתוכנן / הממוצע */
  stats: WorkplaceMonthStats;
  onPress: () => void;
};

const h = (n: number) => formatHours(Math.round(n * 10) / 10);

/**
 * שורת רשימה למקום עבודה: השם, ושעות החודש הנוכחי (לפי יום התשלום של
 * המקום) מול השעות המתוכננות בקורסים הקבועים — או מול הממוצע בחודשים
 * הקודמים כשאין קורסים. כל שאר הפרטים — במסך העריכה.
 */
export function WorkplaceCard({ workplace, stats, onPress }: WorkplaceCardProps) {
  const styles = useThemedStyles(makeStyles);
  const { actual, planned, plannedToDate, average, period } = stats;

  let line: string;
  let fraction: number;
  let sub: string;
  if (planned > 0) {
    line = `החודש: ${h(actual)} מתוך ${h(planned)} שע׳ אקד׳ מתוכננות`;
    fraction = actual / planned;
    const diff = actual - plannedToDate;
    sub =
      Math.abs(diff) < 0.5
        ? 'בהתאם לתכנון עד היום'
        : diff > 0
          ? `${h(diff)} שע׳ מעל המתוכנן עד היום`
          : `${h(-diff)} שע׳ מתחת למתוכנן עד היום`;
  } else if (average != null) {
    line = `החודש: ${h(actual)} שע׳ אקד׳ · ממוצע ${h(average)}`;
    fraction = average > 0 ? actual / average : 0;
    sub = 'אין קורסים קבועים — השוואה לממוצע החודשים הקודמים';
  } else {
    line = `החודש: ${h(actual)} שע׳ אקד׳`;
    fraction = 0;
    sub = 'אפשר להגדיר קורסים קבועים במסך העריכה';
  }

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
      <View style={styles.texts}>
        <Text style={styles.name}>{workplace.name}</Text>
        <Text style={styles.line}>{line}</Text>
        {planned > 0 || average != null ? <ProgressBar fraction={fraction} thin /> : null}
        <Text style={styles.sub}>
          {sub} · {dateRange(period.start, period.end)}
        </Text>
      </View>
      <Text style={styles.chevron}>‹</Text>
    </Pressable>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      padding: spacing.md,
      gap: spacing.md,
    },
    pressed: {
      backgroundColor: colors.brandLight,
    },
    texts: {
      flex: 1,
      gap: 4,
    },
    name: {
      fontSize: 17,
      fontWeight: '700',
      color: colors.text,
      textAlign: 'right',
    },
    line: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.brandDark,
      textAlign: 'right',
    },
    sub: {
      fontSize: 12,
      color: colors.textMuted,
      textAlign: 'right',
    },
    chevron: {
      fontSize: 26,
      color: colors.brand,
    },
  });
