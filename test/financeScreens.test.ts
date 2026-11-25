import { describe, expect, it } from 'vitest';
import { markFinanceScreen, screenHasFinance } from '../lib/financeScreens';

describe('financeScreens — מסכים שמוצג בהם מידע כספי', () => {
  it('מסך מסומן כל עוד יש בו רישום אחד לפחות', () => {
    expect(screenHasFinance('a')).toBe(false);
    const off1 = markFinanceScreen('a');
    const off2 = markFinanceScreen('a');
    expect(screenHasFinance('a')).toBe(true);
    expect(screenHasFinance('b')).toBe(false);
    off1();
    expect(screenHasFinance('a')).toBe(true);
    off2();
    expect(screenHasFinance('a')).toBe(false);
  });

  it('בלי מפתח מסך — לא כספי', () => {
    expect(screenHasFinance(undefined)).toBe(false);
  });
});
