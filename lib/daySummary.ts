/**
 * שורת הסיכום מתחת לאריח יום ביומן: המפגשים / הדיווחים של היום, מקובצים לפי מקום עבודה —
 * כמה מפגשים, שעות נטו, ובמקום שמשלם לפי שעה אקדמית — גם שעות אקדמיות. טהור.
 */
import { ACADEMIC_HOUR_MINUTES } from './academic';
import { parseTime } from './time';

export type DayEntry = { workplaceId: string; netMinutes: number };
export type DayWorkplaceTotal = { workplaceId: string; count: number; netMinutes: number };

/** סיכום לפי מקום עבודה, בסדר ההופעה הראשונה ביום. */
export function dayTotalsByWorkplace(entries: readonly DayEntry[]): DayWorkplaceTotal[] {
  const map = new Map<string, DayWorkplaceTotal>();
  for (const e of entries) {
    const t = map.get(e.workplaceId) ?? { workplaceId: e.workplaceId, count: 0, netMinutes: 0 };
    t.count += 1;
    t.netMinutes += Math.max(0, e.netMinutes);
    map.set(e.workplaceId, t);
  }
  return [...map.values()];
}

/** דקות נטו של טווח "HH:MM"–"HH:MM" פחות הפסקה (0 אם לא תקין). */
export function rangeNetMinutes(start: string, end: string, breakMinutes = 0): number {
  const s = parseTime(start);
  const e = parseTime(end);
  return s == null || e == null ? 0 : Math.max(0, e - s - breakMinutes);
}

const hm = (minutes: number) => {
  const m = Math.max(0, Math.round(minutes));
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
};

const academic = (minutes: number) => {
  const v = Math.round((minutes / ACADEMIC_HOUR_MINUTES) * 100) / 100;
  return Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/0$/, '');
};

/** "2 מפגשים · 7:15 שעות נטו · 9.67 שע׳ אקד׳" */
export function dayTotalText(t: DayWorkplaceTotal, withAcademic: boolean, noun: 'מפגשים' | 'דיווחים' = 'מפגשים'): string {
  return [
    t.count === 1 ? (noun === 'מפגשים' ? 'מפגש אחד' : 'דיווח אחד') : `${t.count} ${noun}`,
    `${hm(t.netMinutes)} שעות נטו`,
    withAcademic ? `${academic(t.netMinutes)} שע׳ אקד׳` : '',
  ]
    .filter(Boolean)
    .join(' · ');
}
