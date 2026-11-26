import { describe, expect, it } from 'vitest';
import { paymentLedger } from '../lib/paymentLedger';
import type { ScheduledPayment } from '../lib/forecast';

const pay = (name: string, expected: string, amount: number, paidAt?: string): ScheduledPayment =>
  ({
    workplace: { id: name, name },
    period: { start: '2026-11-01', end: '2026-11-30' },
    expected,
    paidAt,
    amount,
    gross: amount * 2,
    taxPercent: 0,
    estimate: !paidAt,
    state: paidAt ? 'paidOnTime' : 'upcoming',
    daysLate: 0,
  }) as unknown as ScheduledPayment;

describe('paymentLedger', () => {
  const list = [
    pay('א', '2026-12-15', 100),
    pay('ב', '2026-11-15', 200, '2026-11-16'),
    pay('ג', '2026-11-20', 50),
    pay('ד', '2026-12-30', 300),
  ];

  it('מהחדש לישן, עם יתרה מצטברת וסימון היום', () => {
    const { rows, todayIndex } = paymentLedger(list, '2026-11-26', (p) => p.amount);
    expect(rows.map((r) => r.payment.workplace.name)).toEqual(['ד', 'א', 'ג', 'ב']);
    expect(rows.map((r) => r.running)).toEqual([650, 350, 250, 200]);
    expect(rows.map((r) => r.kind)).toEqual(['expected', 'expected', 'overdue', 'received']);
    expect(rows[3].date).toBe('2026-11-16');
    expect(todayIndex).toBe(2);
  });

  it('צפוי היום — מעל סימון היום', () => {
    const { rows, todayIndex } = paymentLedger([pay('א', '2026-11-26', 10)], '2026-11-26', (p) => p.amount);
    expect(rows[0].kind).toBe('expected');
    expect(todayIndex).toBe(1);
  });

  it('הכול בעבר — הסימון בראש', () => {
    const { todayIndex } = paymentLedger([pay('ב', '2026-11-15', 1, '2026-11-15')], '2026-12-01', (p) => p.gross);
    expect(todayIndex).toBe(0);
  });
});
