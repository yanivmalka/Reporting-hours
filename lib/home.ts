/**
 * הנתונים של מסך הבית — טהור, בלי React ובלי אחסון:
 *   - ברכה לפי שעת היום ושם פרטי;
 *   - לו״ז משלשום עד מחרתיים מתוך הקורסים הפעילים של כל מקום עבודה, עם סטטוס דיווח;
 *   - התראות ותזכורות (מונית, דיווחים חסרים, תשלום קרוב, דקות מצטברות,
 *     דוחות שכר ותיאום מס).
 */
import type { Href } from 'expo-router';
import { accumulatedTotal, redeemableHours, entryOf, type AccumulatedState } from './accumulated';
import { courseReport, courseReported, coursesOn, sessionCancel, timeRange, type Course } from './courses';
import { currentPayPeriod, currentPeriods, daysUntil, isoDate } from './dashboard';
import type { PayBasis } from './payBasis';
import { isLocked, overduePayments, payrollItems, pendingPayroll, statusKey, type StatusMap } from './payroll';
import type { WorkReport } from './reports';
import { currentCancel, NO_CANCEL, type Cancellation, type CancelIndex } from './sessions';
import { recommendations } from './recommend';
import { parseTime } from './time';
import { activeWorkplaces, isTaxi, missingTaxCoordination, type Workplace } from './workplaces';

// ───────────────────────── ברכה ─────────────────────────

/** בוקר 05–11 · צהריים 12–16 · ערב 17–20 · לילה 21–04. */
export function greetingFor(hour: number): string {
  if (hour >= 5 && hour < 12) return 'בוקר טוב';
  if (hour >= 12 && hour < 17) return 'צהריים טובים';
  if (hour >= 17 && hour < 21) return 'ערב טוב';
  return 'לילה טוב';
}

/** השם הפרטי מתוך שם מלא ("יניב מלכא" → "יניב"). */
export function firstName(fullName: string | null | undefined): string {
  return (fullName ?? '').trim().split(/\s+/)[0] ?? '';
}

const WEEKDAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
const MONTHS = [
  'בינואר', 'בפברואר', 'במרץ', 'באפריל', 'במאי', 'ביוני',
  'ביולי', 'באוגוסט', 'בספטמבר', 'באוקטובר', 'בנובמבר', 'בדצמבר',
];

/** "יום שני, 2 בנובמבר" */
export function longDayLabel(d: Date): string {
  return `יום ${WEEKDAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

export function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

const minutesOfDay = (d: Date) => d.getHours() * 60 + d.getMinutes();

// ───────────────────────── לו״ז ─────────────────────────

/**
 * reported — דווח · pending — הסתיים ולא דווח (היום או בימים שעברו) ·
 * now — מתקיים עכשיו · later — בהמשך היום · upcoming — ביום עתידי ·
 * canceled — בוטל (חג / שבתון, או סומן ידנית "לא התקיים").
 */
export type SessionStatus = 'reported' | 'pending' | 'now' | 'later' | 'upcoming' | 'canceled';

export type AgendaItem = {
  course: Course;
  workplace: Workplace;
  date: string;
  status: SessionStatus;
  /** הדיווח שמכסה את המפגש (כשדווח) — לפתיחת תצוגת הדיווח */
  reportId?: string;
  /** "09:00–12:15" בבידוד LTR */
  time: string;
  /** כשהמפגש בוטל — הסיבה והאם אוטומטי (חג) */
  cancel?: Cancellation;
};

export type AgendaDayKey = 'dayBefore' | 'yesterday' | 'today' | 'tomorrow' | 'dayAfter';

export type AgendaDay = {
  key: AgendaDayKey;
  /** הסטה בימים מהיום (‎-2…2) */
  offset: number;
  label: string;
  date: string;
  dayLabel: string;
  items: AgendaItem[];
};

const AGENDA_DAYS: { key: AgendaDayKey; offset: number; label: string }[] = [
  { key: 'dayBefore', offset: -2, label: 'שלשום' },
  { key: 'yesterday', offset: -1, label: 'אתמול' },
  { key: 'today', offset: 0, label: 'היום' },
  { key: 'tomorrow', offset: 1, label: 'מחר' },
  { key: 'dayAfter', offset: 2, label: 'מחרתיים' },
];

/** מיקום "היום" ברשימת ימי הלו״ז. */
export const AGENDA_TODAY_INDEX = AGENDA_DAYS.findIndex((d) => d.key === 'today');

/**
 * הקורסים משלשום עד מחרתיים במקומות העבודה הפעילים, עם סטטוס לכל מפגש.
 * הימים לפי סדר כרונולוגי.
 */
export function agenda(
  courses: readonly Course[],
  workplaces: readonly Workplace[],
  reports: readonly WorkReport[],
  now: Date = new Date(),
  cancel: CancelIndex = currentCancel(),
): AgendaDay[] {
  // מקומות עבודה בארכיון לא מופיעים בלו״ז.
  const byId = new Map(activeWorkplaces(workplaces).map((w) => [w.id, w]));
  const nowMin = minutesOfDay(now);
  return AGENDA_DAYS.map(({ key, offset, label }) => {
    const d = addDays(now, offset);
    const date = isoDate(d);
    const items: AgendaItem[] = [];
    for (const course of coursesOn(courses, date, undefined, NO_CANCEL)) {
      const workplace = byId.get(course.workplaceId);
      if (!workplace) continue;
      let status: SessionStatus = 'upcoming';
      let reportId: string | undefined;
      const canceled = sessionCancel(course, date, cancel) ?? undefined;
      // מפגש שבוטל אך בכל זאת דווח — מוצג כמדווח.
      const covering = courseReport(course, date, reports)?.id;
      // מפגש שנמחק מהתכנון מוסתר מהלו״ז (מופיע רק בדף הקורס, ומשם מחזירים).
      if (canceled?.kind === 'removed' && !covering) continue;
      if (canceled && !covering) {
        status = 'canceled';
      } else if (offset <= 0) {
        reportId = courseReport(course, date, reports)?.id;
        const s = parseTime(course.start) ?? 0;
        const e = parseTime(course.end) ?? 0;
        if (reportId) status = 'reported';
        else if (offset < 0 || nowMin >= e) status = 'pending';
        else if (nowMin >= s) status = 'now';
        else status = 'later';
      }
      items.push({
        course,
        workplace,
        date,
        status,
        reportId,
        time: timeRange(course.start, course.end),
        cancel: status === 'canceled' ? canceled : undefined,
      });
    }
    return { key, offset, label, date, dayLabel: longDayLabel(d), items };
  });
}

/** המפגשים שטרם דווחו בתאריך (בלי מבוטלים), במקומות העבודה הפעילים, לפי שעה. */
export function unreportedOn(
  courses: readonly Course[],
  workplaces: readonly Workplace[],
  reports: readonly WorkReport[],
  date: string,
): Course[] {
  const ids = new Set(activeWorkplaces(workplaces).map((w) => w.id));
  return coursesOn(courses, date)
    .filter((c) => ids.has(c.workplaceId) && !courseReported(c, date, reports))
    .sort((a, b) => a.start.localeCompare(b.start));
}

/** כמה ימים אחורה לחפש דיווח חסר ל"היום הרלוונטי הבא". */
const NEXT_LOOKBACK_DAYS = 60;

export type NextRelevant = {
  date: string;
  /** today — יש היום מפגש שטרם דווח · missing — דיווח חסר מהעבר · none — אין, נפתח על היום */
  kind: 'today' | 'missing' | 'none';
  /** המפגש הראשון שטרם דווח באותו יום */
  course?: Course;
  /** כמה מפגשים טרם דווחו באותו יום */
  count: number;
};

/**
 * היום הרלוונטי הבא לדיווח: קודם היום אם יש בו מפגש שטרם דווח; אחרת הדיווח
 * החסר הקרוב אחורה; אם אין — היום.
 */
export function nextRelevantDay(
  courses: readonly Course[],
  workplaces: readonly Workplace[],
  reports: readonly WorkReport[],
  now: Date = new Date(),
  before?: string,
): NextRelevant {
  const today = isoDate(now);
  if (!before || before > today) {
    const list = unreportedOn(courses, workplaces, reports, today);
    if (list.length) return { date: today, kind: 'today', course: list[0], count: list.length };
  }
  for (let i = 1; i <= NEXT_LOOKBACK_DAYS; i++) {
    const date = isoDate(addDays(now, -i));
    if (before && date >= before) continue;
    const list = unreportedOn(courses, workplaces, reports, date);
    if (list.length) return { date, kind: 'missing', course: list[0], count: list.length };
  }
  return { date: today, kind: 'none', count: 0 };
}

/**
 * הקורס שכדאי למלא מראש בכפתור הדיווח: מפגש של היום שהסתיים או מתקיים
 * עכשיו ולא דווח (המוקדם מביניהם). null כשאין.
 */
export function suggestedSession(today: AgendaDay): AgendaItem | null {
  return today.items.find((i) => i.status === 'pending' || i.status === 'now') ?? null;
}

// ───────────────────────── התראות ─────────────────────────

export type AlertTone = 'info' | 'warn' | 'danger';

export type HomeAlert = {
  /** מפתח יציב — כולל תאריך כשההתראה תלויה ביום, כדי שסגירה תחול רק עליה */
  key: string;
  /** שם אייקון ב־MaterialCommunityIcons */
  icon: string;
  tone: AlertTone;
  title: string;
  body: string;
  action?: { label: string; href?: Href; tel?: string };
};

export type AlertInput = {
  workplaces: readonly Workplace[];
  courses: readonly Course[];
  reports: readonly WorkReport[];
  accumulated: AccumulatedState;
  payroll: StatusMap;
  basis: PayBasis;
  /** המלצות סידור שנדחו (lib/recommend.ts) */
  recommendDismissed?: readonly string[];
  now?: Date;
};

/** כמה ימים אחורה לחפש מפגשים שלא דווחו. */
const MISSING_LOOKBACK_DAYS = 7;

const shortDate = (iso: string) => {
  const [, m, d] = iso.split('-').map(Number);
  return `${d}.${m}`;
};

const names = (list: string[]) => {
  const u = [...new Set(list)];
  return u.slice(0, 3).join(' · ') + (u.length > 3 ? ` ועוד ${u.length - 3}` : '');
};

/** תזכורות מונית: לפי ההעדפה של כל מקום עבודה שמגיעים אליו במונית. */
function taxiAlerts(workplaces: readonly Workplace[], courses: readonly Course[], now: Date): HomeAlert[] {
  const out: HomeAlert[] = [];
  const nowMin = minutesOfDay(now);
  const today = isoDate(now);
  const tomorrow = isoDate(addDays(now, 1));
  for (const w of workplaces) {
    if (!isTaxi(w.arrivalMode) || !w.taxi) continue;
    const reminder = w.taxi.reminder;
    const tel = w.taxi.phone || undefined;
    const kind = w.arrivalMode === 'taxi_voucher' ? 'מונית פתק' : 'מונית';
    if (reminder.kind === 'hoursBefore') {
      const first = coursesOn(courses, today, w.id)[0];
      const start = first ? parseTime(first.start) : null;
      if (first && start != null && nowMin < start && nowMin >= start - reminder.hours * 60) {
        out.push({
          key: `taxi|${w.id}|${today}`,
          icon: 'taxi',
          tone: 'warn',
          title: `להזמין ${kind} ל${w.name}`,
          body: `${first.name} מתחיל ב־${first.start}.${w.address ? `\nיעד: ${w.address}` : ''}`,
          action: tel ? { label: 'חיוג להזמנה', tel } : undefined,
        });
      }
    } else if (reminder.kind === 'nightBefore') {
      const first = coursesOn(courses, tomorrow, w.id)[0];
      const at = parseTime(reminder.time);
      if (first && at != null && nowMin >= at) {
        out.push({
          key: `taxi|${w.id}|${tomorrow}`,
          icon: 'taxi',
          tone: 'warn',
          title: `להזמין ${kind} למחר — ${w.name}`,
          body: `${first.name} מחר ב־${first.start}.${w.address ? `\nיעד: ${w.address}` : ''}`,
          action: tel ? { label: 'חיוג להזמנה', tel } : undefined,
        });
      }
    }
  }
  return out;
}

/** מפגשים מהימים האחרונים (לא כולל היום) שלא דווחו. */
function missingAlerts(
  workplaces: readonly Workplace[],
  courses: readonly Course[],
  reports: readonly WorkReport[],
  now: Date,
): HomeAlert[] {
  const ids = new Set(workplaces.map((w) => w.id));
  const missing: { course: Course; date: string }[] = [];
  for (let i = MISSING_LOOKBACK_DAYS; i >= 1; i--) {
    const date = isoDate(addDays(now, -i));
    for (const course of coursesOn(courses, date)) {
      if (ids.has(course.workplaceId) && !courseReported(course, date, reports)) missing.push({ course, date });
    }
  }
  if (missing.length === 0) return [];
  const wpName = (id: string) => workplaces.find((w) => w.id === id)?.name ?? '';
  const first = missing[0];
  return [
    {
      key: `missing|${missing.map((m) => `${m.course.id}@${m.date}`).join(',')}`,
      icon: 'clipboard-alert-outline',
      tone: 'danger',
      title: missing.length === 1 ? 'דיווח חסר' : `${missing.length} דיווחים חסרים מהשבוע האחרון`,
      body:
        missing.length === 1
          ? `${first.course.name} · ${wpName(first.course.workplaceId)} · ${shortDate(first.date)}`
          : `הראשון: ${first.course.name} · ${shortDate(first.date)}`,
      action: {
        label: 'דיווח עכשיו',
        href: { pathname: '/report', params: { course: first.course.id, date: first.date } },
      },
    },
  ];
}

/** כל ההתראות למסך הבית, מהדחוף לפחות דחוף. */
export function homeAlerts(input: AlertInput): HomeAlert[] {
  const now = input.now ?? new Date();
  const { workplaces, courses, reports } = input;
  const out: HomeAlert[] = [];

  // תזכורות שוטפות (מונית, דיווח חסר, תיאום מס) — רק למקומות עבודה פעילים.
  // דוחות שכר ותשלומים — לכולם, גם למקום שהועבר לארכיון ועוד חייב תשלום.
  const active = activeWorkplaces(workplaces);
  out.push(...taxiAlerts(active, courses, now));
  out.push(...missingAlerts(active, courses, reports, now));

  // דוחות שכר ותיאום מס (אותה לוגיקה שהייתה בבאנר התזכורות).
  const items = payrollItems(workplaces, reports, input.payroll);
  const overdue = overduePayments(items, now);
  if (overdue.length) {
    out.push({
      key: `overdue|${overdue.map((o) => o.workplace.id).join(',')}`,
      icon: 'cash-clock',
      tone: 'danger',
      title: overdue.length === 1 ? 'תשלום אחד באיחור' : `${overdue.length} תשלומים באיחור`,
      body: `טרם סומנו כשולמו: ${names(overdue.map((o) => o.workplace.name))}`,
      action: { label: 'מעקב תשלומים', href: '/payments' },
    });
  }
  // היום האחרון לדיווח שכר מתקרב (עד 3 ימים) — דוח שלא יישלח עד סופו ישולם רק בחודש הבא.
  for (const w of workplaces) {
    const p = currentPayPeriod(w.payday, now);
    const left = daysUntil(p.end, now); // ימים עד סוף התקופה (0 = היום)
    if (left > 3) continue;
    if (isLocked(input.payroll[statusKey(w.id, p.start)])) continue;
    const any =
      reports.some((r) => r.workplaceId === w.id && r.date >= p.start && r.date <= p.end) ||
      courses.some((c) => c.workplaceId === w.id && c.from <= p.end && c.to >= p.start);
    if (!any) continue;
    out.push({
      key: `deadline|${w.id}|${p.end}`,
      icon: 'calendar-alert',
      tone: left <= 1 ? 'danger' : 'warn',
      title: `${left === 0 ? 'היום' : left === 1 ? 'מחר' : `בעוד ${left} ימים`} — יום אחרון לדיווח שכר · ${w.name}`,
      body: `יש לשלוח את דוח השכר עד ${shortDate(p.end)}. דוח שיישלח אחר כך ישולם רק בחודש הבא.`,
      action: { label: 'לדוח השכר', href: { pathname: '/payroll-report', params: { wp: w.id, start: p.start } } },
    });
  }

  const pending = pendingPayroll(items);
  if (pending.length) {
    out.push({
      key: `pending|${pending.map((p) => p.workplace.id).join(',')}`,
      icon: 'email-fast-outline',
      tone: 'warn',
      title: pending.length === 1 ? 'דוח שכר לא נשלח בזמן' : `${pending.length} דוחות שכר לא נשלחו בזמן`,
      body: `${names(pending.map((p) => p.workplace.name))} — עבר היום האחרון לדיווח; התשלום יידחה בחודש. כדאי לשלוח בהקדם.`,
      action: { label: 'לדוחות השכר', href: '/payroll' },
    });
  }

  // תשלום צפוי היום / מחר (לפי "שוטף +" של התקופה הקודמת).
  for (const p of currentPeriods(workplaces, reports, input.basis, now, 'previous')) {
    if (p.daysToExpected !== 0 && p.daysToExpected !== 1) continue;
    if (p.totals.reports === 0 && p.workplace.paymentType === 'hourly') continue;
    out.push({
      key: `payday|${p.workplace.id}|${p.expectedPayment}`,
      icon: 'calendar-check-outline',
      tone: 'info',
      title: `${p.daysToExpected === 0 ? 'היום' : 'מחר'} צפוי תשלום — ${p.workplace.name}`,
      body: `עבור ${shortDate(p.period.start)}–${shortDate(p.period.end)}.`,
      action: { label: 'מעקב תשלומים', href: '/payments' },
    });
  }

  // דקות מצטברות שאפשר לפדות לשעות אקדמיות.
  if (redeemableHours(accumulatedTotal(input.accumulated)) > 0) {
    const ready = workplaces.filter((w) => redeemableHours(entryOf(input.accumulated, w.id)) > 0);
    const minutes = ready.reduce((s, w) => s + entryOf(input.accumulated, w.id).minutes, 0);
    if (ready.length) {
      out.push({
        key: `acc|${minutes}`,
        icon: 'timer-sand',
        tone: 'info',
        title: `${minutes} דקות במונה המצטבר`,
        body: `אפשר לפדות שעות אקדמיות שלמות: ${names(ready.map((w) => w.name))}`,
        action: { label: 'לפדיון', href: '/settings' },
      });
    }
  }

  const year = String(now.getFullYear());
  const noTax = missingTaxCoordination(active, year);
  if (noTax.length) {
    out.push({
      key: `tax|${year}|${noTax.map((w) => w.id).join(',')}`,
      icon: 'file-percent-outline',
      tone: 'warn',
      title: `תיאום מס ${year}`,
      body: `${noTax.length === 1 ? 'מקום עבודה אחד לא נכלל' : `${noTax.length} מקומות עבודה לא נכללו`}: ${names(noTax.map((w) => w.name))}`,
      action: { label: 'לתיאום המס', href: '/tax' },
    });
  }


  // הצעות לסידור פריטים לא פעילים (ארכיון / מחיקה) — מובילות למסך "ארכיון ואשפה".
  const recs = recommendations(workplaces, courses, reports, input.payroll, input.recommendDismissed ?? [], now);
  if (recs.length) {
    out.push({
      key: `recommend|${recs.map((r) => r.key).join(',')}`,
      icon: 'archive-arrow-down-outline',
      tone: 'info',
      title: recs.length === 1 ? 'הצעה אחת לסידור פריטים לא פעילים' : `${recs.length} הצעות לסידור פריטים לא פעילים`,
      body: 'מקומות עבודה וקורסים שלא בשימוש — להעביר לארכיון או למחוק.',
      action: { label: 'לצפייה בהצעות', href: { pathname: '/archive', params: { tab: 'archive' } } },
    });
  }
  return out;
}
