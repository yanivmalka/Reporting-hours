/**
 * פדיון דקות מצטברות לתוך דוח שכר.
 *
 * הבעיה: דוח השכר מסכם שעות אקדמיות (45 דק׳). כשבחלק מהדיווחים הדקות
 * העודפות נכללו בדיווח, סך החודש יוצא שבר — למשל 22.4 שע׳ אקדמיות — וכך
 * גם הפדיון "בשעות שלמות" (45 דק׳ כל אחת) לא מתקן אותו: 22.4 + 1 = 23.4.
 *
 * שני אופני פדיון (הגדרה גלובלית, נבחרת במסך "דקות מצטברות"):
 *
 *   - 'complete' — השלמה לשעה שלמה (מומלץ). מהמונה נלקחות קודם בדיוק הדקות
 *     שחסרות לסך הדוח כדי להגיע לשעה אקדמית שלמה, ורק אחר כך שעות שלמות
 *     נוספות. אם במונה אין מספיק דקות להשלמה — לא נפדה דבר (והמסך מציג כמה
 *     חסר), כדי שהדוח לא יישאר עם שבר.
 *     דוגמה: בדוח 22 שע׳ ו־18 דק׳ (22.4), במונה 70 דק׳ → נפדות 27 דק׳
 *     (משלימות ל־23 שע׳); נשארות 43 דק׳ — פחות משעה, ולכן נשארות במונה.
 *
 *   - 'whole' — שעות שלמות בלבד. נפדות כפולות של 45 דק׳, בלי קשר לסך הדוח.
 *     פשוט, אבל שבר שכבר יש בדוח נשאר בו.
 *     דוגמה: אותו דוח (22.4), 70 דק׳ במונה → נפדית שעה אחת (45 דק׳); הדוח
 *     עומד על 23.4 שע׳, ו־25 דק׳ נשארות במונה.
 *
 * הדקות שנפדו נרשמות על דוח השכר של מקום העבודה (`redeemedMinutes` במצב
 * הדוח, lib/payroll.ts) — ולכן נכללות בסך השעות ובשכר של אותו דוח.
 * הפדיון רלוונטי רק בבסיס חישוב "שעות אקדמיות": בשעות רגילות כל זמן העבודה
 * נטו כבר משולם, ואין מה לפדות.
 */
import { useCallback, useEffect, useState } from 'react';
import { ACADEMIC_HOUR_MINUTES } from './academic';
import { entryOf, loadAccumulated, redeemMinutesFromCounter, type AccumulatedState } from './accumulated';
import type { PayPeriod } from './dashboard';
import { isLocked, payrollItems, statusKey, updatePayrollStatus, type StatusMap } from './payroll';
import { netMinutes, type WorkReport } from './reports';
import { readJSON, writeJSON } from './storage';
import type { Workplace } from './workplaces';

export type RedeemMode = 'complete' | 'whole';

export const DEFAULT_REDEEM_MODE: RedeemMode = 'complete';

export const REDEEM_MODE_LABELS: Record<RedeemMode, string> = {
  complete: 'השלמה לשעה שלמה',
  whole: 'שעות שלמות בלבד',
};

const STORAGE_KEY = 'reporting-hours/redeem-mode/v1';

export async function loadRedeemMode(): Promise<RedeemMode> {
  const v = await readJSON<unknown>(STORAGE_KEY, null);
  return v === 'whole' || v === 'complete' ? v : DEFAULT_REDEEM_MODE;
}

export function useRedeemMode(): [RedeemMode, (m: RedeemMode) => void] {
  const [mode, setModeState] = useState<RedeemMode>(DEFAULT_REDEEM_MODE);
  useEffect(() => {
    let active = true;
    loadRedeemMode().then((m) => active && setModeState(m));
    return () => {
      active = false;
    };
  }, []);
  const setMode = useCallback((m: RedeemMode) => {
    setModeState(m);
    void writeJSON(STORAGE_KEY, m);
  }, []);
  return [mode, setMode];
}

// ───────────────────────── חישוב ─────────────────────────

export type RedeemPlan = {
  /** כמה דקות ייפדו מהמונה עכשיו */
  minutes: number;
  /** כמה דקות חסרות במונה כדי להשלים את הדוח לשעה שלמה (במצב 'complete') */
  missing: number;
  /** סך הדקות בדוח אחרי הפדיון */
  after: number;
};

/**
 * כמה לפדות, לפי האופן שנבחר.
 * @param counter   דקות במונה של מקום העבודה
 * @param inReport  דקות אקדמיות שכבר בדוח (כולל פדיונות קודמים)
 */
export function planRedeem(counter: number, inReport: number, mode: RedeemMode): RedeemPlan {
  const c = Math.max(0, Math.round(counter));
  const r = Math.max(0, Math.round(inReport));
  if (mode === 'whole') {
    const minutes = Math.floor(c / ACADEMIC_HOUR_MINUTES) * ACADEMIC_HOUR_MINUTES;
    return { minutes, missing: 0, after: r + minutes };
  }
  const rest = r % ACADEMIC_HOUR_MINUTES;
  const gap = rest === 0 ? 0 : ACADEMIC_HOUR_MINUTES - rest;
  if (c < gap) return { minutes: 0, missing: gap - c, after: r };
  const minutes = gap + Math.floor((c - gap) / ACADEMIC_HOUR_MINUTES) * ACADEMIC_HOUR_MINUTES;
  return { minutes, missing: 0, after: r + minutes };
}

/** דקות העבודה שמדווחות בתקופה (נטו פחות מה שהועבר למונה), בלי פדיונות. */
export function reportedMinutesIn(
  workplaceId: string,
  period: Pick<PayPeriod, 'start' | 'end'>,
  reports: readonly WorkReport[],
): number {
  return reports
    .filter((r) => r.workplaceId === workplaceId && r.date >= period.start && r.date <= period.end)
    .reduce((s, r) => s + Math.max(0, (netMinutes(r) ?? 0) - (r.carriedMinutes ?? 0)), 0);
}

export type RedeemTarget = {
  period: PayPeriod;
  /** דקות בדוח כרגע — דיווחים + פדיונות קודמים */
  inReport: number;
  /** הדוח הסתיים וממתין לשליחה (אחרת — הדוח של החודש הנוכחי) */
  closed: boolean;
};

/**
 * לאיזה דוח שכר ייכנס הפדיון: הדוח המוקדם ביותר שהסתיים ועוד לא נשלח
 * (הוא הבא שיישלח), ואם אין — הדוח של החודש הנוכחי, כל עוד לא נשלח.
 */
export function redeemTarget(
  workplace: Workplace,
  reports: readonly WorkReport[],
  statuses: StatusMap,
  today: Date = new Date(),
): RedeemTarget | null {
  const items = payrollItems([workplace], reports, statuses, today)
    .filter((i) => !isLocked(i.status))
    .sort((a, b) => a.period.start.localeCompare(b.period.start));
  const pick = items.find((i) => i.closed && i.reports > 0) ?? items.find((i) => !i.closed);
  if (!pick) return null;
  const st = statuses[statusKey(workplace.id, pick.period.start)];
  return {
    period: pick.period,
    inReport: reportedMinutesIn(workplace.id, pick.period, reports) + (st?.redeemedMinutes ?? 0),
    closed: pick.closed,
  };
}

/** מבצע פדיון: מוריד מהמונה ורושם את הדקות על דוח השכר. */
export async function redeemIntoPayroll(
  workplaceId: string,
  periodStart: string,
  minutes: number,
  statuses: StatusMap,
): Promise<{ state: AccumulatedState; statuses: StatusMap; redeemed: number }> {
  const before = entryOf(await loadAccumulated(), workplaceId).minutes;
  const take = Math.min(before, Math.max(0, Math.round(minutes)));
  if (take <= 0) return { state: await loadAccumulated(), statuses, redeemed: 0 };
  const state = await redeemMinutesFromCounter(workplaceId, take);
  const prev = statuses[statusKey(workplaceId, periodStart)]?.redeemedMinutes ?? 0;
  const next = await updatePayrollStatus(workplaceId, periodStart, { redeemedMinutes: prev + take });
  return { state, statuses: next, redeemed: take };
}

/** תיאור קצר של דקות כשעות אקדמיות, למשל "1 שע׳ ו־12 דק׳" / "27 דק׳". */
export function minutesLabel(minutes: number): string {
  const h = Math.floor(minutes / ACADEMIC_HOUR_MINUTES);
  const m = minutes % ACADEMIC_HOUR_MINUTES;
  if (h === 0) return `${m} דק׳`;
  return m ? `${h} שע׳ ו־${m} דק׳` : `${h} שע׳`;
}
