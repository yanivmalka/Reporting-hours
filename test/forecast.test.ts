import AsyncStorage from '@react-native-async-storage/async-storage';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Course } from '../lib/courses';
import { currentPayPeriod } from '../lib/dashboard';
import { canceledSessions, expectedFor, paymentSchedule, periodForecast, plannedFor } from '../lib/forecast';
import { loadCancelIndex, setSessionMark } from '../lib/sessions';
import type { Workplace } from '../lib/workplaces';

const day = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
};
// מקום שעתי, 100 ₪ לשעה אקדמית, ברכב (בלי נסיעות). ביטול "מחלה" — 50%.
const wp = {
  id: 'w1',
  name: 'מכללה',
  rate: 100,
  paymentType: 'hourly',
  payday: 1,
  arrivalMode: 'car',
  travelCostPerDirection: 0,
  tripsPerDay: 2,
  payBasis: 'academic',
  cancelPay: { sick: { kind: 'percent', value: 50 } },
} as Workplace;
// ימי שלישי, 09:00–12:00 = 4 שעות אקדמיות = 400 ₪ למפגש. בנובמבר 2026: 3, 10, 17, 24.
const course: Course = {
  id: 'c1',
  workplaceId: 'w1',
  name: 'קורס',
  weekday: 2,
  start: '09:00',
  end: '12:00',
  breakMinutes: 0,
  from: '2026-09-01',
  to: '2027-01-31',
};
const nov = currentPayPeriod(1, day('2026-11-17'));

beforeEach(async () => {
  await AsyncStorage.clear();
  await loadCancelIndex();
});

describe('פוטנציאל וצפי', () => {
  it('בלי ביטולים — פוטנציאל וצפי שווים', () => {
    expect(plannedFor(wp, [course], nov, 'academic')).toBe(1600);
    expect(expectedFor(wp, [course], nov, 'academic')).toBe(1600);
  });
  it('"השיעור לא התקיים": נשאר בפוטנציאל, יורד מהצפי — חוץ מהחלק שהמוסד משלם לפי הסיבה', async () => {
    await setSessionMark('c1', '2026-11-10', 'canceled', 'מחלה', undefined, 'sick');
    await loadCancelIndex();
    expect(plannedFor(wp, [course], nov, 'academic')).toBe(1600);
    expect(expectedFor(wp, [course], nov, 'academic')).toBe(1200 + 200);
    expect(canceledSessions(wp, [course], nov)).toEqual([{ courseId: 'c1', date: '2026-11-10' }]);
  });
  it('ביטול בלי כלל תשלום — יורד מהצפי במלואו', async () => {
    await setSessionMark('c1', '2026-11-10', 'canceled', 'שביתה');
    await loadCancelIndex();
    expect(expectedFor(wp, [course], nov, 'academic')).toBe(1200);
  });
  it('"הוסר" — יורד גם מהפוטנציאל', async () => {
    await setSessionMark('c1', '2026-11-10', 'removed');
    await loadCancelIndex();
    expect(plannedFor(wp, [course], nov, 'academic')).toBe(1200);
  });
  it('מקום בשכר חודשי — הסכום הקבוע', () => {
    expect(plannedFor({ ...wp, paymentType: 'monthly', rate: 5000 }, [course], nov, 'academic')).toBe(5000);
  });
});

describe('מצב התקופה', () => {
  const report = { id: 'r', workplaceId: 'w1', date: '2026-11-03', start: '09:00', end: '12:00', breaks: [], carriedMinutes: 0, createdAt: 1 };
  it('נוכחית — בהכנה; דווח מול צפי', () => {
    const f = periodForecast(wp, nov, [report], [course], {}, 'academic', day('2026-11-17'));
    expect(f.status).toBe('open');
    expect(f.reported).toBe(400);
    expect(f.reportCount).toBe(1);
    expect(f.expected).toBe('2026-12-30');
  });
  it('עברה ולא נשלחה — ממתינה לשליחה ובאיחור; נשלחה / שולמה', () => {
    const today = day('2026-12-05');
    expect(periodForecast(wp, nov, [report], [course], {}, 'academic', today)).toMatchObject({ status: 'closed', late: true });
    const sent = { 'w1|2026-11-01': { sentAt: day('2026-11-30').getTime() } };
    expect(periodForecast(wp, nov, [report], [course], sent, 'academic', today)).toMatchObject({ status: 'sent', late: false });
    const paid = { 'w1|2026-11-01': { sentAt: 1, paidAt: '2026-12-30' } };
    expect(periodForecast(wp, nov, [report], [course], paid, 'academic', today).status).toBe('paid');
  });
  it('תקופה עתידית — מתוכננת', () => {
    expect(periodForecast(wp, currentPayPeriod(1, day('2027-01-10')), [], [course], {}, 'academic', day('2026-11-17')).status).toBe('planned');
  });
});

describe('מועדי תשלום', () => {
  const oct = { id: 'r0', workplaceId: 'w1', date: '2026-10-06', start: '09:00', end: '12:00', breaks: [], carriedMinutes: 0, createdAt: 1 };
  const novR = { id: 'r1', workplaceId: 'w1', date: '2026-11-03', start: '09:00', end: '12:00', breaks: [], carriedMinutes: 0, createdAt: 1 };
  it('שוטף + 30 בדיוק: אוקטובר — 30.11, נובמבר — 30.12', () => {
    const sent = { 'w1|2026-10-01': { sentAt: day('2026-10-30').getTime() }, 'w1|2026-11-01': { sentAt: day('2026-11-30').getTime() } };
    const list = paymentSchedule([wp], [oct, novR], [course], sent, 'academic', '2026-11-01', '2027-01-31', day('2026-12-05'));
    expect(list.map((p) => [p.period.start, p.expected])).toEqual([
      ['2026-10-01', '2026-11-30'],
      ['2026-11-01', '2026-12-30'],
      ['2026-12-01', '2027-01-30'],
    ]);
  });
  it('מצב: עבר ולא סומן · שולם באיחור · צפי לתקופה הנוכחית', () => {
    const today = day('2026-12-05');
    const sent = { 'w1|2026-10-01': { sentAt: day('2026-10-30').getTime() } };
    const overdue = paymentSchedule([wp], [oct], [course], sent, 'academic', '2026-11-01', '2026-11-30', today);
    expect(overdue[0]).toMatchObject({ state: 'overdue', daysLate: 5, amount: 400, estimate: false });
    const paid = { 'w1|2026-10-01': { sentAt: day('2026-10-30').getTime(), paidAt: '2026-12-02', paidAmount: 380 } };
    expect(paymentSchedule([wp], [oct], [course], paid, 'academic', '2026-11-01', '2026-11-30', today)[0]).toMatchObject({
      state: 'paidLate',
      daysLate: 2,
      amount: 380,
    });
    const current = paymentSchedule([wp], [novR], [course], {}, 'academic', '2026-12-01', '2026-12-31', day('2026-11-17'));
    expect(current[0]).toMatchObject({ state: 'upcoming', estimate: true, amount: 1600 });
  });
});
