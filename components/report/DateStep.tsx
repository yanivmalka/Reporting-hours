import { ScrollView, View } from 'react-native';
import { Text } from '../Text';
import { Pressable } from '../Pressable';
import { DatePicker } from '../DatePicker';
import { FormField } from '../FormField';
import { timeRange, WEEKDAY_SHORT } from '../../lib/courses';
import { dateFromIso } from '../../lib/dates';
import type { Cancellation } from '../../lib/sessions';
import { todayISO } from '../../lib/time';
import type { ReportWizard } from './useReportWizard';

/** "ג׳ 18.11" */
function dayShort(iso: string): string {
  const [, m, d] = iso.split('-').map(Number);
  return `${WEEKDAY_SHORT[dateFromIso(iso).getDay()]} ${d}.${m}`;
}

/** סטטוס מפגש שלא מתקיים: "הועבר ל־ג׳ 18.11" · "בוטל · מחלה" · "לא מתקיים · חנוכה". */
function cancelLabel(c: Cancellation): string {
  if (c.kind === 'moved' && c.movedTo) return `הועבר ל־${dayShort(c.movedTo)}`;
  const base = c.kind === 'canceled' ? 'בוטל' : 'לא מתקיים';
  return c.reason ? `${base} · ${c.reason}` : base;
}

/** שלב 1: בחירת התאריך. */
export function DateStep({ w }: { w: ReportWizard }) {
  const { styles, colorOf, workplaces, step, date, errors, openOnDate, changeDate, workedDates, activeCourses, canceledCourses, nextMissing, reportedCourse, workplaceName } = w;
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
        {activeCourses.length > 0 || canceledCourses.length > 0 ? (
          <View style={styles.dayCourses}>
            {activeCourses.length > 0 ? (
              <Text style={styles.dayCoursesTitle}>
                {activeCourses.length === 1 ? 'קורס אחד' : `${activeCourses.length} קורסים`} ביום זה
                {' · '}
                {activeCourses.filter(reportedCourse).length} דווחו
                {activeCourses.some((c) => !reportedCourse(c))
                  ? ` · ${activeCourses.filter((c) => !reportedCourse(c)).length} נדרש דיווח`
                  : ' — הכול דווח ✓'}
              </Text>
            ) : (
              <Text style={styles.dayCoursesTitle}>
                {canceledCourses.length === 1 ? 'המפגש ביום זה בוטל או הועבר' : 'המפגשים ביום זה בוטלו או הועברו'}
                {' — אפשר לדווח בכל זאת'}
              </Text>
            )}
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
              {canceledCourses.map(({ course: c, cancel }) => (
                <View
                  key={`x-${c.id}`}
                  style={[
                    styles.dayCourseRow,
                    styles.dayCourseCanceled,
                    { borderStartWidth: 3, borderStartColor: colorOf(workplaces.find((w) => w.id === c.workplaceId)), paddingStart: 6 },
                  ]}
                >
                  <Text style={[styles.dayCourseMark, styles.markCanceled]}>–</Text>
                  <View style={styles.dayCourseTexts}>
                    <Text style={[styles.dayCourseName, styles.strike]}>
                      {timeRange(c.start, c.end)} · {c.name}
                    </Text>
                    {cancel.kind === 'moved' && cancel.movedTo ? (
                      <Pressable onPress={() => openOnDate(cancel.movedTo!)} accessibilityRole="link" hitSlop={6}>
                        <Text style={styles.dayCourseSub}>
                          {workplaceName(c.workplaceId)} · <Text style={styles.linkText}>{cancelLabel(cancel)}</Text>
                        </Text>
                      </Pressable>
                    ) : (
                      <Text style={styles.dayCourseSub}>
                        {workplaceName(c.workplaceId)} · {cancelLabel(cancel)}
                      </Text>
                    )}
                  </View>
                </View>
              ))}
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
