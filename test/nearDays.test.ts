import { describe, expect, it } from 'vitest';
import { nearDates, nearDay, shiftISO } from '../lib/nearDays';

describe('nearDays', () => {
  it('shifts across month and year boundaries', () => {
    expect(shiftISO('2026-12-01', -2)).toBe('2026-11-29');
    expect(shiftISO('2026-12-31', 1)).toBe('2027-01-01');
  });
  it('lists day-before-yesterday … day-after-tomorrow', () => {
    expect(nearDates('2026-11-23')).toEqual(['2026-11-21', '2026-11-22', '2026-11-23', '2026-11-24', '2026-11-25']);
  });
  it('labels only the five near days', () => {
    expect(nearDay('2026-11-21', '2026-11-23')?.label).toBe('שלשום');
    expect(nearDay('2026-11-22', '2026-11-23')?.label).toBe('אתמול');
    expect(nearDay('2026-11-23', '2026-11-23')?.key).toBe('today');
    expect(nearDay('2026-11-25', '2026-11-23')?.label).toBe('מחרתיים');
    expect(nearDay('2026-11-20', '2026-11-23')).toBeNull();
    expect(nearDay('2026-11-26', '2026-11-23')).toBeNull();
  });
});
