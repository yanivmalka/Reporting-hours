/**
 * עיגולי מפגשים של קורס — אותו קוד צבעים בלוח הבקרה ובדף הקורס:
 *   ✓ ירוק — דווח · מסגרת — מתוכנן / טרם דווח · אדום מקווקו — בוטל (נשאר בפוטנציאל) ·
 *   אפור מחוק — הוסר מהפוטנציאל / חג · מקווקו בצבע המערכת — חופשה · "←" — הועבר ·
 *   + קטן בפינה — מפגש נוסף.
 * תצוגה בלבד: לחיצה על עיגול מועברת ל־`onPress` (ניווט או הצגת פרטים).
 */
import { StyleSheet, View } from 'react-native';
import { Text } from './Text';
import { Pressable } from './Pressable';
import { courseReport, courseSessions, type Course, type CourseSession } from '../lib/courses';
import { mix } from '../theme/shades';
import { spacing } from '../theme/colors';
import { useTheme } from '../theme/ThemeContext';
import { useStyles, type ColorScheme, type StyleLayout } from '../theme/useStyles';

export type DotState = 'reported' | 'open' | 'canceled' | 'removed' | 'auto' | 'vacation' | 'moved';

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
            : s.cancel?.kind === 'vacation'
              ? 'vacation'
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
    vacation: 'חופשה',
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

type Tone = { bg: string; fg: string; border: string; dashed?: boolean; strike?: boolean };

function useTones(): Record<DotState, Tone> {
  const { colors } = useTheme();
  return {
    reported: { bg: mix(colors.success, colors.surface, 0.82), fg: colors.success, border: colors.success },
    open: { bg: colors.surface, fg: colors.textMuted, border: colors.border },
    canceled: { bg: mix(colors.danger, colors.surface, 0.85), fg: colors.danger, border: colors.danger, dashed: true },
    removed: { bg: colors.background, fg: colors.textMuted, border: colors.textMuted, dashed: true, strike: true },
    auto: { bg: colors.background, fg: colors.textMuted, border: colors.textMuted, dashed: true, strike: true },
    vacation: { bg: colors.brandLight, fg: colors.brand, border: colors.brand, dashed: true, strike: true },
    moved: { bg: colors.background, fg: colors.textMuted, border: colors.textMuted, dashed: true, strike: true },
  };
}

/** עיגול בודד — בעיצוב האמיתי. מפגש נוסף: + קטן בפינה. */
function Dot({
  state,
  label,
  extra,
  small,
  selected,
}: {
  state: DotState;
  label: string;
  extra?: boolean;
  small?: boolean;
  selected?: boolean;
}) {
  const styles = useStyles(makeStyles);
  const { colors } = useTheme();
  const t = useTones()[state];
  return (
    <View
      style={[
        small ? styles.dotSmall : styles.dot,
        { backgroundColor: t.bg, borderColor: t.border, borderStyle: t.dashed ? 'dashed' : 'solid' },
        selected && { borderWidth: 2, borderColor: colors.brand },
      ]}
    >
      <Text style={[small ? styles.labelSmall : styles.label, { color: t.fg }, t.strike && styles.strike]}>
        {label}
      </Text>
      {extra ? (
        <View style={[styles.plus, small && styles.plusSmall]}>
          <Text style={[styles.plusText, small && styles.plusTextSmall]}>+</Text>
        </View>
      ) : null}
    </View>
  );
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
  return (
    <View style={styles.row}>
      {dots.map((s) => {
        const label =
          s.state === 'moved' ? `${day(s.date)}←` : s.movedFrom ? `←${day(s.date)}` : day(s.date);
        return (
          <Pressable
            key={s.date}
            disabled={!onPress}
            onPress={() => onPress?.(s)}
            accessibilityRole="button"
            accessibilityLabel={dotDescription(s)}
          >
            <Dot
              state={s.state}
              label={s.state === 'reported' ? `${label}✓` : label}
              extra={s.kind === 'extra'}
              selected={selected === s.date}
            />
          </Pressable>
        );
      })}
    </View>
  );
}

const MONTH_NAMES = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];

/** עיגולי המפגשים מקובצים לפי חודש, עם שם החודש בתחילת השורה. */
export function SessionDotsByMonth({
  dots,
  onPress,
  selected,
}: {
  dots: readonly SessionDot[];
  onPress?: (dot: SessionDot) => void;
  selected?: string | null;
}) {
  const styles = useStyles(makeStyles);
  const byMonth = new Map<string, SessionDot[]>();
  for (const d of dots) {
    const k = d.date.slice(0, 7);
    byMonth.set(k, [...(byMonth.get(k) ?? []), d]);
  }
  return (
    <View>
      {[...byMonth].map(([key, list]) => (
        <View key={key} style={styles.monthRow}>
          <Text style={styles.monthName}>{MONTH_NAMES[Number(key.slice(5, 7)) - 1]}</Text>
          <View style={styles.monthDots}>
            <SessionDots dots={list} selected={selected} onPress={onPress} />
          </View>
        </View>
      ))}
    </View>
  );
}

/**
 * מקרא לעיגולים: עיגולים קטנים בעיצוב האמיתי + תווית. כל פריט יחידה שלא
 * נשברת. "נמחק מהתכנון" לא מופיע — מפגש כזה מוסתר מהלו״ז.
 */
export function SessionDotsLegend() {
  const styles = useStyles(makeStyles);
  const items: { state: DotState; label: string; text: string; extra?: boolean }[] = [
    { state: 'reported', label: '✓', text: 'דווח' },
    { state: 'open', label: '', text: 'מתוכנן' },
    { state: 'canceled', label: '', text: 'בוטל' },
    { state: 'auto', label: '', text: 'חג' },
    { state: 'vacation', label: '', text: 'חופשה' },
    { state: 'moved', label: '←', text: 'הועבר' },
    { state: 'open', label: '', text: 'מפגש נוסף', extra: true },
  ];
  return (
    <View style={styles.legend}>
      {items.map((i) => (
        <View key={i.text} style={styles.legendItem}>
          <Dot state={i.state} label={i.label} extra={i.extra} small />
          <Text style={styles.legendText}>{i.text}</Text>
        </View>
      ))}
    </View>
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
    dotSmall: {
      width: 14,
      height: 14,
      borderRadius: 7,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    label: { fontSize: 12, fontWeight: '700' },
    labelSmall: { fontSize: 8, fontWeight: '700', lineHeight: 10 },
    strike: { textDecorationLine: 'line-through' },
    plus: {
      position: 'absolute',
      top: -4,
      end: -4,
      width: 13,
      height: 13,
      borderRadius: 6.5,
      backgroundColor: c.brand,
      alignItems: 'center',
      justifyContent: 'center',
    },
    plusSmall: { top: -3, end: -3, width: 8, height: 8, borderRadius: 4 },
    plusText: { fontSize: 10, lineHeight: 12, fontWeight: '800', color: c.textOnBrand },
    plusTextSmall: { fontSize: 7, lineHeight: 8 },
    legend: { flexDirection: layout.rowStart, flexWrap: 'wrap', columnGap: spacing.md, rowGap: 6 },
    legendItem: { flexDirection: layout.rowStart, alignItems: 'center', gap: 4 },
    legendText: { fontSize: 11, color: c.textMuted },
    monthRow: { flexDirection: layout.rowStart, alignItems: 'flex-start', gap: spacing.sm, paddingTop: spacing.sm },
    monthName: { width: 56, fontSize: 12, color: c.textMuted, textAlign: layout.textStart, paddingTop: 7 },
    monthDots: { flex: 1, minWidth: 0 },
  });
