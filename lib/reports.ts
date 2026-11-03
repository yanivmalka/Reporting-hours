import { toAcademic, type AcademicBreakdown } from './academic';
import { readJSON, writeJSON } from './storage';
import { parseTime } from './time';

/**
 * מודל הדיווח על יום עבודה (סעיף 4 ב־WISHLIST) והפעולות לשמירתו.
 * נשמרים הנתונים הגולמיים בלבד — טווח השעות, ההפסקות, וכמה דקות עודפות
 * הועברו למונה "דקות עבודה מצטברות" — וזמן העבודה נטו והשעות האקדמיות
 * מחושבים מהם בכל פעם. האחסון מקומי בלבד, תחת מפתח יחיד שמכיל את כל הרשימה.
 */

/** הפסקה בודדת ביום עבודה — משך בדקות. */
export type BreakEntry = {
  id: string;
  minutes: number;
};

/** סוגי מפגש נוסף לקורס. */
export type ExtraSessionKind = 'makeup' | 'submission' | 'midterm' | 'other';

export const EXTRA_SESSION_LABELS: Record<ExtraSessionKind, string> = {
  makeup: 'שיעור השלמה',
  submission: 'הגשה',
  midterm: 'הגשת ביניים',
  other: 'אחר',
};

export type WorkReport = {
  id: string;
  /** מזהה מקום העבודה שאליו שייך הדיווח */
  workplaceId: string;
  /** תאריך יום העבודה, מחרוזת ISO "YYYY-MM-DD" */
  date: string;
  /** שעת התחלה "HH:MM" */
  start: string;
  /** שעת סיום "HH:MM" */
  end: string;
  breaks: BreakEntry[];
  /**
   * דקות עודפות מן הדיווח שהועברו למונה "דקות עבודה מצטברות" במקום
   * להיכלל בשעות האקדמיות של הדיווח (0–44). 0 כשהמשתמש בחר לכלול את
   * הדקות העודפות בדיווח עצמו.
   */
  carriedMinutes: number;
  /** הערה חופשית — נושא ההרצאה / הגשה / קבוצה (רשות) */
  note?: string;
  /**
   * הקורס שהדיווח שייך אליו (כשדווח דרך בחירת קורס). דיווחים ישנים בלי
   * השדה משויכים לפי שם הקורס או חפיפה בשעות (lib/courses.ts).
   */
  courseId?: string;
  /**
   * מפגש נוסף לקורס, מחוץ למועד הקבוע (שיעור השלמה, הגשה…). נשמר רק יחד עם
   * `courseId`. נספר בקורס ובדוח השכר, ואינו "מכסה" מפגש מתוכנן.
   */
  extraKind?: ExtraSessionKind;
  /** דיווח שנוצר כנתוני הדגמה (lib/demo.ts) — נמחק ב"איפוס נתוני הדגמה" */
  demo?: boolean;
  /** חותמת יצירה (מילישניות) — לסידור דיווחים באותו תאריך */
  createdAt: number;
};

/** נתוני טופס לפני שמירה — בלי שדות שנוצרים אוטומטית. */
export type WorkReportDraft = Omit<WorkReport, 'id' | 'createdAt' | 'demo'>;

const STORAGE_KEY = 'reporting-hours/reports/v1';

export async function loadReports(): Promise<WorkReport[]> {
  const list = await readJSON<WorkReport[]>(STORAGE_KEY, []);
  // דיווחים שנשמרו לפני שלב 3 חסרים את השדה — משלימים אותו כ־0.
  return list.map((report) => ({
    ...report,
    carriedMinutes: report.carriedMinutes ?? 0,
  }));
}

export function saveReports(list: WorkReport[]): Promise<void> {
  return writeJSON(STORAGE_KEY, list);
}

function makeId(): string {
  return `wr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function makeBreakId(): string {
  return `br_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** מוסיף דיווח חדש, שומר את הרשימה המעודכנת ומחזיר אותה. */
export async function addReport(draft: WorkReportDraft): Promise<WorkReport[]> {
  const list = await loadReports();
  const next = [...list, { ...draft, id: makeId(), createdAt: Date.now() }];
  await saveReports(next);
  return next;
}

export async function deleteReport(id: string): Promise<WorkReport[]> {
  const list = await loadReports();
  const next = list.filter((r) => r.id !== id);
  await saveReports(next);
  return next;
}

/** סך דקות ההפסקות בדיווח. */
export function totalBreakMinutes(breaks: BreakEntry[]): number {
  return breaks.reduce((sum, b) => sum + (Number.isFinite(b.minutes) ? b.minutes : 0), 0);
}

/**
 * זמן עבודה נטו בדקות = (שעת סיום − שעת התחלה) − סך ההפסקות.
 * מחזיר null אם השעות חסרות / לא תקינות או שהסיום אינו אחרי ההתחלה.
 */
export function netMinutes(input: Pick<WorkReport, 'start' | 'end' | 'breaks'>): number | null {
  const start = parseTime(input.start);
  const end = parseTime(input.end);
  if (start == null || end == null || end <= start) return null;
  return Math.max(0, end - start - totalBreakMinutes(input.breaks));
}

/**
 * פירוק הדיווח לשעות אקדמיות. הדקות שהועברו למונה המצטבר
 * (`carriedMinutes`) מנוכות מזמן העבודה נטו לפני ההמרה, כדי שלא ייספרו
 * פעמיים. מחזיר null כשזמן העבודה נטו אינו ניתן לחישוב.
 */
export function academicOf(
  report: Pick<WorkReport, 'start' | 'end' | 'breaks' | 'carriedMinutes'>,
): AcademicBreakdown | null {
  const net = netMinutes(report);
  if (net == null) return null;
  return toAcademic(Math.max(0, net - (report.carriedMinutes ?? 0)));
}

/** עדכון דיווח קיים. מחזיר את הרשימה המעודכנת. */
export async function updateReport(id: string, draft: WorkReportDraft): Promise<WorkReport[]> {
  const list = await loadReports();
  const next = list.map((r) => {
    if (r.id !== id) return r;
    const { note: _n, courseId: _c, extraKind: _k, ...rest } = r;
    // note, courseId ו־extraKind נמחקים כשהוסרו בטופס — לכן בונים מחדש בלי הישנים.
    return { ...rest, ...draft, id: r.id, createdAt: r.createdAt };
  });
  await saveReports(next);
  return next;
}
