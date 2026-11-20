import { describe, expect, it } from 'vitest';
import type { Course } from '../lib/courses';
import { dayStatuses, statusesIn } from '../lib/dayStatus';
import { groupCoursesForDisplay, hasSharedNames, weekdaysLabel } from '../lib/courseGrouping';
import type { PlanIndex } from '../lib/sessions';
import type { Workplace } from '../lib/workplaces';

const base: Course = {
  id: 'c1',
  workplaceId: 'w1',
  name: 'מבוא',
  weekday: 1,
  start: '09:00',
  end: '12:00',
  breakMinutes: 0,
  from: '2026-11-01',
  to: '2026-11-30',
};
const other: Course = { ...base, id: 'c2', name: 'סדנה', weekday: 2 };
const wp = { id: 'w1', name: 'מכללה', rate: 100, paymentType: 'hourly', payday: 1 } as Workplace;

// שני 16.11 — הועבר ל־18.11; שני 9.11 — בוטל; שלישי 10.11 — חופשה; שלישי 17.11 — חג; שני 23.11 — הוסר.
const plan: PlanIndex = {
  cancel: (id, date, explicit) => {
    if (explicit) return null;
    if (id === 'c1' && date === '2026-11-16') return { kind: 'moved', reason: '', auto: false, movedTo: '2026-11-18' } as never;
    if (id === 'c1' && date === '2026-11-09') return { kind: 'canceled', reason: 'מחלה', auto: false } as never;
    if (id === 'c2' && date === '2026-11-10') return { kind: 'vacation', reason: 'חופשה', auto: true } as never;
    if (id === 'c2' && date === '2026-11-17') return { kind: 'auto', reason: 'חג', auto: true } as never;
    if (id === 'c1' && date === '2026-11-23') return { kind: 'removed', reason: '', auto: false } as never;
    return null;
  },
  moves: (id) => (id === 'c1' ? [{ date: '2026-11-18', from: '2026-11-16' }] : []),
};
const input = { courses: [base, other], workplaces: [wp], reports: [], plan };
const now = new Date(2026, 10, 20, 12, 0);

describe('סימוני יום בתאריכון', () => {
  it('מפגש שלא מתקיים מקבל סימון לפי הסיבה', () => {
    expect(dayStatuses('2026-11-16', input, now)).toEqual(['moved']);
    expect(dayStatuses('2026-11-09', input, now)).toEqual(['canceled']);
    expect(dayStatuses('2026-11-10', input, now)).toEqual(['vacation']);
    expect(dayStatuses('2026-11-17', input, now)).toEqual(['holiday']);
    // הוסר מהתכנון — בלי סימון
    expect(dayStatuses('2026-11-23', input, now)).toEqual([]);
    // היעד של ההעברה — מפגש שעבר ולא דווח
    expect(dayStatuses('2026-11-18', input, now)).toEqual(['missing']);
  });

  it('יום עם מפגש שמתקיים ומפגש שבוטל — שני הסימונים', () => {
    const sameDay = { ...other, id: 'c3', weekday: 1 };
    const both = { ...input, courses: [base, sameDay] };
    expect(dayStatuses('2026-11-09', both, now)).toEqual(['missing', 'canceled']);
  });

  it('המקרא — רק הסוגים שבחודש', () => {
    const days = ['2026-11-09', '2026-11-16', '2026-11-18', '2026-11-23'];
    expect(statusesIn(days, (d) => dayStatuses(d, input, now))).toEqual(['missing', 'canceled', 'moved']);
  });
});

describe('קורסים עם אותו שם בלוח הבקרה', () => {
  const mon = { ...base, id: 'a', name: 'תכנון אדריכלי', weekday: 1 };
  const thu = { ...base, id: 'b', name: 'תכנון אדריכלי ', weekday: 4 };
  const solo = { ...base, id: 'c', name: 'סדנה', weekday: 2 };

  it('קורס לכל יום — היום מתווסף רק לשם משותף', () => {
    expect(groupCoursesForDisplay([mon, thu, solo], 'split').map((g) => g.label)).toEqual([
      'תכנון אדריכלי · יום ב׳',
      'תכנון אדריכלי · יום ה׳',
      'סדנה',
    ]);
    // אותו יום — גם שעת ההתחלה
    const late = { ...mon, id: 'd', start: '14:00' };
    expect(groupCoursesForDisplay([mon, late], 'split').map((g) => g.label)).toEqual([
      'תכנון אדריכלי · יום ב׳ 09:00',
      'תכנון אדריכלי · יום ב׳ 14:00',
    ]);
  });

  it('מאוחד לפי שם — קבוצה אחת עם כל הימים', () => {
    const groups = groupCoursesForDisplay([mon, solo, thu], 'merged');
    expect(groups.map((g) => g.label)).toEqual(['תכנון אדריכלי · ימים ב׳, ה׳', 'סדנה']);
    expect(groups[0].courses.map((c) => c.id)).toEqual(['a', 'b']);
  });

  it('עזרים', () => {
    expect(hasSharedNames([mon, thu])).toBe(true);
    expect(hasSharedNames([mon, solo])).toBe(false);
    expect(weekdaysLabel([thu, mon, mon])).toBe('ימים ב׳, ה׳');
  });
});
