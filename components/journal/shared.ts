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
