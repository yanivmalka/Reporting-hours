/**
 * תאריך עברי לתצוגה — לצד כל תאריך לועזי באפליקציה.
 * מבוסס @hebcal/hdate (חישוב בלוח העברי, כולל שנים מעוברות — אדר א׳/ב׳),
 * בלי תלות בתמיכת Intl של המכשיר.
 */
import { HDate } from '@hebcal/hdate';

function toDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** חלקי התאריך העברי: יום (גימטריה), חודש, שנה — למשל ["כ״א", "חשון", "תשפ״ז"]. */
function parts(iso: string): { day: string; month: string; year: string } {
  const tokens = new HDate(toDate(iso)).renderGematriya(true).split(' ');
  return { day: tokens[0], month: tokens.slice(1, -1).join(' '), year: tokens[tokens.length - 1] };
}

/** "כ״א חשון תשפ״ז" (או בלי שנה: "כ״א חשון") */
export function hebrewDate(iso: string, withYear = true): string {
  const p = parts(iso);
  return withYear ? `${p.day} ${p.month} ${p.year}` : `${p.day} ${p.month}`;
}

/** היום בחודש העברי בלבד — "כ״א" (לתאי לוח שנה) */
export function hebrewDay(iso: string): string {
  return parts(iso).day;
}

/** טווח עברי: "כ״ח תשרי–כ״ח חשון" (חודש משותף נכתב פעם אחת: "ג׳–י׳ חשון") */
export function hebrewRange(fromIso: string, toIso: string): string {
  const a = parts(fromIso);
  const b = parts(toIso);
  if (a.month === b.month && a.year === b.year) return `${a.day}–${b.day} ${b.month}`;
  return `${a.day} ${a.month}–${b.day} ${b.month}`;
}

/** החודשים העבריים שחלים בחודש לועזי — "תשרי–חשון תשפ״ז" (לכותרת לוח שנה). */
export function hebrewMonthSpan(year: number, month0: number): string {
  const first = new HDate(new Date(year, month0, 1));
  const last = new HDate(new Date(year, month0 + 1, 0));
  const a = parts(iso(first.greg()));
  const b = parts(iso(last.greg()));
  if (a.month === b.month) return `${a.month} ${a.year}`;
  return a.year === b.year ? `${a.month}–${b.month} ${b.year}` : `${a.month} ${a.year}–${b.month} ${b.year}`;
}

function iso(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
