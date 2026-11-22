import { describe, expect, it } from 'vitest';
import type { Course } from '../lib/courses';
import { buildPlanDays, mailReceivedLabel, mailTextArchived, splitMailReply, unseenMailReports } from '../lib/mailReport';
import { leftoverMinutesFor } from '../lib/reportForm';
import type { WorkReport } from '../lib/reports';
import type { Workplace } from '../lib/workplaces';

const course: Course = {
  id: 'c1',
  workplaceId: 'w1',
  name: 'קורס',
  weekday: 2, // שלישי
  start: '08:30',
  end: '11:40',
  breakMinutes: 10,
  from: '2026-11-01',
  to: '2026-12-31',
};
const wp = { id: 'w1', name: 'מכללה' } as Workplace;

describe('דיווח במייל — התכנון לשרת', () => {
  it('מפגשים שמתקיימים ועוד לא דווחו, לפי יום', () => {
    const days = buildPlanDays([course], [wp], [], '2026-11-17', 14);
    expect(Object.keys(days)).toEqual(['2026-11-17', '2026-11-24']);
    expect(days['2026-11-17'][0]).toMatchObject({ courseId: 'c1', courseName: 'קורס', workplaceName: 'מכללה', start: '08:30', breakMinutes: 10 });
  });
  it('מפגש שדווח יוצא מהתכנון', () => {
    const r = { id: 'r1', workplaceId: 'w1', date: '2026-11-17', start: '08:30', end: '11:40', breaks: [], carriedMinutes: 0, courseId: 'c1', createdAt: 1 } as WorkReport;
    expect(Object.keys(buildPlanDays([course], [wp], [r], '2026-11-17', 14))).toEqual(['2026-11-24']);
  });
  it('ארכיון טקסט המייל אחרי X ימים', () => {
    const day = 86_400_000;
    expect(mailTextArchived(0, 30, 29 * day)).toBe(false);
    expect(mailTextArchived(0, 30, 31 * day)).toBe(true);
  });
});

describe('הודעה על דיווח מהמייל', () => {
  const r = (receivedAt?: number) => ({ viaEmail: receivedAt ? { text: 'x', receivedAt } : undefined });
  it('פעם ראשונה — בלי הודעה, רק מסמנים', () => {
    expect(unseenMailReports([r(5), r(), r(9)], null)).toEqual({ count: 0, latest: 9 });
  });
  it('רק מה שהגיע אחרי הסימון', () => {
    expect(unseenMailReports([r(5), r(12), r(20)], 9)).toEqual({ count: 2, latest: 20 });
    expect(unseenMailReports([r(5)], 9)).toEqual({ count: 0, latest: 9 });
  });
});

// אותם מקרים כמו functions/test/mailRecord.test.mjs ב־apps-platform — השרת משקף את החישוב הזה.
describe('דקות עודפות — זהה לשרת', () => {
  const w = (payBasis?: 'academic' | 'regular') => ({ id: 'w1', payBasis }) as unknown as Workplace;
  it('אקדמי: שארית מ־45; רגיל: 0', () => {
    expect(leftoverMinutesFor(420, w('academic'), 'academic')).toBe(15);
    expect(leftoverMinutesFor(405, w('academic'), 'academic')).toBe(0);
    expect(leftoverMinutesFor(430, w('regular'), 'academic')).toBe(0);
    expect(leftoverMinutesFor(430, w(), 'regular')).toBe(0);
    expect(leftoverMinutesFor(430, w(), 'academic')).toBe(25);
  });
});

describe('splitMailReply', () => {
  it('Gmail בעברית: התשובה לבד, וההתכתבות מהשורה "בתאריך … מאת …:"', () => {
    const text = [
      'כן, 16:00-19:10',
      '',
      '\u202bבתאריך יום ד׳, 18 בנוב׳ 2026 ב-20:00 מאת \u202aדיווח שעות\u202c\u200f <\u202areportinghours.app@gmail.com\u202c\u200f>:\u202c',
      '',
      '> האם התקיים היום הקורס?',
    ].join('\n');
    const { reply, quoted } = splitMailReply(text);
    expect(reply).toBe('כן, 16:00-19:10');
    expect(quoted).toContain('האם התקיים');
  });

  it('Gmail באנגלית — שורת "On … wrote:" שנשברה לשתי שורות', () => {
    const text = 'yes\n\nOn Wed, Nov 18, 2026 at 8:00 PM Reporting <a@b.com>\nwrote:\n> question';
    expect(splitMailReply(text)).toEqual({ reply: 'yes', quoted: 'On Wed, Nov 18, 2026 at 8:00 PM Reporting <a@b.com>\nwrote:\n> question' });
  });

  it('שורות מצוטטות ב־> וכותרת Outlook', () => {
    expect(splitMailReply('בוטל\n> שאלה').reply).toBe('בוטל');
    expect(splitMailReply('התקיים\n\nFrom: Reporting\nSent: today').reply).toBe('התקיים');
  });

  it('בלי ציטוט, או רק ציטוט — הכול מוצג', () => {
    expect(splitMailReply('  כן  ')).toEqual({ reply: 'כן', quoted: '' });
    expect(splitMailReply('> רק ציטוט')).toEqual({ reply: '> רק ציטוט', quoted: '' });
  });
});

describe('mailReceivedLabel', () => {
  it('מציג תאריך ושעה מקומיים', () => {
    const at = new Date(2026, 10, 22, 21, 4).getTime();
    expect(mailReceivedLabel(at)).toMatch(/ · 21:04$/);
    expect(mailReceivedLabel(at)).toContain('22');
  });
});
