/**
 * התראות לטלפון — מה לתזמן (חישוב טהור; התזמון עצמו ב־lib/push.ts).
 *
 * ההתראות מתוזמנות במכשיר מראש לימים הקרובים (`PUSH_HORIZON_DAYS`), ומחושבות מחדש בכל פתיחה
 * ובכל שינוי בנתונים — כך דיווח, ביטול או הזזה מבטלים התראה שכבר לא רלוונטית.
 * ארבעה סוגים, כמו ההתראות בדף הבית:
 *  - `taxi`     — הזמנת מונית (X שעות לפני המפגש הראשון, או בערב שלפני בשעה שנקבעה).
 *  - `reminder` — תזכורת מפגש מ"פרטי המפגש" (הגשה, מבחן, תזכורת ידנית).
 *  - `missing`  — מפגש שהתקיים היום ולא דווח (בערב, או חצי שעה אחרי הסיום אם מאוחר יותר).
 *  - `payroll`  — סיכום התקופה יום לפני היום האחרון לדיווח שכר, ובבוקר היום האחרון.
 * בלי סכומי כסף: התראה מוצגת גם במסך הנעול (צנעת הפרט, כמו דף הבית).
 */
import { courseReport, courseReported, coursesOn, sessionCancel, sessionTimes, type Course } from './courses';
import { currentPayPeriod, isoDate } from './dashboard';
import { dateFromIso } from './dates';
import { addDays, longDayLabel } from './home';
import { isLocked, statusKey, type StatusMap } from './payroll';
import { netMinutes, type WorkReport } from './reports';
import { currentPlan, type PlanIndex } from './sessions';
import { effectiveReminder, FLAG_LABEL, type SessionNote } from './sessionNotes';
import { formatDuration, formatTime, parseTime } from './time';
import { beforeTracking } from './trackingStart';
import { activeWorkplaces, isTaxi, type Workplace } from './workplaces';

export type PushKind = 'taxi' | 'reminder' | 'missing' | 'payroll';

export const PUSH_KINDS: readonly PushKind[] = ['taxi', 'reminder', 'missing', 'payroll'];

export type PushItem = {
  /** מזהה יציב — תזמון מחדש מחליף את אותה התראה ולא מכפיל אותה */
  id: string;
  kind: PushKind;
  at: Date;
  title: string;
  body: string;
  /** נתיב באפליקציה שנפתח בלחיצה על ההתראה */
  href: string;
};

export type PushInput = {
  workplaces: readonly Workplace[];
  courses: readonly Course[];
  reports: readonly WorkReport[];
  notes: readonly SessionNote[];
  payroll: StatusMap;
  now: Date;
  kinds?: readonly PushKind[];
  /** שעת ההתראה על דיווח חסר "HH:MM" (ברירת מחדל `MISSING_TIME`) */
  missingTime?: string;
};

/** כמה ימים קדימה מתזמנים. */
export const PUSH_HORIZON_DAYS = 14;
/** תקרה למספר ההתראות המתוזמנות (אנדרואיד מגביל את מספר ההתראות הממתינות). */
export const PUSH_MAX = 60;
/** שעת ההתראה על דיווח חסר (ברירת מחדל; ניתנת לשינוי בהגדרות), כשהמפגש הסתיים לפניה. */
export const MISSING_TIME = '22:00';
/** שעות ההתראה על היום האחרון לדיווח שכר: בערב שלפני ובבוקר עצמו. */
export const PAYROLL_EVE_TIME = '19:00';
export const PAYROLL_DAY_TIME = '09:00';

/** תאריך + "HH:MM" → Date מקומי. */
function at(date: string, time: string): Date {
  const d = dateFromIso(date);
  const m = parseTime(time) ?? 0;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), Math.floor(m / 60), m % 60);
}

const shortDate = (iso: string) => {
  const [, m, d] = iso.split('-').map(Number);
  return `${d}.${m}`;
};

const q = (params: Record<string, string>) => new URLSearchParams(params).toString();

/** "היום" / "מחר" / "יום ג׳, 24 בנובמבר" — ביחס ליום שבו ההתראה מוצגת. */
function dayWord(date: string, shownOn: Date): string {
  if (date === isoDate(shownOn)) return 'היום';
  if (date === isoDate(addDays(shownOn, 1))) return 'מחר';
  return longDayLabel(dateFromIso(date));
}

const live = <T extends { demo?: boolean }>(list: readonly T[]) => list.filter((x) => !x.demo);

function taxiPush(workplaces: readonly Workplace[], courses: readonly Course[], dates: string[], plan: PlanIndex): PushItem[] {
  const out: PushItem[] = [];
  for (const w of workplaces) {
    if (!isTaxi(w.arrivalMode) || !w.taxi) continue;
    const kind = w.arrivalMode === 'taxi_voucher' ? 'מונית פתק' : 'מונית';
    const reminder = w.taxi.reminder;
    for (const date of dates) {
      const first = coursesOn(courses, date, w.id, plan.cancel, plan.moves)
        .map((c) => ({ c, start: sessionTimes(c, date).start }))
        .sort((a, b) => a.start.localeCompare(b.start))[0];
      if (!first) continue;
      let when: Date | null = null;
      if (reminder.kind === 'hoursBefore') {
        const s = at(date, first.start);
        when = new Date(s.getTime() - reminder.hours * 3_600_000);
      } else if (reminder.kind === 'nightBefore') {
        const prev = isoDate(addDays(dateFromIso(date), -1));
        when = at(prev, reminder.time);
      }
      if (!when) continue;
      const contact = w.taxi.contactName ? `\n${w.taxi.contactName} · ${w.taxi.phone}` : w.taxi.phone ? `\nטלפון: ${w.taxi.phone}` : '';
      out.push({
        id: `taxi|${w.id}|${date}`,
        kind: 'taxi',
        at: when,
        title: `להזמין ${kind} ל${w.name}`,
        body: `${first.c.name} ${dayWord(date, when)} ב־${first.start}.${w.address ? `\nיעד: ${w.address}` : ''}${contact}`,
        href: '/',
      });
    }
  }
  return out;
}

function reminderPush(
  notes: readonly SessionNote[],
  workplaces: readonly Workplace[],
  courses: readonly Course[],
  reports: readonly WorkReport[],
  plan: PlanIndex,
): PushItem[] {
  const out: PushItem[] = [];
  for (const n of notes) {
    const when = effectiveReminder(n);
    if (!when) continue;
    const course = courses.find((c) => c.id === n.courseId);
    const workplace = course && workplaces.find((w) => w.id === course.workplaceId);
    if (!course || !workplace) continue;
    if (sessionCancel(course, n.date, plan.cancel) || courseReport(course, n.date, reports)) continue;
    const [date, time] = when.split('T');
    const fire = at(date, time);
    const start = sessionTimes(course, n.date).start;
    const lines = [n.note, n.content && `תוכן: ${n.content}`, n.arrival && `הגעה: ${n.arrival}`].filter(Boolean);
    out.push({
      id: `reminder|${n.courseId}|${n.date}`,
      kind: 'reminder',
      at: fire,
      title: `${n.flag ? `${FLAG_LABEL[n.flag]}: ` : 'תזכורת: '}${course.name} · ${dayWord(n.date, fire)} ${start}`,
      body: lines.length ? lines.join('\n') : workplace.name,
      href: `/reports?${q({ tab: 'plan', day: n.date })}`,
    });
  }
  return out;
}

function missingPush(
  workplaces: readonly Workplace[],
  courses: readonly Course[],
  reports: readonly WorkReport[],
  dates: string[],
  plan: PlanIndex,
  missingTime: string = MISSING_TIME,
): PushItem[] {
  const ids = new Set(workplaces.map((w) => w.id));
  const out: PushItem[] = [];
  for (const date of dates) {
    if (beforeTracking(date)) continue;
    const open = coursesOn(courses, date, undefined, plan.cancel, plan.moves)
      .filter((c) => ids.has(c.workplaceId) && !courseReported(c, date, reports))
      .map((c) => ({ c, ...sessionTimes(c, date) }));
    if (open.length === 0) continue;
    // אחרי סיום המפגש האחרון: בשעה הקבועה, או חצי שעה אחרי הסיום אם הוא מאוחר יותר.
    const lastEnd = Math.max(...open.map((o) => parseTime(o.end) ?? 0));
    const fireMin = Math.max(parseTime(missingTime) ?? parseTime(MISSING_TIME) ?? 0, lastEnd + 30);
    const fire = at(date, formatTime(fireMin));
    const first = open[0];
    out.push({
      id: `missing|${date}`,
      kind: 'missing',
      at: fire,
      title: open.length === 1 ? 'לא לשכוח לדווח' : `${open.length} מפגשים של היום לא דווחו`,
      body: open.length === 1 ? `${first.c.name} · \u2066${first.start}–${first.end}\u2069` : open.map((o) => o.c.name).join(' · '),
      href:
        open.length === 1
          ? `/report?${q({ course: first.c.id, date })}`
          : `/reports?${q({ day: date })}`,
    });
  }
  return out;
}

function payrollPush(
  workplaces: readonly Workplace[],
  courses: readonly Course[],
  reports: readonly WorkReport[],
  payroll: StatusMap,
  now: Date,
  horizonEnd: string,
): PushItem[] {
  const out: PushItem[] = [];
  for (const w of workplaces) {
    // התקופה הנוכחית והבאה — כל תקופה שהיום האחרון שלה בטווח התזמון.
    const first = currentPayPeriod(w.payday, now);
    const second = currentPayPeriod(w.payday, addDays(dateFromIso(first.end), 1));
    for (const p of [first, second]) {
      if (p.end > horizonEnd || beforeTracking(p.end)) continue;
      if (isLocked(payroll[statusKey(w.id, p.start)])) continue;
      const inPeriod = reports.filter((r) => r.workplaceId === w.id && r.date >= p.start && r.date <= p.end);
      const planned = courses.some((c) => c.workplaceId === w.id && c.from <= p.end && c.to >= p.start);
      if (inPeriod.length === 0 && !planned) continue;
      const minutes = inPeriod.reduce((s, r) => s + (netMinutes(r) ?? 0), 0);
      const summary =
        inPeriod.length === 0
          ? `אין עדיין דיווחים בתקופה \u2066${shortDate(p.start)}–${shortDate(p.end)}\u2069.`
          : `בתקופה \u2066${shortDate(p.start)}–${shortDate(p.end)}\u2069: ${inPeriod.length === 1 ? 'דיווח אחד' : `${inPeriod.length} דיווחים`} · ${formatDuration(minutes)}.`;
      const href = `/payroll-report?${q({ wp: w.id, start: p.start })}`;
      const prev = isoDate(addDays(dateFromIso(p.end), -1));
      out.push({
        id: `payroll|${w.id}|${p.end}|eve`,
        kind: 'payroll',
        at: at(prev, PAYROLL_EVE_TIME),
        title: `מחר יום אחרון לדיווח שכר — ${w.name}`,
        body: `${summary}\nכדאי לבדוק ולשלוח את דוח השכר. דוח שיישלח אחר כך ישולם רק בחודש הבא.`,
        href,
      });
      out.push({
        id: `payroll|${w.id}|${p.end}|day`,
        kind: 'payroll',
        at: at(p.end, PAYROLL_DAY_TIME),
        title: `היום יום אחרון לדיווח שכר — ${w.name}`,
        body: `${summary}\nיש לשלוח את דוח השכר היום.`,
        href,
      });
    }
  }
  return out;
}

/**
 * כל ההתראות לתזמון, מהמוקדמת למאוחרת — רק עתידיות, בטווח התזמון ועד `PUSH_MAX`.
 * מקומות עבודה בארכיון ונתוני הדגמה — בלי התראות (דוח שכר — גם למקום בארכיון שעוד לא נשלח).
 */
export function planPush(input: PushInput, plan: PlanIndex = currentPlan()): PushItem[] {
  const { now } = input;
  const kinds = new Set(input.kinds ?? PUSH_KINDS);
  const all = live(input.workplaces);
  const active = activeWorkplaces(all);
  const courses = live(input.courses);
  const dates = Array.from({ length: PUSH_HORIZON_DAYS + 1 }, (_, i) => isoDate(addDays(now, i)));
  const horizonEnd = dates[dates.length - 1];
  const out: PushItem[] = [];
  if (kinds.has('taxi')) out.push(...taxiPush(active, courses, dates, plan));
  if (kinds.has('reminder')) out.push(...reminderPush(input.notes, active, courses, input.reports, plan));
  if (kinds.has('missing')) out.push(...missingPush(active, courses, input.reports, dates, plan, input.missingTime));
  if (kinds.has('payroll')) out.push(...payrollPush(all, courses, input.reports, input.payroll, now, horizonEnd));
  const limit = addDays(now, PUSH_HORIZON_DAYS + 1).getTime();
  return out
    .filter((p) => p.at.getTime() > now.getTime() && p.at.getTime() <= limit)
    .sort((a, b) => a.at.getTime() - b.at.getTime())
    .slice(0, PUSH_MAX);
}
