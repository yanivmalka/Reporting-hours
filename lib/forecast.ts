/**
 * צפי תשלומים לפי חודש — "לפי דיווח" מול "לפי תכנון" (הקורסים הפעילים).
 *
 * לכל מקום עבודה, כל תקופת שכר (מיום התשלום ועד הבא, lib/dashboard.ts)
 * משויכת לחודש אחד:
 *   - mode 'work' — החודש שבו התקופה מתחילה (חודש העבודה);
 *   - mode 'pay'  — החודש שבו התשלום צפוי להתקבל ("שוטף +").
 *
 * הסכום של תקופה = שכר + החזר נסיעות (כמו בדוח השכר, grossAmount).
 *   - לפי דיווח: מהדיווחים בתקופה (totalsFor).
 *   - פוטנציאל (planned): ממפגשי הקורסים בתקופה, כולל מפגשים שסומנו "בוטל"
 *     (מה שציפית) — שעתי: תעריף × שעות לפי בסיס החישוב; חודשי: הסכום הקבוע
 *     כשיש לפחות מפגש אחד. ונסיעות לכל יום מפגש.
 *   - צפי (expected): הפוטנציאל בלי המפגשים שסומנו "בוטל".
 *   מפגשים שהוסרו מהפוטנציאל, הועברו לתאריך אחר או חלים בחג — לא בשניהם.
 * מס: לכל מקום אחוז מס (ניכוי במקור, `taxPercent`, לפי התנאים שחלו בסוף התקופה).
 * המס יורד מהשכר בלבד — לא מהחזר הנסיעות (`netOfTax`). קו אחיד בשני המצבים:
 * הסכומים הראשיים בחודש (דווח · פוטנציאל · צפי) הם נטו — מה שצפוי להיכנס —
 * והברוטו לצדם ב־`gross`.
 * המודול טהור — בלי אחסון ובלי React.
 */
import { canceledSessionPay } from './cancelReasons';
import { ACADEMIC_HOUR_MINUTES } from './academic';
import { potentialSessions, sessionMinutes, sessionTimes, type Course } from './courses';
import { currentPlan, type PlanIndex } from './sessions';
import { currentPayPeriod, expectedPaymentDate, isoDate, periodMonthKey, totalsFor, type PayPeriod } from './dashboard';
import { basisFor, type PayBasis } from './payBasis';
import { expectedPayment, reportLate, statusKey, type StatusMap } from './payroll';
import { openingFor, type OpeningInPeriod } from './openingBalance';
import type { WorkReport } from './reports';
import { travelCostForDay } from './travel';
import { LAST_DAY, paymentTermsOf, reportDeadlineDay, taxPercentOf, workplaceAt, type Workplace } from './workplaces';

export type ForecastMode = 'work' | 'pay';

/** מצב הדוח של תקופה: מתוכנן (עתיד) · בהכנה (נוכחי) · ממתין לשליחה · נשלח · שולם */
export type PeriodStatus = 'planned' | 'open' | 'closed' | 'sent' | 'paid';

export type PeriodForecast = {
  workplace: Workplace;
  period: PayPeriod;
  /** מועד התשלום הצפוי ("YYYY-MM-DD") */
  expected: string;
  /** דווח: שכר + נסיעות */
  reported: number;
  /** מתוכו — שכר בלבד (בלי נסיעות), לחישוב נטו אחרי מס */
  reportedPay: number;
  /** מספר הדיווחים בתקופה */
  reportCount: number;
  /**
   * נקודת פתיחה מדו"ח שכר קודם שהוזנה ידנית (lib/openingBalance.ts) — כבר כלולה
   * ב־`reported` כדיווח רגיל. חסר — אין בתקופה.
   */
  opening?: OpeningInPeriod;
  planned: number;
  /** צפי: הפוטנציאל בלי המפגשים שבוטלו */
  forecast: number;
  /** אחוז המס שחל בתקופה (לפי התנאים בסוף התקופה; 0 — בלי ניכוי) */
  taxPercent: number;
  /** נטו אחרי מס — דווח · פוטנציאל · צפי (המס על השכר בלבד, לא על הנסיעות) */
  reportedNet: number;
  plannedNet: number;
  forecastNet: number;
  /** המפגשים שבוטלו בתקופה (נשארים בפוטנציאל, יורדים מהצפי) */
  canceled: { courseId: string; date: string }[];
  status: PeriodStatus;
  /** הדוח לא נשלח עד היום האחרון לדיווח — התשלום נדחה בחודש */
  late: boolean;
  /** תאריך שבו סומן כשולם, אם סומן */
  paidAt?: string;
  /** מתי סומן כנשלח (מילישניות) */
  sentAt?: number;
};

/** סכומי ברוטו (לפני מס) — לצד הנטו */
export type GrossAmounts = { reported: number; planned: number; forecast: number };

/** סכומי החודש למקום: נטו אחרי מס, והברוטו ב־`gross`. */
export type ForecastCell = {
  reported: number;
  planned: number;
  forecast: number;
  gross: GrossAmounts;
  periods: PeriodForecast[];
};

export type ForecastMonth = {
  /** "YYYY-MM" */
  key: string;
  year: number;
  month0: number;
  byWorkplace: Record<string, ForecastCell>;
  /** נטו אחרי מס */
  reported: number;
  planned: number;
  forecast: number;
  gross: GrossAmounts;
};

const monthKey = (iso: string) => iso.slice(0, 7);

/** התקופה ("החודש") של מקום עבודה שמסתיימת ביום האחרון לדיווח שכר בחודש נתון. */
function periodInMonth(w: Workplace, year: number, month0: number): PayPeriod {
  const last = reportDeadlineDay(w);
  const dim = new Date(year, month0 + 1, 0).getDate();
  // בחודש קצר מיום התשלום, יום התשלום נדחס לסוף החודש — היום האחרון לדיווח הוא יום לפניו.
  const day = last >= LAST_DAY ? dim : Math.min(last, dim - 1);
  return currentPayPeriod(w.payday, new Date(year, month0, day));
}

/** סכום לתקופה ממפגשי הקורסים של המקום: פוטנציאל, או צפי (`withoutCanceled`) — שכר ונסיעות בנפרד. */
function amountParts(
  w: Workplace,
  courses: readonly Course[],
  period: Pick<PayPeriod, 'start' | 'end'>,
  basis: PayBasis,
  withoutCanceled: boolean,
  plan: PlanIndex,
): { pay: number; travel: number } {
  basis = basisFor(w, basis);
  const dates = new Set<string>();
  let pay = 0;
  for (const c of courses) {
    if (c.workplaceId !== w.id) continue;
    for (const s of potentialSessions(c, period.start, period.end, plan.cancel, plan.moves)) {
      // צפי: מפגש שבוטל יורד — חוץ מהחלק שהמוסד משלם עליו לפי סיבת הביטול.
      if (withoutCanceled && s.canceled) {
        pay += canceledSessionPay(w, c, s.date, s.cancel, basis);
        continue;
      }
      dates.add(s.date);
      const at = workplaceAt(w, s.date);
      if (at.paymentType === 'hourly') {
        const per = basis === 'academic' ? ACADEMIC_HOUR_MINUTES : 60;
        pay += (Math.max(0, at.rate) * sessionMinutes(sessionTimes(c, s.date))) / per;
      }
    }
  }
  if (dates.size === 0) return { pay: 0, travel: 0 };
  const last = [...dates].sort().pop() as string;
  const atEnd = workplaceAt(w, last);
  if (atEnd.paymentType === 'monthly') pay = Math.max(0, atEnd.rate);
  let travel = 0;
  for (const d of dates) travel += travelCostForDay(w, d);
  return { pay, travel };
}

function amountFor(...args: Parameters<typeof amountParts>): number {
  const a = amountParts(...args);
  return a.pay + a.travel;
}

/** נטו אחרי ניכוי מס: המס יורד מהשכר בלבד, החזר הנסיעות נשאר מלא. */
export function netOfTax(pay: number, travel: number, taxPercent: number): number {
  const t = Math.min(100, Math.max(0, taxPercent));
  return pay * (1 - t / 100) + travel;
}

/** פוטנציאל לתקופה — ממפגשי הקורסים של המקום, כולל מפגשים שבוטלו. */
export function plannedFor(
  w: Workplace,
  courses: readonly Course[],
  period: Pick<PayPeriod, 'start' | 'end'>,
  basis: PayBasis,
  plan: PlanIndex = currentPlan(),
): number {
  return amountFor(w, courses, period, basis, false, plan);
}

/** צפי לתקופה — הפוטנציאל בלי המפגשים שסומנו "בוטל". */
export function expectedFor(
  w: Workplace,
  courses: readonly Course[],
  period: Pick<PayPeriod, 'start' | 'end'>,
  basis: PayBasis,
  plan: PlanIndex = currentPlan(),
): number {
  return amountFor(w, courses, period, basis, true, plan);
}

/**
 * סכום לתקופה ממפגשי הקורסים — נטו אחרי מס וברוטו (פוטנציאל, או צפי עם `withoutCanceled`).
 * אחוז המס — לפי התנאים בסוף התקופה.
 */
export function courseAmounts(
  w: Workplace,
  courses: readonly Course[],
  period: Pick<PayPeriod, 'start' | 'end'>,
  basis: PayBasis,
  withoutCanceled: boolean,
  plan: PlanIndex = currentPlan(),
): { net: number; gross: number; taxPercent: number } {
  const a = amountParts(w, courses, period, basis, withoutCanceled, plan);
  const taxPercent = taxPercentOf(workplaceAt(w, period.end));
  return { net: netOfTax(a.pay, a.travel, taxPercent), gross: a.pay + a.travel, taxPercent };
}

/** המפגשים שבוטלו (ונשארו בפוטנציאל) של מקום עבודה בתקופה. */
export function canceledSessions(
  w: Workplace,
  courses: readonly Course[],
  period: Pick<PayPeriod, 'start' | 'end'>,
  plan: PlanIndex = currentPlan(),
): { courseId: string; date: string }[] {
  const out: { courseId: string; date: string }[] = [];
  for (const c of courses) {
    if (c.workplaceId !== w.id) continue;
    for (const s of potentialSessions(c, period.start, period.end, plan.cancel, plan.moves)) if (s.canceled) out.push({ courseId: c.id, date: s.date });
  }
  return out;
}

/** כל נתוני התקופה של מקום עבודה: דווח, מתוכנן, מועד תשלום וסטטוס. */
export function periodForecast(
  w: Workplace,
  period: PayPeriod,
  reports: readonly WorkReport[],
  courses: readonly Course[],
  statuses: StatusMap,
  basis: PayBasis,
  today: Date = new Date(),
  plan: PlanIndex = currentPlan(),
): PeriodForecast {
  basis = basisFor(w, basis);
  const todayIso = isoDate(today);
  const mine = reports.filter((r) => r.workplaceId === w.id && r.date >= period.start && r.date <= period.end);
  const t = totalsFor([w], mine, basis);
  // נקודת פתיחה שהוזנה ידנית — נספרת כדיווח רגיל: שכר ונסיעות. במקום חודשי — הסכום
  // הקבוע כשאין דיווח אחר בתקופה (כמו דיווח אחד לפחות).
  const op = openingFor(w, period, basis);
  if (op.count > 0) {
    if (mine.length === 0 && workplaceAt(w, op.entries[op.entries.length - 1].date).paymentType === 'monthly') {
      t.pay += Math.max(0, workplaceAt(w, op.entries[op.entries.length - 1].date).rate);
    } else {
      t.pay += op.pay;
    }
    t.travel += op.travel;
  }
  const st = statuses[statusKey(w.id, period.start)] ?? {};
  // דקות שנפדו מהמונה לתוך הדוח — בתעריף שחל בסוף התקופה (כמו בדוח השכר).
  const atEnd = workplaceAt(w, period.end);
  const redeemedPay =
    basis === 'academic' && atEnd.paymentType === 'hourly'
      ? (Math.max(0, atEnd.rate) * (st.redeemedMinutes ?? 0)) / ACADEMIC_HOUR_MINUTES
      : 0;
  const status: PeriodStatus = st.paidAt
    ? 'paid'
    : st.sentAt
      ? 'sent'
      : period.start > todayIso
        ? 'planned'
        : period.end >= todayIso
          ? 'open'
          : 'closed';
  const tax = taxPercentOf(atEnd);
  const planned = amountParts(w, courses, period, basis, false, plan);
  const expected = amountParts(w, courses, period, basis, true, plan);
  return {
    workplace: w,
    period,
    expected: expectedPayment(w, period, st, today),
    late: (mine.length > 0 || st.sentAt != null) && reportLate(period, st, today),
    reported: t.pay + redeemedPay + t.travel,
    reportedPay: t.pay + redeemedPay,
    reportCount: mine.length,
    opening: op.count > 0 ? op : undefined,
    planned: planned.pay + planned.travel,
    forecast: expected.pay + expected.travel,
    taxPercent: tax,
    reportedNet: netOfTax(t.pay + redeemedPay, t.travel, tax),
    plannedNet: netOfTax(planned.pay, planned.travel, tax),
    forecastNet: netOfTax(expected.pay, expected.travel, tax),
    canceled: canceledSessions(w, courses, period, plan),
    status,
    paidAt: st.paidAt,
    sentAt: st.sentAt,
  };
}

/** 12 חודשי שנה לועזית, עם הסכום לכל מקום עבודה. */
export function forecastYear(
  workplaces: readonly Workplace[],
  reports: readonly WorkReport[],
  courses: readonly Course[],
  statuses: StatusMap,
  basis: PayBasis,
  year: number,
  mode: ForecastMode,
  today: Date = new Date(),
  plan: PlanIndex = currentPlan(),
): ForecastMonth[] {
  const months: ForecastMonth[] = Array.from({ length: 12 }, (_, m) => ({
    key: `${year}-${String(m + 1).padStart(2, '0')}`,
    year,
    month0: m,
    byWorkplace: Object.fromEntries(
      workplaces.map((w) => [
        w.id,
        { reported: 0, planned: 0, forecast: 0, gross: { reported: 0, planned: 0, forecast: 0 }, periods: [] as PeriodForecast[] },
      ]),
    ),
    reported: 0,
    planned: 0,
    forecast: 0,
    gross: { reported: 0, planned: 0, forecast: 0 },
  }));
  const index = new Map(months.map((m, i) => [m.key, i]));
  // במצב "מועד תשלום" תקופות מהשנה הקודמת עשויות להשתלם השנה.
  const fromMonth = mode === 'pay' ? -6 : 0;
  for (const w of workplaces) {
    for (let m = fromMonth; m < 12; m++) {
      const period = periodInMonth(w, year, m);
      const f = periodForecast(w, period, reports, courses, statuses, basis, today, plan);
      const key = mode === 'work' ? periodMonthKey(period) : monthKey(f.expected);
      const i = index.get(key);
      if (i == null) continue;
      // קו אחיד: הסכום הראשי נטו (מה שצפוי להיכנס), והברוטו לצדו.
      const cell = months[i].byWorkplace[w.id];
      for (const t of [cell, months[i]]) {
        t.reported += f.reportedNet;
        t.planned += f.plannedNet;
        t.forecast += f.forecastNet;
        t.gross.reported += f.reported;
        t.gross.planned += f.planned;
        t.gross.forecast += f.forecast;
      }
      cell.periods.push(f);
    }
  }
  return months;
}

/** תקופות אחרונות של מקום עבודה (הנוכחית + `count` קודמות), מהחדשה לישנה. */
export function recentForecasts(
  w: Workplace,
  count: number,
  reports: readonly WorkReport[],
  courses: readonly Course[],
  statuses: StatusMap,
  basis: PayBasis,
  today: Date = new Date(),
  plan: PlanIndex = currentPlan(),
): PeriodForecast[] {
  const out: PeriodForecast[] = [];
  let p = currentPayPeriod(w.payday, today);
  for (let i = 0; i <= count; i++) {
    out.push(periodForecast(w, p, reports, courses, statuses, basis, today, plan));
    const [y, m, d] = p.start.split('-').map(Number);
    p = currentPayPeriod(w.payday, new Date(y, m - 1, d - 1));
  }
  return out;
}

export const STATUS_LABEL: Record<PeriodStatus, string> = {
  planned: 'מתוכנן',
  open: 'בהכנה',
  closed: 'לא נשלח בזמן',
  sent: 'נשלח · ממתין לתשלום',
  paid: 'שולם',
};

/**
 * סדר קבוע לרשימת המקומות בלוח הבקרה — לפי מועד התשלום הצפוי הקרוב (המוקדם
 * מבין התקופות בתצוגה שיש בהן סכום), ובשוויון / בלי תשלום — לפי א״ב. לא תלוי
 * בסכומים, כדי שהחלפת נטו / ברוטו לא תזיז שורות.
 */
export function paymentOrder<R extends { workplace: Pick<Workplace, 'name'>; periods: readonly PeriodForecast[] }>(
  rows: readonly R[],
): R[] {
  const firstPay = (r: R) =>
    r.periods
      .filter((p) => p.reported > 0 || p.planned > 0)
      .reduce<string | null>((m, p) => (m == null || p.expected < m ? p.expected : m), null);
  return [...rows].sort((a, b) => {
    const x = firstPay(a);
    const y = firstPay(b);
    if (x !== y) return x == null ? 1 : y == null ? -1 : x.localeCompare(y);
    return a.workplace.name.localeCompare(b.workplace.name, 'he');
  });
}

// ───────────────────────── רזולוציות תצוגה ─────────────────────────

/** רזולוציית הגרף: חודש (עמודה לכל מקום עבודה) · סמסטר · שנה (לפי חודשים) */
export type ChartResolution = 'month' | 'semester' | 'year';

export type MonthRef = { year: number; month0: number };

const addMonths = (r: MonthRef, n: number): MonthRef => {
  const d = new Date(r.year, r.month0 + n, 1);
  return { year: d.getFullYear(), month0: d.getMonth() };
};

/**
 * הסמסטר שחודש שייך אליו (שנה אקדמית ישראלית):
 * א׳ — אוקטובר–פברואר · ב׳ — מרץ–יולי · קיץ — אוגוסט–ספטמבר.
 */
export function semesterOf(r: MonthRef): { start: MonthRef; count: number; name: string } {
  const m = r.month0;
  if (m >= 9) return { start: { year: r.year, month0: 9 }, count: 5, name: 'סמסטר א׳' };
  if (m <= 1) return { start: { year: r.year - 1, month0: 9 }, count: 5, name: 'סמסטר א׳' };
  if (m <= 6) return { start: { year: r.year, month0: 2 }, count: 5, name: 'סמסטר ב׳' };
  return { start: { year: r.year, month0: 7 }, count: 2, name: 'סמסטר קיץ' };
}

/** החודשים שבתצוגה, לפי הרזולוציה וחודש העוגן. */
export function monthsInView(res: ChartResolution, anchor: MonthRef): MonthRef[] {
  if (res === 'month') return [anchor];
  if (res === 'year') return Array.from({ length: 12 }, (_, m) => ({ year: anchor.year, month0: m }));
  const s = semesterOf(anchor);
  return Array.from({ length: s.count }, (_, i) => addMonths(s.start, i));
}

/** מעבר לתצוגה הקודמת / הבאה באותה רזולוציה. */
export function shiftAnchor(res: ChartResolution, anchor: MonthRef, dir: 1 | -1): MonthRef {
  if (res === 'month') return addMonths(anchor, dir);
  if (res === 'year') return { year: anchor.year + dir, month0: anchor.month0 };
  const s = semesterOf(anchor);
  return dir > 0 ? addMonths(s.start, s.count) : addMonths(s.start, -1);
}

/** נתוני צפי לרשימת חודשים (גם כשהיא חוצה שנה לועזית). */
export function forecastMonths(
  refs: readonly MonthRef[],
  workplaces: readonly Workplace[],
  reports: readonly WorkReport[],
  courses: readonly Course[],
  statuses: StatusMap,
  basis: PayBasis,
  mode: ForecastMode,
  today: Date = new Date(),
  plan: PlanIndex = currentPlan(),
): ForecastMonth[] {
  const years = new Map<number, ForecastMonth[]>();
  return refs.map((r) => {
    let y = years.get(r.year);
    if (!y) {
      y = forecastYear(workplaces, reports, courses, statuses, basis, r.year, mode, today, plan);
      years.set(r.year, y);
    }
    return y[r.month0];
  });
}

// ───────────────────────── מועדי תשלום (ציר זמן) ─────────────────────────

/** מצב תשלום בציר: צפוי · שולם בזמן · שולם באיחור · עבר המועד ולא סומן */
export type PaymentState = 'upcoming' | 'paidOnTime' | 'paidLate' | 'overdue';

export type ScheduledPayment = {
  workplace: Workplace;
  period: PayPeriod;
  /** מועד התשלום הצפוי ("YYYY-MM-DD") */
  expected: string;
  /** תאריך הקבלה בפועל, אם סומן */
  paidAt?: string;
  /**
   * הסכום נטו אחרי מס: שהתקבל בפועל (שולם), שדווח (תקופה שהסתיימה) או הצפי
   * (תקופה נוכחית / עתידית) — בניכוי אחוז המס של המקום.
   */
  amount: number;
  /** אותו סכום ברוטו (לפני מס); בתשלום שהתקבל — הברוטו שדווח */
  gross: number;
  /** אחוז המס שנוכה בחישוב (0 — בלי ניכוי) */
  taxPercent: number;
  /** הסכום הוא צפי ולא דיווח בפועל */
  estimate: boolean;
  state: PaymentState;
  /** ימים בין המועד הצפוי לקבלה (חיובי — איחור), או ימי האיחור עד היום כשלא סומן */
  daysLate: number;
};

const DAY = 86_400_000;
const daysBetween = (a: string, b: string) =>
  Math.round((new Date(`${b}T12:00:00`).getTime() - new Date(`${a}T12:00:00`).getTime()) / DAY);

/**
 * התשלומים שמועדם הצפוי בטווח [from, to], מכל מקומות העבודה, לפי סדר התאריך.
 * תקופה בלי דיווח ובלי צפי — לא מוצגת.
 */
export function paymentSchedule(
  workplaces: readonly Workplace[],
  reports: readonly WorkReport[],
  courses: readonly Course[],
  statuses: StatusMap,
  basis: PayBasis,
  from: string,
  to: string,
  today: Date = new Date(),
  plan: PlanIndex = currentPlan(),
): ScheduledPayment[] {
  const todayIso = isoDate(today);
  const [fy, fm] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  const out: ScheduledPayment[] = [];
  for (const w of workplaces) {
    // תקופה מסתיימת לפחות חודש לפני התשלום, ושוטף + עד כמה חודשים.
    const months = (ty - fy) * 12 + (tm - fm);
    const back = Math.ceil(paymentTermsOf(w) / 28) + 2;
    for (let i = -back; i <= months; i++) {
      const d = new Date(fy, fm - 1 + i, 1);
      const period = periodInMonth(w, d.getFullYear(), d.getMonth());
      const f = periodForecast(w, period, reports, courses, statuses, basis, today, plan);
      if (f.expected < from || f.expected > to) continue;
      if (out.some((p) => p.workplace.id === w.id && p.period.start === period.start)) continue;
      const st = statuses[statusKey(w.id, period.start)] ?? {};
      const ended = f.status !== 'planned' && f.status !== 'open';
      const estimate = !st.paidAt && !ended;
      const useForecast = estimate && f.forecast > f.reported;
      const gross = useForecast ? f.forecast : f.reported;
      const net = useForecast ? f.forecastNet : f.reportedNet;
      // תשלום שהתקבל — הסכום שסומן (שהתקבל בפועל, כבר נטו); אחרת — הנטו המחושב.
      const amount = st.paidAt ? st.paidAmount ?? net : net;
      if (!st.paidAt && gross <= 0) continue;
      const late = st.paidAt ? daysBetween(f.expected, st.paidAt) : daysBetween(f.expected, todayIso);
      const state: PaymentState = st.paidAt
        ? late > 0
          ? 'paidLate'
          : 'paidOnTime'
        : f.expected < todayIso
          ? 'overdue'
          : 'upcoming';
      out.push({ workplace: w, period, expected: f.expected, paidAt: st.paidAt, amount, gross, taxPercent: f.taxPercent, estimate, state, daysLate: Math.max(0, late) });
    }
  }
  return out.sort((a, b) => a.expected.localeCompare(b.expected) || a.workplace.name.localeCompare(b.workplace.name));
}
