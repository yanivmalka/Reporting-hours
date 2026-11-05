/**
 * מצב יום בתאריכונים — אותו קוד בכל תאריכון באפליקציה:
 *   - done    (ירוקה) — הכול דווח, כולל יום עם דיווח בלי מפגש מתוכנן;
 *   - missing (כתומה) — יש מפגש שעבר ולא דווח, כולל דיווח חלקי;
 *   - planned (כהה)   — מפגש מתוכנן שעוד לא עבר.
 * ימים בלי מפגשים ובלי דיווחים — בלי נקודה. טהור, בלי React ובלי אחסון.
 */
import { courseReported, coursesOn, type Course } from './courses';
import type { WorkReport } from './reports';
import { parseTime } from './time';
import { activeWorkplaces, type Workplace } from './workplaces';

export type DayStatus = 'done' | 'missing' | 'planned';

export type DayStatusInput = {
  courses: readonly Course[];
  workplaces: readonly Workplace[];
  reports: readonly WorkReport[];
};

const isoOf = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** מצב יום אחד. */
export function dayStatus(date: string, input: DayStatusInput, now: Date = new Date()): DayStatus | null {
  const today = isoOf(now);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const ids = new Set(activeWorkplaces(input.workplaces).map((w) => w.id));
  const sessions = coursesOn(input.courses, date).filter((c) => ids.has(c.workplaceId));
  let missing = false;
  let planned = false;
  for (const c of sessions) {
    if (courseReported(c, date, input.reports)) continue;
    const ended = date < today || (date === today && nowMin >= (parseTime(c.end) ?? 0));
    if (ended) missing = true;
    else planned = true;
  }
  if (missing) return 'missing';
  if (planned) return 'planned';
  if (sessions.length > 0 || input.reports.some((r) => r.date === date)) return 'done';
  return null;
}

/** פונקציית מצב מוכנה לתאריכון (עם מטמון לכל תאריך). */
export function dayStatusIndex(input: DayStatusInput, now: Date = new Date()): (date: string) => DayStatus | null {
  const cache = new Map<string, DayStatus | null>();
  return (date) => {
    if (!cache.has(date)) cache.set(date, dayStatus(date, input, now));
    return cache.get(date) ?? null;
  };
}
