import { describe, expect, it } from 'vitest';
import { snapPoints, webSnapTarget } from '../components/journal/snap';

describe('יומן — נקודות מגנט בגלילה', () => {
  const days: [string, { y: number; bottom: number }][] = [
    ['2026-11-02', { y: 300, bottom: 420 }],
    ['2026-11-01', { y: 100, bottom: 280 }],
    ['2026-11-03', { y: 440, bottom: 2440 }],
  ];

  it('ראש כל יום מתחת לפס, לפי הסדר; אריח ארוך — גם נקודות ביניים', () => {
    const { offsets, dates } = snapPoints(days, 500, 170, 800);
    expect(offsets.slice(0, 3)).toEqual([500 + 100 - 178, 500 + 300 - 178, 500 + 440 - 178]);
    expect(dates.slice(0, 3)).toEqual(['2026-11-01', '2026-11-02', '2026-11-03']);
    expect(offsets.length).toBeGreaterThan(3);
    expect(dates.slice(3).every((d) => d === '2026-11-03')).toBe(true);
  });

  it('גלילה איטית בדפדפן — לנקודה הבאה בכיוון הגלילה', () => {
    const o = [100, 300, 500];
    expect(webSnapTarget(o, 150, 1)).toBe(300);
    expect(webSnapTarget(o, 290, -1)).toBe(100);
    expect(webSnapTarget(o, 300, 1)).toBeNull();
    expect(webSnapTarget(o, 20, 1)).toBeNull();
  });
});
