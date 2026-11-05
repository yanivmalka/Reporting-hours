import type { WorkReport } from './reports';
import { workplaceAt, type Workplace } from './workplaces';

/**
 * חישוב נסיעות (שלב 5 ב־WISHLIST, סעיף 5 — "חישוב נסיעות").
 *
 * הנוסחה, לכל מקום עבודה:
 *   עלות נסיעות = עלות לכיוון × נסיעות ליום × מספר ימי העבודה שדווחו
 *
 * "ימי עבודה שדווחו" נספרים כתאריכים ייחודיים: שני דיווחים באותו תאריך
 * (למשל משמרת שבורה) הם נסיעה אחת הלוך ושוב, ולכן נספרים כיום אחד.
 *
 * עלות נסיעה קיימת רק כשאופן ההגעה הוא תחבורה ציבורית; ברכב או בהליכה
 * העלות היא 0 (גם אם נשמרו ערכים ישנים בשדות הנסיעה).
 *
 * המודול טהור — בלי אחסון ובלי תלות ב־React — כדי שאפשר יהיה להשתמש בו
 * גם בכרטיס מקום עבודה, גם בדשבורד החודשי (שלב 6) וגם בסיכום (שלב 7).
 */

/** האם מקום העבודה צובר עלות נסיעות (כלומר מגיעים אליו בתחבורה ציבורית). */
export function hasTravelCost(
  workplace: Pick<Workplace, 'arrivalMode'>,
): boolean {
  return workplace.arrivalMode === 'public_transport';
}

/** ערך מספרי לא־שלילי, או 0 כשהקלט אינו מספר תקין. */
function nonNegative(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * מספר ימי העבודה הייחודיים שדווחו למקום עבודה, מתוך רשימת דיווחים.
 * דיווחים למקומות אחרים או ללא תאריך תקין אינם נספרים.
 */
export function reportedWorkdays(
  reports: readonly WorkReport[],
  workplaceId: string,
): number {
  const dates = new Set<string>();
  for (const report of reports) {
    if (report.workplaceId !== workplaceId) continue;
    const date = report.date?.trim();
    if (date) dates.add(date);
  }
  return dates.size;
}

/**
 * עלות הנסיעות הכוללת למקום עבודה יחיד, לפי הדיווחים שנמסרו.
 * מחזיר 0 כשאין נסיעה בתחבורה ציבורית או כשלא דווחו ימים.
 */
export function travelCostForWorkplace(
  workplace: Workplace,
  reports: readonly WorkReport[],
): number {
  // לכל יום עבודה — לפי התנאים שחלו באותו יום (היסטוריית תנאים).
  const dates = new Set<string>();
  for (const r of reports) if (r.workplaceId === workplace.id && r.date) dates.add(r.date);
  let total = 0;
  for (const date of dates) total += travelCostForDay(workplace, date);
  return total;
}

/** עלות הנסיעות ליום עבודה אחד במקום עבודה, לפי התנאים שחלו באותו יום. */
export function travelCostForDay(workplace: Workplace, date?: string): number {
  const w = workplaceAt(workplace, date);
  if (!hasTravelCost(w)) return 0;
  return nonNegative(w.travelCostPerDirection) * nonNegative(w.tripsPerDay);
}

/** פירוט עלות הנסיעות של מקום עבודה אחד — לתצוגה בכרטיס או בסיכום. */
export type WorkplaceTravelCost = {
  workplaceId: string;
  name: string;
  /** האם מגיעים בתחבורה ציבורית (אחרת אין עלות נסיעות) */
  applies: boolean;
  /** ימי עבודה ייחודיים שדווחו */
  days: number;
  tripsPerDay: number;
  costPerDirection: number;
  /** עלות לכיוון × נסיעות ליום × ימים */
  total: number;
};

/** פירוט עלויות הנסיעות לכל מקומות העבודה, בתוספת סכום כולל. */
export type TravelBreakdown = {
  perWorkplace: WorkplaceTravelCost[];
  total: number;
};

/**
 * בונה פירוט נסיעות לכל מקומות העבודה. שומר על סדר הרשימה שנמסרה.
 * ניתן לצמצם מראש את `reports` (למשל לחודש מסוים) לפני הקריאה.
 */
export function travelBreakdown(
  workplaces: readonly Workplace[],
  reports: readonly WorkReport[],
): TravelBreakdown {
  const perWorkplace = workplaces.map<WorkplaceTravelCost>((workplace) => {
    const applies = hasTravelCost(workplace);
    const days = reportedWorkdays(reports, workplace.id);
    const tripsPerDay = nonNegative(workplace.tripsPerDay);
    const costPerDirection = nonNegative(workplace.travelCostPerDirection);
    return {
      workplaceId: workplace.id,
      name: workplace.name,
      applies,
      days,
      tripsPerDay,
      costPerDirection,
      total: travelCostForWorkplace(workplace, reports),
    };
  });
  const total = perWorkplace.reduce((sum, row) => sum + row.total, 0);
  return { perWorkplace, total };
}

/**
 * הפונקציה היחידה להצגת סכום ב־₪ — עם מפריד אלפים, למשל "45,252 ₪" או
 * "12.50 ₪". שלמים מוצגים בלי שבר; אחרת שתי ספרות אחרי הנקודה.
 */
export function formatShekels(amount: number): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  const rounded = Math.round(safe * 100) / 100;
  const text = Number.isInteger(rounded)
    ? rounded.toLocaleString('en-US')
    : rounded.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${text} ₪`;
}

/** סכום מעוגל לשקל שלם, דרך formatShekels ("12,480 ₪"). */
export const money = (amount: number): string => formatShekels(Math.round(Number.isFinite(amount) ? amount : 0));
