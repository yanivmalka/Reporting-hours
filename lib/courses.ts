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
import { currentCancel, loadCancelIndex, type CancelIndex } from './sessions';
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

/** האם הקורס מתקיים בתאריך נתון (יום בשבוע + בתוך התקופה). */
export function occursOn(course: Course, date: string): boolean {
  return date >= course.from && date <= course.to && parseISO(date).getDay() === course.weekday;
}

/**
 * הקורסים שמתקיימים בתאריך (אפשר לצמצם למקום עבודה), לפי שעת התחלה.
 * עם אינדקס ביטולים — בלי מפגשים מבוטלים (חג, "לא התקיים").
 */
export function coursesOn(
  courses: readonly Course[],
  date: string,
  workplaceId?: string,
  cancel: CancelIndex = currentCancel(),
): Course[] {
  return courses
    .filter(
      (c) => (!workplaceId || c.workplaceId === workplaceId) && occursOn(c, date) && !cancel(c.id, date),
    )
    .sort((a, b) => a.start.localeCompare(b.start));
}

/** תאריכי המפגשים של קורס בטווח [start, end] (כולל), בלי מפגשים מבוטלים. */
export function occurrences(
  course: Course,
  start: string,
  end: string,
  cancel: CancelIndex = currentCancel(),
): string[] {
  const from = start > course.from ? start : course.from;
  const to = end < course.to ? end : course.to;
  if (from > to) return [];
  const d = parseISO(from);
  d.setDate(d.getDate() + ((course.weekday - d.getDay() + 7) % 7));
  const out: string[] = [];
  for (; iso(d) <= to; d.setDate(d.getDate() + 7)) out.push(iso(d));
  return out.filter((date) => !cancel(course.id, date));
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

/**
 * האם מפגש של קורס בתאריך נתון כבר דווח: יש באותו יום דיווח לאותו מקום
 * עבודה שנושאו שם הקורס, או שטווח השעות שלו חופף לקורס.
 */
/** הדיווח שמכסה מפגש של קורס בתאריך (לפי שם הקורס או חפיפה בשעות), אם יש. */
export function courseReport<R extends { id: string; workplaceId: string; date: string; start: string; end: string; note?: string }>(
  course: Pick<Course, 'workplaceId' | 'name' | 'start' | 'end'>,
  date: string,
  reports: readonly R[],
): R | undefined {
  const cs = parseTime(course.start) ?? 0;
  const ce = parseTime(course.end) ?? 0;
  return reports.find((r) => {
    if (r.date !== date || r.workplaceId !== course.workplaceId) return false;
    if (r.note === course.name) return true;
    const rs = parseTime(r.start) ?? 0;
    const re = parseTime(r.end) ?? 0;
    return rs < ce && re > cs;
  });
}

export function courseReported(
  course: Pick<Course, 'workplaceId' | 'name' | 'start' | 'end'>,
  date: string,
  reports: readonly { id: string; workplaceId: string; date: string; start: string; end: string; note?: string }[],
  excludeReportId?: string,
): boolean {
  const cs = parseTime(course.start) ?? 0;
  const ce = parseTime(course.end) ?? 0;
  return reports.some((r) => {
    if (r.date !== date || r.workplaceId !== course.workplaceId || r.id === excludeReportId) return false;
    if (r.note === course.name) return true;
    const rs = parseTime(r.start) ?? 0;
    const re = parseTime(r.end) ?? 0;
    return rs < ce && re > cs;
  });
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
