import { StyleSheet, View } from 'react-native';
import { Text } from './Text';
import { monthName } from '../lib/dashboard';
import { hebrewMonthSpan } from '../lib/hebrewDate';
import { useShowHebrewDates } from '../lib/hebrewDatePref';
import { useThemedStyles } from '../theme/useThemedStyles';
import { spacing, type AppColors } from '../theme/colors';
import { TEXT_RIGHT } from '../theme/align';

/** פס מפריד בין חודשים ברשימה נגללת — "דצמבר 2026 · כסלו–טבת תשפ״ז". `month`: "YYYY-MM". */
export function MonthDivider({ month }: { month: string }) {
  const styles = useThemedStyles(makeStyles);
  const showHebrew = useShowHebrewDates();
  const [y, m] = month.split('-').map(Number);
  return (
    <View style={styles.wrap} accessibilityRole="header">
      <Text style={styles.title}>{monthName(month)}</Text>
      {showHebrew ? <Text style={styles.hebrew}>{hebrewMonthSpan(y, m - 1)}</Text> : null}
      <View style={styles.line} />
    </View>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    wrap: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingTop: spacing.md, paddingBottom: spacing.xs },
    title: { fontSize: 15, fontWeight: '800', color: colors.brandDark, textAlign: TEXT_RIGHT },
    hebrew: { fontSize: 13, color: colors.textMuted, textAlign: TEXT_RIGHT },
    line: { flex: 1, height: 1, backgroundColor: colors.border },
  });
