/**
 * נעילת האפליקציה בטביעת אצבע / זיהוי פנים / קוד המכשיר — הגדרה לבחירת המשתמש, לכל מכשיר
 * בנפרד (`KEYS.appLock`, לא מסונכרן: חלה על מי שמשתמש במכשיר, בכל חשבון — גם בחשבון ששותף).
 *
 * - מופעלת רק אחרי זיהוי מוצלח (כדי שלא ננעלים בטעות).
 * - נועלת בפתיחה, ובחזרה לאפליקציה אחרי יותר מ־`RELOCK_AFTER_MS` ברקע (חזרה מהירה — למשל מבורר
 *   קבצים, אנשי קשר או מתקין העדכון — לא נועלת).
 * - מצב הנעילה ברמת המודול (`useAppLocked`), כדי שגם חלונות אחרים (עדכון) לא יוצגו מעל מסך הנעילה.
 * אנדרואיד בלבד; ב־web אין נעילה.
 */
import { useSyncExternalStore } from 'react';
import { AppState, Platform } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { readJSON, writeJSON } from './storage';
import { KEYS } from './keys';

export const RELOCK_AFTER_MS = 60_000;
export const appLockPlatform = Platform.OS !== 'web';

type State = { loaded: boolean; enabled: boolean; locked: boolean };
let state: State = { loaded: !appLockPlatform, enabled: false, locked: false };
const listeners = new Set<() => void>();
function set(next: Partial<State>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

if (appLockPlatform) {
  void readJSON<{ enabled?: boolean }>(KEYS.appLock, {}).then((v) => {
    const enabled = v?.enabled === true;
    set({ loaded: true, enabled, locked: enabled });
  });
  let backgroundAt = 0;
  AppState.addEventListener('change', (st) => {
    if (st === 'background') backgroundAt = Date.now();
    else if (st === 'active' && backgroundAt && state.enabled && Date.now() - backgroundAt > RELOCK_AFTER_MS) {
      set({ locked: true });
    }
    if (st === 'active') backgroundAt = 0;
  });
}

/** מצב הנעילה: `loaded` — ההגדרה נטענה (עד אז מציגים את מסך הנעילה אם ייתכן שהיא מופעלת). */
export function useAppLock(): State {
  return useSyncExternalStore(subscribe, () => state, () => state);
}

/** האם יש במכשיר אמצעי זיהוי (ביומטרי או קוד / תבנית / סיסמה). */
export async function lockAvailable(): Promise<boolean> {
  if (!appLockPlatform) return false;
  try {
    return (await LocalAuthentication.getEnrolledLevelAsync()) > LocalAuthentication.SecurityLevel.NONE;
  } catch {
    return false;
  }
}

/** זיהוי — טביעת אצבע / פנים, ואם אין או נכשל: קוד המכשיר. */
export async function authenticate(prompt = 'פתיחת דיווח שעות'): Promise<boolean> {
  try {
    const r = await LocalAuthentication.authenticateAsync({
      promptMessage: prompt,
      cancelLabel: 'ביטול',
      disableDeviceFallback: false,
    });
    return r.success;
  } catch {
    return false;
  }
}

/** פתיחת הנעילה אחרי זיהוי. */
export async function unlock(): Promise<boolean> {
  const ok = await authenticate();
  if (ok) set({ locked: false });
  return ok;
}

/** הפעלה (רק אחרי זיהוי מוצלח) / כיבוי. מחזיר את המצב שנקבע. */
export async function setAppLockEnabled(on: boolean): Promise<boolean> {
  if (on && !(await authenticate('אישור נעילת האפליקציה'))) return state.enabled;
  set({ enabled: on, locked: false });
  await writeJSON(KEYS.appLock, { enabled: on });
  return on;
}
