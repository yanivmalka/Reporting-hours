/**
 * שחזור וביטול מתוך יומן הפעולות (lib/activityLog.ts).
 *
 * - נוצר / התקבל מהמייל / שוחזר → "ביטול": הדיווח נמחק — רק אם הוא עדיין בדיוק כפי שנרשם.
 * - עודכן / עדכון בוטל → "החזרת הגרסה הקודמת" — רק אם הדיווח השמור עדיין בדיוק הגרסה שאחרי.
 * - נמחק / נזרק בסנכרון → "שחזור": הדיווח חוזר — רק אם אינו קיים כעת.
 * כך פעולה מהיומן לעולם לא דורסת שינוי מאוחר יותר. דיווח בתקופה שהדוח לשכר שלה נשלח / שולם — נעול.
 * מונה הדקות המצטברות מתעדכן כמו במחיקה / עריכה רגילה (חוץ מגרסה שנזרקה בסנכרון — שם המונה כבר מוזג).
 */
import { ACTION_LABELS, sameReport, type LogEntry } from './activityLog';
import { loadReports, saveReports, type WorkReport } from './reports';
import { adjustAccumulated } from './accumulated';
import { isLocked, loadPayrollStatus, statusKey } from './payroll';
import { currentPayPeriod } from './dashboard';
import { loadWorkplaces } from './workplaces';
import { dateFromIso } from './dates';

export type UndoKind = 'remove' | 'revert' | 'restore';

export type UndoPlan =
  | { ok: true; kind: UndoKind; label: string; next: WorkReport[]; touched: WorkReport[]; counter: { workplaceId: string; delta: number }[] }
  | { ok: false; reason: string };

/** מה פעולת הביטול של הרשומה תעשה מול הדיווחים הנוכחיים (טהור). */
export function planUndo(entry: LogEntry, current: readonly WorkReport[], log: readonly LogEntry[] = []): UndoPlan {
  if (log.some((e) => e.undoOf === entry.id)) return { ok: false, reason: 'הפעולה כבר בוטלה / שוחזרה.' };
  const now = current.find((r) => r.id === entry.entityId);
  const carried = (r?: WorkReport) => r?.carriedMinutes ?? 0;
  switch (entry.action) {
    case 'create':
    case 'mail':
    case 'restore': {
      if (!entry.after) return { ok: false, reason: 'אין פרטים לרשומה.' };
      if (!now) return { ok: false, reason: 'הדיווח כבר לא קיים.' };
      if (!sameReport(now, entry.after)) return { ok: false, reason: 'הדיווח השתנה מאז — בטלו קודם את השינויים המאוחרים.' };
      return {
        ok: true,
        kind: 'remove',
        label: 'ביטול — מחיקת הדיווח',
        next: current.filter((r) => r.id !== entry.entityId),
        touched: [now],
        counter: carried(now) ? [{ workplaceId: now.workplaceId, delta: -carried(now) }] : [],
      };
    }
    case 'update':
    case 'undo': {
      if (!entry.before || !entry.after) {
        // ביטול של שחזור / יצירה נרשם כמחיקה — אין גרסה להחזיר.
        return { ok: false, reason: 'אין גרסה קודמת להחזיר.' };
      }
      if (!now) return { ok: false, reason: 'הדיווח כבר לא קיים.' };
      if (!sameReport(now, entry.after)) return { ok: false, reason: 'הדיווח השתנה מאז — בטלו קודם את השינויים המאוחרים.' };
      const back = entry.before;
      const counter = [
        { workplaceId: now.workplaceId, delta: -carried(now) },
        { workplaceId: back.workplaceId, delta: carried(back) },
      ].filter((c) => c.delta !== 0);
      return {
        ok: true,
        kind: 'revert',
        label: 'החזרת הגרסה הקודמת',
        next: current.map((r) => (r.id === entry.entityId ? back : r)),
        touched: [now, back],
        counter,
      };
    }
    case 'delete':
    case 'sync-dropped': {
      if (!entry.before) return { ok: false, reason: 'אין פרטים לרשומה.' };
      if (now) return { ok: false, reason: 'דיווח עם אותו מזהה כבר קיים.' };
      const back = entry.before;
      return {
        ok: true,
        kind: 'restore',
        label: 'שחזור הדיווח',
        next: [...current, back],
        touched: [back],
        counter: entry.action === 'delete' && carried(back) ? [{ workplaceId: back.workplaceId, delta: carried(back) }] : [],
      };
    }
  }
}

/** הכותרת לכפתור הביטול של רשומה (בלי לבדוק אם אפשר). */
export function undoLabel(entry: LogEntry): string | null {
  if (entry.action === 'create' || entry.action === 'mail' || entry.action === 'restore') return 'ביטול (מחיקת הדיווח)';
  if (entry.action === 'update' || (entry.action === 'undo' && entry.before && entry.after)) return 'החזרת הגרסה הקודמת';
  if (entry.action === 'delete' || entry.action === 'sync-dropped') return 'שחזור הדיווח';
  return null;
}

/** ביצוע: בדיקה מול הנתונים העדכניים, נעילת שכר, שמירה ורישום ביומן. מחזיר הודעת שגיאה או null. */
export async function applyUndo(entry: LogEntry, log: readonly LogEntry[]): Promise<string | null> {
  const current = await loadReports();
  const plan = planUndo(entry, current, log);
  if (!plan.ok) return plan.reason;
  const [workplaces, status] = await Promise.all([loadWorkplaces(), loadPayrollStatus()]);
  for (const r of plan.touched) {
    const w = workplaces.find((x) => x.id === r.workplaceId);
    if (!w) continue;
    const p = currentPayPeriod(w.payday, dateFromIso(r.date));
    if (isLocked(status[statusKey(w.id, p.start)])) {
      return `הדוח לשכר של ${w.name} לתקופה של ${r.date.split('-').reverse().join('/')} כבר נשלח — הדיווח נעול.`;
    }
  }
  await saveReports(plan.next, { action: plan.kind === 'restore' ? 'restore' : 'undo', undoOf: entry.id });
  for (const c of plan.counter) await adjustAccumulated(c.workplaceId, c.delta);
  return null;
}

export { ACTION_LABELS };
