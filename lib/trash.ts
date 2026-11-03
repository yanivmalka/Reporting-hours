/**
 * מחיקה, אשפה וארכיון — הכללים:
 *
 * מקום עבודה
 *   - דוח שכר שלו נשלח או שולם → אי אפשר למחוק; רק ארכיון (ההיסטוריה הכספית נשמרת).
 *   - אחרת → אפשר להעביר לאשפה, יחד עם כל הנתונים שלו: קורסים, דיווחים,
 *     סימוני מפגשים ומונה הדקות. הם נשמרים בתוך רשומת מקום העבודה
 *     (`trashed`), חוזרים בשחזור, ונמחקים איתו במחיקה הסופית (ידנית, או
 *     אוטומטית אחרי 30 יום).
 *
 * קורס
 *   - בלי דיווחים → מחיקה.
 *   - יש דיווחים → "סיום הקורס": תאריך הסיום נקבע לאתמול (או למפגש האחרון
 *     שדווח), והקורס עובר לארכיון הקורסים. ההיסטוריה והתכנון של העבר נשמרים.
 *
 * דיווח
 *   - דוח השכר של החודש לא נשלח → מחיקה (הדקות שהעביר למונה יורדות).
 *   - נשלח → נעול; מתקנים בביטול השליחה (עם סיבה).
 *   - שולם → נעול לצמיתות.
 */
import { loadAccumulated, saveAccumulated, type AccumulatedEntry } from './accumulated';
import { deleteCourse, endDateForCourse, loadCourses, reportsOfCourse, saveCourses, upsertCourse, type Course } from './courses';
import { loadPayrollStatus, type StatusMap } from './payroll';
import { loadReports, saveReports, type WorkReport } from './reports';
import { loadSessionMarks, saveSessionMarks, type SessionMark } from './sessions';
import { loadAllPruned, saveWorkplaces, type Workplace } from './workplaces';

type TrashPayload = {
  courses: Course[];
  reports: WorkReport[];
  marks: SessionMark[];
  accumulated?: AccumulatedEntry;
};

// ───────────────────────── מקום עבודה ─────────────────────────

export type WorkplaceDeletion = {
  /** מספר הדיווחים של המקום */
  reports: number;
  /** מספר הקורסים של המקום */
  courses: number;
  /** דוחות שכר שנשלחו או שולמו — אם יש, אי אפשר למחוק (רק ארכיון) */
  lockedPayrolls: number;
};

/** דוחות השכר של מקום עבודה שנשלחו או שולמו. */
function lockedPayrollsOf(workplaceId: string, statuses: StatusMap): number {
  return Object.entries(statuses).filter(
    ([key, st]) => key.startsWith(`${workplaceId}|`) && Boolean(st.sentAt || st.paidAt),
  ).length;
}

/** מה יימחק עם מקום העבודה, והאם מותר למחוק אותו. */
export async function workplaceDeletion(workplaceId: string): Promise<WorkplaceDeletion> {
  const [reports, courses, statuses] = await Promise.all([loadReports(), loadCourses(), loadPayrollStatus()]);
  return {
    reports: reports.filter((r) => r.workplaceId === workplaceId).length,
    courses: courses.filter((c) => c.workplaceId === workplaceId).length,
    lockedPayrolls: lockedPayrollsOf(workplaceId, statuses),
  };
}

export const canDeleteWorkplace = (d: WorkplaceDeletion) => d.lockedPayrolls === 0;

/**
 * העברה לאשפה יחד עם כל הנתונים של המקום. נכשל (מחזיר false) כשדוח שכר
 * שלו כבר נשלח או שולם — אז רק ארכיון.
 */
export async function trashWorkplaceWithData(workplaceId: string): Promise<boolean> {
  const [all, reports, courses, marks, accumulated, statuses] = await Promise.all([
    loadAllPruned(),
    loadReports(),
    loadCourses(),
    loadSessionMarks(),
    loadAccumulated(),
    loadPayrollStatus(),
  ]);
  if (lockedPayrollsOf(workplaceId, statuses) > 0) return false;
  const target = all.find((w) => w.id === workplaceId && w.deletedAt == null);
  if (!target) return false;

  const myCourses = courses.filter((c) => c.workplaceId === workplaceId);
  const courseIds = new Set(myCourses.map((c) => c.id));
  const payload: TrashPayload = {
    courses: myCourses,
    reports: reports.filter((r) => r.workplaceId === workplaceId),
    marks: marks.filter((m) => courseIds.has(m.courseId)),
    accumulated: accumulated.byWorkplace[workplaceId],
  };
  const { [workplaceId]: _gone, ...restAcc } = accumulated.byWorkplace;

  await saveWorkplaces(
    all.map((w) => (w.id === workplaceId ? { ...w, deletedAt: Date.now(), trashed: payload } : w)),
  );
  await Promise.all([
    saveReports(reports.filter((r) => r.workplaceId !== workplaceId)),
    saveCourses(courses.filter((c) => c.workplaceId !== workplaceId)),
    saveSessionMarks(marks.filter((m) => !courseIds.has(m.courseId))),
    saveAccumulated({ byWorkplace: restAcc }),
  ]);
  return true;
}

/** שחזור מהאשפה — מקום העבודה וכל הנתונים שהועברו איתו. מחזיר את רשימת האשפה המעודכנת. */
export async function restoreWorkplaceWithData(workplaceId: string): Promise<Workplace[]> {
  const all = await loadAllPruned();
  const target = all.find((w) => w.id === workplaceId);
  const payload = target?.trashed as TrashPayload | undefined;
  if (payload) {
    const [reports, courses, marks, accumulated] = await Promise.all([
      loadReports(),
      loadCourses(),
      loadSessionMarks(),
      loadAccumulated(),
    ]);
    const has = <T extends { id: string }>(list: readonly T[], id: string) => list.some((x) => x.id === id);
    await Promise.all([
      saveReports([...reports, ...payload.reports.filter((r) => !has(reports, r.id))]),
      saveCourses([...courses, ...payload.courses.filter((c) => !has(courses, c.id))]),
      saveSessionMarks([...marks, ...payload.marks]),
      payload.accumulated
        ? saveAccumulated({ byWorkplace: { ...accumulated.byWorkplace, [workplaceId]: payload.accumulated } })
        : Promise.resolve(),
    ]);
  }
  const next = all.map((w) => (w.id === workplaceId ? { ...w, deletedAt: undefined, trashed: undefined } : w));
  await saveWorkplaces(next);
  return next.filter((w) => w.deletedAt != null);
}

/**
 * מחיקה סופית מהאשפה. הנתונים שהועברו איתו נמחקים יחד איתו (הם שמורים רק
 * ברשומה שלו). מקום ישן שהועבר לאשפה לפני השינוי — גם הקורסים שלו נמחקים.
 */
export async function deleteWorkplaceForever(workplaceId: string): Promise<Workplace[]> {
  const [all, courses] = await Promise.all([loadAllPruned(), loadCourses()]);
  if (courses.some((c) => c.workplaceId === workplaceId)) {
    await saveCourses(courses.filter((c) => c.workplaceId !== workplaceId));
  }
  const next = all.filter((w) => w.id !== workplaceId);
  await saveWorkplaces(next);
  return next.filter((w) => w.deletedAt != null);
}

/** תיאור קצר של מה שיועבר לאשפה — לחלון האישור. */
export function deletionSummary(d: WorkplaceDeletion): string {
  const parts: string[] = [];
  if (d.courses) parts.push(d.courses === 1 ? 'קורס אחד' : `${d.courses} קורסים`);
  if (d.reports) parts.push(d.reports === 1 ? 'דיווח אחד' : `${d.reports} דיווחים`);
  return parts.join(' ו־');
}

// ───────────────────────── קורס ─────────────────────────

/** הדיווחים של קורס — אם יש, מסיימים אותו במקום למחוק. */
export async function courseReportCount(course: Course): Promise<number> {
  return reportsOfCourse(course, await loadReports()).length;
}

/** מחיקת קורס בלי דיווחים, או סיום (העברה לארכיון) של קורס שיש לו דיווחים. */
export async function deleteOrEndCourse(course: Course): Promise<'deleted' | 'ended'> {
  const reports = await loadReports();
  if (reportsOfCourse(course, reports).length === 0) {
    await deleteCourse(course.id);
    return 'deleted';
  }
  const { id, demo: _demo, ...draft } = course;
  await upsertCourse({ ...draft, id, to: endDateForCourse(course, reports) });
  return 'ended';
}
