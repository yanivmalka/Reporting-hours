import { describe, expect, it } from 'vitest';
import { complete, finish, typed, typedText } from '../lib/timeText';

describe('timeText', () => {
  it('הקלדה רציפה: נקודתיים לבד והשלמת 0', () => {
    expect(typedText(...(typed('930').slice(0, 2) as [string, string]))).toBe('09:30');
    expect(typed('09305')).toEqual(['09', '30', '5']);
    expect(typed('27')).toEqual(['23', '', '']);
    expect(typed('45')).toEqual(['04', '5', '']);
    expect(typed('2915')).toEqual(['23', '15', '']);
  });

  it('שעה שלמה בזמן העריכה', () => {
    expect(complete('09:30')).toBe('09:30');
    expect(complete('9:30')).toBe('09:30');
    expect(complete('9.45')).toBe('09:45');
    expect(complete('0930')).toBe('09:30');
    expect(complete('930')).toBe('09:30');
    expect(complete('09:3')).toBeNull();
    expect(complete('093')).toBeNull();
    expect(complete('09:75')).toBeNull();
    expect(complete('')).toBeNull();
  });

  it('השלמה ביציאה מהשדה', () => {
    expect(finish('')).toBe('');
    expect(finish('9')).toBe('09:00');
    expect(finish('14')).toBe('14:00');
    expect(finish('9:')).toBe('09:00');
    expect(finish('130')).toBe('01:30');
    expect(finish('1430')).toBe('14:30');
    expect(finish('14:3')).toBeNull();
    expect(finish('25')).toBeNull();
    expect(finish(':30')).toBeNull();
    expect(finish('12345')).toBeNull();
  });
});
