import AsyncStorage from '@react-native-async-storage/async-storage';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Course } from '../lib/courses';
import { currentPayPeriod } from '../lib/dashboard';
import { periodForecast } from '../lib/forecast';
import { addOpening, loadOpenings, openingFor, openingLabel, saveOpenings } from '../lib/openingBalance';
import type { WorkReport } from '../lib/reports';
import { loadCancelIndex } from '../lib/sessions';
import { setTrackingStart } from '../lib/trackingStart';
import type { Workplace } from '../lib/workplaces';

const day = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
};
// שעתי, 100 ₪ לשעה אקדמית, נסיעה 10 ₪ לכיוון × 2.
const wp = {
  id: 'w1',
  name: 'מכללה',
  rate: 100,
  paymentType: 'hourly',
  payday: 1,
  arrivalMode: 'public_transport',
  travelCostPerDirection: 10,
  tripsPerDay: 2,
  payBasis: 'academic',
} as Workplace;
// ימי שלישי 09:00–12:00 = 4 ש״א = 400 ₪. בנובמבר 2026: 3, 10, 17, 24.
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
const report = (date: string): WorkReport => ({
  id: `r-${date}`,
  workplaceId: 'w1',
  courseId: 'c1',
  date,
  start: '09:00',
  end: '12:00',
  breaks: [],
  carriedMinutes: 0,
  createdAt: 1,
});

beforeEach(async () => {
  await AsyncStorage.clear();
  await saveOpenings([]);
  await loadCancelIndex();
});
afterEach(() => setTrackingStart(null));

describe('נקודת פתיחה מדו"ח שכר קודם', () => {
  it('נספרת בצפי כדיווח רגיל — שכר לפי השעות ונסיעות לפי הימים', async () => {
    // התחלת עבודה עם המערכת ב־15.11: המפגשים של 3 ו־10 בנובמבר מחוץ לצפי.
    await setTrackingStart('2026-11-15');
    const base = periodForecast(wp, nov, [report('2026-11-17')], [course], {}, 'academic', day('2026-11-20'));
    expect(base.reported).toBe(400 + 20);
    expect(base.opening).toBeUndefined();

    await addOpening({ workplaceId: 'w1', courseId: 'c1', date: '2026-11-14', days: 2, hours: 8, basis: 'academic' });
    const f = periodForecast(wp, nov, [report('2026-11-17')], [course], {}, 'academic', day('2026-11-20'));
    expect(f.reported).toBe(400 + 20 + 800 + 40);
    expect(f.reportedPay).toBe(1200);
    expect(f.reportCount).toBe(1);
    expect(f.opening).toMatchObject({ count: 1, days: 2, minutes: 8 * 45 });
  });

  it('שייכת רק לתקופה של התאריך שלה ולמקום שלה', async () => {
    await addOpening({ workplaceId: 'w1', date: '2026-10-31', days: 1, hours: 4, basis: 'academic' });
    await addOpening({ workplaceId: 'w2', date: '2026-11-02', days: 1, hours: 4, basis: 'academic' });
    expect(openingFor(wp, nov, 'academic').count).toBe(0);
    const oct = currentPayPeriod(1, day('2026-10-15'));
    expect(openingFor(wp, oct, 'academic').pay).toBe(400);
  });

  it('שעות רגילות מומרות לבסיס של המקום', async () => {
    await addOpening({ workplaceId: 'w1', date: '2026-11-02', days: 0, hours: 3, basis: 'regular' });
    // 3 שעות רגילות = 180 דק׳ = 4 ש״א.
    expect(openingFor(wp, nov, 'academic').pay).toBe(400);
    expect(openingLabel(openingFor(wp, nov, 'academic'), 'academic')).toBe('נקודת פתיחה (הוזן ידנית): 4 ש״א');
  });

  it('מקום חודשי — הסכום הקבוע כשאין דיווח אחר, ולא פעמיים', async () => {
    const monthly = { ...wp, paymentType: 'monthly', rate: 5000 } as Workplace;
    await addOpening({ workplaceId: 'w1', date: '2026-11-02', days: 3, hours: 12, basis: 'academic' });
    const alone = periodForecast(monthly, nov, [], [course], {}, 'academic', day('2026-11-20'));
    expect(alone.reportedPay).toBe(5000);
    const both = periodForecast(monthly, nov, [report('2026-11-17')], [course], {}, 'academic', day('2026-11-20'));
    expect(both.reportedPay).toBe(5000);
  });

  it('נשמרת ונטענת מהאחסון', async () => {
    await addOpening({ workplaceId: 'w1', date: '2026-11-02', days: 1, hours: 2.5, basis: 'academic', note: 'לפי דוח אוקטובר' });
    const list = await loadOpenings();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ hours: 2.5, note: 'לפי דוח אוקטובר' });
  });
});
