import { describe, expect, it } from 'vitest';
import { coursesOn, occurrences, plannedMinutes, type Course } from '../lib/courses';
import { cancelIndex, DEFAULT_HOLIDAY_SETTINGS } from '../lib/sessions';

const course: Course = {
  id: 'c1',
  workplaceId: 'w1',
  name: 'קורס',
  weekday: 0, // ראשון
  start: '09:00',
  end: '12:00',
  breakMinutes: 0,
  from: '2026-09-01',
  to: '2026-10-31',
};
const none = cancelIndex([], { yomTov: false, eve: false, cholHamoed: false, tishaBav: false });

describe('מפגשי קורס', () => {
  it('כל ימי ראשון בתקופה', () => {
    expect(occurrences(course, '2026-09-01', '2026-10-31', none)).toHaveLength(8);
  });
  it('חג (ראש השנה, 13.9) מבוטל אוטומטית ויורד מהפוטנציאל', () => {
    const holidays = cancelIndex([], DEFAULT_HOLIDAY_SETTINGS);
    expect(occurrences(course, '2026-09-01', '2026-10-31', holidays)).not.toContain('2026-09-13');
    expect(coursesOn([course], '2026-09-13', undefined, holidays)).toHaveLength(0);
    expect(plannedMinutes([course], 'w1', '2026-09-01', '2026-10-31', holidays)).toBe(
      plannedMinutes([course], 'w1', '2026-09-01', '2026-10-31', none) - 180,
    );
  });
  it('ביטול ידני עם סיבה; "המפגש התקיים" גובר על חג', () => {
    const idx = cancelIndex(
      [
        { courseId: 'c1', date: '2026-10-04', status: 'canceled', reason: 'מחלה', at: 1 },
        { courseId: 'c1', date: '2026-09-13', status: 'held', at: 1 },
      ],
      DEFAULT_HOLIDAY_SETTINGS,
    );
    expect(idx('c1', '2026-10-04')?.reason).toBe('מחלה');
    expect(idx('c1', '2026-09-13')).toBeNull();
  });
});
