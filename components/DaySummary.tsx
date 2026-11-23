/**
 * שורת סיכום יומית לפי מקום עבודה (lib/daySummary.ts) — מתחת למפגשים / לדיווחים של יום ביומן.
 * שורה לכל מקום: נקודת הצבע שלו, השם והסיכום. מוצגת רק כשלאחד המקומות יש ביום יותר ממפגש אחד.
 */
import { StyleSheet, View } from 'react-native';
import { Text } from './Text';
import { dayTotalText, type DayWorkplaceTotal } from '../lib/daySummary';
import { basisFor, type PayBasis } from '../lib/payBasis';
import type { Workplace } from '../lib/workplaces';
import { useTheme } from '../theme/ThemeContext';
import { workplaceColor } from '../theme/workplaceColors';
import { spacing } from '../theme/colors';
import { TEXT_RIGHT } from '../theme/align';

export function DaySummary({
  totals,
  workplaceOf,
  basis,
  noun = 'מפגשים',
  separated = true,
}: {
  totals: DayWorkplaceTotal[];
  workplaceOf: (id: string) => Workplace | undefined;
  basis: PayBasis;
  noun?: 'מפגשים' | 'דיווחים';
  /** קו מפריד מעל (בתוך אריח) */
  separated?: boolean;
}) {
  const { colors } = useTheme();
  // רק כשיש מקום עם יותר ממפגש אחד ביום — אחרת הסיכום חוזר על השורות שמעליו.
  if (!totals.some((t) => t.count > 1)) return null;
  return (
    <View style={[styles.wrap, separated && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
      <Text style={[styles.title, { color: colors.textMuted }]}>סה״כ ביום</Text>
      {totals.map((t) => {
        const w = workplaceOf(t.workplaceId);
        return (
          <View key={t.workplaceId} style={styles.row}>
            <View style={[styles.dot, { backgroundColor: w ? workplaceColor(colors, w) : colors.border }]} />
            <Text style={[styles.text, { color: colors.text }]}>
              <Text style={styles.name}>{w?.name ?? ''}</Text>
              {` · ${dayTotalText(t, basisFor(w, basis) === 'academic', noun)}`}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingTop: spacing.sm, marginTop: spacing.xs, gap: 4 },
  title: { fontSize: 12, fontWeight: '700', textAlign: TEXT_RIGHT },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dot: { width: 8, height: 8, borderRadius: 4 },
  text: { flex: 1, fontSize: 13, textAlign: TEXT_RIGHT },
  name: { fontWeight: '700' },
});
