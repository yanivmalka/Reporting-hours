/**
 * חמשת הימים הקרובים — שלשום, אתמול, היום, מחר, מחרתיים. משותף ללו״ז הבית
 * ולתגיות ביומן, כך שהשמות זהים בכל מקום.
 */
export type NearDayKey = 'dayBefore' | 'yesterday' | 'today' | 'tomorrow' | 'dayAfter';

export const NEAR_DAYS: readonly { key: NearDayKey; offset: number; label: string }[] = [
  { key: 'dayBefore', offset: -2, label: 'שלשום' },
  { key: 'yesterday', offset: -1, label: 'אתמול' },
  { key: 'today', offset: 0, label: 'היום' },
  { key: 'tomorrow', offset: 1, label: 'מחר' },
  { key: 'dayAfter', offset: 2, label: 'מחרתיים' },
];

/** "YYYY-MM-DD" מוזז ב־n ימים (לפי לוח השנה המקומי). */
export function shiftISO(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const t = new Date(y, m - 1, d + n);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
}

/** התאריכים של חמשת הימים, משלשום עד מחרתיים. */
export function nearDates(today: string): string[] {
  return NEAR_DAYS.map((d) => shiftISO(today, d.offset));
}

/** התגית של התאריך ("שלשום" … "מחרתיים"), או null אם הוא מחוץ לחמשת הימים. */
export function nearDay(date: string, today: string): { key: NearDayKey; label: string } | null {
  for (const d of NEAR_DAYS) if (shiftISO(today, d.offset) === date) return { key: d.key, label: d.label };
  return null;
}
