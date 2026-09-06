import { ACADEMIC_HOUR_MINUTES } from './academic';
import { readJSON, writeJSON } from './storage';

/**
 * מונה "דקות עבודה מצטברות" (סעיף 5 ב־WISHLIST).
 *
 * בכל דיווח, הדקות שאינן משלימות שעה אקדמית — או שהמשתמש בחר לא לדווח
 * עליהן כרגע — נצברות כאן. כשנצברו 45 דקות ומעלה אפשר "לפדות" אותן:
 * הן הופכות לשעות אקדמיות שלמות שייכללו בסיכומים ובשכר בשלבים הבאים.
 * האחסון מקומי בלבד, תחת מפתח יחיד.
 */

export type AccumulatedState = {
  /** דקות עבודה שנצברו ועדיין לא נפדו (0 ומעלה) */
  minutes: number;
  /** שעות אקדמיות שנפדו מן המונה עד כה */
  redeemedHours: number;
};

const STORAGE_KEY = 'reporting-hours/accumulated/v1';
const EMPTY: AccumulatedState = { minutes: 0, redeemedHours: 0 };

/** מנרמל ערכים שנטענו מהאחסון למספרים שלמים אי־שליליים. */
function sanitize(state: Partial<AccumulatedState> | null): AccumulatedState {
  const toCount = (value: unknown) =>
    typeof value === 'number' && Number.isFinite(value)
      ? Math.max(0, Math.round(value))
      : 0;
  return {
    minutes: toCount(state?.minutes),
    redeemedHours: toCount(state?.redeemedHours),
  };
}

export async function loadAccumulated(): Promise<AccumulatedState> {
  return sanitize(await readJSON<AccumulatedState>(STORAGE_KEY, EMPTY));
}

async function save(state: AccumulatedState): Promise<AccumulatedState> {
  const clean = sanitize(state);
  await writeJSON(STORAGE_KEY, clean);
  return clean;
}

/**
 * מוסיף דקות למונה ומחזיר את המצב המעודכן.
 * `delta` שאינו חיובי לא משנה דבר.
 */
export async function addAccumulatedMinutes(
  delta: number,
): Promise<AccumulatedState> {
  const current = await loadAccumulated();
  if (!Number.isFinite(delta) || delta <= 0) return current;
  return save({ ...current, minutes: current.minutes + Math.round(delta) });
}

/** כמה שעות אקדמיות שלמות אפשר לפדות מן המונה כרגע. */
export function redeemableHours(state: AccumulatedState): number {
  return Math.floor(state.minutes / ACADEMIC_HOUR_MINUTES);
}

/**
 * פודה את כל השעות האקדמיות השלמות שבמונה: מוריד 45 דקות לכל שעה
 * ומוסיף אותן ל־`redeemedHours`. מחזיר את המצב החדש וכמה שעות נפדו.
 */
export async function redeemAccumulated(): Promise<{
  state: AccumulatedState;
  redeemed: number;
}> {
  const current = await loadAccumulated();
  const redeemed = redeemableHours(current);
  if (redeemed === 0) return { state: current, redeemed: 0 };
  const state = await save({
    minutes: current.minutes - redeemed * ACADEMIC_HOUR_MINUTES,
    redeemedHours: current.redeemedHours + redeemed,
  });
  return { state, redeemed };
}

/** איפוס מלא של המונה — דקות שנצברו ושעות שנפדו כאחד. */
export async function resetAccumulated(): Promise<AccumulatedState> {
  return save(EMPTY);
}
