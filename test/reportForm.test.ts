import { describe, expect, it } from 'vitest';
import { buildReportDraft, hasErrors, reportPreview, validateReportForm, type BreakRow } from '../lib/reportForm';
import { END_BEFORE_START, endNotAfterStart } from '../lib/time';
import type { Workplace } from '../lib/workplaces';

const wp = (over: Partial<Workplace> = {}): Workplace =>
  ({
    id: 'w1',
    name: 'מכללה',
    rate: 120,
    paymentType: 'hourly',
    payday: 1,
    arrivalMode: 'public_transport',
    travelCostPerDirection: 10,
    tripsPerDay: 2,
    payBasis: 'academic',
    ...over,
  }) as Workplace;
const br = (...m: string[]): BreakRow[] => m.map((minutes, i) => ({ id: String(i), minutes }));
const form = { workplaceId: 'w1', date: '2026-11-17', start: '09:00', end: '12:15', breaks: br('15') };

describe('אימות טופס הדיווח', () => {
  it('טופס תקין — בלי שגיאות', () => {
    expect(hasErrors(validateReportForm(form))).toBe(false);
  });
  it('חסר מקום עבודה, תאריך ושעות לא תקינים', () => {
    const e = validateReportForm({ workplaceId: null, date: '17/11', start: '9', end: '', breaks: [] });
    expect(Object.keys(e).sort()).toEqual(['date', 'end', 'start', 'workplace']);
  });
  it('סיום לפני התחלה', () => {
    expect(validateReportForm({ ...form, start: '12:00', end: '09:00' }).end).toMatch(/אחרי ההתחלה/);
  });
  it('הפסקה לא שלמה, והפסקות ארוכות מהטווח', () => {
    expect(validateReportForm({ ...form, breaks: br('7.5') }).breaks).toMatch(/מספר דקות שלם/);
    expect(validateReportForm({ ...form, breaks: br('100', '95') }).breaks).toMatch(/ארוך או שווה/);
  });
});

describe('תצוגה מקדימה', () => {
  const ctx = { workplaces: [wp()], basis: 'academic' as const, existing: [] };

  it('נטו, שעות אקדמיות ודקות עודפות למונה', () => {
    // 09:00–12:15 פחות 15 = 180 דק׳ = 4 שעות אקדמיות בדיוק
    const p = reportPreview({ ...form, leftoverChoice: 'carry' }, ctx);
    expect(p.netPreview).toBe(180);
    expect(p.academicHoursNow).toBe(4);
    expect(p.leftoverPreview).toBe(0);
    // 200 דק׳: 4 שעות ו־20 דק׳ עודפות
    const q = reportPreview({ ...form, end: '12:35', leftoverChoice: 'carry' }, ctx);
    expect(q.leftoverPreview).toBe(20);
    expect(q.academicHoursNow).toBe(4);
    expect(q.pay).toBe(480); // העודף במונה — לא בשכר
    const inc = reportPreview({ ...form, end: '12:35', leftoverChoice: 'include' }, ctx);
    expect(inc.academicHoursNow).toBeCloseTo(200 / 45);
  });
  it('מקום שמשלם לפי שעה רגילה — אין דקות עודפות', () => {
    const p = reportPreview(
      { ...form, end: '12:35', leftoverChoice: 'carry' },
      { ...ctx, workplaces: [wp({ payBasis: 'regular' })] },
    );
    expect(p.leftoverPreview).toBe(0);
    expect(p.pay).toBeCloseTo((200 / 60) * 120);
  });
  it('נסיעות — רק בדיווח הראשון של המקום באותו יום (בעריכה הדיווח עצמו לא נחשב)', () => {
    expect(reportPreview({ ...form, leftoverChoice: 'carry' }, ctx).travel).toBe(20);
    const other = { id: 'r1', workplaceId: 'w1', date: form.date } as never;
    const second = reportPreview({ ...form, leftoverChoice: 'carry' }, { ...ctx, existing: [other] });
    expect(second.travelCounted).toBe(true);
    expect(second.travel).toBe(0);
    const editingSame = reportPreview({ ...form, leftoverChoice: 'carry' }, { ...ctx, existing: [other], editingId: 'r1' });
    expect(editingSame.travel).toBe(20);
  });
  it('שעות לא תקינות — אין נטו ואין שכר', () => {
    const p = reportPreview({ ...form, end: '', leftoverChoice: 'carry' }, ctx);
    expect(p.netPreview).toBeNull();
    expect(p.pay).toBeNull();
  });
});

describe('הדיווח שנשמר', () => {
  const ctx = { workplaces: [wp()], basis: 'academic' as const, extraKind: null };
  it('שעות מנוקות, הפסקות ריקות יורדות, הערה ודקות למונה', () => {
    const { draft, carried } = buildReportDraft(
      { ...form, end: ' 12:35 ', breaks: br('15', '0', ''), note: '  הרצאה 3 ', leftoverChoice: 'carry' },
      { ...ctx, course: null },
    );
    expect(carried).toBe(20);
    expect(draft).toMatchObject({ end: '12:35', carriedMinutes: 20, note: 'הרצאה 3' });
    expect(draft.breaks).toEqual([{ id: '0', minutes: 15 }]);
    expect('courseId' in draft).toBe(false);
  });
  it('שיוך לקורס רק כשהקורס שייך למקום העבודה', () => {
    const own = buildReportDraft({ ...form, note: '', leftoverChoice: 'include' }, { ...ctx, course: { id: 'c1', workplaceId: 'w1' }, extraKind: 'makeup' as never });
    expect(own.draft.courseId).toBe('c1');
    expect(own.draft.extraKind).toBe('makeup');
    expect(own.carried).toBe(0);
    const foreign = buildReportDraft({ ...form, note: '', leftoverChoice: 'include' }, { ...ctx, course: { id: 'c2', workplaceId: 'w9' } });
    expect(foreign.draft.courseId).toBeUndefined();
  });
});

describe('שעת סיום אחרי ההתחלה', () => {
  it('endNotAfterStart — רק כששתי השעות מלאות', () => {
    expect(endNotAfterStart('10:00', '09:59')).toBe(true);
    expect(endNotAfterStart('10:00', '10:00')).toBe(true);
    expect(endNotAfterStart('10:00', '10:01')).toBe(false);
    expect(endNotAfterStart('10:00', '')).toBe(false);
  });

  it('האימות חוסם סיום לפני ההתחלה', () => {
    const e = validateReportForm({ workplaceId: 'w', date: '2026-11-18', start: '12:00', end: '11:00', breaks: [] });
    expect(e.end).toBe(END_BEFORE_START);
  });
});
