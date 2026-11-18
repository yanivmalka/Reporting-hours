import { describe, expect, it } from 'vitest';
import { coursesOn, occurrences, plannedMinutes, type Course } from '../lib/courses';
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
const wp = { id: 'w1', name: 'מכללה' } as Workplace;
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
});
