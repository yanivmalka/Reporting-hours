import { describe, expect, it } from 'vitest';
import { amountByMode, forecastForMode } from '../lib/amountMode';
import type { ForecastMonth } from '../lib/forecast';

const month: ForecastMonth = {
  key: '2026-11',
  year: 2026,
  month0: 10,
  reported: 900,
  planned: 1800,
  forecast: 1500,
  gross: { reported: 1000, planned: 2000, forecast: 1700 },
  byWorkplace: {
    a: { reported: 900, planned: 1800, forecast: 1500, gross: { reported: 1000, planned: 2000, forecast: 1700 }, periods: [] },
  },
};

describe('amount mode', () => {
  it('keeps net months as they are', () => {
    expect(forecastForMode([month], 'net')[0]).toBe(month);
  });
  it('switches the main amounts (month and each workplace) to gross', () => {
    const [m] = forecastForMode([month], 'gross');
    expect([m.reported, m.planned, m.forecast]).toEqual([1000, 2000, 1700]);
    expect(m.byWorkplace.a.reported).toBe(1000);
    expect(m.byWorkplace.a.forecast).toBe(1700);
    expect(month.reported).toBe(900);
  });
  it('picks a single amount', () => {
    expect(amountByMode({ net: 85, gross: 100 }, 'net')).toBe(85);
    expect(amountByMode({ net: 85, gross: 100 }, 'gross')).toBe(100);
  });
});
