import { savedLabel } from '../lib/reports';
import { describe, expect, it } from 'vitest';
import { changesMessage, editIntegrityError, reportChanges, sameSessionReports } from '../lib/reportEdit';
import type { WorkReport, WorkReportDraft } from '../lib/reports';

// המקרה מ־22–23.11.2026: דיווח מהמייל (יום ראשון 09:00–15:55) נשמר בעריכה על יום שני ובשעות של קורס אחר.
const mailReport: WorkReport = {
  id: 'wr_1',
  workplaceId: 'w1',
  date: '2026-11-22',
  start: '09:00',
  end: '15:55',
  breaks: [],
  carriedMinutes: 10,
  note: 'תכנון אדריכלי',
  courseId: 'c-sun',
  viaEmail: { text: '09:00-15.55', receivedAt: 1 },
  createdAt: 1,
};
const { id: _id, createdAt: _c, ...asDraft } = mailReport;
const draft = (over: Partial<WorkReportDraft> = {}): WorkReportDraft => ({ ...asDraft, ...over });
const names = {
  workplace: (id: string) => ({ w1: 'הסמינר הישן', w2: 'מכללה' })[id] ?? '',
  course: (id: string | undefined) => (id ? { 'c-sun': 'תכנון (א׳)', 'c-mon': 'תכנון (ב׳)' }[id] ?? '' : ''),
};

describe('בקרה על עדכון דיווח קיים', () => {
  it('בלי שינוי — אין שינויים', () => {
    expect(reportChanges(mailReport, draft(), names)).toEqual([]);
  });

  it('שינוי שעות בלבד — לא קריטי', () => {
    const ch = reportChanges(mailReport, draft({ end: '16:00' }), names);
    expect(ch).toHaveLength(1);
    expect(ch[0]).toMatchObject({ field: 'times', from: '\u206609:00–15:55\u2069', to: '\u206609:00–16:00\u2069', critical: false });
  });

  it('המקרה מהתקלה: תאריך, קורס ושעות — מסומנים, והתאריך קריטי', () => {
    const after = draft({ date: '2026-11-23', courseId: 'c-mon', start: '10:45', end: '16:10' });
    const ch = reportChanges(mailReport, after, names);
    expect(ch.map((c) => c.field)).toEqual(['date', 'course', 'times']);
    expect(ch.find((c) => c.field === 'date')).toMatchObject({ from: '22/11/2026', to: '23/11/2026', critical: true });
    expect(changesMessage(ch)).toContain('שימו לב');
  });

  it('תאריך שהשתנה בלי שהמשתמש בחר — חסום', () => {
    const after = draft({ date: '2026-11-23' });
    expect(editIntegrityError(mailReport, after, { dateChanged: false, workplaceChanged: false })).toMatch(/23\/11\/2026/);
    expect(editIntegrityError(mailReport, after, { dateChanged: true, workplaceChanged: false })).toBeNull();
  });

  it('מקום עבודה שהשתנה בלי שהמשתמש בחר — חסום', () => {
    const after = draft({ workplaceId: 'w2' });
    expect(editIntegrityError(mailReport, after, { dateChanged: false, workplaceChanged: false })).not.toBeNull();
    expect(editIntegrityError(mailReport, after, { dateChanged: false, workplaceChanged: true })).toBeNull();
  });
});

describe('כפילות דיווחים על אותו מפגש', () => {
  it('אותו קורס ותאריך — כפילות; מפגש נוסף / תאריך אחר — לא', () => {
    const a = { id: 'a', courseId: 'c', date: '2026-11-23' };
    const list = [
      a,
      { id: 'b', courseId: 'c', date: '2026-11-23' },
      { id: 'x', courseId: 'c', date: '2026-11-23', extraKind: 'makeup' as const },
      { id: 'y', courseId: 'c', date: '2026-11-22' },
    ];
    expect(sameSessionReports(a, list).map((r) => r.id)).toEqual(['b']);
    expect(sameSessionReports({ id: 'n', courseId: 'c', date: '2026-11-21' }, list)).toEqual([]);
  });
});

describe('savedLabel — מתי הדיווח נשמר', () => {
  const now = new Date(2026, 10, 24, 9, 0);
  const at = (h: number, m: number, d = 24, y = 2026) => new Date(y, 10, d, h, m).getTime();
  it('נשמר · עודכן · מהמייל', () => {
    expect(savedLabel({ createdAt: at(8, 5) }, now)).toBe('נשמר 24.11 · 08:05');
    expect(savedLabel({ createdAt: at(8, 5), updatedAt: at(8, 40) }, now)).toBe('עודכן 24.11 · 08:40');
    expect(savedLabel({ createdAt: at(8, 5), viaEmail: { text: 'x', receivedAt: at(7, 1, 23) } }, now)).toBe('התקבל מהמייל 23.11 · 07:01');
  });
  it('שנה אחרת — עם השנה', () => {
    expect(savedLabel({ createdAt: at(8, 5, 3, 2025) }, now)).toBe('נשמר 3.11.2025 · 08:05');
  });
});
