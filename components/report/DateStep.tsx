import { ScrollView, View } from 'react-native';
import { Text } from '../Text';
import { Pressable } from '../Pressable';
import { DatePicker } from '../DatePicker';
import { FormField } from '../FormField';
import { timeRange } from '../../lib/courses';
import { todayISO } from '../../lib/time';
import type { ReportWizard } from './useReportWizard';

/** שלב 1: בחירת התאריך. */
export function DateStep({ w }: { w: ReportWizard }) {
  const { styles, colorOf, workplaces, step, date, errors, openOnDate, changeDate, workedDates, activeCourses, nextMissing, reportedCourse, workplaceName } = w;
  return (
    <>
    {/* ── 1. תאריך ── */}
    {step === 'date' ? (
      <>
        <Text style={styles.stepTitle}>באיזה יום עבדת?</Text>
        <FormField label="תאריך" error={errors.date}>
          <DatePicker
            value={date}
            onChange={changeDate}
            workedDates={workedDates}
            invalid={Boolean(errors.date)}
          />
        </FormField>
        {activeCourses.length > 0 && activeCourses.every(reportedCourse) ? (
          <View style={styles.allDone}>
            <Text style={styles.allDoneText}>✓ כל המפגשים ביום זה דווחו</Text>
            <View style={styles.allDoneLinks}>
              {date !== todayISO() ? (
                <Pressable onPress={() => openOnDate(todayISO())} accessibilityRole="link" hitSlop={6}>
                  <Text style={styles.linkText}>היום</Text>
                </Pressable>
              ) : null}
              {nextMissing && nextMissing.date !== date ? (
                <Pressable onPress={() => openOnDate(nextMissing.date)} accessibilityRole="link" hitSlop={6}>
                  <Text style={styles.linkText}>הדיווח החסר הבא</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        ) : null}
        {activeCourses.length > 0 ? (
          <View style={styles.dayCourses}>
            <Text style={styles.dayCoursesTitle}>
              {activeCourses.length === 1 ? 'קורס אחד' : `${activeCourses.length} קורסים`} ביום זה
              {' · '}
              {activeCourses.filter(reportedCourse).length} דווחו
              {activeCourses.some((c) => !reportedCourse(c))
                ? ` · ${activeCourses.filter((c) => !reportedCourse(c)).length} נדרש דיווח`
                : ' — הכול דווח ✓'}
            </Text>
            <ScrollView style={styles.dayCoursesList} nestedScrollEnabled>
              {activeCourses.map((c) => {
                const done = reportedCourse(c);
                return (
                  <View
                    key={c.id}
                    style={[
                      styles.dayCourseRow,
                      { borderStartWidth: 3, borderStartColor: colorOf(workplaces.find((w) => w.id === c.workplaceId)), paddingStart: 6 },
                    ]}
                  >
                    <Text style={[styles.dayCourseMark, done ? styles.markDone : styles.markTodo]}>
                      {done ? '✓' : '•'}
                    </Text>
                    <View style={styles.dayCourseTexts}>
                      <Text style={styles.dayCourseName}>
                        {timeRange(c.start, c.end)} · {c.name}
                      </Text>
                      <Text style={styles.dayCourseSub}>
                        {workplaceName(c.workplaceId)} · {done ? 'דווח' : 'נדרש דיווח'}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </ScrollView>
          </View>
        ) : (
          <Text style={styles.hint}>אין קורסים קבועים ביום זה — בשלב הבא בוחרים מקום עבודה</Text>
        )}
      </>
    ) : null}

    </>
  );
}
