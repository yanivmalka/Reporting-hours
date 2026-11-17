/**
 * מרשם מפתחות האחסון — המקור היחיד לשמות המפתחות ולכללים שלהם.
 *
 * כל מפתח של נתוני האפליקציה מתחיל ב־`reporting-hours/` ומקבל כאן היקף:
 *   - 'synced'       — נתוני משתמש: מסונכרן לענן (lib/sync.ts) ונכלל בגיבוי (lib/backup.ts).
 *   - 'device'       — לכל מכשיר בנפרד: לא מסונכרן ולא מגובה (שפה, ערכת צבעים, סימוני הדגמה).
 *   - 'viewerDevice' — העדפת תצוגה: מסונכרנת בין המכשירים של המשתמש עצמו, אבל כשצופים
 *                      בחשבון של אחר נשארת במכשיר. לא מגובה (אינה נתונים).
 * מפתח עם התחילית שאינו רשום (למשל גרסה ישנה לפני הסבה) נחשב 'synced'.
 *
 * מפתחות תשתית (`reporting-hours-sync/…`, `reporting-hours-backup/…`) בתחילית אחרת,
 * ולכן לעולם לא מסונכרנים, לא מגובים ולא נמחקים ב"מחיקת כל המידע".
 *
 * מוסיפים מפתח? רושמים אותו כאן, ומעדכנים את הטבלה ב־CODEMAP.md.
 */

export const DATA_PREFIX = 'reporting-hours/';

export type KeyScope = 'synced' | 'device' | 'viewerDevice';

const def = <K extends string>(key: K, scope: KeyScope) => ({ key, scope });

const REGISTRY = {
  // ── נתוני משתמש ──
  workplaces: def('reporting-hours/workplaces/v1', 'synced'),
  reports: def('reporting-hours/reports/v1', 'synced'),
  courses: def('reporting-hours/courses/v1', 'synced'),
  sessions: def('reporting-hours/sessions/v1', 'synced'),
  sessionNotes: def('reporting-hours/session-notes/v1', 'synced'),
  holidayCancel: def('reporting-hours/holiday-cancel/v2', 'synced'),
  cancelReasons: def('reporting-hours/cancel-reasons/v1', 'synced'),
  vacations: def('reporting-hours/vacations/v1', 'synced'),
  payroll: def('reporting-hours/payroll/v1', 'synced'),
  accumulated: def('reporting-hours/accumulated/v2', 'synced'),
  redeemMode: def('reporting-hours/redeem-mode/v1', 'synced'),
  payBasis: def('reporting-hours/pay-basis/v1', 'synced'),
  trackingStart: def('reporting-hours/tracking-start/v1', 'synced'),
  leftoverMode: def('reporting-hours/leftover-mode/v1', 'synced'),
  profile: def('reporting-hours/profile/v1', 'synced'),
  emailReport: def('reporting-hours/email-report/v1', 'synced'),
  // ── העדפות תצוגה (לא בחשבון של אחר) ──
  homeDismissed: def('reporting-hours/home-dismissed/v1', 'viewerDevice'),
  recommendDismissed: def('reporting-hours/recommend-dismissed/v1', 'viewerDevice'),
  journalCalendarPin: def('reporting-hours/journal-calendar-pin/v1', 'viewerDevice'),
  showHebrewDates: def('reporting-hours/show-hebrew-dates/v1', 'viewerDevice'),
  // ── לכל מכשיר בנפרד ──
  lang: def('reporting-hours/lang/v1', 'device'),
  theme: def('reporting-hours/theme/v1', 'device'),
  demo: def('reporting-hours/demo/v1', 'device'),
  demoAuto: def('reporting-hours/demo-auto/v1', 'device'),
  mailSeen: def('reporting-hours/mail-seen/v1', 'device'),
  updateDownload: def('reporting-hours/update-download/v1', 'device'),
} as const;

type Registry = typeof REGISTRY;

/** שמות המפתחות: `KEYS.reports` → 'reporting-hours/reports/v1'. */
export const KEYS = Object.fromEntries(Object.entries(REGISTRY).map(([k, v]) => [k, v.key])) as {
  readonly [K in keyof Registry]: Registry[K]['key'];
};

/** מפתחות ישנים — נקראים רק להסבה לגרסה החדשה. */
export const LEGACY_KEYS = {
  accumulatedV1: 'reporting-hours/accumulated/v1',
  holidayCancelV1: 'reporting-hours/holiday-cancel/v1',
} as const;

const SCOPE = new Map<string, KeyScope>(Object.values(REGISTRY).map((v) => [v.key, v.scope]));

/** ההיקף של מפתח; מפתח נתונים שאינו רשום — 'synced'. null למפתח שאינו של נתוני האפליקציה. */
export function keyScope(key: string): KeyScope | null {
  if (!key.startsWith(DATA_PREFIX)) return null;
  return SCOPE.get(key) ?? 'synced';
}

/** מסונכרן לענן (גם העדפות תצוגה). */
export const isSyncedKey = (key: string) => {
  const s = keyScope(key);
  return s === 'synced' || s === 'viewerDevice';
};

/** נשאר במכשיר כשצופים בחשבון של אחר. */
export const isViewerLocalKey = (key: string) => keyScope(key) === 'viewerDevice';

/** נכלל בגיבוי ומוחלף בשחזור: נתוני משתמש בלבד. */
export const isBackedUpKey = (key: string) => keyScope(key) === 'synced';
