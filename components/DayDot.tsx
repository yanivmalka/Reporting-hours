/**
 * נקודת מצב יום בתאריכונים ומקרא בתחתית — ירוקה: הכול דווח · כתומה: יש
 * מפגש שעבר ולא דווח (גם דיווח חלקי) · כהה: מפגש מתוכנן בעתיד.
 * `useDayStatus` טוען את הנתונים בעצמו, כך שכל תאריכון מציג את אותן נקודות.
 */
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from './Text';
import { loadCourses } from '../lib/courses';
import { dayStatusIndex, type DayStatus, type DayStatusInput } from '../lib/dayStatus';
import { onDataChanged } from '../lib/demo';
import { loadReports } from '../lib/reports';
import { onLocalWrite } from '../lib/storage';
import { useTrackingStart } from '../lib/trackingStart';
import { loadWorkplaces } from '../lib/workplaces';
import { useTheme } from '../theme/ThemeContext';
import type { AppColors } from '../theme/colors';

export function dayDotColor(status: DayStatus, colors: AppColors): string {
  return status === 'done' ? colors.success : status === 'missing' ? colors.warning : colors.text;
}

export const DAY_STATUS_LABEL: Record<DayStatus, string> = {
  done: 'הכול דווח',
  missing: 'חסר דיווח',
  planned: 'מתוכנן',
};

/** המפתחות שמשפיעים על מצב היום: דיווחים, קורסים, מקומות, סימוני מפגש, חגים וחופשות. */
const STATUS_KEYS = /^reporting-hours\/(reports|courses|workplaces|sessions|holiday-cancel|vacations)\//;

/** מצב הימים — נטען פעם אחת ומתעדכן בכל שינוי נתונים (כולל שמירת דיווח או ביטול מפגש). `input` — כשהנתונים כבר בידי המסך. */
export function useDayStatus(input?: DayStatusInput): (date: string) => DayStatus | null {
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
  return useMemo(() => (data ? dayStatusIndex(data) : () => null), [data, tick, trackingStart]);
}

export function DayDot({ status, size = 6 }: { status: DayStatus | null; size?: number }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        marginTop: 2,
        backgroundColor: status ? dayDotColor(status, colors) : 'transparent',
      }}
    />
  );
}

export function DayDotsLegend() {
  const { colors } = useTheme();
  return (
    <View style={styles.legend}>
      {(['done', 'missing', 'planned'] as DayStatus[]).map((s) => (
        <View key={s} style={styles.item}>
          <DayDot status={s} size={8} />
          <Text style={[styles.text, { color: colors.textMuted }]}>{DAY_STATUS_LABEL[s]}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  legend: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', columnGap: 14, rowGap: 4 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  text: { fontSize: 12 },
});
