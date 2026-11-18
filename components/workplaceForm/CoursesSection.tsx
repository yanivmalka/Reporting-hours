import { View } from 'react-native';
import { Text } from '../Text';
import { Pressable } from '../Pressable';
import { Button } from '../Button';
import { courseScheduleLabel } from '../../lib/courses';
import { dateRange } from '../../lib/dashboard';
import { todayISO } from '../../lib/time';
import { FormField } from '../FormField';
import { EnterChevron } from '../Chevrons';
import type { WorkplaceFormModel } from './useWorkplaceForm';

/** קבוצת "קורסים": רשימת הקורסים של המקום והוספת קורס. */
export function CoursesSection({ w }: { w: WorkplaceFormModel }) {
  const { router, styles, params, id, isEdit, form, courses } = w;
  return (
    <>
          <>
        <FormField
          label="קורסים קבועים"
          hint="קורס מחזורי: יום בשבוע ושעות קבועות לתקופה. משמש למילוי מהיר של דיווח ולשעות המתוכננות לחודש."
        >
          {isEdit ? (
            <View style={styles.courses}>
              {/* פעילים קודם; קורסים שהסתיימו (ארכיון) — בסוף ומעומעמים */}
              {[...courses]
                .sort((x, y) => Number(x.to < todayISO()) - Number(y.to < todayISO()))
                .map((c) => {
                  const ended = c.to < todayISO();
                  return (
                    <Pressable
                      key={c.id}
                      // מעבר לדף פירוט הקורס (תצוגה; עריכה — בכפתור שם)
                      onPress={() => router.push({ pathname: '/course-form', params: { id: c.id, view: '1' } })}
                      accessibilityRole="link"
                      style={({ pressed }) => [
                        styles.course,
                        { flexDirection: 'row', alignItems: 'center', gap: 8 },
                        ended && { opacity: 0.6 },
                        pressed && { opacity: 0.7 },
                      ]}
                    >
                      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                        <Text style={styles.courseName}>
                          {c.name}
                          {ended ? ' · הסתיים (ארכיון)' : ''}
                        </Text>
                        <Text style={styles.courseMeta}>
                          {courseScheduleLabel(c)} · {dateRange(c.from, c.to, true)}
                        </Text>
                      </View>
                      <EnterChevron />
                    </Pressable>
                  );
                })}
              <Button
                label="הוספת קורס"
                variant="secondary"
                onPress={() => router.push({ pathname: '/course-form', params: { workplaceId: id } })}
              />
            </View>
          ) : (
            <Text style={styles.courseMeta}>אפשר להוסיף קורסים אחרי שמירת מקום העבודה.</Text>
          )}
        </FormField>
          </>
    </>
  );
}
