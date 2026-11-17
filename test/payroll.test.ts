import { describe, expect, it } from 'vitest';
import { currentPayPeriod, expectedPaymentDate, periodMonthKey } from '../lib/dashboard';
import { buildPayrollReport, expectedPayment, NO_COURSE, reportLate, statusKey } from '../lib/payroll';
import type { Course } from '../lib/courses';
import type { WorkReport } from '../lib/reports';
import type { Workplace } from '../lib/workplaces';

const day = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
};

describe('תקופת השכר ("החודש")', () => {
  it('יום אחרון סוף החודש (payday 1): החודש הקלנדרי', () => {
    const p = currentPayPeriod(1, day('2026-11-17'));
    expect([p.start, p.end, p.nextPayday]).toEqual(['2026-11-01', '2026-11-30', '2026-12-01']);
  });
  it('יום אחרון 24 (payday 25): 25.10–24.11, ושייכת לנובמבר — החודש שבו היא מסתיימת', () => {
    const p = currentPayPeriod(25, day('2026-11-17'));
    expect([p.start, p.end]).toEqual(['2026-10-25', '2026-11-24']);
    expect(periodMonthKey(p)).toBe('2026-11');
    expect(currentPayPeriod(25, day('2026-11-25')).start).toBe('2026-11-25');
  });
  it('payday 31 בחודש קצר — נחתך לסוף החודש', () => {
    const p = currentPayPeriod(31, day('2027-02-15'));
    expect(p.end < '2027-03-31').toBe(true);
  });
});

describe('איחור ומועד התשלום הצפוי', () => {
  const period = currentPayPeriod(1, day('2026-11-17'));
  const w = { id: 'w', paymentTermsDays: 30 } as Workplace;
  it('"שוטף + 30" נספר מסוף החודש שבו התקופה מסתיימת', () => {
    expect(expectedPaymentDate('2026-11-30', 30)).toBe('2026-12-30');
    expect(expectedPaymentDate('2026-11-24', 30)).toBe('2026-12-30');
  });
  it('דוח שנשלח עד היום האחרון — בזמן; אחריו, או שלא נשלח והמועד עבר — באיחור', () => {
    expect(reportLate(period, { sentAt: day('2026-11-30').getTime() }, day('2026-12-05'))).toBe(false);
    expect(reportLate(period, { sentAt: day('2026-12-01').getTime() }, day('2026-12-05'))).toBe(true);
    expect(reportLate(period, undefined, day('2026-11-20'))).toBe(false);
    expect(reportLate(period, undefined, day('2026-12-01'))).toBe(true);
    expect(reportLate(period, { paidAt: '2027-01-30' }, day('2027-03-01'))).toBe(false);
  });
  it('דוח באיחור משולם רק בחודש שאחרי', () => {
    expect(expectedPayment(w, period, { sentAt: day('2026-11-29').getTime() })).toBe('2026-12-30');
    expect(expectedPayment(w, period, { sentAt: day('2026-12-02').getTime() })).toBe('2027-01-30');
  });
  it('מפתח סטטוס: מקום|תחילת תקופה', () => {
    expect(statusKey('w1', '2026-11-01')).toBe('w1|2026-11-01');
  });
});

describe('דוח שכר', () => {
  const wp = {
    id: 'w1',
    name: 'מכללה',
    rate: 90,
    paymentType: 'hourly',
    payday: 1,
    arrivalMode: 'public_transport',
    travelCostPerDirection: 10,
    tripsPerDay: 2,
    payBasis: 'academic',
  } as Workplace;
  const course: Course = {
    id: 'c1',
    workplaceId: 'w1',
    name: 'תולדות האדריכלות',
    weekday: 2,
    start: '09:00',
    end: '12:00',
    breakMinutes: 0,
    from: '2026-09-01',
    to: '2027-01-31',
  };
  const r = (id: string, date: string, start: string, end: string, extra: Partial<WorkReport> = {}): WorkReport => ({
    id,
    workplaceId: 'w1',
    date,
    start,
    end,
    breaks: [],
    carriedMinutes: 0,
    createdAt: 1,
    ...extra,
  });
  const period = currentPayPeriod(1, day('2026-11-17'));
  const reports = [
    r('a', '2026-11-03', '09:00', '12:00', { courseId: 'c1' }),
    r('b', '2026-11-03', '13:00', '14:30', { note: 'ישיבת סגל' }),
    r('c', '2026-11-10', '09:00', '12:20', { carriedMinutes: 20 }), // חופף לקורס בשעות
    r('x', '2026-10-27', '09:00', '12:00'), // מחוץ לתקופה
    { ...r('y', '2026-11-03', '09:00', '12:00'), workplaceId: 'other' }, // מקום אחר
  ];
  const rep = buildPayrollReport(wp, period, reports, [course], 'academic');

  it('רק דיווחי המקום בתקופה, מקובצים לפי קורס; בלי קורס — בסוף', () => {
    expect(rep.groups.map((g) => g.name)).toEqual(['תולדות האדריכלות', NO_COURSE]);
    expect(rep.groups[0].sessions.map((s) => s.reportId)).toEqual(['a', 'c']);
    expect(rep.days).toBe(2);
  });
  it('דקות שהועברו למונה לא בדוח; פדיון נכנס לשכר', () => {
    // 180 + 180 (200 פחות 20 למונה) + 90
    expect(rep.netMinutes).toBe(450);
    expect(rep.pay).toBe((450 / 45) * 90);
    const withRedeem = buildPayrollReport(wp, period, reports, [course], 'academic', 45);
    expect(withRedeem.netMinutes).toBe(495);
    expect(withRedeem.pay - rep.pay).toBe(90);
  });
  it('נסיעות — פעם אחת לכל יום עבודה', () => {
    expect(rep.travel).toBe(2 * 2 * 10);
  });
});
