import { describe, expect, it } from 'vitest';
import { courseStatus, coursesOn, occurrences, plannedMinutes, type Course } from '../lib/courses';
import { canceledSessions, expectedFor, plannedFor } from '../lib/forecast';
import { buildPayrollReport } from '../lib/payroll';
import type { PayPeriod } from '../lib/dashboard';
import { dayStatus } from '../lib/dayStatus';
import { buildPlanDays } from '../lib/mailReport';
import { agenda } from '../lib/home';
import { currentPlan, NO_PLAN, type PlanIndex } from '../lib/sessions';
import type { Workplace } from '../lib/workplaces';

// קורס ביום שלישי; המפגש של 24.11 הועבר ל־26.11 (חמישי).
const course: Course = {
  id: 'c1',
  workplaceId: 'w1',
  name: 'מבוא',
  weekday: 2,
  start: '09:00',
  end: '12:00',
  breakMinutes: 0,
  from: '2026-11-01',
  to: '2026-11-30',
};
const wp = { id: 'w1', name: 'מכללה', rate: 100, paymentType: 'hourly', payBasis: 'regular', payday: 1 } as Workplace;
const moved: PlanIndex = {
  cancel: (id, date) => (id === 'c1' && date === '2026-11-24' ? { kind: 'moved', reason: 'הועבר', movedTo: '2026-11-26' } as never : null),
  moves: (id) => (id === 'c1' ? [{ date: '2026-11-26', from: '2026-11-24' }] : []),
};

describe('תמונת מצב של התכנון (PlanIndex)', () => {
  it('ביטול והעברה מאותה תמונה — בלי לקרוא את המצב הגלובלי', () => {
    // המצב הגלובלי ריק (לא נטענו קורסים בבדיקה)
    expect(currentPlan().moves('c1')).toEqual([]);
    expect(coursesOn([course], '2026-11-26', undefined, moved.cancel, moved.moves).map((c) => c.id)).toEqual(['c1']);
    expect(coursesOn([course], '2026-11-24', undefined, moved.cancel, moved.moves)).toEqual([]);
    expect(occurrences(course, '2026-11-20', '2026-11-30', moved.cancel, moved.moves)).toEqual(['2026-11-26']);
    expect(plannedMinutes([course], 'w1', '2026-11-20', '2026-11-30', moved.cancel, moved.moves)).toBe(180);
  });

  it('לו״ז הבית לפי התמונה שקיבל', () => {
    const now = new Date(2026, 10, 25, 8, 0); // רביעי — הלו״ז משני עד שישי
    const days = agenda([course], [wp], [], now, moved);
    const byDate = Object.fromEntries(days.map((d) => [d.date, d.items.map((i) => i.status)]));
    expect(byDate['2026-11-24']).toEqual(['canceled']);
    expect(byDate['2026-11-26']).toEqual(['upcoming']);
    const plain = agenda([course], [wp], [], now, NO_PLAN);
    expect(plain.find((d) => d.date === '2026-11-26')?.items).toEqual([]);
  });

  it('צפי, דוח שכר, מצב יום, תכנון למייל ומצב קורס — לפי התמונה שקיבלו', () => {
    const period = { start: '2026-11-01', end: '2026-11-30' } as PayPeriod;
    // ביטול ידני של 10.11 (נשאר בפוטנציאל, יורד מהצפי) + ההעברה של 24.11 ← 26.11
    const canceled: PlanIndex = {
      cancel: (id, date, explicit) =>
        id === 'c1' && date === '2026-11-10' ? ({ kind: 'canceled', reason: 'מחלה' } as never) : moved.cancel(id, date, explicit),
      moves: moved.moves,
    };
    // 4 מפגשים בפוטנציאל (3, 10, 17, 26), 3 שעות כל אחד × 100
    expect(plannedFor(wp, [course], period, 'regular', canceled)).toBe(1200);
    expect(expectedFor(wp, [course], period, 'regular', canceled)).toBe(900);
    expect(canceledSessions(wp, [course], period, canceled)).toEqual([{ courseId: 'c1', date: '2026-11-10' }]);
    expect(plannedFor(wp, [course], period, 'regular', NO_PLAN)).toBe(1200);
    const report = buildPayrollReport(wp, period, [], [course], 'regular', 0, canceled);
    expect(report.canceled.map((c) => c.date)).toEqual(['2026-11-10']);
    expect(buildPayrollReport(wp, period, [], [course], 'regular', 0, NO_PLAN).canceled).toEqual([]);

    const now = new Date(2026, 10, 20, 12, 0);
    expect(dayStatus('2026-11-26', { courses: [course], workplaces: [wp], reports: [], plan: moved }, now)).toBe('planned');
    expect(dayStatus('2026-11-24', { courses: [course], workplaces: [wp], reports: [], plan: moved }, now)).toBeNull();
    expect(Object.keys(buildPlanDays([course], [wp], [], '2026-11-23', 5, moved))).toEqual(['2026-11-26']);
    // המפגש היחיד הועבר ל־26.11 — עוד לא הסתיים
    expect(courseStatus({ ...course, from: '2026-11-24', to: '2026-11-24' }, '2026-11-25', moved)).toBe('active');
    expect(courseStatus({ ...course, from: '2026-11-24', to: '2026-11-24' }, '2026-11-25', NO_PLAN)).toBe('ended');
  });
});
