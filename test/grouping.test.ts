import { describe, expect, it } from 'vitest';
import { groupItems, parseGroupLevel } from '../lib/courseGrouping';
import { currentPayPeriod } from '../lib/dashboard';
import { buildPayrollReport, NO_COURSE, payrollBody, sessionsByDate } from '../lib/payroll';
import { dayTotalsByWorkplace, dayTotalText, rangeNetMinutes } from '../lib/daySummary';
import { buildExport, toCsv, toHtml } from '../lib/exportReports';
import type { Course } from '../lib/courses';
import type { WorkReport } from '../lib/reports';
import type { Workplace } from '../lib/workplaces';

const wp = { id: 'w1', name: 'מכללה', rate: 90, paymentType: 'hourly', payday: 1, payBasis: 'academic' } as Workplace;
const wp2 = { id: 'w2', name: 'אוניברסיטה', rate: 100, paymentType: 'hourly', payday: 1, payBasis: 'academic' } as Workplace;
const course = (id: string, weekday: number, workplaceId = 'w1', name = 'תכנון'): Course => ({
  id,
  workplaceId,
  name,
  weekday,
  start: '09:00',
  end: '12:00',
  breakMinutes: 0,
  from: '2026-09-01',
  to: '2027-01-31',
});
// אותו שם קורס בימי ב׳ וה׳, ועוד קורס במקום אחר
const courses = [course('mon', 1), course('thu', 4), course('u', 3, 'w2', 'סדנה')];
const r = (id: string, date: string, extra: Partial<WorkReport> = {}): WorkReport => ({
  id,
  workplaceId: 'w1',
  date,
  start: '09:00',
  end: '12:00',
  breaks: [],
  carriedMinutes: 0,
  createdAt: 1,
  ...extra,
});
const reports = [
  r('a', '2026-11-02', { courseId: 'mon' }), // ב׳
  r('b', '2026-11-05', { courseId: 'thu' }), // ה׳
  r('c', '2026-11-09', { courseId: 'mon' }), // ב׳
  r('d', '2026-11-03', { start: '14:00', end: '15:30' }), // ללא קורס, ג׳
  r('e', '2026-11-04', { workplaceId: 'w2', courseId: 'u' }),
];

describe('רמת קיבוץ', () => {
  it('ערכים מגרסה קודמת', () => {
    expect(parseGroupLevel('merged')).toBe('course');
    expect(parseGroupLevel('split')).toBe('courseDay');
    expect(parseGroupLevel('workplace')).toBe('workplace');
    expect(parseGroupLevel('xyz')).toBeNull();
  });

  const src = (x: WorkReport) => ({
    workplaceId: x.workplaceId,
    course: courses.find((c) => c.id === x.courseId)?.name ?? null,
    date: x.date,
  });
  const name = (id: string) => (id === 'w1' ? 'מכללה' : 'אוניברסיטה');

  it('שלוש הרמות — תוויות, סדר, ו"ללא קורס" אחרון', () => {
    expect(groupItems(reports, 'workplace', src, { workplaceName: name }).map((g) => [g.label, g.items.length])).toEqual([
      ['אוניברסיטה', 1],
      ['מכללה', 4],
    ]);
    expect(groupItems(reports, 'course', src, { workplaceName: name }).map((g) => g.label)).toEqual([
      'אוניברסיטה · סדנה',
      'מכללה · תכנון',
      `מכללה · ${NO_COURSE}`,
    ]);
    expect(groupItems(reports, 'courseDay', src).map((g) => [g.label, g.items.map((x) => x.id).join('')])).toEqual([
      ['תכנון · יום ב׳', 'ac'],
      ['תכנון · יום ה׳', 'b'],
      [`${NO_COURSE} · יום ג׳`, 'd'],
      ['סדנה · יום ד׳', 'e'],
    ]);
  });
});

describe('דוח שכר ומייל לפי רמת הקיבוץ', () => {
  const period = currentPayPeriod(1, new Date(2026, 10, 17, 12));
  it('ברירת מחדל — לפי קורס (כמו בעבר)', () => {
    const rep = buildPayrollReport(wp, period, reports, courses, 'academic');
    expect(rep.level).toBe('course');
    expect(rep.groups.map((g) => [g.name, g.sessions.length])).toEqual([
      ['תכנון', 3],
      [NO_COURSE, 1],
    ]);
  });
  it('לפי מקום עבודה — קבוצה אחת; לפי קורס ויום — פיצול לימים; הסכומים זהים', () => {
    const base = buildPayrollReport(wp, period, reports, courses, 'academic');
    const all = buildPayrollReport(wp, period, reports, courses, 'academic', 0, undefined, 'workplace');
    expect(all.groups.map((g) => [g.name, g.sessions.length])).toEqual([['מכללה', 4]]);
    const days = buildPayrollReport(wp, period, reports, courses, 'academic', 0, undefined, 'courseDay');
    expect(days.groups.map((g) => g.name)).toEqual(['תכנון · יום ב׳', 'תכנון · יום ה׳', `${NO_COURSE} · יום ג׳`]);
    for (const x of [all, days]) {
      expect(x.netMinutes).toBe(base.netMinutes);
      expect(x.pay).toBe(base.pay);
    }
    expect(payrollBody(days)).toContain('■ תכנון · יום ב׳ — 2 מפגשים');
  });
});

describe('ייצוא מקובץ', () => {
  const opts = { from: '2026-11-01', to: '2026-11-30', withPay: true };
  it('בלי רמה — רשימה רציפה כמו בעבר', () => {
    const out = buildExport(reports, [wp, wp2], courses, 'academic', opts);
    expect(out.groups).toBeUndefined();
  });
  it('כל המקומות — שם המקום בכותרת; סיכומי ביניים מסתכמים לסה״כ', () => {
    const out = buildExport(reports, [wp, wp2], courses, 'academic', { ...opts, level: 'courseDay' });
    expect(out.groups!.map((g) => g.label)).toEqual([
      'אוניברסיטה · סדנה · יום ד׳',
      'מכללה · תכנון · יום ב׳',
      'מכללה · תכנון · יום ה׳',
      `מכללה · ${NO_COURSE} · יום ג׳`,
    ]);
    expect(out.groups!.reduce((n, g) => n + g.totals.netMinutes, 0)).toBe(out.totals.netMinutes);
    const csv = toCsv(out, true);
    expect(csv).toContain('קיבוץ: לפי מקום עבודה, קורס ויום');
    expect(csv).toContain('סה״כ מכללה · תכנון · יום ב׳');
    expect(toHtml(out, true, 't', 's')).toContain('class="subtotal"');
  });
  it('מקום אחד — בלי שם המקום, חוץ מקיבוץ לפי מקום', () => {
    const one = { ...opts, workplaceId: 'w1' };
    expect(buildExport(reports, [wp, wp2], courses, 'academic', { ...one, level: 'course' }).groups!.map((g) => g.label)).toEqual([
      'תכנון',
      NO_COURSE,
    ]);
    expect(buildExport(reports, [wp, wp2], courses, 'academic', { ...one, level: 'workplace' }).groups!.map((g) => g.label)).toEqual([
      'מכללה',
    ]);
  });
});

describe('לפי מקום עבודה — שעות לפי תאריך', () => {
  const period = currentPayPeriod(1, new Date(2026, 10, 17, 12));
  // שני מפגשים ב־2.11
  const twice = [...reports, r('f', '2026-11-02', { start: '13:00', end: '14:30' })];
  it('שורה לכל תאריך, עם המפגשים לפי שעה וסה״כ', () => {
    const rep = buildPayrollReport(wp, period, twice, courses, 'academic', 0, undefined, 'workplace');
    const days = rep.groups[0].days!;
    expect(days.map((d) => [d.date, d.sessions.map((s) => s.start).join(','), d.netMinutes])).toEqual([
      ['2026-11-02', '09:00,13:00', 270],
      ['2026-11-03', '14:00', 90],
      ['2026-11-05', '09:00', 180],
      ['2026-11-09', '09:00', 180],
    ]);
    expect(payrollBody(rep)).toContain('09:00-12:00, 13:00-14:30');
    expect(payrollBody(rep)).toContain('5 מפגשים · 4 ימים');
  });
  it('ברמות האחרות — בלי קיבוץ לפי תאריך', () => {
    expect(buildPayrollReport(wp, period, twice, courses, 'academic').groups[0].days).toBeUndefined();
  });
  it('sessionsByDate — ממוין', () => {
    const s = (date: string, start: string) => ({ reportId: date + start, date, start, end: start, breakMinutes: 0, netMinutes: 10, carriedMinutes: 0 });
    expect(sessionsByDate([s('2026-01-02', '10:00'), s('2026-01-01', '09:00'), s('2026-01-02', '08:00')]).map((d) => [d.date, d.sessions[0].start, d.netMinutes])).toEqual([
      ['2026-01-01', '09:00', 10],
      ['2026-01-02', '08:00', 20],
    ]);
  });
});

describe('סיכום יומי לפי מקום', () => {
  it('מקבץ לפי מקום בסדר ההופעה', () => {
    const t = dayTotalsByWorkplace([
      { workplaceId: 'b', netMinutes: 90 },
      { workplaceId: 'a', netMinutes: 60 },
      { workplaceId: 'b', netMinutes: 345 },
    ]);
    expect(t).toEqual([
      { workplaceId: 'b', count: 2, netMinutes: 435, carriedMinutes: 0 },
      { workplaceId: 'a', count: 1, netMinutes: 60, carriedMinutes: 0 },
    ]);
    expect(dayTotalText(t[0], true)).toBe('2 מפגשים · 7:15 שעות נטו · 9.67 שע׳ אקד׳');
    expect(dayTotalText(t[1], false, 'דיווחים')).toBe('דיווח אחד · 1:00 שעות נטו');
  });
  it('דקות שהועברו למונה — מחוץ לשעות האקדמיות ומוצגות בנפרד', () => {
    const [t] = dayTotalsByWorkplace([
      { workplaceId: 'a', netMinutes: 100, carriedMinutes: 10 },
      { workplaceId: 'a', netMinutes: 100, carriedMinutes: 10 },
    ]);
    expect(dayTotalText(t, true)).toBe('2 מפגשים · 3:20 שעות נטו · 4 שע׳ אקד׳ · 20 דק׳ למונה');
    expect(dayTotalText(t, false)).toBe('2 מפגשים · 3:20 שעות נטו');
  });
  it('דקות נטו של טווח', () => {
    expect(rangeNetMinutes('10:45', '16:10', 15)).toBe(310);
    expect(rangeNetMinutes('x', '16:10')).toBe(0);
  });
});

import { mergeDotsByDay } from '../lib/dayDots';
describe('עיגול אחד ליום', () => {
  const d = (date: string, state: string) => ({ date, state });
  it('מאחד לפי תאריך ומחשב מצב', () => {
    const m = mergeDotsByDay([
      d('2026-11-01', 'reported'),
      d('2026-11-01', 'reported'),
      d('2026-11-08', 'reported'),
      d('2026-11-08', 'open'),
      d('2026-11-15', 'moved'),
      d('2026-11-15', 'moved'),
      d('2026-11-22', 'open'),
      d('2026-11-22', 'canceled'),
      d('2026-11-29', 'open'),
    ]);
    expect(m.map((x) => [x.date.slice(8), x.state, x.parts.length, `${x.reported}/${x.held}`])).toEqual([
      ['01', 'reported', 2, '2/2'],
      ['08', 'partial', 2, '1/2'],
      ['15', 'moved', 2, '0/0'],
      ['22', 'open', 2, '0/1'],
      ['29', 'open', 1, '0/1'],
    ]);
  });
});
