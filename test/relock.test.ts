import { describe, expect, it } from 'vitest';
import { screenWentOff, shouldRelockOnResume, type ResumeInfo } from '../lib/relock';

const base: ResumeInfo = {
  backgroundAt: 100_000,
  now: 110_000,
  screenOffAt: 0,
  sensorOk: true,
  downAtBackground: false,
  relockAfterMs: 60_000,
  relockAwayMs: 600_000,
};

describe('relock — נעילה בחזרה מהרקע', () => {
  it('המסך כבה ברגע היציאה לרקע (ממש לפניה) — נועל', () => {
    expect(shouldRelockOnResume({ ...base, screenOffAt: 99_500 })).toBe(true);
  });

  it('המסך כבה כשהאפליקציה כבר ברקע — נועל', () => {
    expect(shouldRelockOnResume({ ...base, screenOffAt: 105_000 })).toBe(true);
  });

  it('כיבוי מסך ישן, מלפני היציאה הזו — לא נחשב', () => {
    expect(screenWentOff(100_000, 50_000)).toBe(false);
    expect(shouldRelockOnResume({ ...base, screenOffAt: 50_000 })).toBe(false);
  });

  it('מעבר לאפליקציה אחרת בלי כיבוי מסך — נשאר פתוח', () => {
    expect(shouldRelockOnResume(base)).toBe(false);
  });

  it('בלי המודול (לא ידוע) — הכללים הקודמים', () => {
    expect(shouldRelockOnResume({ ...base, screenOffAt: null })).toBe(false);
    expect(shouldRelockOnResume({ ...base, screenOffAt: null, downAtBackground: true })).toBe(true);
    expect(shouldRelockOnResume({ ...base, screenOffAt: null, now: 800_000 })).toBe(true);
    expect(shouldRelockOnResume({ ...base, screenOffAt: null, sensorOk: false, now: 170_000 })).toBe(true);
  });
});
