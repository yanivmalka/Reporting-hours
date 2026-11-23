import { describe, expect, it } from 'vitest';
import { changesMessage, editIntegrityError, reportChanges } from '../lib/reportEdit';
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
    expect(ch[0]).toMatchObject({ field: 'times', from: '09:00–15:55', to: '09:00–16:00', critical: false });
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
