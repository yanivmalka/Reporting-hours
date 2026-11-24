/**
 * מאילו דיווחים הגיעו הדקות למונה המצטבר של מקום עבודה (מסך "דקות מצטברות"). טהור.
 *
 * כל דיווח שומר כמה דקות העביר למונה (`carriedMinutes`). המונה עצמו שומר רק את היתרה,
 * ולכן השיוך נעשה לפי הסדר: הדקות שבמונה כעת הן של הדיווחים האחרונים (פדיון לוקח
 * קודם את הישנות). הדיווח הוותיק ביותר מתוכם יכול להיות "בחלקו" במונה. השאר —
 * דקות שכבר נפדו (או אופסו).
 */
import { ACADEMIC_HOUR_MINUTES } from './academic';
import type { AccumulatedEntry } from './accumulated';

export type SourceReport = {
  id: string;
  workplaceId: string;
  date: string;
  start: string;
  end: string;
  carriedMinutes?: number;
};

export type AccumulatedSource = {
  reportId: string;
  date: string;
  start: string;
  end: string;
  /** הדקות שהדיווח העביר למונה */
  minutes: number;
  /** מתוכן — כמה עדיין במונה (השאר נפדו / אופסו) */
  inCounter: number;
};

export type AccumulatedSources = {
  /** דיווחים שהדקות שלהם (או חלקן) במונה כעת — מהחדש לישן */
  current: AccumulatedSource[];
  /** דיווחים שהדקות שלהם כבר נפדו / אופסו — מהחדש לישן */
  past: AccumulatedSource[];
  /** סך הדקות שהועברו למונה בכל הדיווחים */
  totalCarried: number;
  /** סך הדקות שנפדו (שעות שלמות × 45 + השלמות) */
  totalRedeemed: number;
  /**
   * הפרש בין מה שהדיווחים מסבירים לבין המונה: חיובי — במונה יותר ממה שהגיע מדיווחים
   * (למשל דיווח שנמחק אחרי שנפדה); שלילי — פחות (איפוס / תיקון). 0 — מתאים.
   */
  unexplained: number;
};

export function accumulatedSources(
  reports: readonly SourceReport[],
  workplaceId: string,
  entry: AccumulatedEntry,
): AccumulatedSources {
  const mine = reports
    .filter((r) => r.workplaceId === workplaceId && (r.carriedMinutes ?? 0) > 0)
    .sort((a, b) => b.date.localeCompare(a.date) || b.start.localeCompare(a.start));
  let left = Math.max(0, entry.minutes);
  const current: AccumulatedSource[] = [];
  const past: AccumulatedSource[] = [];
  for (const r of mine) {
    const minutes = Math.round(r.carriedMinutes ?? 0);
    const inCounter = Math.min(minutes, left);
    left -= inCounter;
    const src = { reportId: r.id, date: r.date, start: r.start, end: r.end, minutes, inCounter };
    (inCounter > 0 ? current : past).push(src);
  }
  const totalCarried = mine.reduce((n, r) => n + Math.round(r.carriedMinutes ?? 0), 0);
  const totalRedeemed = entry.redeemedHours * ACADEMIC_HOUR_MINUTES + (entry.redeemedMinutes ?? 0);
  return {
    current,
    past,
    totalCarried,
    totalRedeemed,
    unexplained: entry.minutes - (totalCarried - totalRedeemed),
  };
}
