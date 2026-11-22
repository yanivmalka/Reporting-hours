/**
 * נקודות מצב יום בתאריכונים ומקרא בתחתית — נקודה מלאה למפגשים שמתקיימים (ירוקה: הכול
 * דווח · כתומה: יש מפגש שעבר ולא דווח, גם דיווח חלקי · בצבע המערכת: מתוכנן בעתיד), ולצדה טבעת
 * לכל סוג מפגש שלא מתקיים באותו יום (אדומה: בוטל · אפורה: הועבר · בצבע המערכת: חופשה ·
 * מלאה בהירה: חג) — כמו בעיגולי המפגשים (SessionDots). המקרא מציג רק את הסוגים שמופיעים
 * בחודש המוצג. `useDayStatus` טוען את הנתונים בעצמו, כך שכל תאריכון מציג את אותן נקודות.
 */
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from './Text';
import { loadCourses } from '../lib/courses';
import { DAY_STATUS_ORDER, dayStatusIndex, type DayStatus, type DayStatusInput } from '../lib/dayStatus';
import { onDataChanged } from '../lib/demo';
import { loadReports } from '../lib/reports';
import { onLocalWrite } from '../lib/storage';
import { useTrackingStart } from '../lib/trackingStart';
import { loadWorkplaces } from '../lib/workplaces';
import { useTheme } from '../theme/ThemeContext';
import type { AppColors } from '../theme/colors';
import { mix } from '../theme/shades';

export function dayDotColor(status: DayStatus, colors: AppColors): string {
  switch (status) {
    case 'done':
      return colors.success;
    case 'missing':
      return colors.warning;
    case 'canceled':
      return colors.danger;
    case 'moved':
    case 'holiday':
      return colors.textMuted;
    case 'vacation':
    default:
      // מתוכנן — נקודה מלאה בצבע המערכת (חופשה — טבעת באותו צבע)
      return colors.brand;
  }
}

/** טבעת (מפגש שלא מתקיים) או נקודה מלאה. חג — נקודה בהירה מלאה. */
const RING: Partial<Record<DayStatus, true>> = { canceled: true, moved: true, vacation: true };

export const DAY_STATUS_LABEL: Record<DayStatus, string> = {
  done: 'הכול דווח',
  missing: 'חסר דיווח',
  planned: 'מתוכנן',
  canceled: 'בוטל',
  moved: 'הועבר',
  vacation: 'חופשה',
  holiday: 'חג',
};

const NONE: readonly DayStatus[] = [];

/** המפתחות שמשפיעים על מצב היום: דיווחים, קורסים, מקומות, סימוני מפגש, חגים וחופשות. */
const STATUS_KEYS = /^reporting-hours\/(reports|courses|workplaces|sessions|holiday-cancel|vacations)\//;

/** מצב הימים — נטען פעם אחת ומתעדכן בכל שינוי נתונים (כולל שמירת דיווח או ביטול מפגש). `input` — כשהנתונים כבר בידי המסך. */
export function useDayStatus(input?: DayStatusInput): (date: string) => readonly DayStatus[] {
  const [loaded, setLoaded] = useState<DayStatusInput | null>(null);
  // סימון מפגש (ביטול / העברה) משנה את אינדקס הביטולים בלי לשנות את הנתונים שבידי המסך.
  const [tick, setTick] = useState(0);
  const trackingStart = useTrackingStart();
  useEffect(() => {
    if (input) {
      return onLocalWrite((key) => {
        // האינדקס נבנה מחדש מיד אחרי הכתיבה — מחכים רגע לפני חישוב מחדש.
        if (STATUS_KEYS.test(key)) setTimeout(() => setTick((t) => t + 1), 150);
      });
    }
    let active = true;
    // כמה כתיבות ברצף (דיווח + מונה דקות) — רק הטעינה האחרונה קובעת.
    let seq = 0;
    const load = () => {
      const mine = ++seq;
      return Promise.all([loadCourses(), loadWorkplaces(), loadReports()]).then(([courses, workplaces, reports]) => {
        if (active && mine === seq) setLoaded({ courses, workplaces, reports });
      });
    };
    void load();
    const off = onDataChanged(() => void load());
    const offWrite = onLocalWrite((key) => {
      if (STATUS_KEYS.test(key)) void load();
    });
    return () => {
      active = false;
      off();
      offWrite();
    };
  }, [input]);
  const data = input ?? loaded;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => (data ? dayStatusIndex(data) : () => NONE), [data, tick, trackingStart]);
}

/** סימון אחד — נקודה מלאה או טבעת. */
function Mark({ status, size }: { status: DayStatus; size: number }) {
  const { colors } = useTheme();
  const color = dayDotColor(status, colors);
  const ring = RING[status];
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: ring ? 'transparent' : status === 'holiday' ? mix(color, colors.surface, 0.55) : color,
        borderWidth: ring ? Math.max(1.2, size / 5) : 0,
        borderColor: color,
      }}
    />
  );
}

/** נקודות היום — אחת לכל סימון (עד שלוש). בלי סימונים — מקום ריק באותו גובה. */
export function DayDot({ status, size = 6 }: { status: DayStatus | readonly DayStatus[] | null; size?: number }) {
  const list = status == null ? NONE : typeof status === 'string' ? [status] : status;
  return (
    <View style={[styles.dots, { height: size, marginTop: 2 }]}>
      {list.slice(0, 3).map((s) => (
        <Mark key={s} status={s} size={size} />
      ))}
    </View>
  );
}

/**
 * מקרא — רק הסוגים שמופיעים (`statuses`, בדרך כלל של החודש המוצג). בלי `statuses` —
 * שלושת המצבים הבסיסיים. רשימה ריקה — בלי מקרא.
 */
export function DayDotsLegend({ statuses }: { statuses?: readonly DayStatus[] }) {
  const { colors } = useTheme();
  const list = statuses ?? (['done', 'missing', 'planned'] as DayStatus[]);
  if (list.length === 0) return null;
  return (
    <View style={styles.legend}>
      {DAY_STATUS_ORDER.filter((s) => list.includes(s)).map((s) => (
        <View key={s} style={styles.item}>
          <Mark status={s} size={8} />
          <Text style={[styles.text, { color: colors.textMuted }]}>{DAY_STATUS_LABEL[s]}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  dots: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 2 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', columnGap: 14, rowGap: 4 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  text: { fontSize: 12 },
});
