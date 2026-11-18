/**
 * נעילת המידע הכספי בטביעת אצבע / זיהוי פנים / קוד המכשיר — הגדרה לבחירת המשתמש, לכל מכשיר
 * בנפרד (`KEYS.appLock`, לא מסונכרן: חלה על מי שמשתמש במכשיר, בכל חשבון — גם בחשבון ששותף).
 *
 * דיווח ותכנון פתוחים תמיד (נעשים גם במקום ציבורי). כשההגדרה מופעלת והמידע נעול:
 *  - מסכים כספיים (לוח בקרה, דוחות שכר, תשלומים, תיאום מס) וקבוצות שכר בעריכת מקום עבודה
 *    מבקשים זיהוי (`FinanceGate` / `FinanceSection` ב־components/AppLock.tsx);
 *  - כל סכום ב־₪ שמוצג ב־`Text` של האפליקציה מוחלף ב־"••• ₪" (`maskMoney`), ולחיצה עליו פותחת.
 * פתיחה אחת חלה על כל האפליקציה, עד שהיא חוזרת מהרקע אחרי יותר מ־`RELOCK_AFTER_MS`.
 * ההפעלה רק אחרי זיהוי מוצלח. אנדרואיד בלבד; ב־web אין נעילה.
 */
import { useSyncExternalStore } from 'react';
import { AppState, Platform } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { readJSON, writeJSON } from './storage';
import { KEYS } from './keys';

export const RELOCK_AFTER_MS = 60_000;
export const appLockPlatform = Platform.OS !== 'web';

type State = { loaded: boolean; enabled: boolean; unlocked: boolean };
let state: State = { loaded: !appLockPlatform, enabled: false, unlocked: false };
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
  void readJSON<{ enabled?: boolean }>(KEYS.appLock, {}).then((v) => set({ loaded: true, enabled: v?.enabled === true }));
  let backgroundAt = 0;
  AppState.addEventListener('change', (st) => {
    if (st === 'background') backgroundAt = Date.now();
    else if (st === 'active') {
      if (backgroundAt && state.unlocked && Date.now() - backgroundAt > RELOCK_AFTER_MS) set({ unlocked: false });
      backgroundAt = 0;
    }
  });
}

const lockedNow = () => state.enabled && !state.unlocked;
/** עד שההגדרה נטענת — נעול, כדי שסכום לא ייחשף לרגע. */
const lockedOrLoading = () => !state.loaded || lockedNow();

/** האם המידע הכספי נעול עכשיו. */
export function useFinanceLocked(): boolean {
  return useSyncExternalStore(subscribe, lockedOrLoading, lockedOrLoading);
}

/** ההגדרה עצמה (לתפריט). */
export function useAppLockEnabled(): boolean {
  return useSyncExternalStore(subscribe, () => state.enabled, () => state.enabled);
}

export { hasMoney, maskMoney } from './moneyMask';

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
export async function authenticate(prompt = 'הצגת מידע כספי'): Promise<boolean> {
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

let pending: Promise<boolean> | null = null;
/** פתיחת המידע הכספי אחרי זיהוי (קריאות חופפות — חלון זיהוי אחד). */
export function unlockFinance(): Promise<boolean> {
  if (!lockedNow()) return Promise.resolve(true);
  pending ??= authenticate().then((ok) => {
    pending = null;
    if (ok) set({ unlocked: true });
    return ok;
  });
  return pending;
}

/** נעילה מיידית של המידע הכספי (בלי לכבות את ההגדרה) — מדף הבית או מקבוצה כספית פתוחה. */
export function lockFinance(): void {
  if (state.enabled && state.unlocked) set({ unlocked: false });
}

/** האם ההגדרה מופעלת והמידע פתוח כרגע (לסימן מנעול פתוח). */
export function useFinanceUnlocked(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => state.enabled && state.unlocked,
    () => state.enabled && state.unlocked,
  );
}

/** הפעלה (רק אחרי זיהוי מוצלח) / כיבוי. מחזיר את המצב שנקבע. */
export async function setAppLockEnabled(on: boolean): Promise<boolean> {
  if (on && !(await authenticate('אישור נעילת המידע הכספי'))) return state.enabled;
  // מי שהפעיל זה עתה — כבר זוהה; המידע נשאר פתוח עד היציאה הבאה מהאפליקציה.
  set({ enabled: on, unlocked: on });
  await writeJSON(KEYS.appLock, { enabled: on });
  return on;
}
