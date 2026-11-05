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

/** מצב הימים — נטען פעם אחת ומתעדכן בכל שינוי נתונים. `input` — כשהנתונים כבר בידי המסך. */
export function useDayStatus(input?: DayStatusInput): (date: string) => DayStatus | null {
  const [loaded, setLoaded] = useState<DayStatusInput | null>(null);
  useEffect(() => {
    if (input) return;
    let active = true;
    const load = () =>
      Promise.all([loadCourses(), loadWorkplaces(), loadReports()]).then(([courses, workplaces, reports]) => {
        if (active) setLoaded({ courses, workplaces, reports });
      });
    void load();
    const off = onDataChanged(() => void load());
    return () => {
      active = false;
      off();
    };
  }, [input]);
  const data = input ?? loaded;
  return useMemo(() => (data ? dayStatusIndex(data) : () => null), [data]);
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
