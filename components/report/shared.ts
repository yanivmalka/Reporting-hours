/** טיפוסים ועזרים של אשף הדיווח (app/report.tsx). */


/* הטיפוסים והחישובים של הטופס — ב־lib/reportForm.ts (טהורים, עם בדיקות). */
export { parseNum, sumBreaks, type BreakRow, type LeftoverChoice } from '../../lib/reportForm';
export type { ReportFormErrors as Errors } from '../../lib/reportForm';
/** אורך ברירת המחדל של הפסקה חדשה */
export const DEFAULT_BREAK_MINUTES = 10;

export type Step = 'date' | 'course' | 'workplace' | 'times' | 'summary' | 'done';

/** כמה שניות אחרי שמירה חוזרים אוטומטית (לבית, או לתצוגת הדיווח בעריכה). */
export const AUTO_RETURN_SECONDS = 5;
