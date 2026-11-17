import { describe, expect, it } from 'vitest';
import { hasMoney, maskMoney } from '../lib/moneyMask';
import { formatShekels } from '../lib/travel';

describe('הסתרת סכומים', () => {
  it('כל סכום בפורמט של formatShekels', () => {
    for (const n of [0, 12, 1234, 41667, -50, 12.5]) {
      const t = `צפי ${formatShekels(n)} לחודש`;
      expect(hasMoney(t)).toBe(true);
      expect(maskMoney(t)).toBe('צפי ••• ₪ לחודש');
    }
  });
  it('כמה סכומים בשורה, וטקסט בלי סכום לא משתנה', () => {
    expect(maskMoney('שכר: 1,200 ₪ · נסיעות 40 ₪')).toBe('שכר: ••• ₪ · נסיעות ••• ₪');
    expect(hasMoney('09:00–16:00 · 3 מפגשים')).toBe(false);
    expect(maskMoney('עלות נסיעה לכיוון (₪)')).toBe('עלות נסיעה לכיוון (₪)');
  });
});
