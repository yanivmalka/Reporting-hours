import { describe, expect, it } from 'vitest';
import type { Course } from '../lib/courses';
import { reminderAlerts } from '../lib/home';
import { NO_CANCEL } from '../lib/sessions';
import { effectiveReminder, eveningBefore, moveNoteIn, type SessionNote } from '../lib/sessionNotes';
import type { Workplace } from '../lib/workplaces';

const course: Course = {
  id: 'c1',
  workplaceId: 'w1',
  name: 'קורס',
  weekday: 2, // שלישי
  start: '09:00',
  end: '12:00',
  breakMinutes: 0,
  from: '2026-11-01',
  to: '2026-12-31',
};
const wp = { id: 'w1', name: 'מכללה', arrivalMode: 'car' } as Workplace;
const note = (n: Partial<SessionNote>): SessionNote => ({ courseId: 'c1', date: '2026-11-24', at: 1, ...n });

describe('פרטי מפגש — תזכורות', () => {
  it('הגשה בלי תזכורת מפורשת — ערב לפני; אפשר לבטל', () => {
    expect(eveningBefore('2026-11-24')).toBe('2026-11-23T20:00');
    expect(effectiveReminder(note({ flag: 'submission' }))).toBe('2026-11-23T20:00');
    expect(effectiveReminder(note({ flag: 'submission', reminderOff: true }))).toBeNull();
    expect(effectiveReminder(note({ note: 'להביא מבחנים' }))).toBeNull();
    expect(effectiveReminder(note({ remindAt: '2026-11-24T07:00' }))).toBe('2026-11-24T07:00');
  });

  it('התראה בדף הבית מהמועד ועד סוף המפגש', () => {
    const notes = [note({ flag: 'submission', note: 'הגשת עבודה' })];
    const at = (s: string) => new Date(s);
    expect(reminderAlerts(notes, [wp], [course], [], at('2026-11-23T19:59'), NO_CANCEL)).toHaveLength(0);
    const shown = reminderAlerts(notes, [wp], [course], [], at('2026-11-23T20:00'), NO_CANCEL);
    expect(shown).toHaveLength(1);
    expect(shown[0].title).toContain('הגשה');
    expect(reminderAlerts(notes, [wp], [course], [], at('2026-11-24T12:01'), NO_CANCEL)).toHaveLength(0);
  });

  it('העברת מפגש — הפרטים והתזכורת המפורשת עוברים איתו', () => {
    const list = [note({ note: 'א', remindAt: '2026-11-23T18:30' })];
    const moved = moveNoteIn(list, 'c1', '2026-11-24', '2026-12-01');
    expect(moved).toHaveLength(1);
    expect(moved[0]).toMatchObject({ date: '2026-12-01', remindAt: '2026-11-30T18:30', note: 'א' });
  });
});

describe('פרטי מפגש — סיכום והיסטוריה', () => {
  it('המפגשים הקודמים עם טקסט, מהחדש לישן', async () => {
    const { previousNotes, hasContent } = await import('../lib/sessionNotes');
    const list = [
      note({ date: '2026-11-03', summary: 'מבוא' }),
      note({ date: '2026-11-10', content: 'פרק 2' }),
      note({ date: '2026-11-17', flag: 'test' }),
      note({ date: '2026-11-24', summary: 'עתידי' }),
      note({ courseId: 'c2', date: '2026-11-16', summary: 'קורס אחר' }),
    ];
    expect(previousNotes(list, 'c1', '2026-11-24').map((n) => n.date)).toEqual(['2026-11-10', '2026-11-03']);
    expect(hasContent({ courseId: 'c1', date: '2026-11-24', summary: 'סיכום' })).toBe(true);
  });
  it('סימון "מבחן" — תזכורת אוטומטית בערב שלפני', () => {
    expect(effectiveReminder(note({ flag: 'test' }))).toBe('2026-11-23T20:00');
  });
});
