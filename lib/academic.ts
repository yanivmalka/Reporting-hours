/**
 * המרת זמן עבודה לשעות אקדמיות (סעיף 4 ב־WISHLIST, שלב 5).
 *
 * שעה אקדמית = 45 דקות. זמן העבודה נטו מומר למספר שעות אקדמיות שלמות,
 * והדקות שאינן משלימות שעה אקדמית נחשבות "דקות עודפות" (0–44) — הן
 * מועברות למונה "דקות עבודה מצטברות" (ראה lib/accumulated.ts).
 */

/** מספר הדקות בשעה אקדמית אחת. */
export const ACADEMIC_HOUR_MINUTES = 45;

export type AcademicBreakdown = {
  /** שעות אקדמיות שלמות: ⌊נטו ÷ 45⌋ */
  wholeHours: number;
  /** דקות עודפות שאינן משלימות שעה אקדמית (0–44) */
  leftoverMinutes: number;
  /** סך השעות האקדמיות כשבר עשרוני: נטו ÷ 45 */
  decimalHours: number;
};

/** מפרק זמן עבודה נטו בדקות לשעות אקדמיות שלמות + דקות עודפות. */
export function toAcademic(netMinutes: number): AcademicBreakdown {
  const safe = Math.max(0, Math.round(netMinutes));
  return {
    wholeHours: Math.floor(safe / ACADEMIC_HOUR_MINUTES),
    leftoverMinutes: safe % ACADEMIC_HOUR_MINUTES,
    decimalHours: safe / ACADEMIC_HOUR_MINUTES,
  };
}

/**
 * הצגת שעות אקדמיות כטקסט עברי, למשל "6 שע׳ אקדמיות ו־30 דק׳".
 * כש־`withLeftover` כבוי מוצגות רק השעות השלמות ("6 שע׳ אקדמיות").
 */
export function formatAcademic(netMinutes: number, withLeftover = true): string {
  const { wholeHours, leftoverMinutes } = toAcademic(netMinutes);
  if (wholeHours === 0 && (leftoverMinutes === 0 || !withLeftover)) {
    return '0 שע׳ אקדמיות';
  }
  if (wholeHours === 0) return `${leftoverMinutes} דק׳`;
  const hoursPart = `${wholeHours} שע׳ אקדמיות`;
  if (!withLeftover || leftoverMinutes === 0) return hoursPart;
  return `${hoursPart} ו־${leftoverMinutes} דק׳`;
}
