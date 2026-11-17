/** טיפוסים ועזרים של אשף הדיווח (app/report.tsx). */


/** שורת הפסקה בטופס — משך בדקות נשמר כמחרוזת לעריכה חופשית. */
export type BreakRow = { id: string; minutes: string };
/** אורך ברירת המחדל של הפסקה חדשה */
export const DEFAULT_BREAK_MINUTES = 10;

export type Step = 'date' | 'course' | 'workplace' | 'times' | 'summary' | 'done';

/** מה לעשות עם הדקות שאינן משלימות שעה אקדמית. */
export type LeftoverChoice = 'carry' | 'include';

export type Errors = {
  workplace?: string;
  date?: string;
  start?: string;
  end?: string;
  breaks?: string;
};

export function parseNum(value: string): number {
  return Number(value.replace(',', '.').trim());
}

/** סך דקות ההפסקות מתוך שורות הטופס, תוך התעלמות משורות ריקות / לא תקינות. */
export function sumBreaks(rows: BreakRow[]): number {
  return rows.reduce((total, row) => {
    const n = parseNum(row.minutes);
    return total + (Number.isFinite(n) && n > 0 ? n : 0);
  }, 0);
}

/** כמה שניות אחרי שמירה חוזרים אוטומטית (לבית, או לתצוגת הדיווח בעריכה). */
export const AUTO_RETURN_SECONDS = 5;
