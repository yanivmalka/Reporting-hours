/**
 * פרטי מפגש מתוכנן (קורס + תאריך): הערה, מידע על ההגעה, תוכן מתוכנן, סימון
 * "הגשה" / "הגשת ביניים" ותזכורת. נערכים בגיליון "פרטי המפגש" (לחיצה על מפגש
 * עתידי בדף הבית), ומוצגים בלו״ז, ביומן ובאשף הדיווח.
 *
 * התזכורת היא התראה בדף הבית מהרגע שנקבע ועד סוף המפגש. בסימון הגשה בלי
 * תזכורת מפורשת — תזכורת אוטומטית בערב שלפני (`DEFAULT_REMINDER_TIME`),
 * אלא אם בוטלה (`reminderOff`). כשהמפגש מועבר — הפרטים עוברים איתו (`moveNote`).
 */
import { readJSON, writeJSON } from './storage';
import { KEYS } from './keys';
import { dateFromIso, isoDate } from './dates';

export type SessionFlag = 'submission' | 'midSubmission';

export const FLAG_LABEL: Record<SessionFlag, string> = {
  submission: 'הגשה',
  midSubmission: 'הגשת ביניים',
};

/** אייקון הסימון (MaterialCommunityIcons) — בלו״ז, ביומן ובגיליון. */
export const FLAG_ICON: Record<SessionFlag, string> = {
  submission: 'flag-checkered',
  midSubmission: 'flag-outline',
};

export type SessionNote = {
  courseId: string;
  date: string;
  note?: string;
  arrival?: string;
  content?: string;
  flag?: SessionFlag;
  /** תזכורת מפורשת: "YYYY-MM-DDTHH:MM" */
  remindAt?: string;
  /** ביטול התזכורת האוטומטית של הגשה */
  reminderOff?: boolean;
  at: number;
};

const KEY = KEYS.sessionNotes;
/** שעת התזכורת האוטומטית בערב שלפני */
export const DEFAULT_REMINDER_TIME = '20:00';

const keyOf = (courseId: string, date: string) => `${courseId}|${date}`;

export function loadSessionNotes(): Promise<SessionNote[]> {
  return readJSON<SessionNote[]>(KEY, []);
}

export function noteFor(list: readonly SessionNote[], courseId: string, date: string): SessionNote | undefined {
  return list.find((n) => n.courseId === courseId && n.date === date);
}

/** האם יש בפרטים תוכן כלשהו (אחרת לא נשמרת רשומה). */
export function hasContent(n: Omit<SessionNote, 'at'>): boolean {
  return Boolean(n.note?.trim() || n.arrival?.trim() || n.content?.trim() || n.flag || n.remindAt);
}

/** "YYYY-MM-DDTHH:MM" של ערב היום שלפני המפגש. */
export function eveningBefore(date: string, time = DEFAULT_REMINDER_TIME): string {
  const d = dateFromIso(date);
  d.setDate(d.getDate() - 1);
  return `${isoDate(d)}T${time}`;
}

/** מועד התזכורת בפועל: מפורשת, או אוטומטית להגשה; null — בלי תזכורת. */
export function effectiveReminder(n: SessionNote | undefined): string | null {
  if (!n) return null;
  if (n.remindAt) return n.remindAt;
  if (n.flag && !n.reminderOff) return eveningBefore(n.date);
  return null;
}

/** שמירת הפרטים של מפגש (מחליפה את הקיימים; בלי תוכן — נמחקת). */
export async function saveSessionNote(n: Omit<SessionNote, 'at'>): Promise<void> {
  const list = (await loadSessionNotes()).filter((x) => keyOf(x.courseId, x.date) !== keyOf(n.courseId, n.date));
  const clean: SessionNote = {
    courseId: n.courseId,
    date: n.date,
    note: n.note?.trim() || undefined,
    arrival: n.arrival?.trim() || undefined,
    content: n.content?.trim() || undefined,
    flag: n.flag,
    remindAt: n.remindAt || undefined,
    reminderOff: n.flag && !n.remindAt ? n.reminderOff || undefined : undefined,
    at: Date.now(),
  };
  if (hasContent(clean)) list.push(clean);
  await writeJSON(KEY, list);
}

/** העברת הפרטים עם המפגש לתאריך החדש (תזכורת מפורשת זזה באותו הפרש ימים). */
export function moveNoteIn(list: readonly SessionNote[], courseId: string, from: string, to: string): SessionNote[] {
  const n = noteFor(list, courseId, from);
  if (!n || from === to) return [...list];
  const shift = Math.round((dateFromIso(to).getTime() - dateFromIso(from).getTime()) / 86_400_000);
  let remindAt = n.remindAt;
  if (remindAt) {
    const d = dateFromIso(remindAt.slice(0, 10));
    d.setDate(d.getDate() + shift);
    remindAt = `${isoDate(d)}${remindAt.slice(10)}`;
  }
  const rest = list.filter(
    (x) => keyOf(x.courseId, x.date) !== keyOf(courseId, from) && keyOf(x.courseId, x.date) !== keyOf(courseId, to),
  );
  return [...rest, { ...n, date: to, remindAt, at: Date.now() }];
}

export async function moveNote(courseId: string, from: string, to: string): Promise<void> {
  const list = await loadSessionNotes();
  if (!noteFor(list, courseId, from)) return;
  await writeJSON(KEY, moveNoteIn(list, courseId, from, to));
}

/** "YYYY-MM-DDTHH:MM" מקומי של רגע נתון. */
export function stamp(d: Date): string {
  const p = (x: number) => String(x).padStart(2, '0');
  return `${isoDate(d)}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
