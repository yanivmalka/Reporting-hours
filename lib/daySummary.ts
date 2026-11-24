/**
 * שורת הסיכום מתחת לאריח יום ביומן: המפגשים / הדיווחים של היום, מקובצים לפי מקום עבודה —
 * כמה מפגשים, שעות נטו, ובמקום שמשלם לפי שעה אקדמית — גם שעות אקדמיות. טהור.
 */
import { ACADEMIC_HOUR_MINUTES } from './academic';
import { parseTime } from './time';

/** `carriedMinutes` — דקות שהדיווח העביר למונה המצטבר (במקום אקדמי) */
export type DayEntry = { workplaceId: string; netMinutes: number; carriedMinutes?: number };
export type DayWorkplaceTotal = { workplaceId: string; count: number; netMinutes: number; carriedMinutes: number };

/** סיכום לפי מקום עבודה, בסדר ההופעה הראשונה ביום. */
export function dayTotalsByWorkplace(entries: readonly DayEntry[]): DayWorkplaceTotal[] {
  const map = new Map<string, DayWorkplaceTotal>();
  for (const e of entries) {
    const t = map.get(e.workplaceId) ?? { workplaceId: e.workplaceId, count: 0, netMinutes: 0, carriedMinutes: 0 };
    t.count += 1;
    t.netMinutes += Math.max(0, e.netMinutes);
    t.carriedMinutes += Math.max(0, e.carriedMinutes ?? 0);
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

/**
 * "2 מפגשים · 7:15 שעות נטו · 9 שע׳ אקד׳ · 30 דק׳ למונה" — במקום אקדמי השעות האקדמיות
 * בלי הדקות שהועברו למונה (כמו בדוח השכר), והן מוצגות בנפרד.
 */
export function dayTotalText(t: DayWorkplaceTotal, withAcademic: boolean, noun: 'מפגשים' | 'דיווחים' = 'מפגשים'): string {
  return [
    t.count === 1 ? (noun === 'מפגשים' ? 'מפגש אחד' : 'דיווח אחד') : `${t.count} ${noun}`,
    `${hm(t.netMinutes)} שעות נטו`,
    withAcademic ? `${academic(Math.max(0, t.netMinutes - t.carriedMinutes))} שע׳ אקד׳` : '',
    withAcademic && t.carriedMinutes > 0 ? `${t.carriedMinutes} דק׳ למונה` : '',
  ]
    .filter(Boolean)
    .join(' · ');
}
