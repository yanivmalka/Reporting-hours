import { describe, expect, it } from 'vitest';
import { planShifts, vacationOn, vacationReason, type Vacation } from '../lib/vacations';

const vac = (over: Partial<Vacation>): Vacation => ({
  id: 'v1',
  from: '2026-11-09',
  to: '2026-11-12',
  mode: 'cancel',
  scope: { kind: 'all' },
  exclude: [],
  ...over,
});

describe('לאילו מפגשים חופשה חלה', () => {
  it('כללית — על כולם בטווח; מחוץ לטווח — לא', () => {
    expect(vacationOn([vac({})], 'c1', 'w1', '2026-11-10')?.id).toBe('v1');
    expect(vacationOn([vac({})], 'c1', 'w1', '2026-11-13')).toBeNull();
  });
  it('של מקום עבודה / של קורס — רק עליהם', () => {
    const w = vac({ scope: { kind: 'workplace', id: 'w1' } });
    expect(vacationOn([w], 'c1', 'w1', '2026-11-10')).not.toBeNull();
    expect(vacationOn([w], 'c2', 'w2', '2026-11-10')).toBeNull();
    const c = vac({ scope: { kind: 'course', id: 'c1' } });
    expect(vacationOn([c], 'c9', 'w1', '2026-11-10')).toBeNull();
  });
  it('התעלמות של מקום חלה גם על הקורסים שלו', () => {
    expect(vacationOn([vac({ exclude: ['c1'] })], 'c1', 'w1', '2026-11-10')).toBeNull();
    expect(vacationOn([vac({ exclude: ['w1'] })], 'c1', 'w1', '2026-11-10')).toBeNull();
  });
  it('סיבת הביטול', () => {
    expect(vacationReason(vac({ name: ' חנוכה ' }))).toBe('חופשה · חנוכה');
    expect(vacationReason(vac({}))).toBe('חופשה');
  });
});

describe('מצב "הזזה" — מפגשים עוברים לסוף הקורס', () => {
  // ימי שלישי בנובמבר 2026: 3, 10, 17, 24. סוף הקורס 30.11 → השלישי הבא: 1.12.
  const course = { id: 'c1', workplaceId: 'w1', weekday: 2, from: '2026-11-01', to: '2026-11-30' };
  const base = {
    courses: [course],
    vacations: [vac({ mode: 'shift' })],
    isHoliday: () => false,
    marked: () => false,
    reported: () => false,
    movedIn: () => [] as string[],
  };
  it('המפגש בחופשה עובר למועד הקבוע הפנוי הבא אחרי סוף הקורס', () => {
    const plan = planShifts(base);
    expect(plan.movedTo.get('c1@2026-11-10')).toEqual({ date: '2026-12-01', vacationId: 'v1' });
    expect(plan.movedIn.get('c1')).toEqual([{ date: '2026-12-01', from: '2026-11-10' }]);
  });
  it('דילוג על חג ועל תאריך שכבר תפוס', () => {
    expect(planShifts({ ...base, isHoliday: (d) => d === '2026-12-01' }).movedTo.get('c1@2026-11-10')?.date).toBe('2026-12-08');
    expect(planShifts({ ...base, movedIn: () => ['2026-12-01'] }).movedTo.get('c1@2026-11-10')?.date).toBe('2026-12-08');
  });
  it('מפגש שדווח או שסומן ידנית — לא זז', () => {
    expect(planShifts({ ...base, reported: (_c, d) => d === '2026-11-10' }).movedTo.size).toBe(0);
    expect(planShifts({ ...base, marked: (_c, d) => d === '2026-11-10' }).movedTo.size).toBe(0);
  });
  it('חופשה במצב "ביטול" — אין הזזות', () => {
    expect(planShifts({ ...base, vacations: [vac({})] }).movedTo.size).toBe(0);
  });
});
