import { describe, expect, it } from 'vitest';
import { dateFromIso, isoDate, parseIsoDate } from '../lib/dates';

describe('dates', () => {
  it('מעצב לפי השעון המקומי, עם אפסים מובילים', () => {
    expect(isoDate(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(isoDate(new Date(2026, 11, 31, 23, 59))).toBe('2026-12-31');
  });
  it('הלוך־חזור בלי הזזת יום', () => {
    for (const iso of ['2026-03-27', '2026-10-25', '2028-02-29']) expect(isoDate(dateFromIso(iso))).toBe(iso);
  });
  it('parseIsoDate דוחה קלט לא תקין', () => {
    expect(parseIsoDate('2026-1-5')).toBeNull();
    expect(parseIsoDate('')).toBeNull();
    expect(parseIsoDate('2026-11-16')?.getDate()).toBe(16);
  });
});
