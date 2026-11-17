import { View } from 'react-native';
import { Text } from '../Text';
import { Pressable } from '../Pressable';
import { timeRange } from '../../lib/courses';
import type { ReportWizard } from './useReportWizard';

/** שלב 2א: בחירת קורס מהמערכת של היום. */
export function CourseStep({ w }: { w: ReportWizard }) {
  const { styles, colorOf, workplaces, step, setStep, workplace, activeCourses, reportedCourse, workplaceName, chooseCourse, cancelSession } = w;
  return (
    <>
    {/* ── 2א. קורס ── */}
    {step === 'course' ? (
      <>
        <Text style={styles.stepTitle}>איזה קורס?</Text>
        <View style={styles.choices}>
          {activeCourses.map((c) => {
            const done = reportedCourse(c);
            return (
              <Pressable
                key={c.id}
                onPress={() => chooseCourse(c)}
                style={({ pressed }) => [
                  styles.courseCard,
                  { borderStartWidth: 5, borderStartColor: colorOf(workplaces.find((w) => w.id === c.workplaceId)) },
                  pressed && styles.pressed,
                ]}
                accessibilityRole="button"
              >
                <View style={styles.courseTop}>
                  <Text style={styles.courseTime}>{timeRange(c.start, c.end)}</Text>
                  {done ? <Text style={styles.reported}>✓ דווח</Text> : null}
                </View>
                <Text style={styles.choiceText}>{c.name}</Text>
                <Text style={styles.choiceSub}>
                  {workplaceName(c.workplaceId)}
                  {c.breakMinutes > 0 ? ` · הפסקה ${c.breakMinutes} דק׳` : ''}
                </Text>
                {!done ? (
                  <Pressable
                    onPress={() => cancelSession(c, false)}
                    accessibilityRole="button"
                    accessibilityLabel={`${c.name}: השיעור לא התקיים`}
                    hitSlop={8}
                    style={styles.cardCancel}
                  >
                    <Text style={styles.cardCancelText}>השיעור לא התקיים?</Text>
                  </Pressable>
                ) : null}
              </Pressable>
            );
          })}
        </View>
        <Pressable onPress={() => setStep('workplace')} style={styles.linkBtn}>
          <Text style={styles.linkText}>דיווח שלא לפי קורס — בחירת מקום עבודה</Text>
        </Pressable>
      </>
    ) : null}

    </>
  );
}
