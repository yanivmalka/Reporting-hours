import { describe, expect, it } from 'vitest';
import type { Course } from '../lib/courses';
import { jointCandidate, jointReason } from '../lib/jointCourses';
import type { WorkReport } from '../lib/reports';
import { NO_PLAN } from '../lib/sessions';
import type { Workplace } from '../lib/workplaces';

const base = { workplaceId: 'w1', weekday: 0, breakMinutes: 0, from: '2026-11-01', to: '2026-12-31' };
const hist: Course = { ...base, id: 'hist', name: 'תולדות האדריכלות', start: '09:00', end: '10:30' };
const plan: Course = { ...base, id: 'plan', name: 'תכנון אדריכלי', start: '10:45', end: '16:20' };
const wps = [{ id: 'w1', name: 'גור ירושלים' }, { id: 'w2', name: 'אחר' }] as Workplace[];
const SUN = '2026-11-01';

describe('קורסים צמודים — דיווח אחד ליום', () => {
  it('מציע את הקורס שמתחיל אחרי הפער, באותו מקום', () => {
    expect(jointCandidate(hist, SUN, [hist, plan], wps, [], NO_PLAN)).toMatchObject({
      course: { id: 'plan' },
      end: '16:20',
      gap: 15,
    });
  });
  it('אין הצעה לקורס שכבר דווח', () => {
    const r = { id: 'r', workplaceId: 'w1', date: SUN, start: '10:45', end: '16:20', breaks: [], carriedMinutes: 0, courseId: 'plan', createdAt: 1 } as WorkReport;
    expect(jointCandidate(hist, SUN, [hist, plan], wps, [r], NO_PLAN)).toBeNull();
  });
  it('אין הצעה למקום אחר, לקורס שלפני, או לפער של יותר משעה', () => {
    const other = { ...plan, id: 'o', workplaceId: 'w2' };
    const late = { ...plan, id: 'l', start: '12:00' };
    expect(jointCandidate(hist, SUN, [hist, other, late], wps, [], NO_PLAN)).toBeNull();
    expect(jointCandidate(plan, SUN, [hist, plan], wps, [], NO_PLAN)).toBeNull();
  });
  it('אין הצעה למפגש שבוטל', () => {
    const canceled = { cancel: (id: string) => (id === 'plan' ? { reason: '', auto: false, kind: 'canceled' as const } : null), moves: NO_PLAN.moves };
    expect(jointCandidate(hist, SUN, [hist, plan], wps, [], canceled)).toBeNull();
  });
  it('סיבת הביטול', () => {
    expect(jointReason('תולדות האדריכלות')).toBe('דווח יחד עם תולדות האדריכלות');
  });
});
