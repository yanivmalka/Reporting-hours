/**
 * פס שבוע מכווץ — מוצג מוצמד לראש "יומן" כשגוללים מעבר ללוח השנה החודשי.
 * מציג את שם החודש ואת ימי השבוע (שם היום, התאריך העברי ונקודת המצב),
 * מעבר בין שבועות בחיצים או בהחלקה (אופקית בלבד: ימינה = השבוע הבא), וכפתור
 * "היום". המעבר: פס ימים רציף (קודם · נוכחי · הבא) שזז אופקית כיחידה אחת,
 * 700ms ease-in-out, ברוחב מלא ובלי עיקום — ב־web מעבר CSS בלבד. הרשימה
 * שמתחת מתעדכנת מיד (onWeekChange נקרא בתחילת המעבר).
 * לחיצה על יום בוחרת אותו / משלימה טווח — בדיוק כמו בלוח החודשי.
 */
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, StyleSheet, View } from 'react-native';
import { hebrewDay } from '../lib/hebrewDate';
import { useShowHebrewDates } from '../lib/hebrewDatePref';
import { DayDot, useDayStatus } from './DayDot';
import { Text } from './Text';
import { Pressable } from './Pressable';
import { Icon } from './Icon';
import { iso, nextRange, type DateRangeValue } from './RangeCalendar';
import { useSwipe } from './useSwipe';
import { useI18n } from '../lib/i18n';
import { useTheme } from '../theme/ThemeContext';
import { radius, spacing } from '../theme/colors';
import { useStyles, type ColorScheme } from '../theme/useStyles';

const MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
const WEEKDAYS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];

/** יום ראשון של השבוע שבו נמצא התאריך ("YYYY-MM-DD"). */
export function weekStartOf(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return iso(dt.getFullYear(), dt.getMonth(), dt.getDate() - dt.getDay());
}

export function shiftWeek(weekStart: string, delta: number): string {
  const [y, m, d] = weekStart.split('-').map(Number);
  return iso(y, m - 1, d + delta * 7);
}

/** החודש ("YYYY-MM") שאליו שייך השבוע — לפי יום רביעי שלו. */
export function monthOfWeek(weekStart: string): string {
  const [y, m, d] = weekStart.split('-').map(Number);
  return iso(y, m - 1, d + 3).slice(0, 7);
}

type Props = {
  weekStart: string;
  onWeekChange: (weekStart: string) => void;
  onToday: () => void;
  range: DateRangeValue;
  onRangeChange: (range: DateRangeValue) => void;
  counts: Record<string, number>;
};

export function WeekStrip({ weekStart, onWeekChange, onToday, range, onRangeChange, counts }: Props) {
  const styles = useStyles(makeStyles);
  const statusOf = useDayStatus();
  const { colors } = useTheme();
  const { isRTL } = useI18n();
  const heb = useShowHebrewDates();
  // השבוע שמוצג בפס בפועל — מתעדכן לשבוע החדש רק בסוף המעבר.
  const [shown, setShown] = useState(weekStart);
  const [width, setWidth] = useState(0);
  const anim = useRef(new Animated.Value(0)).current; // ‎-1 = הקודם · 0 = נוכחי · 1 = הבא
  const [webShift, setWebShift] = useState<{ to: -1 | 0 | 1; animate: boolean }>({ to: 0, animate: false });
  const moving = useRef(false);

  // שינוי שבוע מבחוץ (בחירה בלוח החודשי, "היום") — בלי מעבר.
  useEffect(() => {
    if (!moving.current) setShown(weekStart);
  }, [weekStart]);

  function go(delta: 1 | -1) {
    if (moving.current) return;
    const target = shiftWeek(shown, delta);
    moving.current = true;
    onWeekChange(target); // הרשימה מתעדכנת מיד
    const done = () => {
      setShown(target);
      moving.current = false;
      if (Platform.OS === 'web') setWebShift({ to: 0, animate: false });
      else anim.setValue(0);
    };
    if (!width) return done();
    if (Platform.OS === 'web') {
      setWebShift({ to: delta, animate: true });
      setTimeout(done, SLIDE_MS);
    } else {
      Animated.timing(anim, {
        toValue: delta,
        duration: SLIDE_MS,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      }).start(done);
    }
  }

  const swipe = useSwipe(
    () => go(1),
    () => go(-1),
  );
  const [y, m, d] = shown.split('-').map(Number);
  const days = Array.from({ length: 7 }, (_, i) => iso(y, m - 1, d + i));
  const now = new Date();
  const today = iso(now.getFullYear(), now.getMonth(), now.getDate());
  const showsToday = days.includes(today);
  // שבוע שחוצה חודשים: "אוקטובר–נובמבר 2026"
  const m1 = Number(days[0].slice(5, 7)) - 1;
  const m2 = Number(days[6].slice(5, 7)) - 1;
  const title =
    m1 === m2 ? `${MONTHS[m1]} ${days[6].slice(0, 4)}` : `${MONTHS[m1]}–${MONTHS[m2]} ${days[6].slice(0, 4)}`;

  return (
    <View style={styles.wrap} {...swipe}>
      <View style={styles.head}>
        <Pressable
          onPress={() => go(-1)}
          style={styles.nav}
          accessibilityRole="button"
          accessibilityLabel="שבוע קודם"
        >
          <Icon name={isRTL ? 'chevron-right' : 'chevron-left'} size={24} color={colors.brand} />
        </Pressable>
        <Text style={styles.title}>{title}</Text>
        <Pressable
          onPress={() => go(1)}
          style={styles.nav}
          accessibilityRole="button"
          accessibilityLabel="שבוע הבא"
        >
          <Icon name={isRTL ? 'chevron-left' : 'chevron-right'} size={24} color={colors.brand} />
        </Pressable>
        <Pressable
          onPress={onToday}
          disabled={showsToday}
          style={[styles.todayBtn, showsToday && styles.todayBtnOff]}
          accessibilityRole="button"
          accessibilityLabel="מעבר להיום"
        >
          <Icon name="calendar-today" size={16} color={showsToday ? colors.textMuted : colors.brand} />
          <Text style={[styles.todayText, showsToday && styles.todayTextOff]}>היום</Text>
        </Pressable>
      </View>
      <View style={styles.viewport} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {/*
          הפס: [קודם · נוכחי · הבא] בכיוון RTL — הקודם מימין והבא משמאל. הפס
          הרחב מיושר לימין, ולכן הזזה ב־W מציגה את השבוע האמצעי; מעבר לבא =
          הזזה נוספת ימינה, לקודם = חזרה שמאלה.
        */}
        <Animated.View
          style={[
            styles.track,
            { width: width * 3 || undefined },
            Platform.OS === 'web'
              ? ({
                  transform: [{ translateX: width + webShift.to * width }],
                  transitionProperty: webShift.animate ? 'transform' : 'none',
                  transitionDuration: `${SLIDE_MS}ms`,
                  transitionTimingFunction: 'ease-in-out',
                } as object)
              : {
                  transform: [
                    {
                      translateX: anim.interpolate({
                        inputRange: [-1, 0, 1],
                        outputRange: [0, width, 2 * width],
                      }),
                    },
                  ],
                },
          ]}
        >
          {[-1, 0, 1].map((delta) => {
            const ws = shiftWeek(shown, delta);
            const [wy, wm, wd] = ws.split('-').map(Number);
            const week = Array.from({ length: 7 }, (_, i) => iso(wy, wm - 1, wd + i));
            return (
              <View key={ws} style={[styles.row, { width: width || undefined }]}>
                {week.map((day, i) => {
                  const inRange = range != null && day >= range.from && day <= range.to;
                  const isEdge = range != null && (day === range.from || day === range.to);
                  const count = counts[day] ?? 0;
                  return (
                    <Pressable
                      key={day}
                      style={styles.cell}
                      onPress={() => onRangeChange(nextRange(range, day))}
                      accessibilityLabel={day}
                    >
                      <Text style={styles.weekday}>{WEEKDAYS[i]}</Text>
                      <View
                        style={[
                          styles.day,
                          inRange && styles.dayInRange,
                          isEdge && styles.dayEdge,
                          day === today && !inRange && styles.dayToday,
                        ]}
                      >
                        <Text style={[styles.dayText, count === 0 && styles.dayTextEmpty, isEdge && styles.dayTextEdge]}>
                          {Number(day.slice(8))}
                        </Text>
                        {heb ? (
                          <Text style={[styles.dayHeb, isEdge && styles.dayTextEdge]}>{hebrewDay(day)}</Text>
                        ) : null}
                      </View>
                      <DayDot status={statusOf(day)} />
                    </Pressable>
                  );
                })}
              </View>
            );
          })}
        </Animated.View>
      </View>
    </View>
  );
}

/** משך מעבר שבוע בפס. */
const SLIDE_MS = 700;

const makeStyles = (c: ColorScheme) =>
  StyleSheet.create({
    wrap: {
      backgroundColor: c.surface,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
      paddingBottom: spacing.xs,
      elevation: 4,
      shadowColor: '#000',
      shadowOpacity: 0.12,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 2 },
    },
    head: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      paddingHorizontal: spacing.sm,
    },
    viewport: { width: '100%', overflow: 'hidden' },
    track: { flexDirection: 'row' },
    nav: {
      width: 40,
      height: 40,
      alignItems: 'center',
      justifyContent: 'center',
    },
    title: {
      flex: 1,
      textAlign: 'center',
      fontSize: 16,
      fontWeight: '800',
      color: c.text,
    },
    todayBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      height: 32,
      paddingHorizontal: spacing.sm,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: c.brand,
      marginStart: spacing.xs,
    },
    todayBtnOff: {
      borderColor: c.border,
    },
    todayText: {
      fontSize: 13,
      fontWeight: '700',
      color: c.brand,
    },
    todayTextOff: {
      color: c.textMuted,
    },
    row: {
      flexDirection: 'row',
    },
    cell: {
      flex: 1,
      alignItems: 'center',
      gap: 2,
    },
    weekday: {
      fontSize: 11,
      fontWeight: '700',
      color: c.textMuted,
    },
    day: {
      width: 38,
      height: 40,
      borderRadius: 19,
      alignItems: 'center',
      justifyContent: 'center',
    },
    dayInRange: { backgroundColor: c.brandLight },
    dayEdge: { backgroundColor: c.brand },
    dayToday: { borderWidth: 1.5, borderColor: c.brand },
    dayText: { fontSize: 15, fontWeight: '600', color: c.text },
    dayTextEdge: { color: c.textOnBrand, fontWeight: '800' },
    dayTextEmpty: { color: c.textMuted, fontWeight: '400' },
    dayHeb: { fontSize: 9, color: c.textMuted, lineHeight: 11 },
    count: { fontSize: 10, fontWeight: '700', color: c.brand, height: 13 },
    countHidden: { color: 'transparent' },
  });
