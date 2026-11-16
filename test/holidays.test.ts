import { describe, expect, it } from 'vitest';
import { restDayName, restDays } from '../lib/holidays';

describe('חגים וימים מיוחדים', () => {
  it('חגים — לפי הלוח העברי', () => {
    expect(restDayName('2026-09-12')).toBe('ראש השנה');
    expect(restDayName('2026-09-21')).toBe('יום הכיפורים');
    expect(restDayName('2026-04-02')).toBe('פסח');
    expect(restDayName('2026-11-16')).toBeNull();
  });
  it('יום העצמאות מוקדם / נדחה לפי היום בשבוע', () => {
    expect(restDayName('2026-04-22')).toBe('יום העצמאות'); // ה׳ באייר ביום רביעי
    expect(restDayName('2028-05-02')).toBe('יום העצמאות'); // ה׳ באייר בשני → שלישי
    expect(restDayName('2028-05-01')).toBeNull();
  });
  it('תשעה באב נדחה כשחל בשבת', () => {
    expect(restDays('2028-08-01').map((r) => r.kind)).toContain('tishaBav');
    expect(restDays('2028-07-31').map((r) => r.kind)).not.toContain('tishaBav');
  });
  it('יום יכול להיות גם ערב חג וגם חול המועד', () => {
    expect(restDays('2026-04-07').map((r) => r.kind).sort()).toEqual(['cholHamoed', 'eve']);
  });
});
