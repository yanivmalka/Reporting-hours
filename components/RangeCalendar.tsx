/**
 * לוח שנה חודשי לסינון — בחירת יום או טווח ימים.
 *
 * - לחיצה על יום: בוחרת אותו (סינון ליום אחד).
 * - לחיצה נוספת על יום אחר: משלימה טווח בין שני הימים.
 * - לחיצה על היום הנבחר היחיד, או "ניקוי": חזרה לכל החודש.
 * ימים שיש בהם דיווחים מסומנים במספר הדיווחים.
 */
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { DayDot, DayDotsLegend, useDayStatus } from './DayDot';
import type { DayStatus } from '../lib/dayStatus';
import { Text } from './Text';
import { Pressable } from './Pressable';
import { hebrewDay, hebrewMonthSpan } from '../lib/hebrewDate';
import { useShowHebrewDates } from '../lib/hebrewDatePref';
import { useI18n } from '../lib/i18n';
import { MonthSlide } from './MonthSlide';
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
  /** כשמוגדר — לחיצה על יום קוראת לו במקום לבחור טווח (מצב "מעבר ליום"). */
  onDayPress?: (day: string) => void;
  /** מצב היום לנקודות — כשהמסך מסנן (למשל לפי מקום עבודה); אחרת הכול */
  statusOf?: (date: string) => DayStatus | null;
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

/** מרוחב זה ומעלה — שני חודשים זה לצד זה (הקודם והנוכחי). */
const TWO_MONTHS_MIN_WIDTH = 600;
/** רוחב מרבי לחודש אחד — כדי שהתאים לא יימתחו במסך רחב. */
const MONTH_MAX_WIDTH = 340;

export function RangeCalendar({ month, onMonthChange, range, onRangeChange, counts, onDayPress, statusOf }: Props) {
  const styles = useStyles(makeStyles);
  const { isRTL } = useI18n();
  const [width, setWidth] = useState(0);
  const swipe = useSwipe(
    () => onMonthChange(shiftMonth(month, 1)),
    () => onMonthChange(shiftMonth(month, -1)),
  );
  const today = iso(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
  const thisMonth = today.slice(0, 7);
  const two = width >= TWO_MONTHS_MIN_WIDTH;
  // במסך רחב: החודש הקודם לצד החודש המוצג (בעברית — הקודם מימין).
  const tap = (day: string) => (onDayPress ? onDayPress(day) : onRangeChange(nextRange(range, day)));

  return (
    <View style={styles.wrap} {...swipe} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <View style={styles.head}>
        <Pressable onPress={() => onMonthChange(shiftMonth(month, -1))} style={styles.nav} accessibilityLabel="חודש קודם">
          <Text style={styles.navText}>{isRTL ? '→' : '←'}</Text>
        </Pressable>
        <Pressable onPress={() => onMonthChange(shiftMonth(month, 1))} style={styles.nav} accessibilityLabel="חודש הבא">
          <Text style={styles.navText}>{isRTL ? '←' : '→'}</Text>
        </Pressable>
      </View>
      <MonthSlide
        pageKey={month}
        render={(shownMonth) => (
          <View style={styles.months}>
            {(two ? [shiftMonth(shownMonth, -1), shownMonth] : [shownMonth]).map((mk) => (
              <MonthGrid
                key={mk}
                month={mk}
                active={two && mk === shownMonth}
                range={range}
                counts={counts}
                today={today}
                onTap={tap}
                statusOf={statusOf}
              />
            ))}
          </View>
        )}
      />
      {month !== thisMonth ? (
        <Pressable onPress={() => onMonthChange(thisMonth)} hitSlop={6} accessibilityRole="button" style={styles.todayRow}>
          <Text style={styles.todayLink}>חזרה לחודש הנוכחי</Text>
        </Pressable>
      ) : null}
      <DayDotsLegend />
    </View>
  );
}

function MonthGrid({
  month,
  active,
  range,
  counts,
  today,
  onTap,
  statusOf: statusOverride,
}: {
  month: string;
  /** החודש שהרשימה מציגה (כשמוצגים שניים) */
  active: boolean;
  range: DateRangeValue;
  counts: Record<string, number>;
  today: string;
  onTap: (day: string) => void;
  statusOf?: (date: string) => DayStatus | null;
}) {
  const styles = useStyles(makeStyles);
  const ownStatus = useDayStatus();
  const statusOf = statusOverride ?? ownStatus;
  const heb = useShowHebrewDates();
  const [y, m] = month.split('-').map(Number);
  const first = new Date(y, m - 1, 1).getDay();
  const days = new Date(y, m, 0).getDate();
  const cells: (string | null)[] = Array.from({ length: first }, () => null);
  for (let d = 1; d <= days; d++) cells.push(iso(y, m - 1, d));
  while (cells.length % 7) cells.push(null);

  return (
    <View style={styles.month}>
      <View style={styles.titleBox}>
        <Text style={[styles.title, active && styles.titleActive]}>
          {MONTHS[m - 1]} {y}
        </Text>
        {heb ? <Text style={styles.titleHeb}>{hebrewMonthSpan(y, m - 1)}</Text> : null}
      </View>
      <View style={styles.week}>
        {WEEKDAYS.map((w) => (
          <Text key={w} style={styles.weekday}>
            {w}
          </Text>
        ))}
      </View>
      <View style={styles.grid}>
        {chunk7(cells).map((row, r) => (
          <View key={`r${r}`} style={styles.row}>
            {row.map((cell, j) => {
              const i = r * 7 + j;
          if (!cell) return <View key={`e${i}`} style={styles.cell} />;
          const inRange = range != null && cell >= range.from && cell <= range.to;
          const isEdge = range != null && (cell === range.from || cell === range.to);
          const count = counts[cell] ?? 0;
          return (
            <Pressable key={cell} style={styles.cell} onPress={() => onTap(cell)} accessibilityLabel={cell}>
              <View
                style={[
                  styles.day,
                  inRange && styles.dayInRange,
                  isEdge && styles.dayEdge,
                  cell === today && !inRange && styles.dayToday,
                ]}
              >
                <Text style={[styles.dayText, count === 0 && styles.dayTextEmpty, isEdge && styles.dayTextEdge]}>
                  {Number(cell.slice(8))}
                </Text>
                {heb ? <Text style={[styles.dayHeb, isEdge && styles.dayTextEdge]}>{hebrewDay(cell)}</Text> : null}
              </View>
              <DayDot status={statusOf(cell)} />
            </Pressable>
          );
        })}
        </View>
        ))}
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
      marginBottom: -36,
      zIndex: 1,
    },
    months: {
      flexDirection: layout.rowStart,
      justifyContent: 'center',
      gap: spacing.lg,
    },
    month: {
      flex: 1,
      maxWidth: MONTH_MAX_WIDTH,
      gap: 2,
    },
    titleActive: {
      color: c.brand,
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
      minHeight: 40,
      justifyContent: 'center',
      marginBottom: 2,
    },
    titleHeb: {
      fontSize: 12,
      color: c.textMuted,
    },
    todayLink: {
      fontSize: 12,
      fontWeight: '700',
      color: c.brand,
    },
    todayRow: {
      alignSelf: 'center',
      paddingVertical: 2,
    },
    dayHeb: {
      fontSize: 9,
      color: c.textMuted,
      marginTop: -2,
    },
    title: {
      fontSize: 16,
      fontWeight: '700',
      color: c.text,
    },
    week: {
      flexDirection: layout.rowStart,
    },
    weekday: {
      flex: 1,
      textAlign: 'center',
      fontSize: 12,
      fontWeight: '700',
      color: c.textMuted,
    },
    grid: {},
    row: {
      flexDirection: layout.rowStart,
    },
    cell: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 2,
    },
    day: {
      width: 38,
      height: 38,
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

/** מחלק את תאי החודש לשורות של 7 — שורות מפורשות במקום flexWrap, כי באנדרואיד
 * עיגול הפיקסלים של 7 תאים ברוחב 100/7% חורג מהשורה, והתא השביעי (שבת) נשבר לשורה הבאה. */
function chunk7<T>(list: T[]): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < list.length; i += 7) rows.push(list.slice(i, i + 7));
  return rows;
}
