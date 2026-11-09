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
 * המודול טהור — בלי אחסון ובלי React.
 */
import { canceledSessionPay } from './cancelReasons';
import { ACADEMIC_HOUR_MINUTES } from './academic';
import { potentialSessions, sessionMinutes, type Course } from './courses';
import { currentPayPeriod, expectedPaymentDate, isoDate, periodMonthKey, totalsFor, type PayPeriod } from './dashboard';
import { basisFor, type PayBasis } from './payBasis';
import { expectedPayment, reportLate, statusKey, type StatusMap } from './payroll';
import type { WorkReport } from './reports';
import { travelCostForDay } from './travel';
import { LAST_DAY, paymentTermsOf, reportDeadlineDay, workplaceAt, type Workplace } from './workplaces';

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
  planned: number;
  /** צפי: הפוטנציאל בלי המפגשים שבוטלו */
  forecast: number;
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

export type ForecastCell = { reported: number; planned: number; forecast: number; periods: PeriodForecast[] };

export type ForecastMonth = {
  /** "YYYY-MM" */
  key: string;
  year: number;
  month0: number;
  byWorkplace: Record<string, ForecastCell>;
  reported: number;
  planned: number;
  forecast: number;
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

/** סכום לתקופה ממפגשי הקורסים של המקום: פוטנציאל, או צפי (`withoutCanceled`). */
function amountFor(
  w: Workplace,
  courses: readonly Course[],
  period: Pick<PayPeriod, 'start' | 'end'>,
  basis: PayBasis,
  withoutCanceled: boolean,
): number {
  basis = basisFor(w, basis);
  const dates = new Set<string>();
  let pay = 0;
  for (const c of courses) {
    if (c.workplaceId !== w.id) continue;
    for (const s of potentialSessions(c, period.start, period.end)) {
      // צפי: מפגש שבוטל יורד — חוץ מהחלק שהמוסד משלם עליו לפי סיבת הביטול.
      if (withoutCanceled && s.canceled) {
        pay += canceledSessionPay(w, c, s.date, s.cancel, basis);
        continue;
      }
      dates.add(s.date);
      const at = workplaceAt(w, s.date);
      if (at.paymentType === 'hourly') {
        const per = basis === 'academic' ? ACADEMIC_HOUR_MINUTES : 60;
        pay += (Math.max(0, at.rate) * sessionMinutes(c)) / per;
      }
    }
  }
  if (dates.size === 0) return 0;
  const last = [...dates].sort().pop() as string;
  const atEnd = workplaceAt(w, last);
  if (atEnd.paymentType === 'monthly') pay = Math.max(0, atEnd.rate);
  let travel = 0;
  for (const d of dates) travel += travelCostForDay(w, d);
  return pay + travel;
}

/** פוטנציאל לתקופה — ממפגשי הקורסים של המקום, כולל מפגשים שבוטלו. */
export function plannedFor(
  w: Workplace,
  courses: readonly Course[],
  period: Pick<PayPeriod, 'start' | 'end'>,
  basis: PayBasis,
): number {
  return amountFor(w, courses, period, basis, false);
}

/** צפי לתקופה — הפוטנציאל בלי המפגשים שסומנו "בוטל". */
export function expectedFor(
  w: Workplace,
  courses: readonly Course[],
  period: Pick<PayPeriod, 'start' | 'end'>,
  basis: PayBasis,
): number {
  return amountFor(w, courses, period, basis, true);
}

/** המפגשים שבוטלו (ונשארו בפוטנציאל) של מקום עבודה בתקופה. */
export function canceledSessions(
  w: Workplace,
  courses: readonly Course[],
  period: Pick<PayPeriod, 'start' | 'end'>,
): { courseId: string; date: string }[] {
  const out: { courseId: string; date: string }[] = [];
  for (const c of courses) {
    if (c.workplaceId !== w.id) continue;
    for (const s of potentialSessions(c, period.start, period.end)) if (s.canceled) out.push({ courseId: c.id, date: s.date });
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
): PeriodForecast {
  basis = basisFor(w, basis);
  const todayIso = isoDate(today);
  const mine = reports.filter((r) => r.workplaceId === w.id && r.date >= period.start && r.date <= period.end);
  const t = totalsFor([w], mine, basis);
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
  return {
    workplace: w,
    period,
    expected: expectedPayment(w, period, st, today),
    late: (mine.length > 0 || st.sentAt != null) && reportLate(period, st, today),
    reported: t.pay + redeemedPay + t.travel,
    reportedPay: t.pay + redeemedPay,
    reportCount: mine.length,
    planned: plannedFor(w, courses, period, basis),
    forecast: expectedFor(w, courses, period, basis),
    canceled: canceledSessions(w, courses, period),
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
): ForecastMonth[] {
  const months: ForecastMonth[] = Array.from({ length: 12 }, (_, m) => ({
    key: `${year}-${String(m + 1).padStart(2, '0')}`,
    year,
    month0: m,
    byWorkplace: Object.fromEntries(
      workplaces.map((w) => [w.id, { reported: 0, planned: 0, forecast: 0, periods: [] as PeriodForecast[] }]),
    ),
    reported: 0,
    planned: 0,
    forecast: 0,
  }));
  const index = new Map(months.map((m, i) => [m.key, i]));
  // במצב "מועד תשלום" תקופות מהשנה הקודמת עשויות להשתלם השנה.
  const fromMonth = mode === 'pay' ? -6 : 0;
  for (const w of workplaces) {
    for (let m = fromMonth; m < 12; m++) {
      const period = periodInMonth(w, year, m);
      const f = periodForecast(w, period, reports, courses, statuses, basis, today);
      const key = mode === 'work' ? periodMonthKey(period) : monthKey(f.expected);
      const i = index.get(key);
      if (i == null) continue;
      const cell = months[i].byWorkplace[w.id];
      cell.reported += f.reported;
      cell.planned += f.planned;
      cell.forecast += f.forecast;
      cell.periods.push(f);
      months[i].reported += f.reported;
      months[i].planned += f.planned;
      months[i].forecast += f.forecast;
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
): PeriodForecast[] {
  const out: PeriodForecast[] = [];
  let p = currentPayPeriod(w.payday, today);
  for (let i = 0; i <= count; i++) {
    out.push(periodForecast(w, p, reports, courses, statuses, basis, today));
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
): ForecastMonth[] {
  const years = new Map<number, ForecastMonth[]>();
  return refs.map((r) => {
    let y = years.get(r.year);
    if (!y) {
      y = forecastYear(workplaces, reports, courses, statuses, basis, r.year, mode, today);
      years.set(r.year, y);
    }
    return y[r.month0];
  });
}
