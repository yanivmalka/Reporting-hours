/**
 * דוחות שכר: דוח שעות חודשי לכל מקום עבודה, לפי "החודש" שלו (מיום התשלום
 * ועד יום התשלום הבא), לשליחה במייל למחלקת השכר.
 *
 * - הדוח מפרט את שעות העבודה לכל קורס (מפגש־מפגש), סה״כ שעות וסה״כ נסיעות.
 * - לכל דוח נשמר מצב: הופק (נוצר מייל) / נשלח (סומן ידנית).
 * - "ממתינים": חודשים שהסתיימו, שיש בהם דיווחים, והדוח שלהם טרם סומן כנשלח.
 */
import { ACADEMIC_HOUR_MINUTES } from './academic';
import { occursOn, type Course } from './courses';
import { currentPayPeriod, type PayPeriod } from './dashboard';
import { netMinutes, totalBreakMinutes, type WorkReport } from './reports';
import { readJSON, writeJSON } from './storage';
import { formatShekels, hasTravelCost, travelCostForWorkplace } from './travel';
import { parseTime } from './time';
import { hebrewDate, hebrewRange } from './hebrewDate';
import { workplaceAt, taxPercentOf, type Workplace } from './workplaces';
import { workplacePay } from './pay';
import type { PayBasis } from './payBasis';
import { expectedPaymentDate } from './dashboard';
import { paymentTermsOf } from './workplaces';
import { signatureLines, type Profile } from './profile';

// ───────────────────────── מצב הדוחות ─────────────────────────

export type PayrollStatus = {
  /** מתי נוצר מייל לדוח (מילישניות) */
  generatedAt?: number;
  /** מתי סומן כנשלח */
  sentAt?: number;
  /** ביטולי דוח שנשלח (כדי לתקן דיווחים) — מתי ולמה */
  cancellations?: { at: number; reason: string }[];
  /** תאריך קבלת התשלום ("YYYY-MM-DD") */
  paidAt?: string;
  /** הסכום שהתקבל בפועל (₪) */
  paidAmount?: number;
  /** דקות שנפדו מן המונה המצטבר ונכללות בדוח הזה (lib/redeem.ts) */
  redeemedMinutes?: number;
};

/** האם הדוח נעול לעריכה (נשלח לשכר ולא בוטל). */
export const isLocked = (st: PayrollStatus | undefined) => Boolean(st?.sentAt);

export type StatusMap = Record<string, PayrollStatus>;

const STATUS_KEY = 'reporting-hours/payroll/v1';

export const statusKey = (workplaceId: string, periodStart: string) => `${workplaceId}|${periodStart}`;

export async function loadPayrollStatus(): Promise<StatusMap> {
  return readJSON<StatusMap>(STATUS_KEY, {});
}

export async function savePayrollStatus(map: StatusMap): Promise<void> {
  await writeJSON(STATUS_KEY, map);
}

export async function updatePayrollStatus(
  workplaceId: string,
  periodStart: string,
  patch: Partial<PayrollStatus> | null,
): Promise<StatusMap> {
  const map = await loadPayrollStatus();
  const key = statusKey(workplaceId, periodStart);
  if (patch === null) delete map[key];
  else map[key] = { ...map[key], ...patch };
  await savePayrollStatus(map);
  return map;
}

// ───────────────────────── תקופות ─────────────────────────

/** התקופה שמתחילה בתאריך נתון (לפי יום התשלום של המקום). */
export function periodStartingAt(workplace: Workplace, start: string): PayPeriod {
  const [y, m, d] = start.split('-').map(Number);
  return currentPayPeriod(workplace.payday, new Date(y, m - 1, d));
}

/** התקופה הנוכחית ועוד `count` תקופות קודמות, מהחדשה לישנה. */
export function recentPeriods(workplace: Workplace, count: number, today: Date = new Date()): PayPeriod[] {
  const out: PayPeriod[] = [];
  let p = currentPayPeriod(workplace.payday, today);
  for (let i = 0; i <= count; i++) {
    out.push(p);
    const [y, m, d] = p.start.split('-').map(Number);
    p = currentPayPeriod(workplace.payday, new Date(y, m - 1, d - 1));
  }
  return out;
}

export type PayrollItem = {
  workplace: Workplace;
  period: PayPeriod;
  /** דיווחים בתקופה */
  reports: number;
  /** התקופה הסתיימה */
  closed: boolean;
  status: PayrollStatus;
};

/** כל הדוחות הרלוונטיים: התקופה הנוכחית + עד 6 קודמות שיש בהן דיווחים. */
export function payrollItems(
  workplaces: readonly Workplace[],
  reports: readonly WorkReport[],
  statuses: StatusMap,
  today: Date = new Date(),
): PayrollItem[] {
  const todayIso = isoDate(today);
  const items: PayrollItem[] = [];
  for (const w of workplaces) {
    const mine = reports.filter((r) => r.workplaceId === w.id);
    recentPeriods(w, 6, today).forEach((period, i) => {
      const n = mine.filter((r) => r.date >= period.start && r.date <= period.end).length;
      if (n === 0 && i > 0) return;
      items.push({
        workplace: w,
        period,
        reports: n,
        closed: period.end < todayIso,
        status: statuses[statusKey(w.id, period.start)] ?? {},
      });
    });
  }
  return items;
}

/** דוחות שממתינים לשליחה: תקופה שהסתיימה, יש דיווחים, ולא סומן כנשלח. */
export function pendingPayroll(items: readonly PayrollItem[]): PayrollItem[] {
  return items
    .filter((i) => i.closed && i.reports > 0 && !i.status.sentAt)
    .sort((a, b) => a.period.end.localeCompare(b.period.end));
}

function isoDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// ───────────────────────── תוכן הדוח ─────────────────────────

export type PayrollSession = {
  date: string;
  start: string;
  end: string;
  breakMinutes: number;
  netMinutes: number;
};

export type PayrollGroup = {
  /** שם הקורס, או "ללא קורס" */
  name: string;
  sessions: PayrollSession[];
  netMinutes: number;
};

export type PayrollReport = {
  workplace: Workplace;
  period: PayPeriod;
  groups: PayrollGroup[];
  /** סך הדקות בדוח — מפגשים + דקות שנפדו מהמונה */
  netMinutes: number;
  /** דקות שנפדו מהמונה המצטבר לתוך הדוח (lib/redeem.ts) */
  redeemedMinutes: number;
  days: number;
  travel: number;
  /** שכר מחושב (ברוטו, לפי התעריפים שחלו בכל תאריך) */
  pay: number;
  /** התעריפים שחלו בתקופה (לשעה או חודשי) — לתצוגה באפליקציה בלבד */
  rates: number[];
  paymentType: 'hourly' | 'monthly';
};

export const NO_COURSE = 'עבודה שלא במסגרת קורס קבוע';

/** לאיזה קורס שייך דיווח: קורס של אותו מקום שמתקיים בתאריך וחופף בשעות; אחרת לפי הנושא. */
function courseOf(report: WorkReport, courses: readonly Course[]): string {
  const s = parseTime(report.start) ?? 0;
  const e = parseTime(report.end) ?? 0;
  const match = courses.find((c) => {
    if (c.workplaceId !== report.workplaceId || !occursOn(c, report.date)) return false;
    const cs = parseTime(c.start) ?? 0;
    const ce = parseTime(c.end) ?? 0;
    return cs < e && ce > s;
  });
  if (match) return match.name;
  const byName = courses.find((c) => c.workplaceId === report.workplaceId && c.name === report.note);
  return byName?.name ?? NO_COURSE;
}

export function buildPayrollReport(
  workplace: Workplace,
  period: PayPeriod,
  reports: readonly WorkReport[],
  courses: readonly Course[],
  basis: PayBasis = 'academic',
  /** דקות שנפדו מהמונה לתוך הדוח (מצב הדוח, `redeemedMinutes`) */
  redeemedMinutes = 0,
): PayrollReport {
  const mine = reports
    .filter((r) => r.workplaceId === workplace.id && r.date >= period.start && r.date <= period.end)
    .sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start));

  const groups = new Map<string, PayrollGroup>();
  for (const r of mine) {
    const name = courseOf(r, courses);
    const g = groups.get(name) ?? { name, sessions: [], netMinutes: 0 };
    // בשעות אקדמיות — הדקות שהועברו למונה אינן חלק מהדוח (הן ייכנסו כשייפדו).
    const net = Math.max(0, (netMinutes(r) ?? 0) - (basis === 'academic' ? r.carriedMinutes ?? 0 : 0));
    g.sessions.push({
      date: r.date,
      start: r.start,
      end: r.end,
      breakMinutes: totalBreakMinutes(r.breaks),
      netMinutes: net,
    });
    g.netMinutes += net;
    groups.set(name, g);
  }
  const days = new Set(mine.map((r) => r.date)).size;
  const travel = travelCostForWorkplace(workplace, mine);
  const rates = [...new Set(mine.map((r) => workplaceAt(workplace, r.date).rate))];
  const last = mine[mine.length - 1];
  const paymentType = workplaceAt(workplace, last?.date).paymentType;
  const redeemed = basis === 'academic' ? Math.max(0, Math.round(redeemedMinutes)) : 0;
  const atEnd = workplaceAt(workplace, period.end);
  const redeemedPay =
    atEnd.paymentType === 'hourly' ? (Math.max(0, atEnd.rate) * redeemed) / ACADEMIC_HOUR_MINUTES : 0;
  const sessionsMinutes = [...groups.values()].reduce((s, g) => s + g.netMinutes, 0);
  return {
    pay: workplacePay(workplace, mine, basis) + redeemedPay,
    redeemedMinutes: redeemed,
    rates: rates.length ? rates : [workplace.rate],
    paymentType,
    workplace,
    period,
    groups: [...groups.values()].sort((a, b) =>
      a.name === NO_COURSE ? 1 : b.name === NO_COURSE ? -1 : a.name.localeCompare(b.name, 'he'),
    ),
    netMinutes: sessionsMinutes + redeemed,
    days,
    travel,
  };
}

// ───────────────────────── טקסט המייל ─────────────────────────

const WEEKDAYS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];
const MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];

const ddmmyyyy = (iso: string) => {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};
const dayLabel = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return `יום ${WEEKDAYS[new Date(y, m - 1, d).getDay()]} ${ddmmyyyy(iso)} (${hebrewDate(iso, false)})`;
};
const hm = (minutes: number) => `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`;
const academic = (minutes: number) => {
  const v = Math.round((minutes / ACADEMIC_HOUR_MINUTES) * 100) / 100;
  return Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/0$/, '');
};

/** שם החודש של התקופה — לפי החודש שבו רוב ימיה (למשל "אוקטובר 2026"). */
export function periodTitle(period: PayPeriod): string {
  const [y, m, d] = period.start.split('-').map(Number);
  const mid = new Date(y, m - 1, d + 14);
  return `${MONTHS[mid.getMonth()]} ${mid.getFullYear()}`;
}

export function payrollSubject(report: PayrollReport): string {
  return `דיווח שעות — ${periodTitle(report.period)} — ${report.workplace.name}`;
}

/** ריפוד טקסט לרוחב קבוע — לטבלה בטקסט פשוט. */
const pad = (t: string, n: number) => t + ' '.repeat(Math.max(0, n - t.length));

/**
 * גוף המייל (טקסט פשוט): טבלת מפגשים לכל קורס (תאריך, יום, שעות, שעות
 * אקדמיות — בלי הפסקות), סה״כ שעות, נסיעות וסכום לתשלום. בלי תעריף לשעה.
 */
export function payrollBody(report: PayrollReport, profile?: Profile): string {
  const { workplace, period } = report;
  const lines: string[] = [];
  lines.push('שלום,');
  lines.push('');
  lines.push(
    `מצורף דיווח שעות העבודה שלי ב${workplace.name} לחודש ${periodTitle(period)} (${ddmmyyyy(period.start)}–${ddmmyyyy(period.end)} · ${hebrewRange(period.start, period.end)} ${hebrewDate(period.end).split(' ').pop()}).`,
  );
  const W = [10, 5, 11, 9];
  const header = ['תאריך', 'יום', 'שעות', 'שע׳ אקד׳'];
  for (const g of report.groups) {
    lines.push('');
    lines.push(`■ ${g.name} — ${g.sessions.length} מפגשים · ${academic(g.netMinutes)} שעות אקדמיות`);
    lines.push(header.map((h, k) => pad(h, W[k])).join(' | '));
    lines.push(W.map((w) => '-'.repeat(w)).join('-+-'));
    for (const s of g.sessions) {
      const [y, m, d] = s.date.split('-').map(Number);
      const row = [
        ddmmyyyy(s.date),
        WEEKDAYS[new Date(y, m - 1, d).getDay()],
        `${s.start}-${s.end}`,
        academic(s.netMinutes),
      ];
      lines.push(row.map((c, k) => pad(c, W[k])).join(' | '));
    }
  }
  if (report.redeemedMinutes > 0) {
    lines.push('');
    lines.push(
      `■ פדיון דקות עבודה מצטברות (דקות עודפות מחודשים קודמים) — ${academic(report.redeemedMinutes)} שעות אקדמיות (${report.redeemedMinutes} דק׳)`,
    );
  }
  lines.push('');
  lines.push('──────────');
  lines.push(
    `סה״כ שעות: ${academic(report.netMinutes)} שעות אקדמיות (${hm(report.netMinutes)} שעות נטו) · ${report.days} ימי עבודה`,
  );
  const travelW = workplaceAt(workplace, period.end);
  lines.push(
    hasTravelCost(travelW) || report.travel > 0
      ? `סה״כ נסיעות: ${formatShekels(report.travel)} (${report.days} ימי עבודה)`
      : 'סה״כ נסיעות: אין (הגעה ללא תחבורה ציבורית)',
  );
  lines.push(
    report.paymentType === 'monthly'
      ? `סכום לתשלום: ${formatShekels(Math.round(report.pay))} (משכורת חודשית) + נסיעות ${formatShekels(report.travel)}`
      : `סכום לתשלום: ${formatShekels(Math.round(report.pay + report.travel))} (שכר ${formatShekels(Math.round(report.pay))} + נסיעות ${formatShekels(report.travel)})`,
  );
  lines.push('');
  lines.push('בברכה,');
  if (profile) lines.push(...signatureLines(profile, workplace.employeeNumber));
  return lines.join('\n');
}

/** קישור mailto: — פותח טיוטה מוכנה בתוכנת המייל של המכשיר. */
export function payrollMailto(report: PayrollReport, profile?: Profile): string {
  const to = report.workplace.payrollEmail ?? '';
  const params: string[] = [];
  const cc = (report.workplace.ccEmails ?? []).join(',');
  if (cc) params.push(`cc=${encodeURIComponent(cc)}`);
  params.push(`subject=${encodeURIComponent(payrollSubject(report))}`);
  params.push(`body=${encodeURIComponent(payrollBody(report, profile))}`);
  return `mailto:${encodeURIComponent(to).replace(/%40/g, '@')}?${params.join('&')}`;
}

// ───────────────────────── מעקב תשלומים ─────────────────────────

/** סכום ברוטו לתשלום (שכר + נסיעות) */
export const grossAmount = (r: PayrollReport) => Math.round(r.pay + r.travel);

/** סכום נטו משוער: ברוטו פחות אחוז המס של מקום העבודה */
export function netAmount(r: PayrollReport): number {
  const tax = taxPercentOf(workplaceAt(r.workplace, r.period.end));
  return Math.round(grossAmount(r) * (1 - tax / 100));
}

/**
 * האם הדוח הוחמץ: נשלח אחרי היום האחרון לדיווח (סוף התקופה), או שעבר
 * המועד והוא עוד לא נשלח. דוח כזה משולם רק בחודש שאחרי.
 */
export function reportLate(period: Pick<PayPeriod, 'end'>, status: PayrollStatus | undefined, today: Date = new Date()): boolean {
  if (status?.paidAt) return false;
  if (status?.sentAt) return isoDate(new Date(status.sentAt)) > period.end;
  return isoDate(today) > period.end;
}

/** תאריך ISO + חודש אחד (היום מוגבל לאורך החודש). */
function plusMonth(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const last = new Date(y, m + 1, 0).getDate();
  return isoDate(new Date(y, m, Math.min(d, last)));
}

/**
 * מועד התשלום הצפוי לפי "שוטף +". דוח שהוחמץ (ראה {@link reportLate}) —
 * נדחה בחודש.
 */
export const expectedPayment = (w: Workplace, period: PayPeriod, status?: PayrollStatus, today: Date = new Date()) =>
  expectedPaymentDate(reportLate(period, status, today) ? plusMonth(period.end) : period.end, paymentTermsOf(w));

/** דוחות שנשלחו, שמועד התשלום הצפוי שלהם עבר, וטרם סומנו כשולמו. */
export function overduePayments(items: readonly PayrollItem[], today: Date = new Date()): PayrollItem[] {
  const t = isoDate(today);
  return items.filter(
    (i) => i.status.sentAt && !i.status.paidAt && expectedPayment(i.workplace, i.period, i.status, today) < t,
  );
}
