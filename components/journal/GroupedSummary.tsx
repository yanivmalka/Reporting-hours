/**
 * "סיכום מקובץ" בלשונית "דיווחים" ביומן: הדיווחים שבסינון הנוכחי, מקובצים לפי רמת הקיבוץ
 * המשותפת (מקום עבודה / + קורס / + קורס ויום — lib/courseGrouping.ts): מספר דיווחים, שעות
 * אקדמיות ושכר לכל קבוצה.
 */
import { StyleSheet, View } from 'react-native';
import { Text } from '../Text';
import { FoldSection } from '../FoldSection';
import { GroupLevelPicker } from '../GroupLevelPicker';
import { ACADEMIC_HOUR_MINUTES } from '../../lib/academic';
import { groupItems, groupLevelTitle, reportCourseName, useGroupLevel } from '../../lib/courseGrouping';
import { netMinutes } from '../../lib/reports';
import { formatShekels } from '../../lib/travel';
import { workplaceColor } from '../../theme/workplaceColors';
import { spacing } from '../../theme/colors';
import { TEXT_RIGHT } from '../../theme/align';
import type { Journal } from './useJournal';

export function GroupedSummary({ w }: { w: Journal }) {
  const { filtered, courses, nameOf, workplaceOf, payOf, colors } = w;
  const level = useGroupLevel();
  if (filtered.length === 0) return null;
  const groups = groupItems(
    filtered,
    level,
    (r) => ({ workplaceId: r.workplaceId, course: reportCourseName(r, courses), date: r.date }),
    { workplaceName: nameOf },
  );
  return (
    <FoldSection title="סיכום מקובץ" summary={groupLevelTitle(level)} meta={String(groups.length)}>
      <GroupLevelPicker />
      {groups.map((g) => {
        const minutes = g.items.reduce((n, r) => n + (netMinutes(r) ?? 0), 0);
        const carried = g.items.reduce((n, r) => n + (r.carriedMinutes ?? 0), 0);
        const pays = g.items.map(payOf);
        const pay = pays.reduce<number>((n, p) => n + (typeof p === 'number' ? p : 0), 0);
        const hasPay = pays.some((p) => typeof p === 'number');
        const wp = workplaceOf(g.workplaceId);
        return (
          <View
            key={g.key}
            style={[styles.row, { borderStartColor: wp ? workplaceColor(colors, wp) : colors.border }]}
          >
            {g.detail ? (
              <>
                <Text style={[styles.place, { color: colors.textMuted }]}>{nameOf(g.workplaceId)}</Text>
                <Text style={[styles.label, { color: colors.text }]}>{g.detail}</Text>
              </>
            ) : (
              <Text style={[styles.label, { color: colors.text }]}>{g.label}</Text>
            )}
            <Text style={[styles.meta, { color: colors.textMuted }]}>
              {g.items.length} דיווחים · {Math.round((minutes / ACADEMIC_HOUR_MINUTES) * 10) / 10} שע׳ אקד׳
              {carried > 0 ? ` · ${carried} דק׳ למונה` : ''}
              {hasPay ? ` · ${formatShekels(Math.round(pay))}` : ''}
            </Text>
          </View>
        );
      })}
    </FoldSection>
  );
}

const styles = StyleSheet.create({
  row: { borderStartWidth: 4, paddingStart: spacing.sm, paddingVertical: 2, gap: 2 },
  place: { fontSize: 12, textAlign: TEXT_RIGHT },
  label: { fontSize: 14, fontWeight: '700', textAlign: TEXT_RIGHT },
  meta: { fontSize: 13, textAlign: TEXT_RIGHT },
});
