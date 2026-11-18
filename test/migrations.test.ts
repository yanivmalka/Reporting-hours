import { beforeEach, describe, expect, it } from 'vitest';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ensureMigrated, MIGRATIONS, runMigrations, SCHEMA_VERSION } from '../lib/migrations';
import { loadAccumulated } from '../lib/accumulated';
import { loadHolidaySettings } from '../lib/sessions';
import { KEYS, LEGACY_KEYS } from '../lib/keys';

const set = (k: string, v: unknown) => AsyncStorage.setItem(k, JSON.stringify(v));
const get = async (k: string) => JSON.parse((await AsyncStorage.getItem(k)) ?? 'null');

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('הסבות נתונים', () => {
  it('גרסאות רצופות וייחודיות', () => {
    const versions = MIGRATIONS.map((m) => m.version);
    expect(versions).toEqual(versions.map((_, i) => i + 1));
    expect(SCHEMA_VERSION).toBe(MIGRATIONS.length);
    expect(new Set(MIGRATIONS.map((m) => m.id)).size).toBe(MIGRATIONS.length);
  });

  it('מונה גלובלי ישן ← מונה לכל מקום, והסכום נשמר', async () => {
    await set(LEGACY_KEYS.accumulatedV1, { minutes: 999, redeemedHours: 1 });
    await set(KEYS.reports, [
      { workplaceId: 'a', carriedMinutes: 40 },
      { workplaceId: 'a', carriedMinutes: 30 },
      { workplaceId: 'b', carriedMinutes: 20 },
    ]);
    const acc = await loadAccumulated();
    // 70 דק׳ ב־a, שעה אחת (45) נפדתה ממנו
    expect(acc.byWorkplace.a).toEqual({ minutes: 25, redeemedHours: 1 });
    expect(acc.byWorkplace.b).toEqual({ minutes: 20, redeemedHours: 0 });
    // הישן לא נמחק; הרצה נוספת לא משנה
    expect(await get(LEGACY_KEYS.accumulatedV1)).not.toBeNull();
    expect(await runMigrations()).toEqual([]);
  });

  it('לא דורסת מבנה חדש קיים', async () => {
    await set(LEGACY_KEYS.accumulatedV1, { redeemedHours: 3 });
    await set(KEYS.accumulated, { byWorkplace: { a: { minutes: 10, redeemedHours: 0 } } });
    expect(await runMigrations()).toEqual([]);
    expect((await loadAccumulated()).byWorkplace.a.minutes).toBe(10);
  });

  it('חגים: בוליאני ישן ← הגדרה לכל סוג יום', async () => {
    await set(LEGACY_KEYS.holidayCancelV1, false);
    expect(await ensureMigrated()).toEqual(['holiday-cancel-v2']);
    const s = await loadHolidaySettings();
    expect(s.yomTov).toBe(false);
    expect(s.eve).toBe(false);
  });

  it('בלי נתונים ישנים — כלום לא רץ; קריאות במקביל — הרצה אחת', async () => {
    const [a, b] = await Promise.all([ensureMigrated(), ensureMigrated()]);
    expect(a).toEqual([]);
    expect(a).toBe(b);
    expect((await loadHolidaySettings()).yomTov).toBe(true);
  });
});
