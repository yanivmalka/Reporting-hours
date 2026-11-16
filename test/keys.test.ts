import { describe, expect, it } from 'vitest';
import { KEYS, LEGACY_KEYS, isBackedUpKey, isSyncedKey, isViewerLocalKey, keyScope } from '../lib/keys';

describe('מרשם המפתחות', () => {
  it('אין שני שמות לאותו מפתח', () => {
    const all = [...Object.values(KEYS), ...Object.values(LEGACY_KEYS)];
    expect(new Set(all).size).toBe(all.length);
  });
  it('נתוני משתמש: מסונכרנים ומגובים', () => {
    for (const k of [KEYS.reports, KEYS.workplaces, KEYS.courses, KEYS.sessions, KEYS.payroll, KEYS.accumulated]) {
      expect(isSyncedKey(k)).toBe(true);
      expect(isBackedUpKey(k)).toBe(true);
    }
  });
  it('העדפות מכשיר והדגמה: לא מסונכרנות ולא מגובות', () => {
    for (const k of [KEYS.lang, KEYS.theme, KEYS.demo, KEYS.demoAuto]) {
      expect(isSyncedKey(k)).toBe(false);
      expect(isBackedUpKey(k)).toBe(false);
    }
  });
  it('העדפות תצוגה: מסונכרנות, נשארות במכשיר אצל צופה, ולא מגובות', () => {
    for (const k of [KEYS.homeDismissed, KEYS.showHebrewDates]) {
      expect(isSyncedKey(k)).toBe(true);
      expect(isViewerLocalKey(k)).toBe(true);
      expect(isBackedUpKey(k)).toBe(false);
    }
  });
  it('מפתח נתונים לא רשום (גרסה ישנה) — כמו נתוני משתמש; תשתית — מחוץ לנתונים', () => {
    expect(keyScope(LEGACY_KEYS.accumulatedV1)).toBe('synced');
    expect(keyScope('reporting-hours-sync/meta/v1')).toBeNull();
    expect(isBackedUpKey('reporting-hours-backup/done/v1')).toBe(false);
  });
});
