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
 *   - לפי תכנון: ממפגשי הקורסים בתקופה — שעתי: תעריף × שעות לפי בסיס
 *     החישוב; חודשי: הסכום הקבוע כשיש לפחות מפגש אחד. ונסיעות לכל יום מפגש.
 * המודול טהור — בלי אחסון ובלי React.
 */
import { ACADEMIC_HOUR_MINUTES } from './academic';
import { occurrences, sessionMinutes, type Course } from './courses';
import { currentPayPeriod, expectedPaymentDate, isoDate, totalsFor, type PayPeriod } from './dashboard';
import type { PayBasis } from './payBasis';
import { statusKey, type StatusMap } from './payroll';
import type { WorkReport } from './reports';
import { travelCostForDay } from './travel';
import { paymentTermsOf, workplaceAt, type Workplace } from './workplaces';

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
  status: PeriodStatus;
  /** תאריך שבו סומן כשולם, אם סומן */
  paidAt?: string;
  /** מתי סומן כנשלח (מילישניות) */
  sentAt?: number;
};

export type ForecastCell = { reported: number; planned: number; periods: PeriodForecast[] };

export type ForecastMonth = {
  /** "YYYY-MM" */
  key: string;
  year: number;
  month0: number;
  byWorkplace: Record<string, ForecastCell>;
  reported: number;
  planned: number;
};

const monthKey = (iso: string) => iso.slice(0, 7);

/** התקופה של מקום עבודה שמתחילה בחודש נתון. */
function periodInMonth(w: Workplace, year: number, month0: number): PayPeriod {
  const day = Math.min(Math.max(1, Math.round(w.payday) || 1), new Date(year, month0 + 1, 0).getDate());
  return currentPayPeriod(w.payday, new Date(year, month0, day));
}

/** סכום מתוכנן לתקופה — ממפגשי הקורסים של המקום. */
export function plannedFor(
  w: Workplace,
  courses: readonly Course[],
  period: Pick<PayPeriod, 'start' | 'end'>,
  basis: PayBasis,
): number {
  const dates = new Set<string>();
  let pay = 0;
  for (const c of courses) {
    if (c.workplaceId !== w.id) continue;
    for (const date of occurrences(c, period.start, period.end)) {
      dates.add(date);
      const at = workplaceAt(w, date);
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
  const todayIso = isoDate(today);
  const mine = reports.filter((r) => r.workplaceId === w.id && r.date >= period.start && r.date <= period.end);
  const t = totalsFor([w], mine, basis);
  const st = statuses[statusKey(w.id, period.start)] ?? {};
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
    expected: expectedPaymentDate(period.end, paymentTermsOf(w)),
    reported: t.pay + t.travel,
    reportedPay: t.pay,
    reportCount: mine.length,
    planned: plannedFor(w, courses, period, basis),
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
      workplaces.map((w) => [w.id, { reported: 0, planned: 0, periods: [] as PeriodForecast[] }]),
    ),
    reported: 0,
    planned: 0,
  }));
  const index = new Map(months.map((m, i) => [m.key, i]));
  // במצב "מועד תשלום" תקופות מהשנה הקודמת עשויות להשתלם השנה.
  const fromMonth = mode === 'pay' ? -6 : 0;
  for (const w of workplaces) {
    for (let m = fromMonth; m < 12; m++) {
      const period = periodInMonth(w, year, m);
      const f = periodForecast(w, period, reports, courses, statuses, basis, today);
      const key = mode === 'work' ? monthKey(period.start) : monthKey(f.expected);
      const i = index.get(key);
      if (i == null) continue;
      const cell = months[i].byWorkplace[w.id];
      cell.reported += f.reported;
      cell.planned += f.planned;
      cell.periods.push(f);
      months[i].reported += f.reported;
      months[i].planned += f.planned;
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
  closed: 'ממתין לשליחה',
  sent: 'נשלח · ממתין לתשלום',
  paid: 'שולם',
};
