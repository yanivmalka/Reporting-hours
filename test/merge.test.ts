import { describe, expect, it } from 'vitest';
import { merge3, merge3Raw } from '../lib/merge';

const rec = (id: string, v: number) => ({ id, v });

describe('מיזוג תלת־כיווני בסנכרון', () => {
  it('צד אחד שינה — השינוי שלו', () => {
    expect(merge3(1, 2, 1)).toBe(2);
    expect(merge3(1, 1, 3)).toBe(3);
  });
  it('שני הצדדים שינו ערך פשוט — המכשיר מנצח', () => {
    expect(merge3(1, 2, 3)).toBe(2);
  });
  it('רשימת רשומות: הוספות משני הצדדים נשמרות', () => {
    const base = [rec('a', 1)];
    const out = merge3(base, [rec('a', 1), rec('b', 1)], [rec('a', 1), rec('c', 1)]) as { id: string }[];
    expect(out.map((x) => x.id).sort()).toEqual(['a', 'b', 'c']);
  });
  it('רשומה שנמחקה בצד אחד ולא שונתה בשני — נמחקת', () => {
    const base = [rec('a', 1), rec('b', 1)];
    const out = merge3(base, [rec('a', 1)], [rec('a', 1), rec('b', 1)]) as { id: string }[];
    expect(out.map((x) => x.id)).toEqual(['a']);
  });
  it('רשומה שנמחקה בצד אחד ושונתה בשני — נשארת (השינוי לא הולך לאיבוד)', () => {
    const base = [rec('a', 1)];
    expect(merge3(base, [], [rec('a', 2)])).toEqual([rec('a', 2)]);
  });
  it('שינויים בשדות שונים של אותה רשומה — שניהם נשמרים', () => {
    const base = [{ id: 'a', note: 'x', end: '12:00' }];
    const out = merge3(base, [{ id: 'a', note: 'y', end: '12:00' }], [{ id: 'a', note: 'x', end: '13:00' }]);
    expect(out).toEqual([{ id: 'a', note: 'y', end: '13:00' }]);
  });
  it('סימוני מפגש מזוהים לפי קורס + תאריך', () => {
    const m = (date: string, status: string) => ({ courseId: 'c', date, status });
    const out = merge3([], [m('2026-11-03', 'canceled')], [m('2026-11-10', 'held')]) as unknown[];
    expect(out).toHaveLength(2);
  });
  it('מונה הדקות (additive): שינויים מקבילים מצטברים', () => {
    const base = { byWorkplace: { w: { minutes: 10 } } };
    const local = { byWorkplace: { w: { minutes: 25 } } }; // +15 במכשיר
    const remote = { byWorkplace: { w: { minutes: 30 } } }; // +20 בענן
    expect(merge3(base, local, remote, true)).toEqual({ byWorkplace: { w: { minutes: 45 } } });
    expect(merge3(base, local, remote, false)).toEqual(local);
  });
  it('merge3Raw: בלי בסיס — איחוד; JSON פגום — הערך המקומי', () => {
    expect(JSON.parse(merge3Raw(null, JSON.stringify([rec('a', 1)]), JSON.stringify([rec('b', 1)]))).length).toBe(2);
    expect(merge3Raw(null, 'not json', '[]')).toBe('not json');
  });
});
