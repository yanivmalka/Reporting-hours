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
import { workplacePay } from './pay';
import type { PayBasis } from './payBasis';
import { netMinutes, totalBreakMinutes, type WorkReport } from './reports';
import { travelCostForWorkplace } from './travel';
import type { Workplace } from './workplaces';

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
};

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
    return { workplace, period, totals: totalsFor([workplace], mine, basis) };
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

/** "DD/MM" מתוך "YYYY-MM-DD". */
export function shortDate(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
}
