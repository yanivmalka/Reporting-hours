/**
 * חגים וימי שבתון בישראל — ימים שבהם מוסדות הלימוד סגורים ומפגשי קורסים
 * לא מתקיימים. מחושב מהלוח העברי (@hebcal/hdate), בלי תלות ברשת.
 *
 * נכללים ימי יום טוב לפי מנהג ארץ ישראל, יום הכיפורים, ויום העצמאות
 * (יום שבתון לפי החוק, כולל הקדמה/דחייה כשהוא חל סמוך לשבת).
 */
import { HDate, months } from '@hebcal/hdate';

function toDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** ימים קבועים בלוח העברי: [חודש, יום, שם]. */
const FIXED: [number, number, string][] = [
  [months.TISHREI, 1, 'ראש השנה'],
  [months.TISHREI, 2, 'ראש השנה'],
  [months.TISHREI, 10, 'יום הכיפורים'],
  [months.TISHREI, 15, 'סוכות'],
  [months.TISHREI, 22, 'שמחת תורה'],
  [months.NISAN, 15, 'פסח'],
  [months.NISAN, 21, 'שביעי של פסח'],
  [months.SIVAN, 6, 'שבועות'],
];

/**
 * יום העצמאות: ה׳ באייר; כשחל בשישי או בשבת — מוקדם ליום חמישי שלפניו,
 * וכשחל בשני — נדחה לשלישי (כדי שיום הזיכרון לא יחול במוצאי שבת).
 */
function independenceDay(hd: HDate): boolean {
  if (hd.getMonth() !== months.IYYAR) return false;
  const day = hd.getDate();
  const fifth = new HDate(5, months.IYYAR, hd.getFullYear());
  const dow = fifth.getDay(); // 0 = ראשון
  const actual = dow === 5 ? 4 : dow === 6 ? 3 : dow === 1 ? 6 : 5;
  return day === actual;
}

/** שם החג / השבתון שחל בתאריך ("YYYY-MM-DD"), או null ביום רגיל. */
export function restDayName(iso: string): string | null {
  const hd = new HDate(toDate(iso));
  const m = hd.getMonth();
  const d = hd.getDate();
  for (const [fm, fd, name] of FIXED) if (fm === m && fd === d) return name;
  if (independenceDay(hd)) return 'יום העצמאות';
  return null;
}
