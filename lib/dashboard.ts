/**
 * חישובי הדשבורד (שלב 6 ב־WISHLIST).
 *
 * "החודש" של כל מקום עבודה נקבע לפי יום התשלום שלו: התקופה הנוכחית מתחילה
 * ביום התשלום האחרון שחל (כולל היום) ומסתיימת יום לפני יום התשלום הבא.
 * לצד זה — מגמה לפי חודשים קלנדריים, פילוח לפי ימי השבוע ולפי מקום עבודה,
 * וסטטיסטיקת "עיגול השעות" (דקות עודפות שהועברו למונה / נכללו בדיווח).
 *
 * המודול טהור — בלי אחסון ובלי React.
 */
import { ACADEMIC_HOUR_MINUTES } from './academic';
import { hebrewDate, hebrewRange } from './hebrewDate';
import { plannedMinutes, type Course } from './courses';
import { workplacePay } from './pay';
import type { PayBasis } from './payBasis';
import { netMinutes, totalBreakMinutes, type WorkReport } from './reports';
import { travelCostForWorkplace } from './travel';
import { paymentTermsOf, type Workplace } from './workplaces';

const DAY_MS = 24 * 60 * 60 * 1000;

export type Totals = {
  /** שכר מחושב ב־₪ */
  pay: number;
  /** עלות נסיעות ב־₪ */
  travel: number;
  /** דקות עבודה נטו */
  netMinutes: number;
  /** דקות הפסקה */
  breakMinutes: number;
  /** ימי עבודה ייחודיים (תאריכים) */
  days: number;
  /** מספר דיווחים */
  reports: number;
};

// ───────────────────────── תאריכים ─────────────────────────

/** "YYYY-MM-DD" של תאריך מקומי. */
export function isoDate(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

/** יום התשלום בחודש נתון, מוגבל לאורך החודש (31 בפברואר → 28/29). */
function paydayIn(year: number, month: number, payday: number): Date {
  const day = Math.min(Math.max(1, Math.round(payday) || 1), daysInMonth(year, month));
  return new Date(year, month, day);
}

export type PayPeriod = {
  /** תחילת התקופה (כולל), "YYYY-MM-DD" */
  start: string;
  /** סוף התקופה (כולל) — יום לפני יום התשלום הבא */
  end: string;
  /** יום התשלום הבא */
  nextPayday: string;
  /** ימים עד יום התשלום הבא (0 = היום) */
  daysToPayday: number;
  /** כמה מהתקופה חלף (0–1) */
  elapsed: number;
};

/** התקופה ("החודש") הנוכחית של מקום עבודה לפי יום התשלום שלו. */
export function currentPayPeriod(payday: number, today: Date = new Date()): PayPeriod {
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const thisMonth = paydayIn(t.getFullYear(), t.getMonth(), payday);
  // Date מנרמל חודשים מחוץ לטווח (‎-1 → דצמבר הקודם, 12 → ינואר הבא).
  const start = t >= thisMonth ? thisMonth : paydayIn(t.getFullYear(), t.getMonth() - 1, payday);
  const next = paydayIn(start.getFullYear(), start.getMonth() + 1, payday);
  const end = new Date(next.getFullYear(), next.getMonth(), next.getDate() - 1);
  const total = Math.round((next.getTime() - start.getTime()) / DAY_MS);
  const passed = Math.round((t.getTime() - start.getTime()) / DAY_MS) + 1;
  return {
    start: isoDate(start),
    end: isoDate(end),
    nextPayday: isoDate(next),
    daysToPayday: Math.round((next.getTime() - t.getTime()) / DAY_MS),
    elapsed: Math.min(1, Math.max(0, passed / total)),
  };
}

/** ימים מהיום עד תאריך (0 = היום, שלילי = עבר). */
export function daysUntil(iso: string, today: Date = new Date()): number {
  const [y, m, d] = iso.split('-').map(Number);
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((new Date(y, m - 1, d).getTime() - t.getTime()) / DAY_MS);
}

/**
 * ניסוח יחסי ליום האחרון לדיווח שכר (סוף התקופה), תמיד ביחס להיום:
 * "היום" · "מחר" · "עוד N ימים" · אחרי שעבר — "עבר לפני N ימים" (`late`).
 */
export function deadlineRelative(end: string, today: Date = new Date()): { text: string; late: boolean; days: number } {
  const days = daysUntil(end, today);
  if (days < 0) return { text: days === -1 ? 'עבר אתמול' : `עבר לפני ${-days} ימים`, late: true, days };
  return { text: days === 0 ? 'היום' : days === 1 ? 'מחר' : `עוד ${days} ימים`, late: false, days };
}

const inRange = (r: WorkReport, start: string, end: string) => r.date >= start && r.date <= end;

// ───────────────────────── סכומים ─────────────────────────

/** סכומים לרשימת דיווחים, לפי מקומות העבודה ובסיס החישוב. */
export function totalsFor(
  workplaces: readonly Workplace[],
  reports: readonly WorkReport[],
  basis: PayBasis,
): Totals {
  let net = 0;
  let breaks = 0;
  for (const r of reports) {
    net += netMinutes(r) ?? 0;
    breaks += totalBreakMinutes(r.breaks);
  }
  let pay = 0;
  let travel = 0;
  for (const w of workplaces) {
    pay += workplacePay(w, reports, basis);
    travel += travelCostForWorkplace(w, reports);
  }
  return {
    pay,
    travel,
    netMinutes: net,
    breakMinutes: breaks,
    days: new Set(reports.map((r) => r.date)).size,
    reports: reports.length,
  };
}

export type WorkplacePeriod = {
  workplace: Workplace;
  period: PayPeriod;
  totals: Totals;
  /** מועד התשלום הצפוי לפי "שוטף +": סוף החודש שבו התקופה מסתיימת + N ימים */
  expectedPayment: string;
  /** ימים עד התשלום הצפוי (שלילי = כבר עבר) */
  daysToExpected: number;
};

/** "שוטף + N": סוף החודש של התאריך + N ימים. */
export function expectedPaymentDate(periodEnd: string, termsDays: number): string {
  const [y, m] = periodEnd.split('-').map(Number);
  // היום ה־0 של החודש הבא = היום האחרון בחודש; + N ימים.
  return isoDate(new Date(y, m, termsDays));
}

/** התקופה שקדמה לתקופה הנוכחית (זו ששולמה ביום התשלום האחרון). */
export function previousPayPeriod(payday: number, today: Date = new Date()): PayPeriod {
  const current = currentPayPeriod(payday, today);
  const [y, m, d] = current.start.split('-').map(Number);
  const prev = currentPayPeriod(payday, new Date(y, m - 1, d - 1));
  return { ...prev, daysToPayday: 0, elapsed: 1 };
}

/** לכל מקום עבודה — התקופה (הנוכחית או הקודמת) שלו והסכומים בה. */
export function currentPeriods(
  workplaces: readonly Workplace[],
  reports: readonly WorkReport[],
  basis: PayBasis,
  today: Date = new Date(),
  which: 'current' | 'previous' = 'current',
): WorkplacePeriod[] {
  return workplaces.map((workplace) => {
    const period =
      which === 'current'
        ? currentPayPeriod(workplace.payday, today)
        : previousPayPeriod(workplace.payday, today);
    const mine = reports.filter(
      (r) => r.workplaceId === workplace.id && inRange(r, period.start, period.end),
    );
    const expectedPayment = expectedPaymentDate(period.end, paymentTermsOf(workplace));
    const [ey, em, ed] = expectedPayment.split('-').map(Number);
    const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    return {
      workplace,
      period,
      totals: totalsFor([workplace], mine, basis),
      expectedPayment,
      daysToExpected: Math.round((new Date(ey, em - 1, ed).getTime() - t.getTime()) / DAY_MS),
    };
  });
}

/** סכום של כמה Totals. */
export function sumTotals(list: readonly Totals[]): Totals {
  return list.reduce<Totals>(
    (acc, t) => ({
      pay: acc.pay + t.pay,
      travel: acc.travel + t.travel,
      netMinutes: acc.netMinutes + t.netMinutes,
      breakMinutes: acc.breakMinutes + t.breakMinutes,
      days: acc.days + t.days,
      reports: acc.reports + t.reports,
    }),
    { pay: 0, travel: 0, netMinutes: 0, breakMinutes: 0, days: 0, reports: 0 },
  );
}

// ───────────────────────── מגמה חודשית ─────────────────────────

export type MonthPoint = {
  /** "YYYY-MM" */
  key: string;
  /** תווית קצרה, למשל "אוק׳" */
  label: string;
  totals: Totals;
};

const MONTH_SHORT_HE = ['ינו׳', 'פבר׳', 'מרץ', 'אפר׳', 'מאי', 'יוני', 'יולי', 'אוג׳', 'ספט׳', 'אוק׳', 'נוב׳', 'דצמ׳'];
const MONTH_LONG_HE = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];

export function monthName(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return `${MONTH_LONG_HE[m - 1]} ${y}`;
}

/** סכומים לפי חודשים קלנדריים — `count` החודשים האחרונים, כולל הנוכחי. */
export function monthlyTrend(
  workplaces: readonly Workplace[],
  reports: readonly WorkReport[],
  basis: PayBasis,
  count = 6,
  today: Date = new Date(),
): MonthPoint[] {
  const points: MonthPoint[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const mine = reports.filter((r) => r.date.startsWith(key));
    points.push({
      key,
      label: MONTH_SHORT_HE[d.getMonth()],
      totals: totalsFor(workplaces, mine, basis),
    });
  }
  return points;
}

// ───────────────────────── פילוחים ─────────────────────────

export const WEEKDAY_SHORT_HE = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];

export type WeekdayPoint = {
  weekday: number;
  label: string;
  /** ממוצע שעות אקדמיות ביום עבודה */
  avgAcademicHours: number;
  /** כמה ימים כאלה דווחו */
  days: number;
};

/** ממוצע שעות אקדמיות לפי יום בשבוע (רק ימים שבהם דווחה עבודה). */
export function weekdayProfile(reports: readonly WorkReport[]): WeekdayPoint[] {
  const minutesByDate = new Map<string, number>();
  for (const r of reports) {
    minutesByDate.set(r.date, (minutesByDate.get(r.date) ?? 0) + (netMinutes(r) ?? 0));
  }
  const sum = new Array(7).fill(0);
  const days = new Array(7).fill(0);
  for (const [date, minutes] of minutesByDate) {
    const [y, m, d] = date.split('-').map(Number);
    const wd = new Date(y, m - 1, d).getDay();
    sum[wd] += minutes;
    days[wd] += 1;
  }
  return WEEKDAY_SHORT_HE.map((label, weekday) => ({
    weekday,
    label,
    days: days[weekday],
    avgAcademicHours: days[weekday] ? sum[weekday] / days[weekday] / ACADEMIC_HOUR_MINUTES : 0,
  }));
}

export type WorkplaceShare = {
  workplace: Workplace;
  totals: Totals;
  /** חלק מסך השכר (0–1) */
  share: number;
};

/** חלוקת השכר והשעות בין מקומות העבודה, מהגדול לקטן. */
export function workplaceShares(
  workplaces: readonly Workplace[],
  reports: readonly WorkReport[],
  basis: PayBasis,
): WorkplaceShare[] {
  const rows = workplaces.map((workplace) => ({
    workplace,
    totals: totalsFor(
      [workplace],
      reports.filter((r) => r.workplaceId === workplace.id),
      basis,
    ),
  }));
  const total = rows.reduce((s, r) => s + r.totals.pay, 0) || 1;
  return rows
    .map((r) => ({ ...r, share: r.totals.pay / total }))
    .filter((r) => r.totals.reports > 0)
    .sort((a, b) => b.totals.pay - a.totals.pay);
}

export type RoundingStats = {
  /** דיווחים שיש בהם דקות עודפות (שאינן משלימות שעה אקדמית) */
  withLeftover: number;
  /** מתוכם — הדקות הועברו למונה */
  carried: number;
  /** מתוכם — הדקות נכללו בדיווח */
  included: number;
  /** דיווחים "עגולים" — בדיוק שעות אקדמיות שלמות */
  exact: number;
  /** סך הדקות שהועברו למונה */
  carriedMinutes: number;
};

/** סטטיסטיקת עיגול השעות: מה קרה לדקות שאינן משלימות שעה אקדמית. */
export function roundingStats(reports: readonly WorkReport[]): RoundingStats {
  const stats: RoundingStats = { withLeftover: 0, carried: 0, included: 0, exact: 0, carriedMinutes: 0 };
  for (const r of reports) {
    const net = netMinutes(r);
    if (net == null) continue;
    if (net % ACADEMIC_HOUR_MINUTES === 0) {
      stats.exact += 1;
      continue;
    }
    stats.withLeftover += 1;
    if (r.carriedMinutes > 0) {
      stats.carried += 1;
      stats.carriedMinutes += r.carriedMinutes;
    } else {
      stats.included += 1;
    }
  }
  return stats;
}

/**
 * טווח תאריכים לתצוגה, למשל "10/10–09/11". עטוף בבידוד כיווניות משמאל
 * לימין (LRI…PDI), אחרת בטקסט עברי סדר התאריכים מתהפך.
 */
export function dateRange(startIso: string, endIso: string, long = false): string {
  const f = (v: string) => {
    const [y, m, d] = v.split('-');
    return long ? `${d}/${m}/${y}` : `${d}/${m}`;
  };
  return `\u2066${f(startIso)}–${f(endIso)}\u2069 (${hebrewRange(startIso, endIso)})`;
}

/** "DD/MM (י״ז חשון)" מתוך "YYYY-MM-DD". */
export function shortDate(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${d}/${m} (${hebrewDate(iso, false)})`;
}

// ───────────────────────── החודש מול מתוכנן / ממוצע ─────────────────────────

export type WorkplaceMonthStats = {
  period: PayPeriod;
  /** שעות אקדמיות שדווחו בחודש הנוכחי (של מקום העבודה) */
  actual: number;
  /** שעות אקדמיות מתוכננות לכל החודש — לפי הקורסים הקבועים (0 = אין קורסים) */
  planned: number;
  /** מתוכננות עד היום (כולל) — להשוואה הוגנת באמצע החודש */
  plannedToDate: number;
  /** ממוצע שעות אקדמיות בחודשים קודמים שבהם דווח (עד 3), או null */
  average: number | null;
};

/** סיכום החודש הנוכחי של מקום עבודה מול המתוכנן (קורסים) והממוצע. */
export function workplaceMonthStats(
  workplace: Workplace,
  reports: readonly WorkReport[],
  courses: readonly Course[],
  today: Date = new Date(),
): WorkplaceMonthStats {
  const mine = reports.filter((r) => r.workplaceId === workplace.id);
  const hoursIn = (start: string, end: string) =>
    mine
      .filter((r) => r.date >= start && r.date <= end)
      .reduce((s, r) => s + (netMinutes(r) ?? 0), 0) / ACADEMIC_HOUR_MINUTES;

  const period = currentPayPeriod(workplace.payday, today);
  const todayIso = isoDate(today);
  const toDate = todayIso < period.end ? todayIso : period.end;

  // עד 3 חודשים קודמים שבהם דווחה עבודה.
  const past: number[] = [];
  let cursor = period;
  for (let i = 0; i < 6 && past.length < 3; i++) {
    const [y, m, d] = cursor.start.split('-').map(Number);
    cursor = currentPayPeriod(workplace.payday, new Date(y, m - 1, d - 1));
    const h = hoursIn(cursor.start, cursor.end);
    if (h > 0) past.push(h);
  }

  return {
    period,
    actual: hoursIn(period.start, period.end),
    planned: plannedMinutes(courses, workplace.id, period.start, period.end) / ACADEMIC_HOUR_MINUTES,
    plannedToDate: plannedMinutes(courses, workplace.id, period.start, toDate) / ACADEMIC_HOUR_MINUTES,
    average: past.length ? past.reduce((a, b) => a + b, 0) / past.length : null,
  };
}
