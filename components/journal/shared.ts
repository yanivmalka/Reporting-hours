/** טיפוסים ועזרים של היומן (app/reports.tsx). */
import { type WorkReport } from '../../lib/reports';
import { KEYS } from '../../lib/keys';

/**
 * מצב התאריכון ביומן: 'auto' — התאריכון המלא מתחלף בפס השבוע בגלילה;
 * 'full' — התאריכון המלא נעוץ; 'week' — פס השבוע נעוץ, במקום התאריכון המלא.
 * (ערך ישן true = 'full'.)
 */
export type CalMode = 'auto' | 'full' | 'week';
export const CAL_PIN_KEY = KEYS.journalCalendarPin;

/** מיון: תאריך יורד, ובאותו תאריך לפי סדר ההזנה היורד. */
export function byNewest(a: WorkReport, b: WorkReport): number {
  if (a.date !== b.date) return a.date < b.date ? 1 : -1;
  return b.createdAt - a.createdAt;
}

/** הזזת חודש "YYYY-MM" ב־n חודשים. */
export function shiftMonth(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** היום האחרון בחודש "YYYY-MM" — "YYYY-MM-DD". */
export function monthEnd(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return `${month}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;
}
