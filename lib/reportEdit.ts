import { totalBreakMinutes, type WorkReport, type WorkReportDraft } from './reports';
import { formatISODate } from './time';

/**
 * בקרה על עדכון דיווח קיים (תקלת 22–23.11.2026: עריכה של דיווח שהתקבל במייל נשמרה על
 * תאריך אחר ושעות של קורס אחר, כי האשף נפל בטעינה חוזרת למסלול של דיווח חדש).
 *
 * - `reportChanges` — מה משתנה בדיווח, לדיאלוג האישור לפני שמירה.
 * - `editIntegrityError` — שינוי של תאריך / מקום עבודה שהמשתמש לא ביצע בעצמו = הטופס
 *   התחלף מתחת לידיים. לא שומרים.
 * - הגנה שלישית ב־`updateReport(id, draft, expected)`: הדיווח השמור כבר לא זהה למה שנטען לעריכה — לא דורסים.
 */

export type ReportChange = {
  field: 'date' | 'workplace' | 'course' | 'times' | 'breaks' | 'note';
  label: string;
  from: string;
  to: string;
  /** שינוי זהות הדיווח (תאריך, מקום עבודה, קורס) — מודגש בדיאלוג */
  critical: boolean;
};

type Names = { workplace: (id: string) => string; course: (id: string | undefined) => string };

export function reportChanges(before: WorkReport, after: WorkReportDraft, names: Names): ReportChange[] {
  const out: ReportChange[] = [];
  const add = (field: ReportChange['field'], label: string, from: string, to: string, critical: boolean) => {
    if (from !== to) out.push({ field, label, from: from || '—', to: to || '—', critical });
  };
  add('date', 'תאריך', formatISODate(before.date), formatISODate(after.date), true);
  add('workplace', 'מקום עבודה', names.workplace(before.workplaceId), names.workplace(after.workplaceId), true);
  if ((before.courseId ?? '') !== (after.courseId ?? '')) {
    out.push({
      field: 'course',
      label: 'קורס',
      from: names.course(before.courseId) || '—',
      to: names.course(after.courseId) || '—',
      critical: true,
    });
  }
  add('times', 'שעות', `\u2066${before.start}–${before.end}\u2069`, `\u2066${after.start}–${after.end}\u2069`, false);
  const br = (r: Pick<WorkReport, 'breaks'>) => {
    const m = totalBreakMinutes(r.breaks);
    return m > 0 ? `${m} דק׳` : 'ללא';
  };
  add('breaks', 'הפסקות', br(before), br(after), false);
  add('note', 'הערה', (before.note ?? '').trim(), (after.note ?? '').trim(), false);
  return out;
}

/** טקסט לדיאלוג האישור: שורה לכל שינוי, "לפני ← אחרי". */
export function changesMessage(changes: readonly ReportChange[]): string {
  const lines = changes.map((c) => `${c.critical ? '⚠ ' : ''}${c.label}: ${c.from} ← ${c.to}`);
  if (changes.some((c) => c.critical)) lines.push('', 'שימו לב: הדיווח עובר לתאריך / מקום / קורס אחר.');
  return lines.join('\n');
}

/**
 * שינוי תאריך או מקום עבודה שהמשתמש לא ביצע בעצמו באשף — סימן שהטופס הוחלף
 * (למשל נפל למסלול דיווח חדש). מחזיר הודעת שגיאה, או null כשהכול תקין.
 */
export function editIntegrityError(
  before: Pick<WorkReport, 'date' | 'workplaceId'>,
  after: Pick<WorkReportDraft, 'date' | 'workplaceId'>,
  user: { dateChanged: boolean; workplaceChanged: boolean },
): string | null {
  if (after.date !== before.date && !user.dateChanged) {
    return `התאריך בטופס (${formatISODate(after.date)}) שונה מתאריך הדיווח (${formatISODate(before.date)}) בלי שבחרת בו.`;
  }
  if (after.workplaceId !== before.workplaceId && !user.workplaceChanged) {
    return 'מקום העבודה בטופס שונה ממקום העבודה של הדיווח בלי שבחרת בו.';
  }
  return null;
}

/**
 * דיווחים נוספים על אותו מפגש (אותו קורס ואותו תאריך, לא "מפגש נוסף") — כפילות.
 * במסך הבית מוצג רק אחד מהם, ולכן מחיקה "לא נתפסת" (תקלת 23.11: שלושה דיווחים על אותו מפגש).
 */
export function sameSessionReports<R extends Pick<WorkReport, 'id' | 'courseId' | 'date' | 'extraKind'>>(
  report: Pick<WorkReport, 'id' | 'courseId' | 'date' | 'extraKind'>,
  reports: readonly R[],
): R[] {
  if (!report.courseId || report.extraKind) return [];
  return reports.filter(
    (r) => r.id !== report.id && !r.extraKind && r.courseId === report.courseId && r.date === report.date,
  );
}
