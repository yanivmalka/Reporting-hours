import { readJSON, writeJSON } from './storage';
import { parseTime } from './time';

/**
 * מודל הדיווח על יום עבודה (סעיף 4 ב־WISHLIST, שלבים 1–4) והפעולות לשמירתו.
 * בשלב זה נשמרים הנתונים הגולמיים בלבד — טווח השעות וההפסקות — וזמן העבודה
 * נטו מחושב מהם בכל פעם. ההמרה לשעות אקדמיות ומונה הדקות יתווספו בשלב 3.
 * האחסון מקומי בלבד, תחת מפתח יחיד שמכיל את כל הרשימה.
 */

/** הפסקה בודדת ביום עבודה — משך בדקות. */
export type BreakEntry = {
  id: string;
  minutes: number;
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
  /** חותמת יצירה (מילישניות) — לסידור דיווחים באותו תאריך */
  createdAt: number;
};

/** נתוני טופס לפני שמירה — בלי שדות שנוצרים אוטומטית. */
export type WorkReportDraft = Omit<WorkReport, 'id' | 'createdAt'>;

const STORAGE_KEY = 'reporting-hours/reports/v1';

export function loadReports(): Promise<WorkReport[]> {
  return readJSON<WorkReport[]>(STORAGE_KEY, []);
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
