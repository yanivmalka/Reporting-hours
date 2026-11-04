/**
 * עיגולי מפגשים של קורס — אותו קוד צבעים בלוח הבקרה ובדף הקורס:
 *   ✓ ירוק — דווח · מסגרת — מתוכנן / טרם דווח · אדום מקווקו — בוטל (נשאר בפוטנציאל) ·
 *   אפור מחוק — הוסר מהפוטנציאל / חג · "→" — הועבר · "+" — מפגש נוסף.
 * תצוגה בלבד: לחיצה על עיגול מועברת ל־`onPress` (ניווט או הצגת פרטים).
 */
import { StyleSheet, View } from 'react-native';
import { Text } from './Text';
import { Pressable } from './Pressable';
import { courseReport, courseSessions, type Course, type CourseSession } from '../lib/courses';
import { mix } from '../theme/shades';
import { useTheme } from '../theme/ThemeContext';
import { useStyles, type ColorScheme, type StyleLayout } from '../theme/useStyles';

export type DotState = 'reported' | 'open' | 'canceled' | 'removed' | 'auto' | 'moved';

export type SessionDot = CourseSession & { state: DotState; reportId?: string };

type ReportLike = Parameters<typeof courseReport>[2][number];

/** המפגשים של קורס בטווח, עם מצב לתצוגה (כולל אם דווח). */
export function sessionDots<R extends ReportLike & { id: string }>(
  course: Course,
  start: string,
  end: string,
  reports: readonly R[],
): SessionDot[] {
  return courseSessions(course, start, end).map((s) => {
    const report = courseReport(course, s.date, reports);
    const state: DotState = report
      ? 'reported'
      : s.cancel?.kind === 'canceled'
        ? 'canceled'
        : s.cancel?.kind === 'removed'
          ? 'removed'
          : s.cancel?.kind === 'auto'
            ? 'auto'
            : s.cancel?.kind === 'moved'
              ? 'moved'
              : 'open';
    return { ...s, state, reportId: report?.id };
  });
}

const day = (iso: string) => String(Number(iso.slice(8, 10)));

/** תיאור מפגש במילים — לנגישות ולשורת פרטים. */
export function dotDescription(s: SessionDot): string {
  const [y, m, d] = s.date.split('-').map(Number);
  const parts = [`${d}/${m}/${String(y).slice(2)}`];
  const label: Record<DotState, string> = {
    reported: 'דווח',
    open: 'מתוכנן',
    canceled: 'בוטל — נשאר בפוטנציאל',
    removed: 'בוטל והוסר מהפוטנציאל',
    auto: 'בוטל אוטומטית',
    moved: 'הועבר',
  };
  parts.push(label[s.state]);
  if (s.cancel?.reason) parts.push(s.cancel.reason);
  if (s.kind === 'extra') parts.push('מפגש נוסף');
  if (s.movedFrom) {
    const [, fm, fd] = s.movedFrom.split('-').map(Number);
    parts.push(`הועבר מ־${fd}/${fm}`);
  }
  return parts.join(' · ');
}

export function SessionDots({
  dots,
  onPress,
  selected,
}: {
  dots: readonly SessionDot[];
  onPress?: (dot: SessionDot) => void;
  selected?: string | null;
}) {
  const styles = useStyles(makeStyles);
  const { colors } = useTheme();
  const tone: Record<DotState, { bg: string; fg: string; border: string; dashed?: boolean; strike?: boolean }> = {
    reported: { bg: mix(colors.success, colors.surface, 0.82), fg: colors.success, border: colors.success },
    open: { bg: colors.surface, fg: colors.textMuted, border: colors.border },
    canceled: { bg: mix(colors.danger, colors.surface, 0.85), fg: colors.danger, border: colors.danger, dashed: true },
    removed: { bg: colors.background, fg: colors.textMuted, border: colors.textMuted, dashed: true, strike: true },
    auto: { bg: colors.background, fg: colors.textMuted, border: colors.textMuted, dashed: true, strike: true },
    moved: { bg: colors.background, fg: colors.textMuted, border: colors.textMuted, dashed: true, strike: true },
  };
  return (
    <View style={styles.row}>
      {dots.map((s) => {
        const t = tone[s.state];
        const extra = s.state === 'open' && s.kind !== 'regular';
        const label =
          s.state === 'moved'
            ? `${day(s.date)}→`
            : s.movedFrom
              ? `→${day(s.date)}`
              : s.kind === 'extra'
                ? `${day(s.date)}+`
                : day(s.date);
        return (
          <Pressable
            key={s.date}
            disabled={!onPress}
            onPress={() => onPress?.(s)}
            accessibilityRole="button"
            accessibilityLabel={dotDescription(s)}
            style={[
              styles.dot,
              {
                backgroundColor: extra ? colors.brandLight : t.bg,
                borderColor: extra ? colors.brand : t.border,
                borderStyle: t.dashed ? 'dashed' : 'solid',
              },
              selected === s.date && { borderWidth: 2, borderColor: colors.brand },
            ]}
          >
            <Text
              style={[
                styles.label,
                { color: extra ? colors.brand : t.fg },
                t.strike && styles.strike,
              ]}
            >
              {s.state === 'reported' ? `${label}✓` : label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** מקרא לעיגולים. */
export function SessionDotsLegend() {
  const styles = useStyles(makeStyles);
  return (
    <Text style={styles.legend}>
      ✓ דווח · מקווקו אדום — בוטל (נשאר בפוטנציאל) · מחוק אפור — הוסר / חג · → הועבר · + מפגש נוסף
    </Text>
  );
}

const makeStyles = (c: ColorScheme, layout: StyleLayout) =>
  StyleSheet.create({
    row: { flexDirection: layout.rowStart, flexWrap: 'wrap', gap: 4 },
    dot: {
      minWidth: 30,
      height: 30,
      paddingHorizontal: 5,
      borderRadius: 15,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    label: { fontSize: 12, fontWeight: '700' },
    strike: { textDecorationLine: 'line-through' },
    legend: { fontSize: 11, color: c.textMuted, textAlign: layout.textStart, lineHeight: 16 },
  });
