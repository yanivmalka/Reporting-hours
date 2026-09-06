import type { WorkReport } from './reports';
import type { Workplace } from './workplaces';

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
  if (!hasTravelCost(workplace)) return 0;
  const perDirection = nonNegative(workplace.travelCostPerDirection);
  const tripsPerDay = nonNegative(workplace.tripsPerDay);
  const days = reportedWorkdays(reports, workplace.id);
  return perDirection * tripsPerDay * days;
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
      total: applies ? costPerDirection * tripsPerDay * days : 0,
    };
  });
  const total = perWorkplace.reduce((sum, row) => sum + row.total, 0);
  return { perWorkplace, total };
}

/**
 * הצגת סכום ב־₪ כטקסט קצר, למשל "48 ₪" או "12.50 ₪".
 * שלמים מוצגים בלי שבר; אחרת שתי ספרות אחרי הנקודה.
 */
export function formatShekels(amount: number): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  const rounded = Math.round(safe * 100) / 100;
  const text = Number.isInteger(rounded)
    ? String(rounded)
    : rounded.toFixed(2);
  return `${text} ₪`;
}
