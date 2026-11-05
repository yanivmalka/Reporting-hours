/**
 * "תכנון" בדף "יומן": מפגשי הקורסים לפי יום בטווח שנבחר, עם סטטוס — ממתין /
 * דווח / בוטל / הועבר — וסיכום פוטנציאל וצפי. מפגש שנמחק מהתכנון לא מוצג.
 * לחיצה: מפגש שדווח → תצוגת הדיווח; שלא דווח → דיווח ישיר; שבוטל → דיאלוג המפגש.
 */
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Text } from './Text';
import { Pressable } from './Pressable';
import { Icon } from './Icon';
import { EnterChevron } from './Chevrons';
import { useSessionCancel } from './SessionCancelDialog';
import { courseReport, courseSessions, timeRange, type Course } from '../lib/courses';
import { expectedFor, plannedFor } from '../lib/forecast';
import type { PayBasis } from '../lib/payBasis';
import type { WorkReport } from '../lib/reports';
import type { Cancellation } from '../lib/sessions';
import { money } from '../lib/travel';
import { activeWorkplaces, type Workplace } from '../lib/workplaces';
import { useTheme } from '../theme/ThemeContext';
import { useThemedStyles } from '../theme/useThemedStyles';
import { radius, spacing, type AppColors } from '../theme/colors';
import { TEXT_RIGHT } from '../theme/align';
import { workplaceColor } from '../theme/workplaceColors';

type Status = 'pending' | 'reported' | 'canceled' | 'moved';

type Row = {
  course: Course;
  workplace: Workplace;
  date: string;
  status: Status;
  reportId?: string;
  cancel: Cancellation | null;
  movedFrom?: string;
};

const WEEKDAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
const dayTitle = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return `יום ${WEEKDAYS[new Date(y, m - 1, d).getDay()]} · ${d}.${m}`;
};
const short = (iso: string) => {
  const [, m, d] = iso.split('-').map(Number);
  return `${d}.${m}`;
};

export function PlanList({
  courses,
  workplaces,
  reports,
  from,
  to,
  wpFilter,
  basis,
  onChanged,
}: {
  courses: readonly Course[];
  workplaces: readonly Workplace[];
  reports: readonly WorkReport[];
  from: string;
  to: string;
  wpFilter: string | null;
  basis: PayBasis;
  onChanged: () => void;
}) {
  const router = useRouter();
  const styles = useThemedStyles(makeStyles);
  const { colors } = useTheme();
  const sessionDialog = useSessionCancel();
  const active = activeWorkplaces(workplaces).filter((w) => !wpFilter || w.id === wpFilter);
  const byId = new Map(active.map((w) => [w.id, w]));

  const rows: Row[] = [];
  for (const course of courses) {
    const workplace = byId.get(course.workplaceId);
    if (!workplace) continue;
    for (const s of courseSessions(course, from, to)) {
      if (s.cancel?.kind === 'removed') continue; // נמחק מהתכנון — מוסתר
      const report = courseReport(course, s.date, reports);
      const status: Status = report
        ? 'reported'
        : s.cancel?.kind === 'moved'
          ? 'moved'
          : s.cancel
            ? 'canceled'
            : 'pending';
      rows.push({
        course,
        workplace,
        date: s.date,
        status,
        reportId: report?.id,
        cancel: s.cancel,
        movedFrom: s.movedFrom,
      });
    }
  }
  rows.sort((a, b) => a.date.localeCompare(b.date) || a.course.start.localeCompare(b.course.start));
  const days = new Map<string, Row[]>();
  for (const r of rows) days.set(r.date, [...(days.get(r.date) ?? []), r]);

  const period = { start: from, end: to };
  const potential = active.reduce((n, w) => n + plannedFor(w, courses, period, basis), 0);
  const expected = active.reduce((n, w) => n + expectedFor(w, courses, period, basis), 0);
  const counts = {
    reported: rows.filter((r) => r.status === 'reported').length,
    pending: rows.filter((r) => r.status === 'pending').length,
    canceled: rows.filter((r) => r.status === 'canceled').length,
  };

  const open = (r: Row) => {
    if (r.reportId) router.push({ pathname: '/report-view', params: { id: r.reportId } });
    else if (r.status === 'pending')
      router.push({ pathname: '/report', params: { course: r.course.id, date: r.date } });
    else
      sessionDialog.open({
        course: r.course,
        date: r.date,
        cancel: r.cancel,
        onDone: onChanged,
        onHeld: () => router.push({ pathname: '/report', params: { course: r.course.id, date: r.date } }),
      });
  };

  const tone: Record<Status, { label: string; fg: string; bg: string }> = {
    pending: { label: 'ממתין', fg: colors.warning, bg: colors.background },
    reported: { label: 'דווח', fg: colors.success, bg: colors.brandLight },
    canceled: { label: 'בוטל', fg: colors.dangerText, bg: colors.dangerSoft },
    moved: { label: 'הועבר', fg: colors.textMuted, bg: colors.background },
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.summary}>
        <Text style={styles.summaryTitle}>
          {rows.length} מפגשים · {counts.reported} דווחו · {counts.pending} ממתינים
          {counts.canceled ? ` · ${counts.canceled} בוטלו` : ''}
        </Text>
        <Text style={styles.summaryLine}>
          פוטנציאל {money(potential)} · צפי {money(expected)}
        </Text>
      </View>
      {rows.length === 0 ? (
        <View style={styles.empty}>
          <Icon name="calendar-blank-outline" size={22} color={colors.textMuted} />
          <Text style={styles.emptyText}>אין מפגשים מתוכננים בתקופה הזו.</Text>
        </View>
      ) : (
        [...days].map(([date, list]) => (
          <View key={date} style={styles.day}>
            <Text style={styles.dayTitle}>{dayTitle(date)}</Text>
            {list.map((r) => {
              const t = tone[r.status];
              return (
                <Pressable
                  key={`${r.course.id}@${r.date}`}
                  onPress={() => open(r)}
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.row, pressed && styles.pressed]}
                >
                  <View style={[styles.bar, { backgroundColor: workplaceColor(colors, r.workplace) }]} />
                  <View style={styles.texts}>
                    <Text
                      style={[styles.name, (r.status === 'canceled' || r.status === 'moved') && styles.strike]}
                      numberOfLines={1}
                    >
                      {r.course.name}
                    </Text>
                    <Text style={styles.meta} numberOfLines={1}>
                      {r.status === 'moved' && r.cancel?.movedTo
                        ? `הועבר ל־${short(r.cancel.movedTo)}`
                        : r.status === 'canceled' && r.cancel?.reason
                          ? r.cancel.reason
                          : timeRange(r.course.start, r.course.end)}
                      {r.movedFrom ? ` · הועבר מ־${short(r.movedFrom)}` : ''} · {r.workplace.name}
                    </Text>
                  </View>
                  <View style={[styles.chip, { backgroundColor: t.bg }]}>
                    <Text style={[styles.chipText, { color: t.fg }]}>{t.label}</Text>
                  </View>
                  <EnterChevron size={18} />
                </Pressable>
              );
            })}
          </View>
        ))
      )}
      {sessionDialog.dialog}
    </View>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    wrap: { gap: spacing.md },
    summary: { backgroundColor: colors.brandLight, borderRadius: radius.md, padding: spacing.md, gap: 2 },
    summaryTitle: { fontSize: 15, fontWeight: '800', color: colors.brandDark, textAlign: TEXT_RIGHT },
    summaryLine: { fontSize: 13, color: colors.brandDark, textAlign: TEXT_RIGHT },
    empty: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, padding: spacing.lg },
    emptyText: { fontSize: 15, color: colors.textMuted },
    day: {
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      padding: spacing.md,
      gap: spacing.xs,
    },
    dayTitle: { fontSize: 15, fontWeight: '800', color: colors.text, textAlign: TEXT_RIGHT },
    row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 48 },
    pressed: { opacity: 0.7 },
    bar: { width: 4, alignSelf: 'stretch', borderRadius: 2 },
    texts: { flex: 1, minWidth: 0, gap: 2 },
    name: { fontSize: 15, fontWeight: '700', color: colors.text, textAlign: TEXT_RIGHT },
    strike: { textDecorationLine: 'line-through', color: colors.textMuted },
    meta: { fontSize: 12, color: colors.textMuted, textAlign: TEXT_RIGHT },
    chip: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 12 },
    chipText: { fontSize: 12, fontWeight: '700' },
  });
