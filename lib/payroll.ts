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
import { formatShekels, hasTravelCost } from './travel';
import { parseTime } from './time';
import { hebrewDate, hebrewRange } from './hebrewDate';
import type { Workplace } from './workplaces';

// ───────────────────────── מצב הדוחות ─────────────────────────

export type PayrollStatus = {
  /** מתי נוצר מייל לדוח (מילישניות) */
  generatedAt?: number;
  /** מתי סומן כנשלח */
  sentAt?: number;
};

type StatusMap = Record<string, PayrollStatus>;

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
  netMinutes: number;
  days: number;
  travel: number;
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
): PayrollReport {
  const mine = reports
    .filter((r) => r.workplaceId === workplace.id && r.date >= period.start && r.date <= period.end)
    .sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start));

  const groups = new Map<string, PayrollGroup>();
  for (const r of mine) {
    const name = courseOf(r, courses);
    const g = groups.get(name) ?? { name, sessions: [], netMinutes: 0 };
    const net = netMinutes(r) ?? 0;
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
  const travel = hasTravelCost(workplace)
    ? workplace.travelCostPerDirection * workplace.tripsPerDay * days
    : 0;
  return {
    workplace,
    period,
    groups: [...groups.values()].sort((a, b) =>
      a.name === NO_COURSE ? 1 : b.name === NO_COURSE ? -1 : a.name.localeCompare(b.name, 'he'),
    ),
    netMinutes: mine.reduce((s, r) => s + (netMinutes(r) ?? 0), 0),
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

/** גוף המייל (טקסט פשוט): פירוט לפי קורס, סה״כ שעות וסה״כ נסיעות. */
export function payrollBody(report: PayrollReport): string {
  const { workplace, period } = report;
  const lines: string[] = [];
  lines.push('שלום,');
  lines.push('');
  lines.push(
    `מצורף דיווח שעות העבודה שלי ב${workplace.name} לחודש ${periodTitle(period)} (${ddmmyyyy(period.start)}–${ddmmyyyy(period.end)} · ${hebrewRange(period.start, period.end)} ${hebrewDate(period.end).split(' ').pop()}).`,
  );
  for (const g of report.groups) {
    lines.push('');
    lines.push(`■ ${g.name}`);
    lines.push(
      `  ${g.sessions.length} מפגשים · ${academic(g.netMinutes)} שעות אקדמיות (${hm(g.netMinutes)} שעות נטו)`,
    );
    for (const s of g.sessions) {
      const brk = s.breakMinutes > 0 ? ` (הפסקה ${s.breakMinutes} דק׳)` : '';
      lines.push(`  • ${dayLabel(s.date)} · ${s.start}–${s.end}${brk} · ${academic(s.netMinutes)} שע׳ אקד׳`);
    }
  }
  lines.push('');
  lines.push('──────────');
  lines.push(
    `סה״כ שעות: ${academic(report.netMinutes)} שעות אקדמיות (${hm(report.netMinutes)} שעות נטו) · ${report.days} ימי עבודה`,
  );
  if (hasTravelCost(workplace)) {
    lines.push(
      `סה״כ נסיעות: ${formatShekels(report.travel)} (${report.days} ימים × ${workplace.tripsPerDay} נסיעות × ${formatShekels(workplace.travelCostPerDirection)})`,
    );
  } else {
    lines.push('סה״כ נסיעות: אין (הגעה ללא תחבורה ציבורית)');
  }
  lines.push('');
  lines.push('בברכה,');
  return lines.join('\n');
}

/** קישור mailto: — פותח טיוטה מוכנה בתוכנת המייל של המכשיר. */
export function payrollMailto(report: PayrollReport): string {
  const to = report.workplace.payrollEmail ?? '';
  const params: string[] = [];
  const cc = (report.workplace.ccEmails ?? []).join(',');
  if (cc) params.push(`cc=${encodeURIComponent(cc)}`);
  params.push(`subject=${encodeURIComponent(payrollSubject(report))}`);
  params.push(`body=${encodeURIComponent(payrollBody(report))}`);
  return `mailto:${encodeURIComponent(to).replace(/%40/g, '@')}?${params.join('&')}`;
}
