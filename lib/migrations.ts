/**
 * הסבות נתונים — במקום אחד, לפי סדר וגרסה.
 *
 * כל הסבה ממירה מפתח ישן (`LEGACY_KEYS`) למבנה החדש, והיא אידמפוטנטית: רצה רק כשהמפתח החדש
 * חסר והישן קיים, ולא מוחקת את הישן (מכשיר עם גרסה ישנה עוד עשוי לקרוא אותו). לכן אפשר להריץ
 * אותן בכל רגע — גם אחרי שהנתונים הוחלפו (סנכרון, שחזור גיבוי, מעבר לחשבון ששותף), כשמגיעים
 * נתונים בפורמט ישן. בחשבון ששותף — רק מפתחות שהמורשה רשאי לכתוב (`canWriteKey`).
 *
 * המודולים קוראים `ensureMigrated()` לפני טעינת המפתח שלהם (`loadAccumulated`, `loadHolidaySettings`).
 * הבדיקה זולה (כמה קריאות מהאחסון), והרצות במקביל מתאחדות להרצה אחת.
 *
 * מוסיפים הסבה? מוסיפים בסוף `MIGRATIONS` עם `version` הבא, רושמים את המפתח הישן ב־`LEGACY_KEYS`
 * (lib/keys.ts), קוראים `ensureMigrated()` בטוען של המפתח החדש, ומוסיפים בדיקה ב־test/migrations.test.ts.
 * אין להשאיר במודולים הסבות "עצלות" משלהם.
 */
import { ACADEMIC_HOUR_MINUTES } from './academic';
import { readJSON, writeJSON } from './storage';
import { KEYS, LEGACY_KEYS } from './keys';
import { canWriteKey } from './sync';

export type Migration = {
  /** מספר רץ — הסדר שבו ההסבות רצות */
  version: number;
  id: string;
  description: string;
  /** המפתח שההסבה כותבת — בחשבון ששותף בלי הרשאת כתיבה אליו ההסבה לא רצה */
  writes: string;
  /** האם צריך להריץ (המפתח החדש חסר והישן קיים) */
  needed: () => Promise<boolean>;
  run: () => Promise<void>;
};

const has = async (key: string) => (await readJSON<unknown>(key, null)) != null;

const toCount = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;

/**
 * 1 — מונה הדקות המצטברות: ממונה גלובלי אחד (`accumulated/v1`) למונה לכל מקום עבודה (`v2`).
 * הדקות שהועברו בכל דיווח (`carriedMinutes`) משויכות למקום העבודה של הדיווח, והשעות שכבר נפדו
 * מחולקות בין המקומות (קודם למקום שצבר הכי הרבה דקות), כך שהסכום הכולל נשמר.
 */
const accumulatedPerWorkplace: Migration = {
  version: 1,
  id: 'accumulated-v2',
  description: 'מונה דקות מצטברות לכל מקום עבודה',
  writes: KEYS.accumulated,
  needed: async () => !(await has(KEYS.accumulated)) && (await has(LEGACY_KEYS.accumulatedV1)),
  run: async () => {
    const legacy = await readJSON<{ redeemedHours?: unknown } | null>(LEGACY_KEYS.accumulatedV1, null);
    if (!legacy) return;
    const reports = await readJSON<{ workplaceId: string; carriedMinutes?: number }[]>(KEYS.reports, []);
    const byWorkplace: Record<string, { minutes: number; redeemedHours: number }> = {};
    for (const r of reports) {
      const m = toCount(r.carriedMinutes);
      if (m === 0) continue;
      const e = (byWorkplace[r.workplaceId] ??= { minutes: 0, redeemedHours: 0 });
      e.minutes += m;
    }
    let toRedeem = toCount(legacy.redeemedHours);
    while (toRedeem > 0) {
      const richest = Object.values(byWorkplace)
        .filter((e) => e.minutes >= ACADEMIC_HOUR_MINUTES)
        .sort((a, b) => b.minutes - a.minutes)[0];
      if (!richest) break;
      richest.minutes -= ACADEMIC_HOUR_MINUTES;
      richest.redeemedHours += 1;
      toRedeem -= 1;
    }
    await writeJSON(KEYS.accumulated, { byWorkplace });
  },
};

/**
 * 2 — ביטול אוטומטי בימים מיוחדים: מבוליאני אחד (`holiday-cancel/v1`, חגים בלבד) להגדרה לכל
 * סוג יום (`v2`). שאר הסוגים — ברירת המחדל (ב־`loadHolidaySettings`).
 */
const holidayKinds: Migration = {
  version: 2,
  id: 'holiday-cancel-v2',
  description: 'ביטול אוטומטי לפי סוג יום מיוחד',
  writes: KEYS.holidayCancel,
  needed: async () =>
    !(await has(KEYS.holidayCancel)) && typeof (await readJSON<unknown>(LEGACY_KEYS.holidayCancelV1, null)) === 'boolean',
  run: async () => {
    const legacy = await readJSON<unknown>(LEGACY_KEYS.holidayCancelV1, null);
    if (typeof legacy !== 'boolean') return;
    await writeJSON(KEYS.holidayCancel, { yomTov: legacy });
  },
};

/** כל ההסבות, לפי הסדר. */
export const MIGRATIONS: readonly Migration[] = [accumulatedPerWorkplace, holidayKinds];

/** גרסת הסכמה של הקוד — מספר ההסבה האחרונה. */
export const SCHEMA_VERSION = Math.max(0, ...MIGRATIONS.map((m) => m.version));

/** מריץ לפי הסדר את ההסבות שנדרשות. מחזיר את המזהים של מה שרץ. */
export async function runMigrations(): Promise<string[]> {
  const ran: string[] = [];
  for (const m of [...MIGRATIONS].sort((a, b) => a.version - b.version)) {
    try {
      // מורשה בלי הרשאת כתיבה למפתח (צפייה / מדווח) — ההסבה תרוץ אצל הבעלים.
      if (!canWriteKey(m.writes) || !(await m.needed())) continue;
      await m.run();
      ran.push(m.id);
    } catch (e) {
      // הסבה שנכשלה לא חוסמת את האפליקציה — תנסה שוב בטעינה הבאה.
      console.warn(`[migrate] ${m.id} failed`, e);
    }
  }
  return ran;
}

let inFlight: Promise<string[]> | null = null;

/** מוודא שההסבות הנדרשות רצו; קריאות במקביל מחכות להרצה אחת. */
export function ensureMigrated(): Promise<string[]> {
  inFlight ??= runMigrations().finally(() => {
    inFlight = null;
  });
  return inFlight;
}
