import { describe, expect, it } from 'vitest';
import { toAcademic } from '../lib/academic';
import { reportPay } from '../lib/pay';
import { planRedeem } from '../lib/redeem';
import { academicOf, netMinutes } from '../lib/reports';

const report = (start: string, end: string, breaks: number[] = [], carried = 0) => ({
  id: 'r',
  workplaceId: 'w',
  date: '2026-11-01',
  start,
  end,
  breaks: breaks.map((minutes, i) => ({ id: String(i), minutes })),
  carriedMinutes: carried,
});

describe('זמן עבודה ושעות אקדמיות', () => {
  it('נטו = סיום − התחלה − הפסקות', () => {
    expect(netMinutes(report('09:00', '12:15', [15]))).toBe(180);
    expect(netMinutes(report('12:00', '09:00'))).toBeNull();
  });
  it('שעה אקדמית = 45 דק׳; דקות שהועברו למונה לא נספרות פעמיים', () => {
    expect(toAcademic(180)).toEqual({ wholeHours: 4, leftoverMinutes: 0, decimalHours: 4 });
    expect(academicOf(report('09:00', '10:00', [], 15))?.wholeHours).toBe(1);
  });
});

describe('פדיון דקות מצטברות', () => {
  it('השלמה לשעה שלמה (ברירת המחדל) — הדוגמה ממסך ההגדרות', () => {
    // בדוח 22 שע׳ ו־18 דק׳ (22.4), במונה 70 דק׳ → נפדות 27; הדוח 23 שע׳ בדיוק
    const plan = planRedeem(70, 22 * 45 + 18, 'complete');
    expect(plan).toEqual({ minutes: 27, missing: 0, after: 23 * 45 });
  });
  it('שעות שלמות בלבד', () => {
    expect(planRedeem(70, 22 * 45 + 18, 'whole').minutes).toBe(45);
  });
  it('אין מספיק במונה להשלמה — מדווח כמה חסר', () => {
    expect(planRedeem(10, 22 * 45 + 18, 'complete')).toEqual({ minutes: 0, missing: 17, after: 22 * 45 + 18 });
  });
});

describe('שכר לדיווח', () => {
  const hourly = { id: 'w', rate: 120, paymentType: 'hourly' as const };
  it('שעתי: תעריף × שעות לפי בסיס החישוב', () => {
    expect(reportPay(report('09:00', '12:00'), hourly, 'academic')).toBe(480); // 180 ÷ 45 × 120
    expect(reportPay(report('09:00', '12:00'), hourly, 'regular')).toBe(360); // 3 × 120
  });
  it('חודשי: אין שכר לדיווח בודד', () => {
    expect(reportPay(report('09:00', '12:00'), { ...hourly, paymentType: 'monthly' }, 'academic')).toBeNull();
  });
});
