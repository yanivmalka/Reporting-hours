/**
 * טופס הדיווח — החישובים הטהורים של אשף הדיווח (components/report), בלי React
 * ובלי אחסון, כדי שאפשר יהיה לבדוק אותם (test/reportForm.test.ts):
 *
 *   - validateReportForm — אימות השדות לפני שמירה;
 *   - reportPreview      — התצוגה המקדימה החיה: נטו, שעות אקדמיות, דקות עודפות,
 *                          שכר ונסיעות;
 *   - buildReportDraft   — הדיווח שנשמר: שעות, הפסקות, דקות למונה, הערה ושיוך לקורס.
 *
 * שעות ודקות ההפסקה נשמרות בטופס כמחרוזות (עריכה חופשית), וההמרה למספרים נעשית כאן.
 */
import { toAcademic, type AcademicBreakdown } from './academic';
import type { Course } from './courses';
import { payableHours, reportPay } from './pay';
import { basisFor, type PayBasis } from './payBasis';
import type { ExtraSessionKind, WorkReport, WorkReportDraft } from './reports';
import { END_BEFORE_START, isValidISODate, parseTime } from './time';
import { travelCostForDay } from './travel';
import type { Workplace } from './workplaces';

/** שורת הפסקה בטופס — משך בדקות נשמר כמחרוזת לעריכה חופשית. */
export type BreakRow = { id: string; minutes: string };

/** מה לעשות עם הדקות שאינן משלימות שעה אקדמית: למונה המצטבר, או בדיווח עצמו. */
export type LeftoverChoice = 'carry' | 'include';

export type ReportFormErrors = {
  workplace?: string;
  date?: string;
  start?: string;
  end?: string;
  breaks?: string;
};

/** שדות הטופס שהחישובים צריכים. */
export type ReportFormFields = {
  workplaceId: string | null;
  date: string;
  start: string;
  end: string;
  breaks: readonly BreakRow[];
};

/** מספר מטקסט חופשי ("1,5" → 1.5). */
export function parseNum(value: string): number {
  return Number(value.replace(',', '.').trim());
}

/** סך דקות ההפסקות, תוך התעלמות משורות ריקות / לא תקינות. */
export function sumBreaks(rows: readonly BreakRow[]): number {
  return rows.reduce((total, row) => {
    const n = parseNum(row.minutes);
    return total + (Number.isFinite(n) && n > 0 ? n : 0);
  }, 0);
}

/** אימות לפני שמירה. אובייקט ריק — הטופס תקין. */
export function validateReportForm(f: ReportFormFields): ReportFormErrors {
  const next: ReportFormErrors = {};
  if (!f.workplaceId) next.workplace = 'יש לבחור מקום עבודה';
  if (!isValidISODate(f.date)) next.date = 'תאריך בפורמט YYYY-MM-DD';

  const startMin = parseTime(f.start);
  const endMin = parseTime(f.end);
  if (startMin == null) next.start = 'שעה בפורמט HH:MM';
  if (endMin == null) next.end = 'שעה בפורמט HH:MM';
  if (startMin != null && endMin != null && endMin <= startMin) {
    next.end = END_BEFORE_START;
  }

  for (const row of f.breaks) {
    const n = parseNum(row.minutes);
    if (!Number.isInteger(n) || n < 0) {
      next.breaks = 'כל הפסקה: מספר דקות שלם, 0 ומעלה';
      break;
    }
  }

  if (startMin != null && endMin != null && endMin > startMin) {
    if (sumBreaks(f.breaks) >= endMin - startMin) {
      next.breaks = 'סך ההפסקות ארוך או שווה לטווח השעות';
    }
  }
  return next;
}

/** האם יש שגיאה כלשהי. */
export const hasErrors = (e: ReportFormErrors) => Object.values(e).some(Boolean);

/** דקות עודפות (שאינן משלימות שעה אקדמית) — נצברות רק במקום שמשלם לפי שעה אקדמית. */
export function leftoverMinutesFor(
  netMinutes: number,
  workplace: Workplace | null | undefined,
  basis: PayBasis,
): number {
  return basisFor(workplace, basis) === 'academic' ? toAcademic(netMinutes).leftoverMinutes : 0;
}

export type ReportPreview = {
  startMin: number | null;
  endMin: number | null;
  /** הטווח בדקות (null כשהשעות לא תקינות) */
  rangeMin: number | null;
  /** זמן עבודה נטו (טווח פחות הפסקות) */
  netPreview: number | null;
  academicPreview: AcademicBreakdown | null;
  /** בסיס השכר של המקום שנבחר */
  wBasis: PayBasis;
  /** דקות שיעברו למונה (במקום אקדמי) */
  leftoverPreview: number;
  /** שעות אקדמיות בדיווח: שלמות כשהעודף עובר למונה, אחרת כשבר */
  academicHoursNow: number;
  /** הדיווח כפי שיחושב לשכר */
  draft: Pick<WorkReport, 'date' | 'start' | 'end' | 'breaks' | 'carriedMinutes'>;
  /** שכר לדיווח: מספר במקום שעתי, null במקום חודשי או כשאין שעות */
  pay: number | null;
  hoursForPay: number;
  /** האם הנסיעות של היום כבר נספרו בדיווח אחר לאותו מקום */
  travelCounted: boolean;
  /** עלות הנסיעות שהדיווח הזה מוסיף */
  travel: number;
};

/**
 * התצוגה המקדימה החיה של הדיווח.
 * @param existing  כל הדיווחים — לבדיקה אם הנסיעות של היום כבר נספרו
 * @param editingId בעריכה — הדיווח עצמו לא נחשב "דיווח אחר" באותו יום
 */
export function reportPreview(
  f: ReportFormFields & { leftoverChoice: LeftoverChoice },
  ctx: {
    workplaces: readonly Workplace[];
    basis: PayBasis;
    existing: readonly WorkReport[];
    editingId?: string;
  },
): ReportPreview {
  const startMin = parseTime(f.start);
  const endMin = parseTime(f.end);
  const rangeMin = startMin != null && endMin != null && endMin > startMin ? endMin - startMin : null;
  const netPreview = rangeMin == null ? null : Math.max(0, rangeMin - sumBreaks(f.breaks));
  const academicPreview = netPreview == null ? null : toAcademic(netPreview);
  const workplace = ctx.workplaces.find((w) => w.id === f.workplaceId) ?? null;
  const wBasis = basisFor(workplace, ctx.basis);
  const leftoverPreview = wBasis === 'academic' ? academicPreview?.leftoverMinutes ?? 0 : 0;
  const academicHoursNow =
    academicPreview == null
      ? 0
      : f.leftoverChoice === 'carry'
        ? academicPreview.wholeHours
        : academicPreview.decimalHours;

  const draft = {
    date: f.date,
    start: f.start,
    end: f.end,
    breaks: f.breaks.map((row) => ({ id: row.id, minutes: Math.max(0, parseNum(row.minutes) || 0) })),
    carriedMinutes: f.leftoverChoice === 'carry' ? leftoverPreview : 0,
  };
  const pay = workplace && netPreview != null ? reportPay(draft, workplace, ctx.basis) : null;
  const hoursForPay = netPreview != null ? payableHours(draft, wBasis) : 0;
  // נסיעות: רק אם עוד אין דיווח לאותו מקום באותו יום (travelCostForDay — רק בתחבורה ציבורית).
  const travelCounted =
    workplace != null &&
    ctx.existing.some((r) => r.workplaceId === workplace.id && r.date === f.date && r.id !== ctx.editingId);
  const travel = workplace && !travelCounted ? travelCostForDay(workplace, f.date) : 0;
  return {
    startMin,
    endMin,
    rangeMin,
    netPreview,
    academicPreview,
    wBasis,
    leftoverPreview,
    academicHoursNow,
    draft,
    pay,
    hoursForPay,
    travelCounted,
    travel,
  };
}

/**
 * הדיווח שנשמר, מטופס תקין (אחרי validateReportForm).
 * @returns הדיווח, וכמה דקות עוברות למונה המצטבר
 */
export function buildReportDraft(
  f: ReportFormFields & { note: string; leftoverChoice: LeftoverChoice },
  ctx: {
    workplaces: readonly Workplace[];
    basis: PayBasis;
    /** הקורס שנבחר — נשמר רק אם הדיווח עדיין שייך למקום העבודה שלו */
    course: Pick<Course, 'id' | 'workplaceId'> | null;
    extraKind: ExtraSessionKind | null;
  },
): { draft: WorkReportDraft; carried: number } {
  const id = f.workplaceId as string;
  const net = Math.max(0, (parseTime(f.end) as number) - (parseTime(f.start) as number) - sumBreaks(f.breaks));
  const leftover = leftoverMinutesFor(net, ctx.workplaces.find((w) => w.id === id), ctx.basis);
  const carried = f.leftoverChoice === 'carry' ? leftover : 0;
  const ownCourse = ctx.course && ctx.course.workplaceId === id ? ctx.course : null;
  const draft: WorkReportDraft = {
    workplaceId: id,
    date: f.date.trim(),
    start: f.start.trim(),
    end: f.end.trim(),
    breaks: f.breaks
      .map((row) => ({ id: row.id, minutes: parseNum(row.minutes) }))
      .filter((b) => b.minutes > 0),
    carriedMinutes: carried,
    ...(f.note.trim() ? { note: f.note.trim() } : {}),
    ...(ownCourse ? { courseId: ownCourse.id } : {}),
    ...(ownCourse && ctx.extraKind ? { extraKind: ctx.extraKind } : {}),
  };
  return { draft, carried };
}
