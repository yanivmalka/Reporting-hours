import { describe, expect, it } from 'vitest';
import type { Course } from '../lib/courses';
import { planPush, type PushInput } from '../lib/pushPlan';
import type { WorkReport } from '../lib/reports';
import { NO_PLAN } from '../lib/sessions';
import type { SessionNote } from '../lib/sessionNotes';
import type { Workplace } from '../lib/workplaces';

// 24.11.2026 — יום שלישי
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
// יום אחרון לדיווח 24 (payday 25): התקופה 25.10–24.11
const wp = { id: 'w1', name: 'מכללה', arrivalMode: 'car', payday: 25 } as Workplace;
const taxiWp = (reminder: NonNullable<Workplace['taxi']>['reminder']) =>
  ({ ...wp, arrivalMode: 'taxi', taxi: { phone: '050-1234567', reminder } }) as Workplace;
const report: WorkReport = {
  id: 'r1',
  workplaceId: 'w1',
  date: '2026-11-24',
  start: '09:00',
  end: '12:00',
  breaks: [],
  carriedMinutes: 0,
  courseId: 'c1',
  createdAt: 1,
};

const input = (over: Partial<PushInput>): PushInput => ({
  workplaces: [wp],
  courses: [course],
  reports: [],
  notes: [],
  payroll: {},
  now: new Date(2026, 10, 24, 8, 0),
  ...over,
});
const plan = (over: Partial<PushInput>) => planPush(input(over), NO_PLAN);
const ids = (over: Partial<PushInput>) => plan(over).map((p) => p.id);
const hhmm = (d: Date) => `${d.getDate()}.${d.getMonth() + 1} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

describe('התראות לטלפון — מה מתוזמן', () => {
  it('דיווח חסר: בערב של יום המפגש, ונעלם כשיש דיווח', () => {
    const m = plan({ kinds: ['missing'] }).filter((p) => p.id === 'missing|2026-11-24');
    expect(m).toHaveLength(1);
    expect(hhmm(m[0].at)).toBe('24.11 22:00');
    expect(m[0].href).toBe('/report?course=c1&date=2026-11-24');
    expect(ids({ kinds: ['missing'], reports: [report] })).not.toContain('missing|2026-11-24');
  });

  it('דיווח חסר: מפגש שמסתיים מאוחר — חצי שעה אחרי הסיום', () => {
    const late = { ...course, start: '19:00', end: '22:00' };
    const m = plan({ kinds: ['missing'], courses: [late] }).find((p) => p.id === 'missing|2026-11-24');
    expect(m && hhmm(m.at)).toBe('24.11 22:30');
  });

  it('דיווח חסר: שעה מההגדרות', () => {
    const m = plan({ kinds: ['missing'], missingTime: '21:15' }).find((p) => p.id === 'missing|2026-11-24');
    expect(m && hhmm(m.at)).toBe('24.11 21:15');
  });

  it('מונית: X שעות לפני המפגש הראשון, או בערב שלפני', () => {
    const before = plan({ kinds: ['taxi'], workplaces: [taxiWp({ kind: 'hoursBefore', hours: 2 })], now: new Date(2026, 10, 24, 6, 0) });
    expect(before.map((p) => `${p.id} ${hhmm(p.at)}`)).toContain('taxi|w1|2026-11-24 24.11 07:00');
    const night = plan({ kinds: ['taxi'], workplaces: [taxiWp({ kind: 'nightBefore', time: '21:00' })], now: new Date(2026, 10, 23, 12, 0) });
    expect(night[0].id).toBe('taxi|w1|2026-11-24');
    expect(hhmm(night[0].at)).toBe('23.11 21:00');
    expect(night[0].body).toContain('מחר');
  });

  it('תזכורת מפגש: הגשה — בערב שלפני; מפגש שדווח — בלי', () => {
    const notes: SessionNote[] = [{ courseId: 'c1', date: '2026-12-01', at: 1, flag: 'submission', note: 'עבודה 1' }];
    const r = plan({ kinds: ['reminder'], notes });
    expect(r).toHaveLength(1);
    expect(hhmm(r[0].at)).toBe('30.11 20:00');
    expect(r[0].title).toContain('מחר');
    expect(r[0].body).toBe('עבודה 1');
    const reported = { ...report, date: '2026-12-01' };
    expect(plan({ kinds: ['reminder'], notes, reports: [reported] })).toHaveLength(0);
  });

  it('דוח שכר: ערב לפני היום האחרון ובבוקר שלו, בלי סכומים; דוח שנשלח — בלי', () => {
    const now = new Date(2026, 10, 20, 12, 0);
    const p = plan({ kinds: ['payroll'], reports: [report], now }).filter((x) => x.id.includes('2026-11-24'));
    expect(p.map((x) => hhmm(x.at))).toEqual(['23.11 19:00', '24.11 09:00']);
    expect(p[0].body).toContain('דיווח אחד');
    expect(p[0].body).not.toContain('₪');
    expect(p[0].href).toBe('/payroll-report?wp=w1&start=2026-10-25');
    const sent = { 'w1|2026-10-25': { sentAt: 1 } };
    expect(ids({ kinds: ['payroll'], now, payroll: sent }).some((id) => id.includes('2026-11-24'))).toBe(false);
  });

  it('רק עתידיות, בלי הדגמה ובלי מקום בארכיון; סוגים שכובו — לא', () => {
    // 08:00 — המונית של 07:00 כבר עברה
    expect(ids({ kinds: ['taxi'], workplaces: [taxiWp({ kind: 'hoursBefore', hours: 2 })] })).not.toContain('taxi|w1|2026-11-24');
    expect(plan({ courses: [{ ...course, demo: true }], workplaces: [{ ...wp, demo: true }] })).toHaveLength(0);
    expect(plan({ kinds: ['missing'], workplaces: [{ ...wp, archivedAt: 1 } as Workplace] })).toHaveLength(0);
    expect(plan({ kinds: [] })).toHaveLength(0);
  });

  it('ממוינות לפי זמן', () => {
    const all = plan({ workplaces: [taxiWp({ kind: 'nightBefore', time: '21:00' })] });
    const times = all.map((p) => p.at.getTime());
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });
});
