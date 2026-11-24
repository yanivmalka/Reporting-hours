/**
 * שורת הסיכום מתחת לאריח יום ביומן: המפגשים / הדיווחים של היום, מקובצים לפי מקום עבודה.
 * במקום שמשלם לפי שעה אקדמית — שעות אקדמיות שלמות וכמה דקות הועברו למונה המצטבר
 * (ודקות שנכללו בדיווח כשבר, אם יש); במקום אחר — שעות נטו. טהור.
 */
import { toAcademic } from './academic';
import type { LeftoverMode } from './leftover';
import { academicOf, netMinutes, type WorkReport } from './reports';
import { parseTime } from './time';

/** מפגש / דיווח ביום: נטו, שעות אקדמיות שלמות, דקות למונה ודקות שנשארו בדיווח. */
export type DayEntry = {
  workplaceId: string;
  netMinutes: number;
  wholeHours?: number;
  carriedMinutes?: number;
  keptMinutes?: number;
};
export type DayWorkplaceTotal = {
  workplaceId: string;
  count: number;
  netMinutes: number;
  wholeHours: number;
  carriedMinutes: number;
  keptMinutes: number;
};

/** רשומת יום מדיווח שנשמר — השעות האקדמיות והדקות למונה כפי שנקבעו בו. */
export function reportEntry(r: Pick<WorkReport, 'workplaceId' | 'start' | 'end' | 'breaks' | 'carriedMinutes'>): DayEntry {
  const a = academicOf(r);
  return {
    workplaceId: r.workplaceId,
    netMinutes: netMinutes(r) ?? 0,
    wholeHours: a?.wholeHours ?? 0,
    carriedMinutes: r.carriedMinutes ?? 0,
    keptMinutes: a?.leftoverMinutes ?? 0,
  };
}

/** רשומת יום ממפגש שטרם דווח — לפי השעות המתוכננות וההגדרה הכללית לדקות העודפות. */
export function plannedEntry(workplaceId: string, net: number, mode: LeftoverMode): DayEntry {
  const a = toAcademic(net);
  return {
    workplaceId,
    netMinutes: net,
    wholeHours: a.wholeHours,
    carriedMinutes: mode === 'carry' ? a.leftoverMinutes : 0,
    keptMinutes: mode === 'carry' ? 0 : a.leftoverMinutes,
  };
}

/** סיכום לפי מקום עבודה, בסדר ההופעה הראשונה ביום. */
export function dayTotalsByWorkplace(entries: readonly DayEntry[]): DayWorkplaceTotal[] {
  const map = new Map<string, DayWorkplaceTotal>();
  for (const e of entries) {
    const t = map.get(e.workplaceId) ?? {
      workplaceId: e.workplaceId,
      count: 0,
      netMinutes: 0,
      wholeHours: 0,
      carriedMinutes: 0,
      keptMinutes: 0,
    };
    t.count += 1;
    t.netMinutes += Math.max(0, e.netMinutes);
    t.wholeHours += e.wholeHours ?? 0;
    t.carriedMinutes += e.carriedMinutes ?? 0;
    t.keptMinutes += e.keptMinutes ?? 0;
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

/** "9 שע׳ אקד׳ · 10 דק׳ למצטברות" (שעות שלמות; דקות שנכללו בדיווח — "ו־N דק׳"). */
export function academicLine(wholeHours: number, carriedMinutes: number, keptMinutes = 0): string {
  return [
    `${wholeHours} שע׳ אקד׳${keptMinutes > 0 ? ` ו־${keptMinutes} דק׳` : ''}`,
    carriedMinutes > 0 ? `${carriedMinutes} דק׳ למצטברות` : '',
  ]
    .filter(Boolean)
    .join(' · ');
}

/** שורת הסיכום של מקום: במקום אקדמי — שעות אקדמיות ודקות למונה; אחרת — שעות נטו. */
export function dayTotalText(t: DayWorkplaceTotal, withAcademic: boolean): string {
  return withAcademic ? academicLine(t.wholeHours, t.carriedMinutes, t.keptMinutes) : `${hm(t.netMinutes)} שעות נטו`;
}

/** השורה באריח מפגש שדווח (מקום אקדמי) — כמו שורת הסיכום היומית. */
export function reportAcademicLine(r: Pick<WorkReport, 'workplaceId' | 'start' | 'end' | 'breaks' | 'carriedMinutes'>): string {
  const e = reportEntry(r);
  return academicLine(e.wholeHours ?? 0, e.carriedMinutes ?? 0, e.keptMinutes ?? 0);
}
