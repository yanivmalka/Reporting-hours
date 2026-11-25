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
import { authenticateWithRecovery, createAuthSession, STALE_AFTER_RESUME_MS, type AuthDriver } from './authSession';

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
      // חלון זיהוי שהיה פתוח כשהאפליקציה ירדה לרקע (למשל המסך כבה) נסגר לפעמים בלי תוצאה —
      // אם הבקשה עדיין ממתינה אחרי השהייה קצרה, היא נזנחת, ולחיצה הבאה פותחת חלון חדש.
      const stale = session.pendingId();
      if (backgroundAt && stale != null) setTimeout(() => session.abandon(stale), STALE_AFTER_RESUME_MS);
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

function driver(prompt: string): AuthDriver {
  return {
    authenticate: () =>
      LocalAuthentication.authenticateAsync({
        promptMessage: prompt,
        cancelLabel: 'ביטול',
        disableDeviceFallback: false,
      }),
    cancel: () => LocalAuthentication.cancelAuthenticate(),
  };
}

/** זיהוי — טביעת אצבע / פנים, ואם אין או נכשל: קוד המכשיר (עם התאוששות מבקשה תקועה, lib/authSession.ts). */
export function authenticate(prompt = 'הצגת מידע כספי'): Promise<boolean> {
  return authenticateWithRecovery(driver(prompt));
}

const session = createAuthSession(driver('הצגת מידע כספי'));
/** פתיחת המידע הכספי אחרי זיהוי (קריאות חופפות — חלון זיהוי אחד). */
export function unlockFinance(): Promise<boolean> {
  if (!lockedNow()) return Promise.resolve(true);
  return session.run(() => set({ unlocked: true }));
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
