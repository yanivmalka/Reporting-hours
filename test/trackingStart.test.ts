import { afterEach, describe, expect, it } from 'vitest';
import {
  allCourseSessions,
  occurrences,
  plannedMinutes,
  workplacesWithActiveCourse,
  type Course,
} from '../lib/courses';
import { cancelIndex } from '../lib/sessions';
import { setTrackingStart } from '../lib/trackingStart';

const course: Course = {
  id: 'c1',
  workplaceId: 'w1',
  name: 'קורס',
  weekday: 0, // ראשון
  start: '09:00',
  end: '12:00',
  breakMinutes: 0,
  from: '2026-10-01',
  to: '2026-11-30',
};
const none = cancelIndex([], { yomTov: false, eve: false, cholHamoed: false, tishaBav: false });

describe('תאריך תחילת העבודה עם המערכת', () => {
  afterEach(() => setTrackingStart(null));

  it('מפגשים לפני התאריך אינם בתכנון ובפוטנציאל', async () => {
    expect(occurrences(course, '2026-10-01', '2026-11-30', none)).toHaveLength(9);
    await setTrackingStart('2026-11-01');
    expect(occurrences(course, '2026-10-01', '2026-11-30', none)).toEqual([
      '2026-11-01',
      '2026-11-08',
      '2026-11-15',
      '2026-11-22',
      '2026-11-29',
    ]);
    expect(plannedMinutes([course], 'w1', '2026-10-01', '2026-10-31', none)).toBe(0);
  });

  it('הרשימה המלאה (לספירת "לפני המעקב") לא נחתכת', async () => {
    await setTrackingStart('2026-11-01');
    expect(allCourseSessions(course, '2026-10-01', '2026-10-31', none)).toHaveLength(4);
  });
});

describe('מקומות עם קורס פעיל', () => {
  it('רק מקום שיש לו קורס פעיל', () => {
    const ended: Course = { ...course, id: 'c2', workplaceId: 'w2', from: '2026-01-01', to: '2026-02-01' };
    const planned: Course = { ...course, id: 'c3', workplaceId: 'w3', from: '2027-03-01', to: '2027-05-01' };
    expect([...workplacesWithActiveCourse([course, ended, planned], '2026-11-18')]).toEqual(['w1']);
  });
});
