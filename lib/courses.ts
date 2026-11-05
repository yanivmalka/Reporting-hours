/**
 * קורסים מחזוריים: לרוב מלמדים במקום עבודה קורס קבוע — יום בשבוע, שעות
 * קבועות — לתקופה מוגדרת (חודש־חודש, או סמסטר).
 *
 * הקורסים משמשים ל:
 *   - מילוי מהיר של דיווח (בחירת קורס ממלאת שעות, הפסקה ונושא);
 *   - "שעות מתוכננות" לחודש של כל מקום עבודה, להשוואה מול מה שדווח.
 * האחסון מקומי בלבד, תחת מפתח יחיד.
 *
 * מפגשים מבוטלים (חג, "לא התקיים" — lib/sessions.ts) לא נספרים: החישובים
 * כאן מקבלים אינדקס ביטולים, וברירת המחדל היא האינדקס הנוכחי.
 */
import { ACADEMIC_HOUR_MINUTES } from './academic';
import { readJSON, writeJSON } from './storage';
import {
  currentCancel,
  currentMoves,
  keptInPotential,
  loadCancelIndex,
  type CancelIndex,
  type Cancellation,
  type MovesIndex,
} from './sessions';
import { parseTime } from './time';

export type Course = {
  id: string;
  workplaceId: string;
  /** שם הקורס / הקבוצה, למשל "תולדות האדריכלות — שנה א׳" */
  name: string;
  /** יום בשבוע: 0 = ראשון … 6 = שבת */
  weekday: number;
  /** "HH:MM" */
  start: string;
  /** "HH:MM" */
  end: string;
  /** הפסקה קבועה בדקות (0 = בלי) */
  breakMinutes: number;
  /** תחילת התקופה (כולל), "YYYY-MM-DD" */
  from: string;
  /** סוף התקופה (כולל), "YYYY-MM-DD" */
  to: string;
  /** מפגשים פרטניים נוספים ("YYYY-MM-DD"), בשעות הקורס — מעבר ליום הקבוע */
  extraDates?: string[];
  /** נוצר כנתוני הדגמה */
  demo?: boolean;
};

export type CourseDraft = Omit<Course, 'id' | 'demo'>;

const STORAGE_KEY = 'reporting-hours/courses/v1';

export const WEEKDAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
export const WEEKDAY_SHORT = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];

/** טעינת הקורסים — יחד עם רענון אינדקס הביטולים (lib/sessions.ts). */
export async function loadCourses(): Promise<Course[]> {
  const [list] = await Promise.all([readJSON<Course[]>(STORAGE_KEY, []), loadCancelIndex()]);
  return list;
}

export function saveCourses(list: Course[]): Promise<void> {
  return writeJSON(STORAGE_KEY, list);
}

function makeId(): string {
  return `cr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** הוספה (בלי `id`) או עדכון (עם `id`). מחזיר את הרשימה המעודכנת. */
export async function upsertCourse(draft: CourseDraft & { id?: string }): Promise<Course[]> {
  const list = await loadCourses();
  const next = draft.id
    ? list.map((c) => (c.id === draft.id ? { ...c, ...draft, id: c.id } : c))
    : [...list, { ...draft, id: makeId() }];
  await saveCourses(next);
  return next;
}

export async function deleteCourse(id: string): Promise<Course[]> {
  const next = (await loadCourses()).filter((c) => c.id !== id);
  await saveCourses(next);
  return next;
}

// ───────────────────────── חישובים ─────────────────────────

function parseISO(value: string): Date {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function iso(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** זמן עבודה נטו של מפגש אחד בדקות. */
export function sessionMinutes(course: Pick<Course, 'start' | 'end' | 'breakMinutes'>): number {
  const s = parseTime(course.start);
  const e = parseTime(course.end);
  if (s == null || e == null || e <= s) return 0;
  return Math.max(0, e - s - Math.max(0, course.breakMinutes || 0));
}

/** האם התאריך הוא מפגש קבוע של הקורס (יום בשבוע + בתוך התקופה). */
function regularOn(course: Course, date: string): boolean {
  return date >= course.from && date <= course.to && parseISO(date).getDay() === course.weekday;
}

/**
 * מפגש של קורס בתאריך:
 *   - kind: 'regular' (המועד הקבוע) · 'extra' (מפגש פרטני שנוסף) · 'movedIn' (הועבר לכאן);
 *   - cancel: למה לא מתקיים (בוטל / הוסר / הועבר / חג), או null.
 */
export type CourseSession = {
  date: string;
  kind: 'regular' | 'extra' | 'movedIn';
  /** ב־'movedIn' — התאריך המקורי */
  movedFrom?: string;
  cancel: Cancellation | null;
};

/**
 * כל המפגשים של קורס בטווח [start, end] (כולל), ממוינים — גם כאלה שבוטלו,
 * הוסרו, הועברו או חלים בחג (עם `cancel`). לתצוגה מלאה ולחישובי פוטנציאל.
 */
export function courseSessions(
  course: Course,
  start: string,
  end: string,
  cancel: CancelIndex = currentCancel(),
  moves: MovesIndex = currentMoves(),
): CourseSession[] {
  const out = new Map<string, CourseSession>();
  const from = start > course.from ? start : course.from;
  const to = end < course.to ? end : course.to;
  if (from <= to) {
    const d = parseISO(from);
    d.setDate(d.getDate() + ((course.weekday - d.getDay() + 7) % 7));
    for (; iso(d) <= to; d.setDate(d.getDate() + 7)) {
      const date = iso(d);
      out.set(date, { date, kind: 'regular', cancel: cancel(course.id, date) });
    }
  }
  for (const date of course.extraDates ?? []) {
    if (date < start || date > end || out.has(date)) continue;
    out.set(date, { date, kind: 'extra', cancel: cancel(course.id, date, true) });
  }
  for (const m of moves(course.id)) {
    if (m.date < start || m.date > end || out.has(m.date)) continue;
    out.set(m.date, { date: m.date, kind: 'movedIn', movedFrom: m.from, cancel: cancel(course.id, m.date, true) });
  }
  return [...out.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/** האם הקורס מתקיים בתאריך נתון (מועד קבוע, מפגש נוסף או מפגש שהועבר אליו) — בלי לבדוק ביטולים. */
export function occursOn(course: Course, date: string, moves: MovesIndex = currentMoves()): boolean {
  return (
    regularOn(course, date) ||
    (course.extraDates ?? []).includes(date) ||
    moves(course.id).some((m) => m.date === date)
  );
}

/** ביטול של מפגש בתאריך — ביטול אוטומטי בחג חל רק על המועד הקבוע. */
export function sessionCancel(course: Course, date: string, cancel: CancelIndex = currentCancel()): Cancellation | null {
  return cancel(course.id, date, !regularOn(course, date));
}

/**
 * הקורסים שמתקיימים בתאריך (אפשר לצמצם למקום עבודה), לפי שעת התחלה.
 * עם אינדקס ביטולים — בלי מפגשים מבוטלים (חג, "לא התקיים", הועבר).
 */
export function coursesOn(
  courses: readonly Course[],
  date: string,
  workplaceId?: string,
  cancel: CancelIndex = currentCancel(),
): Course[] {
  return courses
    .filter(
      (c) =>
        (!workplaceId || c.workplaceId === workplaceId) && occursOn(c, date) && !sessionCancel(c, date, cancel),
    )
    .sort((a, b) => a.start.localeCompare(b.start));
}

/** תאריכי המפגשים שמתקיימים בטווח [start, end] (כולל) — בלי מבוטלים, כולל נוספים ומועברים. */
export function occurrences(
  course: Course,
  start: string,
  end: string,
  cancel: CancelIndex = currentCancel(),
): string[] {
  return courseSessions(course, start, end, cancel)
    .filter((s) => !s.cancel)
    .map((s) => s.date);
}

/**
 * מפגשי הפוטנציאל בטווח: מה שתוכנן — כולל מפגשים שבוטלו ידנית (`canceled`),
 * בלי מפגשים שהוסרו, הועברו מכאן או חלים בחג.
 */
export function potentialSessions(
  course: Course,
  start: string,
  end: string,
  cancel: CancelIndex = currentCancel(),
): { date: string; canceled: boolean; cancel: Cancellation | null }[] {
  return courseSessions(course, start, end, cancel)
    .filter((s) => !s.cancel || keptInPotential(s.cancel))
    .map((s) => ({ date: s.date, canceled: s.cancel != null, cancel: s.cancel }));
}

/** דקות עבודה מתוכננות למקום עבודה בטווח תאריכים — לפי הקורסים שלו. */
export function plannedMinutes(
  courses: readonly Course[],
  workplaceId: string,
  start: string,
  end: string,
  cancel: CancelIndex = currentCancel(),
): number {
  return courses
    .filter((c) => c.workplaceId === workplaceId)
    .reduce((sum, c) => sum + occurrences(c, start, end, cancel).length * sessionMinutes(c), 0);
}

/** שעות אקדמיות של מפגש — לתצוגה ("4 שע׳ אקד׳"). */
export function sessionAcademicHours(course: Pick<Course, 'start' | 'end' | 'breakMinutes'>): number {
  return sessionMinutes(course) / ACADEMIC_HOUR_MINUTES;
}

/** "09:00–12:15" בבידוד LTR — אחרת בטקסט עברי סדר השעות מתהפך. */
export function timeRange(start: string, end: string): string {
  return `\u2066${start}–${end}\u2069`;
}

/** "יום ב׳ · 09:00–12:15" */
export function courseScheduleLabel(course: Pick<Course, 'weekday' | 'start' | 'end'>): string {
  return `יום ${WEEKDAY_SHORT[course.weekday]} · ${timeRange(course.start, course.end)}`;
}

type ReportLike = {
  id: string;
  workplaceId: string;
  date: string;
  start: string;
  end: string;
  note?: string;
  courseId?: string;
  extraKind?: string;
};

/**
 * האם דיווח מכסה מפגש של קורס בתאריך: דיווח עם `courseId` — רק לפי המזהה;
 * דיווח ישן בלי מזהה — לפי שם הקורס או חפיפה בשעות באותו מקום עבודה.
 */
function covers(course: Pick<Course, 'id' | 'workplaceId' | 'name' | 'start' | 'end'>, date: string, r: ReportLike): boolean {
  if (r.date !== date || r.workplaceId !== course.workplaceId) return false;
  // מפגש נוסף (השלמה, הגשה…) לא מכסה את המפגש הקבוע של אותו יום.
  if (r.extraKind) return false;
  if (r.courseId) return r.courseId === course.id;
  if (r.note === course.name) return true;
  const cs = parseTime(course.start) ?? 0;
  const ce = parseTime(course.end) ?? 0;
  const rs = parseTime(r.start) ?? 0;
  const re = parseTime(r.end) ?? 0;
  return rs < ce && re > cs;
}

/** הדיווח שמכסה מפגש של קורס בתאריך, אם יש. */
export function courseReport<R extends ReportLike>(
  course: Pick<Course, 'id' | 'workplaceId' | 'name' | 'start' | 'end'>,
  date: string,
  reports: readonly R[],
): R | undefined {
  return reports.find((r) => covers(course, date, r));
}

/** האם מפגש של קורס בתאריך נתון כבר דווח. */
export function courseReported(
  course: Pick<Course, 'id' | 'workplaceId' | 'name' | 'start' | 'end'>,
  date: string,
  reports: readonly ReportLike[],
  excludeReportId?: string,
): boolean {
  return reports.some((r) => r.id !== excludeReportId && covers(course, date, r));
}

/**
 * כל הדיווחים ששייכים לקורס: לפי `courseId`, ובדיווחים ישנים — דיווח של אותו
 * מקום עבודה בתקופת הקורס, ביום הקורס, שנושאו שם הקורס או שחופף לשעותיו.
 */
export function reportsOfCourse<R extends ReportLike>(course: Course, reports: readonly R[]): R[] {
  return reports.filter((r) => {
    if (r.courseId) return r.courseId === course.id;
    if (r.workplaceId !== course.workplaceId || r.date < course.from || r.date > course.to) return false;
    if (r.note === course.name) return true;
    return parseISO(r.date).getDay() === course.weekday && covers(course, r.date, r);
  });
}

/** תאריך הסיום לקורס שמסיימים היום: אתמול, או המפגש האחרון שדווח אם הוא מאוחר יותר. */
export function endDateForCourse(course: Course, reports: readonly ReportLike[], today: Date = new Date()): string {
  const yesterday = iso(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1));
  const last = reportsOfCourse(course, reports).reduce((m, r) => (r.date > m ? r.date : m), '');
  const end = last > yesterday ? last : yesterday;
  return end < course.from ? course.from : end;
}

// ───────────────────────── תקופות מוכנות ─────────────────────────

export type PeriodPreset = { key: string; label: string; from: string; to: string };

/**
 * תקופות מוכנות לבחירה, יחסית להיום: חודש אחד, 3 חודשים, והסמסטרים של
 * שנת הלימודים (א׳: אמצע אוקטובר–סוף ינואר · ב׳: מרץ–יוני · קיץ: יולי–ספטמבר).
 */
export function periodPresets(today: Date = new Date()): PeriodPreset[] {
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const addMonths = (n: number) => new Date(t.getFullYear(), t.getMonth() + n, t.getDate() - 1);
  // שנת הלימודים מתחילה בסתיו: מאוקטובר — השנה הנוכחית, אחרת — הקודמת.
  const y = t.getMonth() >= 9 ? t.getFullYear() : t.getFullYear() - 1;
  return [
    { key: 'month', label: 'חודש אחד', from: iso(t), to: iso(addMonths(1)) },
    { key: 'quarter', label: '3 חודשים', from: iso(t), to: iso(addMonths(3)) },
    { key: 'semA', label: 'סמסטר א׳', from: `${y}-10-15`, to: `${y + 1}-01-31` },
    { key: 'semB', label: 'סמסטר ב׳', from: `${y + 1}-03-01`, to: `${y + 1}-06-30` },
    { key: 'summer', label: 'סמסטר קיץ', from: `${y + 1}-07-01`, to: `${y + 1}-09-30` },
  ];
}

// ───────────────────────── מצב קורס: פעיל · מתוכנן · הסתיים ─────────────────────────

export type CourseStatus = 'active' | 'planned' | 'ended';

export const COURSE_STATUS_LABELS: Record<CourseStatus, string> = {
  active: 'פעילים',
  planned: 'מתוכננים',
  ended: 'הסתיימו',
};

/** תאריך המפגש האחרון של הקורס (כולל נוספים ומועברים); בלי מפגשים — סוף התקופה. */
export function lastSessionDate(course: Course): string {
  const all = courseSessions(course, '0000-01-01', '9999-12-31');
  return all.length ? all[all.length - 1].date : course.to;
}

/**
 * מצב הקורס ביחס להיום:
 *   - הסתיים — תאריך המפגש האחרון שלו כבר עבר.
 *   - פעיל — יש לו מפגש בחודש הנוכחי, או שהוא מתחיל בשבוע הנוכחי.
 *   - מתוכנן — כל קורס אחר.
 */
export function courseStatus(course: Course, today: string): CourseStatus {
  if (lastSessionDate(course) < today) return 'ended';
  const month = today.slice(0, 7);
  const [y, m] = month.split('-').map(Number);
  const monthEnd = iso(new Date(y, m, 0));
  if (courseSessions(course, `${month}-01`, monthEnd).length > 0) return 'active';
  const t = parseISO(today);
  const weekStart = iso(new Date(t.getFullYear(), t.getMonth(), t.getDate() - t.getDay()));
  const weekEnd = iso(new Date(t.getFullYear(), t.getMonth(), t.getDate() - t.getDay() + 6));
  if (course.from >= weekStart && course.from <= weekEnd) return 'active';
  return 'planned';
}
