import { ACADEMIC_HOUR_MINUTES } from './academic';
import { readJSON, writeJSON } from './storage';

/**
 * מונה "דקות עבודה מצטברות" (סעיף 5 ב־WISHLIST) — נפרד לכל מקום עבודה.
 *
 * בכל דיווח, הדקות שאינן משלימות שעה אקדמית — או שהמשתמש בחר לא לדווח
 * עליהן כרגע — נצברות במונה של אותו מקום עבודה. כשנצברו 45 דקות ומעלה
 * אפשר "לפדות" אותן: הן הופכות לשעות אקדמיות שלמות באותו מקום עבודה
 * (ולכן גם בתעריף שלו). האחסון מקומי בלבד, תחת מפתח יחיד.
 */

export type AccumulatedEntry = {
  /** דקות עבודה שנצברו ועדיין לא נפדו (0 ומעלה) */
  minutes: number;
  /** שעות אקדמיות שנפדו מן המונה עד כה */
  redeemedHours: number;
};

export type AccumulatedState = {
  /** מונה לכל מקום עבודה, לפי מזהה */
  byWorkplace: Record<string, AccumulatedEntry>;
};

const STORAGE_KEY = 'reporting-hours/accumulated/v2';
/** מונה גלובלי ישן (לפני הפיצול למקומות עבודה) — להסבה חד־פעמית. */
const LEGACY_KEY = 'reporting-hours/accumulated/v1';
const REPORTS_KEY = 'reporting-hours/reports/v1';

const EMPTY_ENTRY: AccumulatedEntry = { minutes: 0, redeemedHours: 0 };

const toCount = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;

function sanitize(state: Partial<AccumulatedState> | null): AccumulatedState {
  const byWorkplace: Record<string, AccumulatedEntry> = {};
  for (const [id, entry] of Object.entries(state?.byWorkplace ?? {})) {
    const clean = { minutes: toCount(entry?.minutes), redeemedHours: toCount(entry?.redeemedHours) };
    if (clean.minutes > 0 || clean.redeemedHours > 0) byWorkplace[id] = clean;
  }
  return { byWorkplace };
}

/** המונה של מקום עבודה אחד (אפסים אם אין). */
export function entryOf(state: AccumulatedState, workplaceId: string): AccumulatedEntry {
  return state.byWorkplace[workplaceId] ?? EMPTY_ENTRY;
}

/** סכום כל המונים — לתצוגה כוללת. */
export function accumulatedTotal(state: AccumulatedState): AccumulatedEntry {
  return Object.values(state.byWorkplace).reduce(
    (acc, e) => ({ minutes: acc.minutes + e.minutes, redeemedHours: acc.redeemedHours + e.redeemedHours }),
    { minutes: 0, redeemedHours: 0 },
  );
}

/**
 * הסבה מהמונה הגלובלי הישן: הדקות שהועברו בכל דיווח (`carriedMinutes`)
 * משויכות למקום העבודה של הדיווח, והשעות שכבר נפדו מחולקות בין המקומות
 * (קודם למקום שצבר הכי הרבה דקות), כך שהסכום הכולל נשמר.
 */
async function migrateFromLegacy(): Promise<AccumulatedState | null> {
  const legacy = await readJSON<Partial<AccumulatedEntry> | null>(LEGACY_KEY, null);
  if (!legacy) return null;
  const reports = await readJSON<{ workplaceId: string; carriedMinutes?: number }[]>(REPORTS_KEY, []);
  const carried: Record<string, number> = {};
  for (const r of reports) {
    if ((r.carriedMinutes ?? 0) > 0) carried[r.workplaceId] = (carried[r.workplaceId] ?? 0) + (r.carriedMinutes ?? 0);
  }
  const byWorkplace: Record<string, AccumulatedEntry> = {};
  for (const [id, minutes] of Object.entries(carried)) byWorkplace[id] = { minutes, redeemedHours: 0 };

  let toRedeem = toCount(legacy.redeemedHours);
  while (toRedeem > 0) {
    const richest = Object.entries(byWorkplace)
      .filter(([, e]) => e.minutes >= ACADEMIC_HOUR_MINUTES)
      .sort((a, b) => b[1].minutes - a[1].minutes)[0];
    if (!richest) break;
    richest[1].minutes -= ACADEMIC_HOUR_MINUTES;
    richest[1].redeemedHours += 1;
    toRedeem -= 1;
  }
  return sanitize({ byWorkplace });
}

export async function loadAccumulated(): Promise<AccumulatedState> {
  const stored = await readJSON<AccumulatedState | null>(STORAGE_KEY, null);
  if (stored) return sanitize(stored);
  const migrated = await migrateFromLegacy();
  if (migrated) {
    await writeJSON(STORAGE_KEY, migrated);
    return migrated;
  }
  return { byWorkplace: {} };
}

export async function saveAccumulated(state: AccumulatedState): Promise<AccumulatedState> {
  const clean = sanitize(state);
  await writeJSON(STORAGE_KEY, clean);
  return clean;
}

function withEntry(
  state: AccumulatedState,
  workplaceId: string,
  update: (e: AccumulatedEntry) => AccumulatedEntry,
): AccumulatedState {
  return {
    byWorkplace: { ...state.byWorkplace, [workplaceId]: update(entryOf(state, workplaceId)) },
  };
}

/**
 * מוסיף דקות למונה של מקום עבודה ומחזיר את המצב המעודכן.
 * `delta` שאינו חיובי לא משנה דבר.
 */
export async function addAccumulatedMinutes(
  workplaceId: string,
  delta: number,
): Promise<AccumulatedState> {
  const current = await loadAccumulated();
  if (!Number.isFinite(delta) || delta <= 0) return current;
  return saveAccumulated(
    withEntry(current, workplaceId, (e) => ({ ...e, minutes: e.minutes + Math.round(delta) })),
  );
}

/** כמה שעות אקדמיות שלמות אפשר לפדות ממונה. */
export function redeemableHours(entry: AccumulatedEntry): number {
  return Math.floor(entry.minutes / ACADEMIC_HOUR_MINUTES);
}

/**
 * פודה את כל השעות האקדמיות השלמות במונה של מקום עבודה (או בכל המונים,
 * כשלא נמסר מזהה): מוריד 45 דקות לכל שעה ומוסיף אותה ל־`redeemedHours`.
 */
export async function redeemAccumulated(workplaceId?: string): Promise<{
  state: AccumulatedState;
  redeemed: number;
}> {
  let state = await loadAccumulated();
  let redeemed = 0;
  const ids = workplaceId ? [workplaceId] : Object.keys(state.byWorkplace);
  for (const id of ids) {
    const n = redeemableHours(entryOf(state, id));
    if (n === 0) continue;
    redeemed += n;
    state = withEntry(state, id, (e) => ({
      minutes: e.minutes - n * ACADEMIC_HOUR_MINUTES,
      redeemedHours: e.redeemedHours + n,
    }));
  }
  if (redeemed > 0) state = await saveAccumulated(state);
  return { state, redeemed };
}

/** איפוס המונה של מקום עבודה — או של כולם, כשלא נמסר מזהה. */
export async function resetAccumulated(workplaceId?: string): Promise<AccumulatedState> {
  if (!workplaceId) return saveAccumulated({ byWorkplace: {} });
  const current = await loadAccumulated();
  const byWorkplace = { ...current.byWorkplace };
  delete byWorkplace[workplaceId];
  return saveAccumulated({ byWorkplace });
}
