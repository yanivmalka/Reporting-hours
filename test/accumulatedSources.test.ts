import { describe, expect, it } from 'vitest';
import { accumulatedSources } from '../lib/accumulatedSources';

const rep = (id: string, date: string, carried: number, workplaceId = 'w1') => ({
  id,
  workplaceId,
  date,
  start: '09:00',
  end: '12:00',
  carriedMinutes: carried,
});

describe('accumulatedSources', () => {
  const reports = [
    rep('a', '2026-10-01', 20),
    rep('b', '2026-10-08', 30),
    rep('c', '2026-10-15', 25),
    rep('d', '2026-10-15', 0),
    rep('x', '2026-10-20', 40, 'w2'),
  ];

  it('הדקות שבמונה משויכות לדיווחים האחרונים, והוותיק מתוכם — בחלקו', () => {
    const s = accumulatedSources(reports, 'w1', { minutes: 30, redeemedHours: 0, redeemedMinutes: 45 });
    expect(s.current.map((x) => [x.reportId, x.inCounter])).toEqual([
      ['c', 25],
      ['b', 5],
    ]);
    expect(s.past.map((x) => x.reportId)).toEqual(['a']);
    expect(s.totalCarried).toBe(75);
    expect(s.totalRedeemed).toBe(45);
    expect(s.unexplained).toBe(0);
  });

  it('רק מקום העבודה המבוקש, ורק דיווחים שהעבירו דקות', () => {
    const s = accumulatedSources(reports, 'w2', { minutes: 40, redeemedHours: 0 });
    expect(s.current.map((x) => x.reportId)).toEqual(['x']);
  });

  it('אחרי איפוס — הכול בעבר, וההפרש מדווח', () => {
    const s = accumulatedSources(reports, 'w1', { minutes: 0, redeemedHours: 0 });
    expect(s.current).toEqual([]);
    expect(s.past).toHaveLength(3);
    expect(s.unexplained).toBe(-75);
  });
});
