/**
 * עזרי זמן ותאריך משותפים למסכי הדיווח.
 * זמנים מיוצגים כמחרוזת "HH:MM" ותאריכים כמחרוזת ISO "YYYY-MM-DD".
 */

/** מחרוזת ISO של היום ("YYYY-MM-DD") לפי השעון המקומי. */
export function todayISO(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** בדיקה שמחרוזת היא תאריך ISO תקין וקיים בלוח השנה. */
export function isValidISODate(value: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!m) return false;
  const [, y, mo, day] = m;
  const date = new Date(Number(y), Number(mo) - 1, Number(day));
  return (
    date.getFullYear() === Number(y) &&
    date.getMonth() === Number(mo) - 1 &&
    date.getDate() === Number(day)
  );
}

/** הצגת תאריך ISO בפורמט מקומי "DD/MM/YYYY". */
export function formatISODate(value: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!m) return value;
  const [, y, mo, day] = m;
  return `${day}/${mo}/${y}`;
}

/** המרת "HH:MM" למספר דקות מתחילת היום, או null אם אינו תקין. */
export function parseTime(value: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const hours = Number(m[1]);
  const minutes = Number(m[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/** תוויות שפה לפירמוט משך; ברירת המחדל עברית לשמירה על תאימות לאחור. */
export type DurationLabels = {
  hoursShort: string;
  minutesShort: string;
  join: string;
};

const DEFAULT_DURATION_LABELS: DurationLabels = {
  hoursShort: 'שע׳',
  minutesShort: 'דק׳',
  join: ' ו־',
};

/** הצגת משך בדקות כטקסט קצר, למשל "4 שע׳ ו־15 דק׳" או "4h 15m". */
export function formatDuration(
  totalMinutes: number,
  labels: DurationLabels = DEFAULT_DURATION_LABELS,
): string {
  const safe = Math.max(0, Math.round(totalMinutes));
  const hours = Math.floor(safe / 60);
  const minutes = safe % 60;
  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours} ${labels.hoursShort}`);
  if (minutes > 0 || hours === 0) parts.push(`${minutes} ${labels.minutesShort}`);
  return parts.join(labels.join);
}
