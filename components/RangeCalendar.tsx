/**
 * לוח שנה חודשי לסינון — בחירת יום או טווח ימים.
 *
 * - לחיצה על יום: בוחרת אותו (סינון ליום אחד).
 * - לחיצה נוספת על יום אחר: משלימה טווח בין שני הימים.
 * - לחיצה על היום הנבחר היחיד, או "ניקוי": חזרה לכל החודש.
 * ימים שיש בהם דיווחים מסומנים במספר הדיווחים.
 */
import { StyleSheet, Text, View } from 'react-native';
import { Pressable } from './Pressable';
import { hebrewDay, hebrewMonthSpan } from '../lib/hebrewDate';
import { useI18n } from '../lib/i18n';
import { useSwipe } from './useSwipe';
import { radius, spacing } from '../theme/colors';
import { useStyles, type ColorScheme, type StyleLayout } from '../theme/useStyles';

const MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
const WEEKDAYS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];

export type DateRangeValue = { from: string; to: string } | null;

export function iso(y: number, m: number, d: number): string {
  const dt = new Date(y, m, d);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`;
}

/** "YYYY-MM" של החודש שלפני / אחרי */
export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  return iso(y, m - 1 + delta, 1).slice(0, 7);
}

type Props = {
  /** החודש המוצג, "YYYY-MM" */
  month: string;
  onMonthChange: (month: string) => void;
  range: DateRangeValue;
  onRangeChange: (range: DateRangeValue) => void;
  /** מספר דיווחים לכל תאריך */
  counts: Record<string, number>;
};

/**
 * לחיצה על יום: בלי בחירה — היום הזה; יום יחיד נבחר — אותו יום מנקה,
 * יום אחר משלים טווח; טווח קיים — מתחיל בחירה חדשה.
 */
export function nextRange(range: DateRangeValue, day: string): DateRangeValue {
  if (!range) return { from: day, to: day };
  if (range.from === range.to) {
    if (day === range.from) return null;
    return day < range.from ? { from: day, to: range.from } : { from: range.from, to: day };
  }
  return { from: day, to: day };
}

export function RangeCalendar({ month, onMonthChange, range, onRangeChange, counts }: Props) {
  const styles = useStyles(makeStyles);
  const { isRTL } = useI18n();
  const swipe = useSwipe(
    () => onMonthChange(shiftMonth(month, 1)),
    () => onMonthChange(shiftMonth(month, -1)),
  );
  const [y, m] = month.split('-').map(Number);
  const first = new Date(y, m - 1, 1).getDay();
  const days = new Date(y, m, 0).getDate();
  const cells: (string | null)[] = Array.from({ length: first }, () => null);
  for (let d = 1; d <= days; d++) cells.push(iso(y, m - 1, d));
  while (cells.length % 7) cells.push(null);
  const today = iso(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());

  const tap = (day: string) => onRangeChange(nextRange(range, day));
  const thisMonth = today.slice(0, 7);

  return (
    <View style={styles.wrap} {...swipe}>
      <View style={styles.head}>
        <Pressable onPress={() => onMonthChange(shiftMonth(month, -1))} style={styles.nav} accessibilityLabel="חודש קודם">
          <Text style={styles.navText}>{isRTL ? '→' : '←'}</Text>
        </Pressable>
        <View style={styles.titleBox}>
          <Text style={styles.title}>
            {MONTHS[m - 1]} {y}
          </Text>
          <Text style={styles.titleHeb}>{hebrewMonthSpan(y, m - 1)}</Text>
          {month !== thisMonth ? (
            <Pressable onPress={() => onMonthChange(thisMonth)} hitSlop={6} accessibilityRole="button">
              <Text style={styles.todayLink}>חזרה להיום</Text>
            </Pressable>
          ) : null}
        </View>
        <Pressable onPress={() => onMonthChange(shiftMonth(month, 1))} style={styles.nav} accessibilityLabel="חודש הבא">
          <Text style={styles.navText}>{isRTL ? '←' : '→'}</Text>
        </Pressable>
      </View>

      <View style={styles.week}>
        {WEEKDAYS.map((w) => (
          <Text key={w} style={styles.weekday}>
            {w}
          </Text>
        ))}
      </View>

      <View style={styles.grid}>
        {cells.map((cell, i) => {
          if (!cell) return <View key={`e${i}`} style={styles.cell} />;
          const inRange = range != null && cell >= range.from && cell <= range.to;
          const isEdge = range != null && (cell === range.from || cell === range.to);
          const count = counts[cell] ?? 0;
          return (
            <Pressable key={cell} style={styles.cell} onPress={() => tap(cell)} accessibilityLabel={cell}>
              <View
                style={[
                  styles.day,
                  inRange && styles.dayInRange,
                  isEdge && styles.dayEdge,
                  cell === today && !inRange && styles.dayToday,
                ]}
              >
                <Text style={[styles.dayText, isEdge && styles.dayTextEdge, count === 0 && styles.dayTextEmpty]}>
                  {Number(cell.slice(8))}
                </Text>
                <Text style={[styles.dayHeb, isEdge && styles.dayTextEdge]}>{hebrewDay(cell)}</Text>
              </View>
              <Text style={[styles.count, count === 0 && styles.countHidden]}>{count || '·'}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const makeStyles = (c: ColorScheme, layout: StyleLayout) =>
  StyleSheet.create({
    wrap: {
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: radius.md,
      padding: spacing.sm,
      gap: spacing.xs,
    },
    head: {
      flexDirection: layout.rowStart,
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    nav: {
      width: 44,
      height: 40,
      alignItems: 'center',
      justifyContent: 'center',
    },
    navText: {
      fontSize: 22,
      fontWeight: '700',
      color: c.brand,
    },
    titleBox: {
      alignItems: 'center',
    },
    titleHeb: {
      fontSize: 12,
      color: c.textMuted,
    },
    todayLink: {
      fontSize: 12,
      fontWeight: '700',
      color: c.brand,
      paddingTop: 2,
    },
    dayHeb: {
      fontSize: 9,
      color: c.textMuted,
      marginTop: -2,
    },
    title: {
      fontSize: 16,
      fontWeight: '800',
      color: c.text,
    },
    week: {
      flexDirection: layout.rowStart,
    },
    weekday: {
      width: `${100 / 7}%`,
      textAlign: 'center',
      fontSize: 12,
      fontWeight: '700',
      color: c.textMuted,
    },
    grid: {
      flexDirection: layout.rowStart,
      flexWrap: 'wrap',
    },
    cell: {
      width: `${100 / 7}%`,
      alignItems: 'center',
      paddingVertical: 2,
    },
    day: {
      width: 40,
      height: 42,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    dayInRange: {
      backgroundColor: c.brandLight,
    },
    dayEdge: {
      backgroundColor: c.brand,
    },
    dayToday: {
      borderWidth: 1.5,
      borderColor: c.brand,
    },
    dayText: {
      fontSize: 15,
      fontWeight: '600',
      color: c.text,
    },
    dayTextEdge: {
      color: c.textOnBrand,
      fontWeight: '800',
    },
    dayTextEmpty: {
      color: c.textMuted,
      fontWeight: '400',
    },
    count: {
      fontSize: 10,
      fontWeight: '700',
      color: c.brand,
      height: 13,
    },
    countHidden: {
      color: 'transparent',
    },
  });
