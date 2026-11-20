/**
 * מצב יום בתאריכונים — אותו קוד בכל תאריכון באפליקציה:
 *   - done    (ירוקה) — הכול דווח, כולל יום עם דיווח בלי מפגש מתוכנן;
 *   - missing (כתומה) — יש מפגש שעבר ולא דווח, כולל דיווח חלקי;
 *   - planned (כהה)   — מפגש מתוכנן שעוד לא עבר.
 * ולצדן — מפגשים שתוכננו ולא מתקיימים (כמו בעיגולי המפגשים, components/SessionDots.tsx):
 *   - canceled — בוטל ("השיעור לא התקיים");
 *   - moved    — הועבר לתאריך אחר (גם בהזזה מחופשה או ב"דחיית כל השיעורים");
 *   - vacation — חופשה מלוח החופשות;
 *   - holiday  — ביטול אוטומטי בחג / יום מיוחד.
 * מפגש שהוסר מהתכנון (`removed`) לא מסומן. ימים בלי מפגשים ובלי דיווחים — בלי נקודה.
 * טהור, בלי React ובלי אחסון.
 */
import { canceledOn, courseReported, coursesOn, type Course } from './courses';
import { currentPlan, type PlanIndex } from './sessions';
import type { WorkReport } from './reports';
import { parseTime } from './time';
import { activeWorkplaces, type Workplace } from './workplaces';
import { beforeTracking } from './trackingStart';
import { isoDate } from './dates';

/** מצב המפגשים שמתקיימים (נקודה מלאה). */
export type MainStatus = 'done' | 'missing' | 'planned';
/** מפגש שתוכנן ולא מתקיים (טבעת). */
export type OffStatus = 'canceled' | 'moved' | 'vacation' | 'holiday';
export type DayStatus = MainStatus | OffStatus;

/** סדר התצוגה — בנקודות של יום ובמקרא. */
export const DAY_STATUS_ORDER: readonly DayStatus[] = ['done', 'missing', 'planned', 'canceled', 'moved', 'vacation', 'holiday'];

const OFF_OF: Record<string, OffStatus | undefined> = {
  canceled: 'canceled',
  moved: 'moved',
  vacation: 'vacation',
  auto: 'holiday',
};

export type DayStatusInput = {
  courses: readonly Course[];
  workplaces: readonly Workplace[];
  reports: readonly WorkReport[];
  /** תמונת מצב של הביטולים וההעברות (ברירת מחדל: הנוכחית) */
  plan?: PlanIndex;
};

const isoOf = isoDate;

/** מצב המפגשים שמתקיימים ביום (נקודה אחת). */
function mainStatus(date: string, input: DayStatusInput & { plan: PlanIndex }, ids: Set<string>, now: Date): MainStatus | null {
  const today = isoOf(now);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const plan = input.plan;
  const sessions = coursesOn(input.courses, date, undefined, plan.cancel, plan.moves).filter((c) => ids.has(c.workplaceId));
  let missing = false;
  let planned = false;
  for (const c of sessions) {
    if (courseReported(c, date, input.reports)) continue;
    // לפני תחילת העבודה עם המערכת — מפגש שלא דווח אינו חסר.
    if (beforeTracking(date)) continue;
    const ended = date < today || (date === today && nowMin >= (parseTime(c.end) ?? 0));
    if (ended) missing = true;
    else planned = true;
  }
  if (missing) return 'missing';
  if (planned) return 'planned';
  if (input.reports.some((r) => r.date === date)) return 'done';
  if (sessions.length > 0 && !beforeTracking(date)) return 'done';
  return null;
}

/**
 * כל הסימונים של יום: מצב המפגשים שמתקיימים (אם יש), ואחריו סוגי המפגשים שלא מתקיימים
 * בו (בוטל, הועבר, חופשה, חג) — בסדר `DAY_STATUS_ORDER`. ריק — בלי נקודה.
 */
export function dayStatuses(date: string, input: DayStatusInput, now: Date = new Date()): DayStatus[] {
  const ids = new Set(activeWorkplaces(input.workplaces).map((w) => w.id));
  const plan = input.plan ?? currentPlan();
  const out = new Set<DayStatus>();
  const main = mainStatus(date, { ...input, plan }, ids, now);
  if (main) out.add(main);
  if (!beforeTracking(date)) {
    for (const x of canceledOn(input.courses, date, plan.cancel, plan.moves)) {
      if (!ids.has(x.course.workplaceId)) continue;
      const off = OFF_OF[x.cancel.kind];
      if (off) out.add(off);
    }
  }
  return DAY_STATUS_ORDER.filter((s) => out.has(s));
}

/** הסימון הראשי של יום (הראשון ב־`dayStatuses`). */
export function dayStatus(date: string, input: DayStatusInput, now: Date = new Date()): DayStatus | null {
  return dayStatuses(date, input, now)[0] ?? null;
}

/** פונקציית מצב מוכנה לתאריכון (עם מטמון לכל תאריך). */
export function dayStatusIndex(input: DayStatusInput, now: Date = new Date()): (date: string) => DayStatus[] {
  const cache = new Map<string, DayStatus[]>();
  // תמונה אחת לכל התאריכון — כל הימים מחושבים מול אותם ביטולים והעברות.
  const fixed = { ...input, plan: input.plan ?? currentPlan() };
  return (date) => {
    if (!cache.has(date)) cache.set(date, dayStatuses(date, fixed, now));
    return cache.get(date) ?? [];
  };
}

/** סוגי הסימונים שמופיעים בתאריכים — למקרא של החודש המוצג. */
export function statusesIn(dates: readonly string[], statusOf: (date: string) => readonly DayStatus[]): DayStatus[] {
  const seen = new Set<DayStatus>();
  for (const d of dates) for (const s of statusOf(d)) seen.add(s);
  return DAY_STATUS_ORDER.filter((s) => seen.has(s));
}
