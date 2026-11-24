/**
 * דוחות שכר: דוח שעות חודשי לכל מקום עבודה, לפי "החודש" שלו (מיום התשלום
 * ועד יום התשלום הבא), לשליחה במייל למחלקת השכר.
 *
 * - הדוח מפרט את שעות העבודה לכל קורס (מפגש־מפגש), סה״כ שעות וסה״כ נסיעות.
 * - לכל דוח נשמר מצב: הופק (נוצר מייל) / נשלח (סומן ידנית).
 * - "ממתינים": חודשים שהסתיימו, שיש בהם דיווחים, והדוח שלהם טרם סומן כנשלח.
 */
import { canceledSessionPay } from './cancelReasons';
import { ACADEMIC_HOUR_MINUTES } from './academic';
import { courseReport, courseSessions, type Course } from './courses';
import { currentPlan, type PlanIndex } from './sessions';
import { currentPayPeriod, type PayPeriod } from './dashboard';
import { netMinutes, totalBreakMinutes, type WorkReport } from './reports';
import { readJSON, writeJSON } from './storage';
import { formatShekels, hasTravelCost, travelCostForWorkplace } from './travel';
import { hebrewDate, hebrewRange } from './hebrewDate';
import { workplaceAt, taxPercentOf, type Workplace } from './workplaces';
import { workplacePay } from './pay';
import { basisFor, type PayBasis } from './payBasis';
import { expectedPaymentDate } from './dashboard';
import { paymentTermsOf } from './workplaces';
import { signatureLines, type Profile } from './profile';
import { KEYS } from './keys';
import { isoDate } from './dates';
import { groupItems, NO_COURSE_LABEL, reportCourseName, type GroupLevel } from './courseGrouping';
import { FULL_DETAIL, type PayrollDetail, type RedeemedEdge, type RedeemedPlacement } from './payrollTemplate';
import { formatTime, parseTime } from './time';

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

/** האם הדוח נעול לעריכה: נשלח לשכר (ולא בוטל), או שולם. */
export const isLocked = (st: PayrollStatus | undefined) => Boolean(st?.sentAt || st?.paidAt);

/** האם הדוח שולם — אז הוא נעול לצמיתות, בלי ביטול שליחה. */
export const isPaid = (st: PayrollStatus | undefined) => Boolean(st?.paidAt);

export type StatusMap = Record<string, PayrollStatus>;

const STATUS_KEY = KEYS.payroll;

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


// ───────────────────────── תוכן הדוח ─────────────────────────

export type PayrollSession = {
  /** הדיווח שממנו המפגש — לניווט לתצוגת הדיווח */
  reportId: string;
  date: string;
  start: string;
  end: string;
  breakMinutes: number;
  netMinutes: number;
  /** דקות שהועברו מהמפגש למונה המצטבר (במקום אקדמי; אינן ב־netMinutes) */
  carriedMinutes: number;
};

/** כל המפגשים של יום אחד (בקיבוץ לפי מקום עבודה) — שורה אחת בדוח, עם סה״כ השעות של היום. */
export type PayrollDay = {
  date: string;
  /** המפגשים של היום, לפי שעת ההתחלה */
  sessions: PayrollSession[];
  netMinutes: number;
  carriedMinutes: number;
};

/** מפגשי הקבוצה מקובצים לפי תאריך (טהור). */
export function sessionsByDate(sessions: readonly PayrollSession[]): PayrollDay[] {
  const map = new Map<string, PayrollSession[]>();
  for (const x of sessions) map.set(x.date, [...(map.get(x.date) ?? []), x]);
  return [...map]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, list]) => {
      const sorted = [...list].sort((a, b) => a.start.localeCompare(b.start));
      return {
        date,
        sessions: sorted,
        netMinutes: sorted.reduce((n, x) => n + x.netMinutes, 0),
        carriedMinutes: sorted.reduce((n, x) => n + x.carriedMinutes, 0),
      };
    });
}

export type PayrollGroup = {
  /** תווית הקבוצה לפי רמת הקיבוץ: שם הקורס / "קורס · יום ב׳" / שם מקום העבודה; או "ללא קורס" */
  name: string;
  sessions: PayrollSession[];
  netMinutes: number;
  /** דקות שהועברו למונה מהמפגשים בקבוצה */
  carriedMinutes: number;
  /** בקיבוץ לפי מקום עבודה — המפגשים מקובצים גם לפי תאריך (שורה ליום) */
  days?: PayrollDay[];
};

/** מפגש שבוטל בתקופה — לשורה בדוח השכר. */
export type PayrollCanceled = {
  date: string;
  course: string;
  /** סיבת הביטול כפי שנשמרה ("" — לא צוינה) */
  reason: string;
  /** הסכום שהמוסד משלם עליו לפי כלל הסיבה (0 — ללא תשלום) */
  amount: number;
};

export type PayrollReport = {
  /** מפגשים שבוטלו בתקופה (כולל סכום, אם המוסד משלם על הסיבה) */
  canceled: PayrollCanceled[];
  /** סך התשלום על ביטולים — כלול ב־pay */
  canceledPay: number;
  workplace: Workplace;
  period: PayPeriod;
  /** רמת הקיבוץ של `groups` (lib/courseGrouping.ts) */
  level: GroupLevel;
  groups: PayrollGroup[];
  /** סך הדקות בדוח — מפגשים + דקות שנפדו מהמונה */
  netMinutes: number;
  /** דקות שנפדו מהמונה המצטבר לתוך הדוח (lib/redeem.ts) */
  redeemedMinutes: number;
  /** דקות שהועברו מהדיווחים בתקופה למונה המצטבר (אינן ב־netMinutes) */
  carriedMinutes: number;
  days: number;
  travel: number;
  /** שכר מחושב (ברוטו, לפי התעריפים שחלו בכל תאריך) */
  pay: number;
  /** התעריפים שחלו בתקופה (לשעה או חודשי) — לתצוגה באפליקציה בלבד */
  rates: number[];
  paymentType: 'hourly' | 'monthly';
};

export const NO_COURSE = NO_COURSE_LABEL;

export function buildPayrollReport(
  workplace: Workplace,
  period: PayPeriod,
  reports: readonly WorkReport[],
  courses: readonly Course[],
  basis: PayBasis = 'academic',
  /** דקות שנפדו מהמונה לתוך הדוח (מצב הדוח, `redeemedMinutes`) */
  redeemedMinutes = 0,
  /** תמונת מצב של הביטולים וההעברות — נלקחת פעם אחת לכל הדוח */
  plan: PlanIndex = currentPlan(),
  /** רמת הקיבוץ (ברירת מחדל — לפי קורס, כמו בעבר) */
  level: GroupLevel = 'course',
): PayrollReport {
  basis = basisFor(workplace, basis);
  const mine = reports
    .filter((r) => r.workplaceId === workplace.id && r.date >= period.start && r.date <= period.end)
    .sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start));

  // בשעות אקדמיות — הדקות שהועברו למונה אינן חלק מהדוח (הן ייכנסו כשייפדו).
  const sessionOf = (r: WorkReport): PayrollSession => ({
    reportId: r.id,
    date: r.date,
    start: r.start,
    end: r.end,
    breakMinutes: totalBreakMinutes(r.breaks),
    netMinutes: Math.max(0, (netMinutes(r) ?? 0) - (basis === 'academic' ? r.carriedMinutes ?? 0 : 0)),
    carriedMinutes: basis === 'academic' ? Math.max(0, r.carriedMinutes ?? 0) : 0,
  });
  const groups: PayrollGroup[] = groupItems(
    mine.map((r) => ({ r, course: reportCourseName(r, courses, plan) })),
    level,
    (x) => ({ workplaceId: workplace.id, course: x.course, date: x.r.date }),
  ).map((g) => {
    const sessions = g.items.map((x) => sessionOf(x.r));
    return {
      name: level === 'workplace' ? workplace.name : g.label,
      sessions,
      netMinutes: sessions.reduce((n, x) => n + x.netMinutes, 0),
      carriedMinutes: sessions.reduce((n, x) => n + x.carriedMinutes, 0),
      ...(level === 'workplace' ? { days: sessionsByDate(sessions) } : {}),
    };
  });
  const days = new Set(mine.map((r) => r.date)).size;
  const travel = travelCostForWorkplace(workplace, mine);
  const rates = [...new Set(mine.map((r) => workplaceAt(workplace, r.date).rate))];
  const last = mine[mine.length - 1];
  const paymentType = workplaceAt(workplace, last?.date).paymentType;
  const redeemed = basis === 'academic' ? Math.max(0, Math.round(redeemedMinutes)) : 0;
  const atEnd = workplaceAt(workplace, period.end);
  const redeemedPay =
    atEnd.paymentType === 'hourly' ? (Math.max(0, atEnd.rate) * redeemed) / ACADEMIC_HOUR_MINUTES : 0;
  const sessionsMinutes = groups.reduce((s, g) => s + g.netMinutes, 0);
  // מפגשים שבוטלו (ונשארו בפוטנציאל) ולא דווחו — שורה לכל אחד, עם התשלום לפי הסיבה.
  const canceled: PayrollCanceled[] = [];
  for (const c of courses) {
    if (c.workplaceId !== workplace.id) continue;
    for (const s of courseSessions(c, period.start, period.end, plan.cancel, plan.moves)) {
      if (s.cancel?.kind !== 'canceled' || courseReport(c, s.date, mine)) continue;
      canceled.push({
        date: s.date,
        course: c.name,
        reason: s.cancel.reason,
        amount: canceledSessionPay(workplace, c, s.date, s.cancel, basis),
      });
    }
  }
  canceled.sort((a, b) => a.date.localeCompare(b.date));
  const canceledPay = canceled.reduce((n, x) => n + x.amount, 0);
  return {
    canceled,
    canceledPay,
    pay: workplacePay(workplace, mine, basis) + redeemedPay + canceledPay,
    redeemedMinutes: redeemed,
    carriedMinutes: groups.reduce((s, g) => s + g.carriedMinutes, 0),
    rates: rates.length ? rates : [workplace.rate],
    paymentType,
    workplace,
    period,
    level,
    groups,
    netMinutes: sessionsMinutes + redeemed,
    days,
    travel,
  };
}

/** סיכום הביטולים לפי סיבה. */
export function canceledByReason(report: Pick<PayrollReport, 'canceled'>): { reason: string; count: number; amount: number }[] {
  const map = new Map<string, { reason: string; count: number; amount: number }>();
  for (const c of report.canceled) {
    const reason = c.reason || 'ללא סיבה';
    const r = map.get(reason) ?? { reason, count: 0, amount: 0 };
    r.count++;
    r.amount += c.amount;
    map.set(reason, r);
  }
  return [...map.values()].sort((a, b) => b.count - a.count);
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

/** שם החודש של התקופה — החודש שבו היא מסתיימת, ביום האחרון לדיווח (למשל "אוקטובר 2026"). */
export function periodTitle(period: PayPeriod): string {
  const [y, m] = period.end.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

export function payrollSubject(report: PayrollReport): string {
  return `דיווח שעות — ${periodTitle(report.period)} — ${report.workplace.name}`;
}

/** ריפוד טקסט לרוחב קבוע — לטבלה בטקסט פשוט. */
const pad = (t: string, n: number) => t + ' '.repeat(Math.max(0, n - t.length));

/** עמודות אפשריות בשורת מפגש / יום — לפי הסדר, ורוחב לטבלה בטקסט פשוט. */
const COLUMNS: { key: keyof PayrollDetail | 'date'; title: string; width: number }[] = [
  { key: 'date', title: 'תאריך', width: 10 },
  { key: 'weekday', title: 'יום', width: 5 },
  { key: 'hebrewDate', title: 'תאריך עברי', width: 12 },
  { key: 'times', title: 'שעות', width: 11 },
  { key: 'breaks', title: 'הפסקה', width: 6 },
  { key: 'netHours', title: 'נטו', width: 6 },
  { key: 'academicHours', title: 'שע׳ אקד׳', width: 9 },
  { key: 'carried', title: 'למונה', width: 6 },
];

/**
 * רכיב בעורך הפירוט ששורה בתצוגה המקדימה שייכת אליו — לחיצה על השורה גוללת אליו
 * ומבליטה אותו. `columns` — קבוצת "מה מופיע בשורות".
 */
export type PreviewTarget = keyof PayrollDetail | 'columns';
export type PreviewLine = { text: string; target?: PreviewTarget };

/** שיבוץ הפדיון בתוך מפגש: איזה מפגש, איזה קצה, והשעה החדשה. */
export type RedeemedShift = { reportId: string; date: string; edge: RedeemedEdge; time: string; minutes: number };

/**
 * היכן משובצות הדקות שנפדו מהמונה (`report.redeemedMinutes`) בתוך יום בדוח:
 * `lastDay` — תאריך הדיווח האחרון; `shortestDay` — התאריך עם הכי מעט דקות נטו בכל
 * הדוח (בשוויון — המאוחר). בתוך היום: `start` — המפגש הראשון מתחיל מוקדם יותר,
 * `end` — האחרון מסתיים מאוחר יותר. אם השעה תחצה חצות — הקצה השני; אם גם הוא —
 * null (ואז שורה נפרדת). טהור.
 */
export function redeemedShift(
  report: PayrollReport,
  placement: RedeemedPlacement,
  edge: RedeemedEdge,
): RedeemedShift | null {
  const minutes = report.redeemedMinutes;
  if (placement === 'separate' || minutes <= 0) return null;
  const all = report.groups.flatMap((g) => g.sessions);
  if (all.length === 0) return null;
  const byDate = new Map<string, PayrollSession[]>();
  for (const s of all) byDate.set(s.date, [...(byDate.get(s.date) ?? []), s]);
  const dates = [...byDate.keys()].sort();
  const net = (d: string) => byDate.get(d)!.reduce((n, s) => n + s.netMinutes, 0);
  const date =
    placement === 'lastDay'
      ? dates[dates.length - 1]
      : dates.reduce((best, d) => (net(d) <= net(best) ? d : best), dates[dates.length - 1]);
  const day = [...byDate.get(date)!].sort((a, b) => a.start.localeCompare(b.start));
  const tryEdge = (e: RedeemedEdge): RedeemedShift | null => {
    const s = e === 'start' ? day[0] : day.reduce((a, b) => (b.end > a.end ? b : a));
    const t = parseTime(e === 'start' ? s.start : s.end);
    if (t == null) return null;
    const next = e === 'start' ? t - minutes : t + minutes;
    if (next < 0 || next >= 24 * 60) return null;
    return { reportId: s.reportId, date, edge: e, time: formatTime(next), minutes };
  };
  return tryEdge(edge) ?? tryEdge(edge === 'start' ? 'end' : 'start');
}

/**
 * גוף המייל (טקסט פשוט) לפי רמת הפירוט (lib/payrollTemplate.ts): טבלת מפגשים לכל
 * קבוצה (בברירת המחדל: תאריך, יום, שעות, שעות אקדמיות — בלי הפסקות), סה״כ שעות,
 * נסיעות וסכום לתשלום. בלי תעריף לשעה.
 */
export function payrollBodyLines(
  report: PayrollReport,
  profile?: Profile,
  detail: PayrollDetail = FULL_DETAIL,
): PreviewLine[] {
  const { workplace, period } = report;
  const out: PreviewLine[] = [];
  /** הרכיב שהשורות הבאות שייכות אליו */
  let at: PreviewTarget | undefined;
  const push = (...texts: string[]) => {
    for (const text of texts) out.push({ text, target: text ? at : undefined });
  };
  push('שלום,');
  push('');
  at = 'hebrewPeriod';
  push(
    `מצורף דיווח שעות העבודה שלי ב${workplace.name} לחודש ${periodTitle(period)} (${ddmmyyyy(period.start)}-${ddmmyyyy(period.end)}${
      detail.hebrewPeriod ? ` · ${hebrewRange(period.start, period.end)} ${hebrewDate(period.end).split(' ').pop()}` : ''
    }).`,
  );
  const cols = COLUMNS.filter((c) => c.key === 'date' || detail[c.key as keyof PayrollDetail]);
  const W = cols.map((c) => c.width);
  const header = cols.map((c) => c.title);
  // הפדיון בתוך יום — שעות המפגש, היום והקבוצה גדלות בדקות שנפדו
  const shift = detail.redeemed ? redeemedShift(report, detail.redeemedPlacement, detail.redeemedEdge) : null;
  const hasShift = (sessions: readonly PayrollSession[]) =>
    shift != null && sessions.some((s) => s.reportId === shift.reportId);
  const extra = (sessions: readonly PayrollSession[]) => (shift && hasShift(sessions) ? shift.minutes : 0);
  const timesOf = (s: PayrollSession) =>
    shift?.reportId === s.reportId
      ? shift.edge === 'start'
        ? `${shift.time}-${s.end}`
        : `${s.start}-${shift.time}`
      : `${s.start}-${s.end}`;
  const hoursPart = (minutes: number) =>
    [
      detail.academicHours || !detail.netHours ? `${academic(minutes)} שעות אקדמיות` : '',
      detail.netHours ? `${hm(minutes)} שעות נטו` : '',
    ]
      .filter(Boolean)
      .join(' · ');
  for (const g of report.groups) {
    if (!detail.groupSummary && !detail.rows) continue;
    push('');
    const days = g.days?.length ?? 0;
    at = 'groupSummary';
    if (detail.groupSummary || !detail.rows) {
      push(
        `■ ${g.name} — ${g.sessions.length} מפגשים${g.days ? ` · ${days} ימים` : ''} · ${hoursPart(g.netMinutes + extra(g.sessions))}${
          detail.carried && g.carriedMinutes > 0 ? ` · ${g.carriedMinutes} דק׳ למצטברות` : ''
        }`,
      );
    } else {
      push(`■ ${g.name}`);
    }
    if (!detail.rows) continue;
    at = 'columns';
    push(header.map((h, k) => pad(h, W[k])).join(' | '));
    push(W.map((w) => '-'.repeat(w)).join('-+-'));
    // בקיבוץ לפי מקום עבודה — שורה לכל תאריך, עם כל טווחי השעות של היום וסה״כ.
    const rows =
      g.days ??
      g.sessions.map((s) => ({ date: s.date, sessions: [s], netMinutes: s.netMinutes, carriedMinutes: s.carriedMinutes }));
    for (const day of rows) {
      const [y, m, d] = day.date.split('-').map(Number);
      const cell: Record<string, string> = {
        date: ddmmyyyy(day.date),
        weekday: WEEKDAYS[new Date(y, m - 1, d).getDay()],
        hebrewDate: hebrewDate(day.date, false),
        times: day.sessions.map(timesOf).join(', '),
        breaks: String(day.sessions.reduce((n, s) => n + s.breakMinutes, 0) || ''),
        netHours: hm(day.netMinutes + extra(day.sessions)),
        academicHours: academic(day.netMinutes + extra(day.sessions)),
        carried: day.carriedMinutes > 0 ? String(day.carriedMinutes) : '',
      };
      at = hasShift(day.sessions) ? 'redeemedPlacement' : 'columns';
      push(cols.map((c, k) => pad(cell[c.key], W[k])).join(' | '));
    }
  }
  at = 'canceled';
  if (detail.canceled && report.canceled.length) {
    push('');
    push(`■ מפגשים שבוטלו — ${report.canceled.length}`);
    for (const c of report.canceled) {
      push(
        `${ddmmyyyy(c.date)} · ${c.course} · ${c.reason || 'ללא סיבה'}${
          detail.canceledAmounts && c.amount > 0 ? ` · ${formatShekels(Math.round(c.amount))}` : ''
        }`,
      );
    }
  }
  at = 'canceledSummary';
  if (detail.canceledSummary && report.canceled.length) {
    if (!detail.canceled) {
      push('');
      push(`■ מפגשים שבוטלו — ${report.canceled.length}`);
    }
    for (const r of canceledByReason(report)) {
      push(
        `סה״כ ${r.reason}: ${r.count}${detail.canceledAmounts && r.amount > 0 ? ` · ${formatShekels(Math.round(r.amount))}` : ''}`,
      );
    }
  }
  at = 'redeemed';
  if (detail.redeemed && report.redeemedMinutes > 0 && !shift) {
    push('');
    push(
      `■ פדיון דקות עבודה מצטברות (דקות עודפות מחודשים קודמים) — ${academic(report.redeemedMinutes)} שעות אקדמיות (${report.redeemedMinutes} דק׳)`,
    );
  }
  at = undefined;
  push('');
  push('──────────');
  at = 'totalAcademic';
  const totalParts = [
    detail.totalAcademic ? `${academic(report.netMinutes)} שעות אקדמיות` : '',
    detail.totalNet ? (detail.totalAcademic ? `(${hm(report.netMinutes)} שעות נטו)` : `${hm(report.netMinutes)} שעות נטו`) : '',
  ].filter(Boolean);
  if (totalParts.length || detail.totalDays) {
    push(
      [totalParts.length ? `סה״כ שעות: ${totalParts.join(' ')}` : '', detail.totalDays ? `${report.days} ימי עבודה` : '']
        .filter(Boolean)
        .join(' · '),
    );
  }
  at = 'carriedTotal';
  if (detail.carriedTotal && report.carriedMinutes > 0) {
    push(`דקות עודפות שהועברו למונה המצטבר (לא נכללו בשעות): ${report.carriedMinutes} דק׳`);
  }
  const travelW = workplaceAt(workplace, period.end);
  at = 'travel';
  if (detail.travel) {
    push(
      hasTravelCost(travelW) || report.travel > 0
        ? `סה״כ נסיעות: ${formatShekels(report.travel)} (${report.days} ימי עבודה)`
        : 'סה״כ נסיעות: אין (הגעה ללא תחבורה ציבורית)',
    );
  }
  at = 'pay';
  if (detail.pay) {
    push(
      report.paymentType === 'monthly'
        ? `סכום לתשלום: ${formatShekels(Math.round(report.pay))} (משכורת חודשית)${detail.travel ? ` + נסיעות ${formatShekels(report.travel)}` : ''}`
        : detail.travel
          ? `סכום לתשלום: ${formatShekels(Math.round(report.pay + report.travel))} (שכר ${formatShekels(Math.round(report.pay))} + נסיעות ${formatShekels(report.travel)})`
          : `סכום לתשלום (שכר): ${formatShekels(Math.round(report.pay))}`,
    );
  }
  at = undefined;
  push('');
  push('בברכה,');
  at = 'signature';
  if (profile && detail.signature) push(...signatureLines(profile, workplace.employeeNumber));
  else if (profile?.fullName) push(profile.fullName);
  return out;
}

/** גוף המייל (טקסט פשוט) — שורות `payrollBodyLines`. */
export function payrollBody(report: PayrollReport, profile?: Profile, detail: PayrollDetail = FULL_DETAIL): string {
  return payrollBodyLines(report, profile, detail)
    .map((l) => l.text)
    .join('\n');
}

/** קישור mailto: — פותח טיוטה מוכנה בתוכנת המייל של המכשיר. */
export function payrollMailto(report: PayrollReport, profile?: Profile, detail: PayrollDetail = FULL_DETAIL): string {
  const to = report.workplace.payrollEmail ?? '';
  const params: string[] = [];
  const cc = (report.workplace.ccEmails ?? []).join(',');
  if (cc) params.push(`cc=${encodeURIComponent(cc)}`);
  params.push(`subject=${encodeURIComponent(payrollSubject(report))}`);
  params.push(`body=${encodeURIComponent(payrollBody(report, profile, detail))}`);
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
