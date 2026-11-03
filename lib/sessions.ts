/**
 * ביטול מפגשים של קורסים.
 *
 * מפגש (קורס + תאריך) יכול להיות מבוטל בשתי דרכים:
 *   - ידנית — "השיעור לא התקיים", עם סיבה אופציונלית;
 *   - אוטומטית — כשהתאריך חל בחג או ביום שבתון (lib/holidays.ts), כל עוד
 *     האפשרות מסומנת בהגדרות. הסימון מחושב בכל טעינה ולכן חל גם על
 *     קורסים שכבר קיימים, וגם על קורסים שיתווספו בעתיד.
 * אפשר לבטל ביטול אוטומטי של מפגש מסוים ("המפגש התקיים") — נשמר כסימון 'held'.
 *
 * מפגש מבוטל לא נספר בשעות המתוכננות (פוטנציאל), לא נחשב "דיווח חסר", ולא
 * מקפיץ תזכורות (מונית וכד׳). בלו״ז הוא מוצג כ"בוטל" עם הסיבה.
 */
import { useCallback, useEffect, useState } from 'react';
import { restDayName } from './holidays';
import { readJSON, writeJSON } from './storage';

export type SessionMark = {
  courseId: string;
  date: string;
  status: 'canceled' | 'held';
  reason?: string;
  /** מתי סומן (מילישניות) */
  at: number;
};

export type Cancellation = {
  /** סיבת הביטול לתצוגה ("ראש השנה", "המרצה חולה"…) — ריק כשלא צוינה */
  reason: string;
  /** בוטל אוטומטית בגלל חג / שבתון */
  auto: boolean;
};

/** האם מפגש של קורס בתאריך מבוטל, ולמה. */
export type CancelIndex = (courseId: string, date: string) => Cancellation | null;

/** בלי ביטולים — ברירת המחדל לחישובים שלא קיבלו אינדקס. */
export const NO_CANCEL: CancelIndex = () => null;

const MARKS_KEY = 'reporting-hours/sessions/v1';
const HOLIDAYS_KEY = 'reporting-hours/holiday-cancel/v1';
/** ברירת המחדל: ביטול אוטומטי בחגים — פעיל. */
export const DEFAULT_CANCEL_HOLIDAYS = true;

const keyOf = (courseId: string, date: string) => `${courseId}@${date}`;

export function loadSessionMarks(): Promise<SessionMark[]> {
  return readJSON<SessionMark[]>(MARKS_KEY, []);
}

export async function loadCancelHolidays(): Promise<boolean> {
  const v = await readJSON<unknown>(HOLIDAYS_KEY, null);
  return typeof v === 'boolean' ? v : DEFAULT_CANCEL_HOLIDAYS;
}

export async function saveCancelHolidays(on: boolean): Promise<void> {
  await writeJSON(HOLIDAYS_KEY, on);
  await loadCancelIndex();
}

/** בניית אינדקס ביטולים מהסימונים ומההגדרה. */
export function cancelIndex(marks: readonly SessionMark[], cancelHolidays: boolean): CancelIndex {
  const byKey = new Map(marks.map((m) => [keyOf(m.courseId, m.date), m]));
  return (courseId, date) => {
    const mark = byKey.get(keyOf(courseId, date));
    if (mark?.status === 'canceled') return { reason: mark.reason?.trim() ?? '', auto: false };
    if (mark?.status === 'held' || !cancelHolidays) return null;
    const holiday = restDayName(date);
    return holiday ? { reason: holiday, auto: true } : null;
  };
}

/**
 * האינדקס הנוכחי — מתעדכן בכל טעינת קורסים (loadCourses) ובכל שינוי סימון.
 * כך כל החישובים (פוטנציאל, תחזית, דיווחים חסרים, תזכורות) מדלגים על
 * מפגשים מבוטלים בלי להעביר את האינדקס דרך כל שכבה.
 */
let current: CancelIndex = NO_CANCEL;

export function currentCancel(): CancelIndex {
  return current;
}

export async function loadCancelIndex(): Promise<CancelIndex> {
  const [marks, holidays] = await Promise.all([loadSessionMarks(), loadCancelHolidays()]);
  current = cancelIndex(marks, holidays);
  return current;
}

/**
 * סימון מפגש: 'canceled' (עם סיבה), 'held' (התקיים למרות חג), או null —
 * מחיקת הסימון וחזרה לברירת המחדל.
 */
export async function setSessionMark(
  courseId: string,
  date: string,
  status: SessionMark['status'] | null,
  reason?: string,
): Promise<void> {
  const list = (await loadSessionMarks()).filter((m) => keyOf(m.courseId, m.date) !== keyOf(courseId, date));
  if (status) list.push({ courseId, date, status, reason: reason?.trim() || undefined, at: Date.now() });
  await writeJSON(MARKS_KEY, list);
  await loadCancelIndex();
}

/**
 * ביטול מפגש ידני, או החזרת מפגש שבוטל. בהחזרה של מפגש בחג — נשמר 'held'
 * כדי שהביטול האוטומטי לא יחול עליו שוב.
 */
export async function restoreSession(courseId: string, date: string): Promise<void> {
  const holidays = await loadCancelHolidays();
  await setSessionMark(courseId, date, holidays && restDayName(date) ? 'held' : null);
}

/** ההגדרה "ביטול אוטומטי בחגים" כ־hook — למסך ההגדרות. */
export function useCancelHolidays(): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(DEFAULT_CANCEL_HOLIDAYS);
  useEffect(() => {
    let active = true;
    loadCancelHolidays().then((v) => active && setOn(v));
    return () => {
      active = false;
    };
  }, []);
  const set = useCallback((v: boolean) => {
    setOn(v);
    void saveCancelHolidays(v);
  }, []);
  return [on, set];
}
