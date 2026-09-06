/**
 * חישוב שכר (שלב 4 ב־WISHLIST, סעיפים 7 ו־7א).
 *
 * שכר שעתי: תעריף × מספר שעות, כאשר "שעות" נקבע לפי בסיס החישוב שבחר
 * המשתמש (lib/payBasis.ts):
 *   - "שעות רגילות"  — דקות נטו ÷ 60, כל זמן העבודה נטו נכנס לחישוב.
 *   - "שעות אקדמיות" — דקות נטו ÷ 45. הדקות שהמשתמש בחר להעביר למונה
 *     "דקות עבודה מצטברות" (`carriedMinutes`) מנוכות תחילה, כדי שלא
 *     ישולמו פעמיים — הן ישולמו כשייפדו מן המונה (lib/accumulated.ts).
 *
 * שכר חודשי: סכום קבוע לכל "חודש" של מקום העבודה, ללא תלות במספר השעות
 * שדווחו; אין לו משמעות ברמת דיווח בודד.
 *
 * המודול טהור — בלי אחסון ובלי תלות ב־React — כדי שאפשר יהיה להשתמש בו
 * גם בכרטיס הדיווח, גם בכרטיס מקום העבודה, גם בדשבורד החודשי (שלב 6)
 * וגם בסיכום החודשי (שלב 7).
 */
import { ACADEMIC_HOUR_MINUTES } from './academic';
import { netMinutes, type WorkReport } from './reports';
import { reportedWorkdays } from './travel';
import type { PayBasis } from './payBasis';
import type { PaymentType, Workplace } from './workplaces';

const REGULAR_HOUR_MINUTES = 60;

/** מספר הדקות בשעה אחת לפי בסיס החישוב. */
export function minutesPerHour(basis: PayBasis): number {
  return basis === 'academic' ? ACADEMIC_HOUR_MINUTES : REGULAR_HOUR_MINUTES;
}

/** ערך מספרי לא־שלילי, או 0 כשהקלט אינו מספר תקין. */
function nonNegative(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

type PayReport = Pick<WorkReport, 'start' | 'end' | 'breaks' | 'carriedMinutes'>;

/**
 * מספר השעות שהתעריף השעתי מוכפל בהן עבור דיווח בודד, לפי בסיס החישוב.
 * מחזיר 0 כשזמן העבודה נטו אינו ניתן לחישוב.
 */
export function payableHours(report: PayReport, basis: PayBasis): number {
  const net = netMinutes(report);
  if (net == null) return 0;
  const minutes =
    basis === 'academic'
      ? Math.max(0, net - nonNegative(report.carriedMinutes ?? 0))
      : net;
  return minutes / minutesPerHour(basis);
}

/**
 * שכר עבור דיווח בודד. למקום עבודה חודשי אין שכר לכל דיווח (הסכום קבוע
 * לחודש) ולכן מוחזר null. למקום שעתי: תעריף × שעות לפי בסיס החישוב.
 */
export function reportPay(
  report: PayReport,
  workplace: Pick<Workplace, 'rate' | 'paymentType'>,
  basis: PayBasis,
): number | null {
  if (workplace.paymentType === 'monthly') return null;
  return nonNegative(workplace.rate) * payableHours(report, basis);
}

/**
 * שכר מצטבר למקום עבודה מתוך רשימת דיווחים (בדרך כלל של "חודש" אחד).
 *   - שעתי: סכום שכר הדיווחים ששייכים למקום.
 *   - חודשי: הסכום הקבוע, כל עוד דווח לפחות יום עבודה אחד; אחרת 0.
 */
export function workplacePay(
  workplace: Workplace,
  reports: readonly WorkReport[],
  basis: PayBasis,
): number {
  if (workplace.paymentType === 'monthly') {
    return reportedWorkdays(reports, workplace.id) > 0
      ? nonNegative(workplace.rate)
      : 0;
  }
  return reports
    .filter((report) => report.workplaceId === workplace.id)
    .reduce((sum, report) => sum + (reportPay(report, workplace, basis) ?? 0), 0);
}

/** פירוט שכר של מקום עבודה אחד — לתצוגה בכרטיס, בדשבורד או בסיכום. */
export type WorkplacePay = {
  workplaceId: string;
  name: string;
  paymentType: PaymentType;
  /** שעות משולמות מצטברות לפי בסיס החישוב (למקום שעתי; 0 לחודשי) */
  hours: number;
  /** מספר ימי העבודה הייחודיים שדווחו למקום */
  days: number;
  /** השכר המחושב הכולל, ב־₪ */
  total: number;
};

/** פירוט שכר לכל מקומות העבודה, בתוספת סכום כולל. */
export type PayBreakdown = {
  perWorkplace: WorkplacePay[];
  total: number;
};

/**
 * בונה פירוט שכר לכל מקומות העבודה, לפי בסיס החישוב שנמסר. שומר על סדר
 * הרשימה. ניתן לצמצם מראש את `reports` (למשל ל"חודש" של מקום עבודה)
 * לפני הקריאה.
 */
export function payBreakdown(
  workplaces: readonly Workplace[],
  reports: readonly WorkReport[],
  basis: PayBasis,
): PayBreakdown {
  const perWorkplace = workplaces.map<WorkplacePay>((workplace) => {
    const mine = reports.filter((r) => r.workplaceId === workplace.id);
    const hours =
      workplace.paymentType === 'hourly'
        ? mine.reduce((sum, r) => sum + payableHours(r, basis), 0)
        : 0;
    return {
      workplaceId: workplace.id,
      name: workplace.name,
      paymentType: workplace.paymentType,
      hours,
      days: reportedWorkdays(reports, workplace.id),
      total: workplacePay(workplace, reports, basis),
    };
  });
  const total = perWorkplace.reduce((sum, row) => sum + row.total, 0);
  return { perWorkplace, total };
}

/**
 * הצגת מספר שעות לתצוגה: שלם בלי שבר עשרוני, אחרת עד שתי ספרות אחרי
 * הנקודה (בלי אפסים מיותרים). למשל 6, 4.5, 3.25.
 */
export function formatHours(hours: number): string {
  const safe = Number.isFinite(hours) ? hours : 0;
  if (Number.isInteger(safe)) return String(safe);
  return safe.toFixed(2).replace(/\.?0+$/, '');
}
