import { describe, expect, it } from 'vitest';
import { canceledOn, coursesOn, occurrences, plannedMinutes, type Course } from '../lib/courses';
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

describe('מפגשים שלא מתקיימים בתאריך (שלב התאריך באשף)', () => {
  it('מפגש שהועבר או בוטל מוצג עם הסיבה; נמחק מהתכנון — לא', () => {
    const idx = cancelIndex(
      [
        { courseId: 'c1', date: '2026-10-04', status: 'moved', movedTo: '2026-10-06', at: 1 },
        { courseId: 'c1', date: '2026-10-11', status: 'canceled', reason: 'מחלה', at: 1 },
        { courseId: 'c1', date: '2026-10-18', status: 'removed', at: 1 },
      ],
      { yomTov: false, eve: false, cholHamoed: false, tishaBav: false },
    );
    expect(coursesOn([course], '2026-10-04', undefined, idx)).toHaveLength(0);
    expect(canceledOn([course], '2026-10-04', idx)[0]?.cancel).toMatchObject({ kind: 'moved', movedTo: '2026-10-06' });
    expect(canceledOn([course], '2026-10-11', idx)[0]?.cancel.reason).toBe('מחלה');
    expect(canceledOn([course], '2026-10-18', idx)).toHaveLength(0);
    expect(canceledOn([course], '2026-10-25', idx)).toHaveLength(0);
  });
});

describe('קורס בכמה ימים בשבוע', async () => {
  const { applyCourseGroup, courseSiblings, sessionTimes } = await import('../lib/courses');
  let n = 0;
  const ids = () => `x${++n}`;
  it('ימים נוספים נשמרים כקורסים אחים עם שעות משלהם', () => {
    const list = applyCourseGroup(
      [],
      { workplaceId: 'w1', name: 'סדנה', weekday: 0, start: '09:00', end: '12:00', breakMinutes: 0, from: '2026-11-01', to: '2026-12-31' },
      [{ weekday: 2, start: '15:00', end: '17:00' }],
      ids,
    );
    expect(list).toHaveLength(2);
    expect(list[1]).toMatchObject({ weekday: 2, start: '15:00', name: 'סדנה', groupId: list[0].id });
    expect(courseSiblings(list[0], list).map((c) => c.weekday)).toEqual([2]);
    // שינוי שם ותקופה בקורס — עובר גם לאח
    const next = applyCourseGroup(list, { ...list[0], name: 'סדנה ב׳', to: '2027-01-31' }, [], ids);
    expect(next[1]).toMatchObject({ name: 'סדנה ב׳', to: '2027-01-31', start: '15:00' });
  });
  it('מפגש נוסף עם שעות משלו', () => {
    const c = { ...course, extraInfo: { '2026-10-07': { name: 'סיור', start: '10:00', end: '11:30' } } };
    expect(sessionTimes(c, '2026-10-07')).toEqual({ start: '10:00', end: '11:30', breakMinutes: 0 });
    expect(sessionTimes(c, '2026-10-04')).toEqual({ start: '09:00', end: '12:00', breakMinutes: 0 });
  });
});
