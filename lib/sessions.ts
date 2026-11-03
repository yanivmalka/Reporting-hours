/**
 * ביטול מפגשים של קורסים.
 *
 * מפגש (קורס + תאריך) יכול להיות מבוטל בשתי דרכים:
 *   - ידנית — "השיעור לא התקיים", עם סיבה אופציונלית;
 *   - אוטומטית — כשהתאריך חל ביום מיוחד (lib/holidays.ts) מסוג שמסומן
 *     בהגדרות: חגים וימי שבתון (ברירת מחדל), ערבי חג, חול המועד, תשעה באב.
 *     הביטול האוטומטי לא נשמר כרשומה אלא מחושב מחדש בכל טעינה, מתוך הקורסים
 *     וההגדרות. לכן הוא חל מיד גם על קורסים קיימים וגם על קורסים חדשים,
 *     ומתעדכן מעצמו כשמשנים הגדרה או מאריכים קורס.
 * אפשר לבטל ביטול אוטומטי של מפגש מסוים ("המפגש התקיים") — נשמר כסימון 'held'.
 *
 * מפגש מבוטל לא נספר בשעות המתוכננות (פוטנציאל), לא נחשב "דיווח חסר", ולא
 * מקפיץ תזכורות (מונית וכד׳). בלו״ז הוא מוצג כ"בוטל" עם הסיבה.
 */
import { useCallback, useEffect, useState } from 'react';
import { restDays, type RestDayKind } from './holidays';
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
/** גרסה 1 — בוליאני יחיד (חגים בלבד); מומרת לגרסה 2 בטעינה. */
const HOLIDAYS_KEY_V1 = 'reporting-hours/holiday-cancel/v1';
const HOLIDAYS_KEY = 'reporting-hours/holiday-cancel/v2';

/** אילו סוגי ימים מיוחדים מבטלים מפגשים אוטומטית. */
export type HolidaySettings = Record<RestDayKind, boolean>;

/**
 * ברירת המחדל: חגים וימי שבתון — כן (אין לימודים כמעט בשום מוסד);
 * ערבי חג, חול המועד ותשעה באב — לא (יש מוסדות שמלמדים בהם).
 */
export const DEFAULT_HOLIDAY_SETTINGS: HolidaySettings = {
  yomTov: true,
  eve: false,
  cholHamoed: false,
  tishaBav: false,
};

const keyOf = (courseId: string, date: string) => `${courseId}@${date}`;

export function loadSessionMarks(): Promise<SessionMark[]> {
  return readJSON<SessionMark[]>(MARKS_KEY, []);
}

export async function loadHolidaySettings(): Promise<HolidaySettings> {
  const v = await readJSON<Partial<HolidaySettings> | null>(HOLIDAYS_KEY, null);
  if (v && typeof v === 'object') return { ...DEFAULT_HOLIDAY_SETTINGS, ...v };
  const legacy = await readJSON<unknown>(HOLIDAYS_KEY_V1, null);
  return typeof legacy === 'boolean' ? { ...DEFAULT_HOLIDAY_SETTINGS, yomTov: legacy } : DEFAULT_HOLIDAY_SETTINGS;
}

export async function saveHolidaySettings(settings: HolidaySettings): Promise<void> {
  await writeJSON(HOLIDAYS_KEY, settings);
  await loadCancelIndex();
}

/** הסיבה לביטול אוטומטי של תאריך לפי ההגדרות (שם היום המיוחד), או null. */
export function autoCancelReason(date: string, settings: HolidaySettings): string | null {
  return restDays(date).find((r) => settings[r.kind])?.name ?? null;
}

/** בניית אינדקס ביטולים מהסימונים ומההגדרה. */
export function cancelIndex(marks: readonly SessionMark[], settings: HolidaySettings): CancelIndex {
  const byKey = new Map(marks.map((m) => [keyOf(m.courseId, m.date), m]));
  return (courseId, date) => {
    const mark = byKey.get(keyOf(courseId, date));
    if (mark?.status === 'canceled') return { reason: mark.reason?.trim() ?? '', auto: false };
    if (mark?.status === 'held') return null;
    const holiday = autoCancelReason(date, settings);
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
  const [marks, holidays] = await Promise.all([loadSessionMarks(), loadHolidaySettings()]);
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
 * החזרת מפגש שבוטל ("המפגש התקיים").
 *
 * - בוטל ידנית ביום רגיל — הסימון נמחק, והמפגש חוזר להיות רגיל לגמרי.
 * - חל ביום מיוחד (גם אם כרגע הסוג שלו לא מסומן בהגדרות) — נשמר סימון
 *   'held' קבוע: המפגש נחשב כמתקיים — נספר בפוטנציאל, ואם לא דווח יופיע
 *   כדיווח חסר — וזה נשאר כך גם אם בעתיד מסמנים בהגדרות את סוג היום הזה.
 *   הסימון חל רק על המפגש הזה, לא על שאר המפגשים באותו יום או באותו חג.
 * כדי לבטל שוב — "סימון כבוטל" רגיל, שמחליף את הסימון.
 */
export async function restoreSession(courseId: string, date: string): Promise<void> {
  await setSessionMark(courseId, date, restDays(date).length ? 'held' : null);
}

/** הגדרות הביטול האוטומטי כ־hook — למסך ההגדרות. */
export function useHolidaySettings(): [HolidaySettings, (kind: RestDayKind, on: boolean) => void] {
  const [settings, setSettings] = useState<HolidaySettings>(DEFAULT_HOLIDAY_SETTINGS);
  useEffect(() => {
    let active = true;
    loadHolidaySettings().then((v) => active && setSettings(v));
    return () => {
      active = false;
    };
  }, []);
  const set = useCallback((kind: RestDayKind, on: boolean) => {
    setSettings((prev) => {
      const next = { ...prev, [kind]: on };
      void saveHolidaySettings(next);
      return next;
    });
  }, []);
  return [settings, set];
}
