import { describe, expect, it } from 'vitest';
import { droppedOnMerge, mailLogEntries, pruneLog, reportLogEntries, type LogEntry } from '../lib/activityLog';
import { planUndo } from '../lib/activityUndo';
import { merge3 } from '../lib/merge';
import type { WorkReport } from '../lib/reports';

const rep = (over: Partial<WorkReport> = {}): WorkReport => ({
  id: 'wr_1',
  workplaceId: 'w1',
  date: '2026-11-22',
  start: '09:00',
  end: '15:55',
  breaks: [],
  carriedMinutes: 10,
  note: 'תכנון אדריכלי',
  courseId: 'c1',
  createdAt: 1,
  ...over,
});
const ctx = { at: 1000, who: { name: 'Yaniv', email: 'y@x' }, device: 'android · abc' };

describe('יומן פעולות — רישום', () => {
  it('נוצר / עודכן / נמחק, עם הגרסאות לפני ואחרי', () => {
    const a = rep();
    const b = rep({ id: 'wr_2' });
    const a2 = rep({ date: '2026-11-23', start: '10:45', end: '16:10' });
    const c = rep({ id: 'wr_3' });
    const log = reportLogEntries([a, b], [a2, c], ctx);
    const by = Object.fromEntries(log.map((e) => [e.entityId, e]));
    expect(by.wr_1).toMatchObject({ action: 'update', before: a, after: a2, who: ctx.who, device: ctx.device });
    expect(by.wr_2).toMatchObject({ action: 'delete', before: b });
    expect(by.wr_3).toMatchObject({ action: 'create', after: c });
  });
  it('שינוי רק בחותמת המדווח / דיווח הדגמה — לא נרשם', () => {
    const a = rep();
    expect(reportLogEntries([a], [{ ...a, by: { name: 'x', email: 'x' } }], ctx)).toEqual([]);
    expect(reportLogEntries([], [rep({ demo: true })], ctx)).toEqual([]);
  });
  it('דיווח מהמייל — מזהה קבוע (לא מוכפל מכמה מכשירים)', () => {
    const r = rep({ viaEmail: { text: 'כן', receivedAt: 500 } });
    expect(mailLogEntries([r, rep({ id: 'x' })])).toEqual([
      expect.objectContaining({ id: 'mail:wr_1', action: 'mail', at: 500, device: 'server' }),
    ]);
  });
  it('שמירה ל־90 יום, מהחדש לישן', () => {
    const now = 100 * 86_400_000;
    const e = (at: number) => ({ id: String(at), at }) as LogEntry;
    expect(pruneLog([e(now - 91 * 86_400_000), e(now - 1), e(now)], now).map((x) => x.at)).toEqual([now, now - 1]);
  });
});

describe('יומן פעולות — שחזור וביטול', () => {
  const a = rep();
  const a2 = rep({ date: '2026-11-23', start: '10:45', end: '16:10', carriedMinutes: 10 });
  const upd: LogEntry = { id: 'l1', at: 1, action: 'update', entity: 'report', entityId: 'wr_1', before: a, after: a2 };
  it('עדכון — החזרת הגרסה הקודמת, רק כשהשמור זהה לגרסה שאחרי', () => {
    const p = planUndo(upd, [a2]);
    expect(p.ok && p.kind).toBe('revert');
    if (p.ok) expect(p.next).toEqual([a]);
    expect(planUndo(upd, [rep({ id: 'wr_1', end: '17:00' })]).ok).toBe(false);
  });
  it('מחיקה — שחזור, והמונה מקבל בחזרה את הדקות', () => {
    const del: LogEntry = { id: 'l2', at: 1, action: 'delete', entity: 'report', entityId: 'wr_1', before: a };
    const p = planUndo(del, []);
    expect(p.ok && p.next).toEqual([a]);
    expect(p.ok && p.counter).toEqual([{ workplaceId: 'w1', delta: 10 }]);
    expect(planUndo(del, [a]).ok).toBe(false); // כבר קיים
  });
  it('גרסה שנזרקה בסנכרון — שחזור בלי לגעת במונה', () => {
    const drop: LogEntry = { id: 'l3', at: 1, action: 'sync-dropped', entity: 'report', entityId: 'wr_1', before: a2 };
    const p = planUndo(drop, []);
    expect(p.ok && p.counter).toEqual([]);
  });
  it('יצירה — ביטול מוחק; פעולה שכבר בוטלה — לא שוב', () => {
    const cr: LogEntry = { id: 'l4', at: 1, action: 'create', entity: 'report', entityId: 'wr_1', after: a };
    expect(planUndo(cr, [a]).ok && planUndo(cr, [a])).toMatchObject({ kind: 'remove', next: [] });
    const undo: LogEntry = { id: 'l5', at: 2, action: 'undo', entity: 'report', entityId: 'wr_1', before: a, undoOf: 'l4' };
    expect(planUndo(cr, [a], [undo]).ok).toBe(false);
  });
});

describe('סנכרון — מחיקה גוברת בדיווחים', () => {
  const base = [rep()];
  const edited = [rep({ start: '08:00' })];
  it('נמחק במכשיר ושונה בענן — נשאר מחוק (deleteWins), והגרסה ששונתה מזוהה כנזרקה', () => {
    const merged = merge3(base, [], edited, false, true) as WorkReport[];
    expect(merged).toEqual([]);
    expect(droppedOnMerge(base, [], edited, merged)).toEqual(edited);
  });
  it('בלי deleteWins (שאר המפתחות) — ההתנהגות הקודמת: השינוי מחזיר את הרשומה', () => {
    expect(merge3(base, [], edited)).toEqual(edited);
  });
  it('נמחק בצד אחד ולא שונה בשני — אין גרסה נזרקת', () => {
    const merged = merge3(base, [], base, false, true) as WorkReport[];
    expect(droppedOnMerge(base, [], base, merged)).toEqual([]);
  });
});
