import { describe, expect, it } from 'vitest';
import { buildExport, exportFileName, hoursText, toCsv, toHtml } from '../lib/exportReports';
import type { Course } from '../lib/courses';
import type { WorkReport } from '../lib/reports';
import type { Workplace } from '../lib/workplaces';

const hourly = { id: 'w1', name: 'מכללה, צפון', rate: 200, paymentType: 'hourly', payBasis: 'academic' } as Workplace;
const monthly = { id: 'w2', name: 'אוניברסיטה', rate: 5000, paymentType: 'monthly' } as Workplace;
const course = { id: 'c1', name: 'מבוא "לתכנות"' } as Course;
const rep = (r: Partial<WorkReport>): WorkReport => ({
  id: Math.random().toString(36),
  workplaceId: 'w1',
  date: '2026-11-10',
  start: '09:00',
  end: '12:00',
  breaks: [],
  carriedMinutes: 0,
  createdAt: 1,
  ...r,
});

const reports = [
  rep({ date: '2026-11-10', courseId: 'c1', breaks: [{ minutes: 15 } as WorkReport['breaks'][number]] }), // 165 דק׳ נטו
  rep({ date: '2026-11-03', start: '10:00', end: '11:30', note: 'השלמה' }), // 90 דק׳
  rep({ date: '2026-11-12', workplaceId: 'w2' }),
  rep({ date: '2026-10-30' }), // מחוץ לטווח
];
const opts = { from: '2026-11-01', to: '2026-11-30', withPay: true };

describe('ייצוא דיווחים', () => {
  it('בוחר לפי טווח ומקום, ממיין לפי תאריך, ומחשב נטו ושכר', () => {
    const out = buildExport(reports, [hourly, monthly], [course], 'regular', opts);
    expect(out.rows.map((r) => r.date)).toEqual(['2026-11-03', '2026-11-10', '2026-11-12']);
    expect(out.rows[1].course).toBe('מבוא "לתכנות"');
    expect(out.rows[0].course).toBe('השלמה');
    expect(out.rows[1].netMinutes).toBe(165);
    // אקדמי: 165 / 45 שעות × 200
    expect(out.rows[1].pay).toBeCloseTo((165 / 45) * 200);
    expect(out.rows[2].pay).toBeNull(); // חודשי
    expect(out.monthly).toEqual(['אוניברסיטה']);
    expect(out.totals.netMinutes).toBe(90 + 165 + 180);
    const one = buildExport(reports, [hourly, monthly], [course], 'regular', { ...opts, workplaceId: 'w2' });
    expect(one.rows).toHaveLength(1);
  });

  it('בלי סכומים — בלי שכר', () => {
    const out = buildExport(reports, [hourly], [course], 'regular', { ...opts, withPay: false });
    expect(out.rows.every((r) => r.pay == null)).toBe(true);
    expect(toCsv(out, false)).not.toContain('שכר');
  });

  it('CSV: BOM, מירכאות לשדות עם פסיק / מירכאות, ושורת סיכום', () => {
    const csv = toCsv(buildExport(reports, [hourly], [course], 'regular', opts), true);
    expect(csv.startsWith('﻿')).toBe(true);
    const lines = csv.trim().split('\r\n');
    expect(lines).toHaveLength(1 + 2 + 1);
    expect(lines[2]).toContain('"מכללה, צפון"');
    expect(lines[2]).toContain('"מבוא ""לתכנות"""');
    expect(lines[3].startsWith('סה״כ')).toBe(true);
  });

  it('HTML: RTL, תווים מוברחים וסכום ב־₪', () => {
    const html = toHtml(buildExport(reports, [hourly], [course], 'regular', opts), true, 'דיווח שעות', 'נובמבר');
    expect(html).toContain('dir="rtl"');
    expect(html).toContain('מבוא &quot;לתכנות&quot;');
    expect(html).toContain('₪');
  });

  it('עזרים', () => {
    expect(hoursText(1505)).toBe('25:05');
    expect(exportFileName({ from: '2026-11-01', to: '2026-11-30' }, 'pdf')).toBe('reports_2026-11-01_2026-11-30.pdf');
  });
});
