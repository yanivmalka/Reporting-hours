/**
 * חגים וימים מיוחדים בישראל — ימים שבהם מפגשי קורסים עשויים לא להתקיים.
 * מחושב מהלוח העברי (@hebcal/hdate), בלי תלות ברשת, לפי מנהג ארץ ישראל.
 *
 * ארבעה סוגים, כל אחד נבחר בנפרד בהגדרות (lib/sessions.ts):
 *   - yomTov     — חג ויום שבתון: ראש השנה, יום הכיפורים, סוכות, שמחת תורה,
 *                  פסח, שביעי של פסח, שבועות, יום העצמאות. כמעט תמיד אין לימודים.
 *   - eve        — ערב חג: ערב ראש השנה, ערב יום הכיפורים, ערב סוכות, הושענא רבה,
 *                  ערב פסח, ערב שביעי של פסח, ערב שבועות.
 *   - cholHamoed — חול המועד סוכות ופסח.
 *   - tishaBav   — תשעה באב (נדחה ליום ראשון כשחל בשבת).
 * בערבי חג, בחול המועד ובתשעה באב יש מוסדות שמלמדים ויש שלא — ולכן הם נפרדים.
 * תאריך יכול להשתייך לכמה סוגים (למשל ערב שביעי של פסח הוא גם חול המועד).
 */
import { HDate, months } from '@hebcal/hdate';

export type RestDayKind = 'yomTov' | 'eve' | 'cholHamoed' | 'tishaBav';

export type RestDay = { name: string; kind: RestDayKind };

export const REST_DAY_KIND_LABELS: Record<RestDayKind, string> = {
  yomTov: 'חגים וימי שבתון',
  eve: 'ערבי חג',
  cholHamoed: 'חול המועד',
  tishaBav: 'תשעה באב',
};

function toDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** ימים קבועים בלוח העברי: [חודש, יום, שם, סוג]. */
const FIXED: [number, number, string, RestDayKind][] = [
  // חגים
  [months.TISHREI, 1, 'ראש השנה', 'yomTov'],
  [months.TISHREI, 2, 'ראש השנה', 'yomTov'],
  [months.TISHREI, 10, 'יום הכיפורים', 'yomTov'],
  [months.TISHREI, 15, 'סוכות', 'yomTov'],
  [months.TISHREI, 22, 'שמחת תורה', 'yomTov'],
  [months.NISAN, 15, 'פסח', 'yomTov'],
  [months.NISAN, 21, 'שביעי של פסח', 'yomTov'],
  [months.SIVAN, 6, 'שבועות', 'yomTov'],
  // ערבי חג
  [months.ELUL, 29, 'ערב ראש השנה', 'eve'],
  [months.TISHREI, 9, 'ערב יום הכיפורים', 'eve'],
  [months.TISHREI, 14, 'ערב סוכות', 'eve'],
  [months.TISHREI, 21, 'הושענא רבה', 'eve'],
  [months.NISAN, 14, 'ערב פסח', 'eve'],
  [months.NISAN, 20, 'ערב שביעי של פסח', 'eve'],
  [months.SIVAN, 5, 'ערב שבועות', 'eve'],
  // חול המועד (כולל הושענא רבה וערב שביעי של פסח)
  ...[16, 17, 18, 19, 20, 21].map((d) => [months.TISHREI, d, 'חול המועד סוכות', 'cholHamoed'] as [number, number, string, RestDayKind]),
  ...[16, 17, 18, 19, 20].map((d) => [months.NISAN, d, 'חול המועד פסח', 'cholHamoed'] as [number, number, string, RestDayKind]),
];

/**
 * יום העצמאות: ה׳ באייר; כשחל בשישי או בשבת — מוקדם ליום חמישי שלפניו,
 * וכשחל בשני — נדחה לשלישי (כדי שיום הזיכרון לא יחול במוצאי שבת).
 */
function independenceDay(hd: HDate): boolean {
  if (hd.getMonth() !== months.IYYAR) return false;
  const fifth = new HDate(5, months.IYYAR, hd.getFullYear());
  const dow = fifth.getDay(); // 0 = ראשון
  const actual = dow === 5 ? 4 : dow === 6 ? 3 : dow === 1 ? 6 : 5;
  return hd.getDate() === actual;
}

/** תשעה באב: ט׳ באב, ונדחה לי׳ באב כשט׳ באב חל בשבת. */
function tishaBav(hd: HDate): boolean {
  if (hd.getMonth() !== months.AV) return false;
  const ninth = new HDate(9, months.AV, hd.getFullYear());
  return hd.getDate() === (ninth.getDay() === 6 ? 10 : 9);
}

/** כל הסוגים שחלים בתאריך ("YYYY-MM-DD"), מהחשוב לפחות חשוב. ריק ביום רגיל. */
export function restDays(iso: string): RestDay[] {
  const hd = new HDate(toDate(iso));
  const m = hd.getMonth();
  const d = hd.getDate();
  const out: RestDay[] = FIXED.filter(([fm, fd]) => fm === m && fd === d).map(([, , name, kind]) => ({
    name,
    kind,
  }));
  if (independenceDay(hd)) out.push({ name: 'יום העצמאות', kind: 'yomTov' });
  if (tishaBav(hd)) out.push({ name: 'תשעה באב', kind: 'tishaBav' });
  const order: RestDayKind[] = ['yomTov', 'eve', 'cholHamoed', 'tishaBav'];
  return out.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
}

/** שם החג / השבתון (סוג yomTov בלבד) בתאריך, או null. */
export function restDayName(iso: string): string | null {
  return restDays(iso).find((r) => r.kind === 'yomTov')?.name ?? null;
}
