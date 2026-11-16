/**
 * תאריכים בפורמט "YYYY-MM-DD" (ISO, לפי השעון המקומי) — המקור היחיד להמרות.
 *
 * באפליקציה תאריך הוא מחרוזת ISO מקומית, ולא Date: כך אין הפתעות של אזור זמן
 * (‎toISOString ממיר ל־UTC ומזיז את היום אחרי חצות). ההמרות כאן משתמשות בשעון
 * המקומי בלבד.
 */

const pad2 = (n: number) => String(n).padStart(2, '0');

/** Date → "YYYY-MM-DD" (יום מקומי). */
export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** "YYYY-MM-DD" → Date בחצות המקומית. מניח קלט תקין (ראו parseIsoDate לקלט מהמשתמש). */
export function dateFromIso(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** קלט שאולי אינו תקין: Date, או null כשאינו בפורמט "YYYY-MM-DD". */
export function parseIsoDate(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}

/** "YYYY-MM-DD" של היום. */
export const todayIsoDate = (now: Date = new Date()) => isoDate(now);
