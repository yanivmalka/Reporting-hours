import { describe, expect, it } from 'vitest';
import { currentPayPeriod } from '../lib/dashboard';
import { buildPayrollReport, payrollBody } from '../lib/payroll';
import { buildExport, toCsv } from '../lib/exportReports';
import {
  assignTemplate,
  FULL_DETAIL,
  removeTemplate,
  sameDetail,
  sanitizeDetail,
  sanitizeStore,
  SHORT_DETAIL,
  templateFor,
  upsertTemplate,
} from '../lib/payrollTemplate';
import type { Course } from '../lib/courses';
import type { WorkReport } from '../lib/reports';
import type { Workplace } from '../lib/workplaces';

const wp = { id: 'w1', name: 'מכללה', rate: 90, paymentType: 'hourly', payday: 1, payBasis: 'academic' } as Workplace;
const course: Course = {
  id: 'c1',
  workplaceId: 'w1',
  name: 'תכנון',
  weekday: 1,
  start: '09:00',
  end: '12:00',
  breakMinutes: 0,
  from: '2026-09-01',
  to: '2027-01-31',
};
const r = (id: string, date: string, extra: Partial<WorkReport> = {}): WorkReport => ({
  id,
  workplaceId: 'w1',
  date,
  start: '09:00',
  end: '12:00',
  breaks: [],
  carriedMinutes: 0,
  createdAt: 1,
  courseId: 'c1',
  ...extra,
});
// 9:00–12:10 = 190 דק׳: 4 שע׳ אקד׳ (180) ו־10 דק׳ למונה
const reports = [r('a', '2026-11-02', { end: '12:10', carriedMinutes: 10 }), r('b', '2026-11-09')];
const period = currentPayPeriod(1, new Date(2026, 10, 17, 12));
const report = buildPayrollReport(wp, period, reports, [course], 'academic');

describe('דקות שהועברו למונה בדוח השכר', () => {
  it('נספרות בנפרד לכל מפגש, קבוצה ודוח — ואינן בשעות', () => {
    expect(report.carriedMinutes).toBe(10);
    expect(report.groups[0].carriedMinutes).toBe(10);
    expect(report.groups[0].sessions[0]).toMatchObject({ netMinutes: 180, carriedMinutes: 10 });
    expect(report.netMinutes).toBe(360);
  });
  it('במייל המלא — שורת סיכום "הועברו למונה"', () => {
    expect(payrollBody(report)).toContain('דקות עודפות שהועברו למונה המצטבר (לא נכללו בשעות): 10 דק׳');
  });
  it('עמודת "למונה" לכל מפגש לפי הפירוט', () => {
    const body = payrollBody(report, undefined, { ...FULL_DETAIL, carried: true });
    expect(body).toContain('למונה');
    expect(body).toContain('· 10 דק׳ למונה');
  });
  it('בייצוא — עמודה וסיכום', () => {
    const csv = toCsv(
      buildExport(reports, [wp], [course], 'academic', { from: '2026-11-01', to: '2026-11-30', withPay: false }),
      false,
    );
    expect(csv).toContain('למונה המצטבר (דק׳)');
    expect(csv.split('\r\n').at(-2)).toMatch(/,10$/);
  });
});

describe('רמת הפירוט במייל', () => {
  it('ברירת המחדל — כמו הדוח עד כה', () => {
    const body = payrollBody(report);
    expect(body).toContain('תאריך      | יום   | שעות        | שע׳ אקד׳');
    expect(body).toContain('■ תכנון — 2 מפגשים · 8 שעות אקדמיות');
    expect(body).toContain('סה״כ שעות: 8 שעות אקדמיות (6:00 שעות נטו) · 2 ימי עבודה');
  });
  it('מקוצר — בלי שורות מפגשים', () => {
    const body = payrollBody(report, undefined, SHORT_DETAIL);
    expect(body).toContain('■ תכנון — 2 מפגשים');
    expect(body).not.toContain('02/11/2026');
  });
  it('עמודות נוספות ורכיבים כבויים', () => {
    const body = payrollBody(report, undefined, {
      ...FULL_DETAIL,
      weekday: false,
      breaks: true,
      netHours: true,
      pay: false,
      travel: false,
      totalDays: false,
      hebrewPeriod: false,
    });
    expect(body).toContain('תאריך      | שעות        | הפסקה  | נטו    | שע׳ אקד׳');
    expect(body).toContain('8 שעות אקדמיות · 6:00 שעות נטו');
    expect(body).not.toContain('סכום לתשלום');
    expect(body).not.toContain('נסיעות');
    expect(body).not.toContain('ימי עבודה');
  });
  it('שעות נטו בלבד', () => {
    const body = payrollBody(report, undefined, { ...FULL_DETAIL, academicHours: false, netHours: true, totalAcademic: false });
    expect(body).toContain('■ תכנון — 2 מפגשים · 6:00 שעות נטו');
    expect(body).toContain('סה״כ שעות: 6:00 שעות נטו');
  });
});

describe('תבניות', () => {
  it('שדות חסרים מקבלים את ברירת המחדל, ורמה לא מוכרת — "כפי שבמסך"', () => {
    const d = sanitizeDetail({ rows: false, level: 'xyz' as never });
    expect(d.rows).toBe(false);
    expect(d.pay).toBe(true);
    expect(d.level).toBeNull();
  });
  it('שמירה, שיוך למקום ומחיקה', () => {
    let s = sanitizeStore(null);
    expect(templateFor(s, 'w1').id).toBe('full');
    s = upsertTemplate(s, { id: 't1', name: ' שלי ', detail: SHORT_DETAIL });
    s = assignTemplate(s, 'w1', 't1');
    expect(templateFor(s, 'w1').name).toBe('שלי');
    expect(sameDetail(templateFor(s, 'w1').detail, SHORT_DETAIL)).toBe(true);
    s = upsertTemplate(s, { id: 't1', name: 'שלי', detail: FULL_DETAIL });
    expect(s.templates).toHaveLength(1);
    s = removeTemplate(s, 't1');
    expect(templateFor(s, 'w1').id).toBe('full');
    expect(s.byWorkplace).toEqual({});
  });
  it('תבנית מובנית לא נדרסת', () => {
    const s = upsertTemplate(sanitizeStore(null), { id: 'full', name: 'x', detail: SHORT_DETAIL });
    expect(s.templates).toHaveLength(0);
  });
});
