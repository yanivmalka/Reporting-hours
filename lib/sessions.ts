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
 * מצבי מפגש (סימון לכל קורס + תאריך):
 *   - 'canceled' — "השיעור לא התקיים": נשאר בפוטנציאל (מה שציפית) ויורד מהצפי;
 *   - 'removed'  — בוטל והוסר גם מהפוטנציאל ("עדכן פוטנציאל");
 *   - 'moved'    — הועבר לתאריך אחר (`movedTo`); המפגש מופיע בתאריך החדש
 *                  ("הועבר מ…"), והפוטנציאל עובר איתו;
 *   - 'held'     — התקיים למרות חג.
 * ביטול אוטומטי בחג לא נכלל בפוטנציאל מלכתחילה (המפגש לא תוכנן).
 *
 * כל מפגש שלא מתקיים (בוטל, הוסר, הועבר, חג) לא נחשב "דיווח חסר" ולא מקפיץ
 * תזכורות. בלו״ז הוא מוצג כ"בוטל" עם הסיבה.
 */
import { useCallback, useEffect, useState } from 'react';
import { restDays, type RestDayKind } from './holidays';
import { readJSON, writeJSON } from './storage';

export type SessionMark = {
  courseId: string;
  date: string;
  status: 'canceled' | 'held' | 'removed' | 'moved';
  reason?: string;
  /** במפגש שהועבר ('moved') — התאריך החדש */
  movedTo?: string;
  /** מתי סומן (מילישניות) */
  at: number;
};

export type Cancellation = {
  /** סיבת הביטול לתצוגה ("ראש השנה", "המרצה חולה"…) — ריק כשלא צוינה */
  reason: string;
  /** בוטל אוטומטית בגלל חג / שבתון */
  auto: boolean;
  /**
   * סוג: 'canceled' — בוטל ונשאר בפוטנציאל · 'removed' — הוסר מהפוטנציאל ·
   * 'auto' — חג (לא בפוטנציאל) · 'moved' — הועבר לתאריך אחר.
   */
  kind: 'canceled' | 'removed' | 'auto' | 'moved';
  /** ב־'moved' — התאריך החדש */
  movedTo?: string;
};

/**
 * האם מפגש של קורס בתאריך לא מתקיים, ולמה. `explicit` — מפגש שנוסף או
 * הועבר במפורש לתאריך: ביטול אוטומטי בחג לא חל עליו.
 */
export type CancelIndex = (courseId: string, date: string, explicit?: boolean) => Cancellation | null;

/** בלי ביטולים — ברירת המחדל לחישובים שלא קיבלו אינדקס. */
export const NO_CANCEL: CancelIndex = () => null;

/** מפגש שהועבר אל תאריך: התאריך החדש ומאיזה תאריך הועבר. */
export type MovedIn = { date: string; from: string };

/** המפגשים שהועברו אל קורס (לפי מזהה קורס). */
export type MovesIndex = (courseId: string) => readonly MovedIn[];

export const NO_MOVES: MovesIndex = () => [];

/** האם ביטול משאיר את המפגש בפוטנציאל (בוטל ידנית, בלי הסרה). */
export function keptInPotential(c: Cancellation | null): boolean {
  return c?.kind === 'canceled';
}

/** "d/m" לתצוגה קצרה. */
function shortDate(iso: string): string {
  const [, m, d] = iso.split('-').map(Number);
  return `${d}/${m}`;
}

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

/** שמירת כל סימוני המפגשים (לשימוש בהעברה לאשפה ובשחזור — lib/trash.ts). */
export async function saveSessionMarks(list: SessionMark[]): Promise<void> {
  await writeJSON(MARKS_KEY, list);
  await loadCancelIndex();
}

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
  return (courseId, date, explicit) => {
    const mark = byKey.get(keyOf(courseId, date));
    if (mark?.status === 'canceled') return { reason: mark.reason?.trim() ?? '', auto: false, kind: 'canceled' };
    if (mark?.status === 'removed') return { reason: mark.reason?.trim() ?? '', auto: false, kind: 'removed' };
    if (mark?.status === 'moved' && mark.movedTo) {
      return { reason: `הועבר ל־${shortDate(mark.movedTo)}`, auto: false, kind: 'moved', movedTo: mark.movedTo };
    }
    if (mark?.status === 'held' || explicit) return null;
    const holiday = autoCancelReason(date, settings);
    return holiday ? { reason: holiday, auto: true, kind: 'auto' } : null;
  };
}

/** בניית אינדקס ההעברות מהסימונים. */
export function movesIndex(marks: readonly SessionMark[]): MovesIndex {
  const byCourse = new Map<string, MovedIn[]>();
  for (const m of marks) {
    if (m.status !== 'moved' || !m.movedTo) continue;
    const list = byCourse.get(m.courseId) ?? [];
    list.push({ date: m.movedTo, from: m.date });
    byCourse.set(m.courseId, list);
  }
  return (courseId) => byCourse.get(courseId) ?? [];
}

/**
 * האינדקס הנוכחי — מתעדכן בכל טעינת קורסים (loadCourses) ובכל שינוי סימון.
 * כך כל החישובים (פוטנציאל, תחזית, דיווחים חסרים, תזכורות) מדלגים על
 * מפגשים מבוטלים בלי להעביר את האינדקס דרך כל שכבה.
 */
let current: CancelIndex = NO_CANCEL;
let currentMovesIdx: MovesIndex = NO_MOVES;

export function currentCancel(): CancelIndex {
  return current;
}

/** אינדקס ההעברות הנוכחי — מתעדכן יחד עם אינדקס הביטולים. */
export function currentMoves(): MovesIndex {
  return currentMovesIdx;
}

export async function loadCancelIndex(): Promise<CancelIndex> {
  const [marks, holidays] = await Promise.all([loadSessionMarks(), loadHolidaySettings()]);
  current = cancelIndex(marks, holidays);
  currentMovesIdx = movesIndex(marks);
  return current;
}

/**
 * סימון מפגש: 'canceled' (עם סיבה), 'removed' (הוסר מהפוטנציאל), 'moved'
 * (עם `movedTo`), 'held' (התקיים למרות חג), או null — מחיקת הסימון וחזרה
 * לברירת המחדל.
 */
export async function setSessionMark(
  courseId: string,
  date: string,
  status: SessionMark['status'] | null,
  reason?: string,
  movedTo?: string,
): Promise<void> {
  const list = (await loadSessionMarks()).filter((m) => keyOf(m.courseId, m.date) !== keyOf(courseId, date));
  if (status) {
    list.push({
      courseId,
      date,
      status,
      reason: reason?.trim() || undefined,
      movedTo: status === 'moved' ? movedTo : undefined,
      at: Date.now(),
    });
  }
  await writeJSON(MARKS_KEY, list);
  await loadCancelIndex();
}

/** העברת מפגש לתאריך אחר — נשמר "הועבר ל…" במקור ו"הועבר מ…" ביעד. */
export function moveSession(courseId: string, date: string, to: string): Promise<void> {
  return setSessionMark(courseId, date, 'moved', undefined, to);
}

/** "עדכן פוטנציאל": כל המפגשים שבוטלו (בלי הסרה) של הקורסים — מוסרים מהפוטנציאל. */
export async function removeCanceledFromPotential(courseIds: readonly string[]): Promise<number> {
  const ids = new Set(courseIds);
  let n = 0;
  const list = (await loadSessionMarks()).map((m) => {
    if (m.status !== 'canceled' || !ids.has(m.courseId)) return m;
    n++;
    return { ...m, status: 'removed' as const, at: Date.now() };
  });
  if (n > 0) {
    await writeJSON(MARKS_KEY, list);
    await loadCancelIndex();
  }
  return n;
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
