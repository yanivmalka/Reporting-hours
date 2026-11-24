/**
 * פירוט המונה של מקום עבודה במסך "דקות מצטברות": מאילו דיווחים הגיעו הדקות
 * (lib/accumulatedSources.ts). כל שורה מובילה לתצוגת הדיווח.
 */
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Text } from './Text';
import { Pressable } from './Pressable';
import { DateText } from './DateText';
import { EnterChevron, FoldChevron } from './Chevrons';
import { accumulatedSources, type AccumulatedSource } from '../lib/accumulatedSources';
import type { AccumulatedEntry } from '../lib/accumulated';
import type { WorkReport } from '../lib/reports';
import { useTheme } from '../theme/ThemeContext';
import { spacing } from '../theme/colors';
import { TEXT_RIGHT } from '../theme/align';

const WEEKDAYS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];
const weekday = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return WEEKDAYS[new Date(y, m - 1, d).getDay()];
};

export function AccumulatedSourcesList({
  reports,
  workplaceId,
  entry,
  courseOf,
}: {
  reports: readonly WorkReport[];
  workplaceId: string;
  entry: AccumulatedEntry;
  courseOf: (r: WorkReport) => string | null;
}) {
  const { colors } = useTheme();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pastOpen, setPastOpen] = useState(false);
  const s = accumulatedSources(reports, workplaceId, entry);
  if (s.current.length === 0 && s.past.length === 0) return null;
  const byId = new Map(reports.map((r) => [r.id, r]));

  const row = (x: AccumulatedSource, isPast: boolean) => {
    const r = byId.get(x.reportId);
    const course = r ? courseOf(r) : null;
    const amount = isPast
      ? `${x.minutes} דק׳`
      : x.inCounter < x.minutes
        ? `${x.inCounter} מתוך ${x.minutes} דק׳`
        : `+${x.minutes} דק׳`;
    return (
      <Pressable
        key={x.reportId}
        onPress={() => router.push({ pathname: '/report-view', params: { id: x.reportId } })}
        accessibilityRole="link"
        style={({ pressed }) => [styles.row, { borderTopColor: colors.border }, pressed && { opacity: 0.6 }]}
      >
        <View style={styles.rowText}>
          <Text style={[styles.date, { color: isPast ? colors.textMuted : colors.text }]}>
            {weekday(x.date)} <DateText iso={x.date} hebrew={false} /> · {`⁦${x.start}–${x.end}⁩`}
          </Text>
          {course ? (
            <Text style={[styles.sub, { color: colors.textMuted }]} numberOfLines={1}>
              {course}
            </Text>
          ) : null}
        </View>
        <Text style={[styles.amount, { color: isPast ? colors.textMuted : colors.brandDark }]}>{amount}</Text>
        <EnterChevron size={14} />
      </Pressable>
    );
  };

  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={() => setOpen((o) => !o)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={({ pressed }) => [styles.head, pressed && { opacity: 0.7 }]}
      >
        <Text style={[styles.headText, { color: colors.brandDark }]}>
          מאילו דיווחים · {s.current.length} {s.current.length === 1 ? 'דיווח' : 'דיווחים'} במונה
        </Text>
        <FoldChevron open={open} size={16} />
      </Pressable>
      {open ? (
        <View>
          {s.current.length === 0 ? (
            <Text style={[styles.sub, { color: colors.textMuted }]}>אין כרגע דקות במונה.</Text>
          ) : (
            s.current.map((x) => row(x, false))
          )}
          {s.past.length > 0 ? (
            <>
              <Pressable
                onPress={() => setPastOpen((o) => !o)}
                accessibilityRole="button"
                accessibilityState={{ expanded: pastOpen }}
                style={({ pressed }) => [styles.head, pressed && { opacity: 0.7 }]}
              >
                <Text style={[styles.sub, { color: colors.textMuted }]}>
                  דיווחים קודמים שנפדו · {s.past.length}
                </Text>
                <FoldChevron open={pastOpen} size={14} />
              </Pressable>
              {pastOpen ? s.past.map((x) => row(x, true)) : null}
            </>
          ) : null}
          <Text style={[styles.sub, { color: colors.textMuted }]}>
            {`סה״כ הועברו ${s.totalCarried} דק׳ · נפדו ${s.totalRedeemed} דק׳ · במונה ${entry.minutes} דק׳`}
            {s.unexplained < 0
              ? ` · ${-s.unexplained} דק׳ אופסו או תוקנו`
              : s.unexplained > 0
                ? ` · ${s.unexplained} דק׳ מדיווחים שנמחקו או תוקנו`
                : ''}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 2 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4 },
  headText: { fontSize: 13, fontWeight: '700', textAlign: TEXT_RIGHT },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  rowText: { flex: 1, gap: 1 },
  date: { fontSize: 13, fontWeight: '600', textAlign: TEXT_RIGHT },
  sub: { fontSize: 12, textAlign: TEXT_RIGHT },
  amount: { fontSize: 13, fontWeight: '700' },
});
