import { describe, expect, it } from 'vitest';
import { userDataOnly } from '../lib/backup';
import { KEYS } from '../lib/keys';

describe('גיבוי — רק נתוני המשתמש', () => {
  const raw = {
    [KEYS.workplaces]: JSON.stringify([
      { id: 'wd', name: 'הדגמה', demo: true },
      { id: 'wu', name: 'שלי' },
    ]),
    [KEYS.reports]: JSON.stringify([
      { id: 'r1', workplaceId: 'wd' },
      { id: 'r2', workplaceId: 'wu' },
    ]),
    [KEYS.payroll]: JSON.stringify({ 'wd|2026-10-01': { sentAt: 1 }, 'wu|2026-10-01': { sentAt: 2 } }),
    [KEYS.accumulated]: JSON.stringify({ byWorkplace: { wd: { minutes: 30 }, wu: { minutes: 12 } } }),
  };
  const out = userDataOnly(raw, true);
  const parse = (k: string) => JSON.parse(out[k]);

  it('פריטי הדגמה וכל מה שמשויך אליהם יורדים', () => {
    expect(parse(KEYS.workplaces).map((w: { id: string }) => w.id)).toEqual(['wu']);
    expect(parse(KEYS.reports).map((r: { id: string }) => r.id)).toEqual(['r2']);
    expect(Object.keys(parse(KEYS.payroll))).toEqual(['wu|2026-10-01']);
    expect(Object.keys(parse(KEYS.accumulated).byWorkplace)).toEqual(['wu']);
  });
  it('בלי הדגמה — הקלט נשאר כמו שהוא', () => {
    const clean = { [KEYS.reports]: JSON.stringify([{ id: 'r2', workplaceId: 'wu' }]) };
    expect(userDataOnly(clean, false)).toBe(clean);
  });
});
