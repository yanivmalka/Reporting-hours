/**
 * מתי לנעול שוב את המידע הכספי בחזרה מהרקע — טהור, עם בדיקות (test/relock.test.ts).
 * משמש את lib/appLock.ts.
 *
 * **המסך כבה** (הטלפון הונח / כובה בכפתור) מאז היציאה לרקע, או שהיציאה לרקע הייתה בגלל כיבוי
 * המסך — נועלים תמיד, כך שבהדלקה מוצג שוב מסך "מידע כספי נעול". אחרת — הכללים הקודמים: הטלפון
 * כבר היה מונח ביציאה (מד תאוצה), או היעדרות ארוכה.
 */

/** כיבוי מסך שקרה עד כך לפני אירוע היציאה לרקע — הוא שגרם לה. */
export const SCREEN_OFF_SLACK_MS = 2_000;

export type ResumeInfo = {
  /** מתי האפליקציה ירדה לרקע */
  backgroundAt: number;
  now: number;
  /** מתי המסך כבה לאחרונה (0 — לא כבה; null — לא ידוע, בלי המודול) */
  screenOffAt: number | null;
  /** יש מד תאוצה */
  sensorOk: boolean;
  /** הטלפון כבר היה מונח ביציאה לרקע */
  downAtBackground: boolean;
  /** בלי מד תאוצה — נעילה אחרי היעדרות של יותר מכך */
  relockAfterMs: number;
  /** עם מד תאוצה — רשת ביטחון להיעדרות ארוכה */
  relockAwayMs: number;
};

/** האם המסך כבה מאז היציאה לרקע (או גרם לה). */
export function screenWentOff(backgroundAt: number, screenOffAt: number | null): boolean {
  return screenOffAt != null && screenOffAt > 0 && screenOffAt >= backgroundAt - SCREEN_OFF_SLACK_MS;
}

export function shouldRelockOnResume(i: ResumeInfo): boolean {
  if (screenWentOff(i.backgroundAt, i.screenOffAt)) return true;
  const away = i.now - i.backgroundAt;
  return i.sensorOk ? i.downAtBackground || away > i.relockAwayMs : away > i.relockAfterMs;
}
