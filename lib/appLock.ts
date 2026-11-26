/**
 * נעילת המידע הכספי בטביעת אצבע / זיהוי פנים / קוד המכשיר — הגדרה לבחירת המשתמש, לכל מכשיר
 * בנפרד (`KEYS.appLock`, לא מסונכרן: חלה על מי שמשתמש במכשיר, בכל חשבון — גם בחשבון ששותף).
 *
 * דיווח ותכנון פתוחים תמיד (נעשים גם במקום ציבורי). כשההגדרה מופעלת והמידע נעול:
 *  - מסכים כספיים (לוח בקרה, דוחות שכר, תשלומים, תיאום מס) וקבוצות שכר בעריכת מקום עבודה
 *    מבקשים זיהוי (`FinanceGate` / `FinanceSection` ב־components/AppLock.tsx);
 *  - כל סכום ב־₪ שמוצג ב־`Text` של האפליקציה מוחלף ב־"••• ₪" (`maskMoney`), ולחיצה עליו פותחת.
 * פתיחה אחת חלה על כל האפליקציה, עד שהטלפון מונח מהיד (lib/putDown.ts — מד התאוצה, רק כשהמידע
 * פתוח והאפליקציה פעילה): דומם ~10 שנ׳ כששוכב / ~30 שנ׳ בתנוחה אחרת, בלי נגיעה במסך.
 * **כיבוי המסך נועל תמיד** (modules/screen-state, lib/relock.ts): כבה בזמן שהאפליקציה פתוחה — הנעילה
 * מיד ביציאה לרקע, כך שבהדלקה מוצג שוב מסך "מידע כספי נעול" בלי שהסכומים ייחשפו לרגע; כבה כשהיא
 * ברקע — נועלים בחזרה.
 * יציאה מהאפליקציה לבדה לא נועלת: נועלים בחזרה רק אם הטלפון כבר היה מונח כשיצאה לרקע
 * (למשל המסך כבה על השולחן), או אם עברו יותר מ־`RELOCK_AWAY_MS`. אין מד תאוצה — הכלל הישן
 * (חזרה מהרקע אחרי יותר מ־`RELOCK_AFTER_MS`).
 * ההפעלה רק אחרי זיהוי מוצלח. אנדרואיד בלבד; ב־web אין נעילה.
 */
import { useSyncExternalStore } from 'react';
import { AppState, Platform } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { Accelerometer } from 'expo-sensors';
import { createPutDownDetector, SAMPLE_INTERVAL_MS } from './putDown';
import { shouldRelockOnResume } from './relock';
import { isScreenOn, screenOffAt } from '../modules/screen-state/src';
import { readJSON, writeJSON } from './storage';
import { KEYS } from './keys';
import { authenticateWithRecovery, createAuthSession, STALE_AFTER_RESUME_MS, type AuthDriver } from './authSession';

/** בלי מד תאוצה — נעילה בחזרה מהרקע אחרי דקה (הכלל הקודם). */
export const RELOCK_AFTER_MS = 60_000;
/** עם מד תאוצה — רשת ביטחון: חזרה אחרי היעדרות ארוכה נועלת גם אם הטלפון לא זוהה כמונח. */
export const RELOCK_AWAY_MS = 10 * 60_000;
/** דומם לפחות כך ברגע היציאה לרקע — הטלפון כבר היה מונח. */
const DOWN_AT_BACKGROUND_MS = 3_000;
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

const detector = createPutDownDetector();
let sensorOk: boolean | null = null;
let sensorSub: { remove(): void } | null = null;
let appActive = AppState.currentState !== 'background';

/** מד התאוצה פועל רק כשיש מה לנעול: ההגדרה מופעלת, המידע פתוח והאפליקציה פעילה. */
function updateMonitor() {
  const want = appLockPlatform && sensorOk === true && state.enabled && state.unlocked && appActive;
  if (want && !sensorSub) {
    detector.reset();
    Accelerometer.setUpdateInterval(SAMPLE_INTERVAL_MS);
    sensorSub = Accelerometer.addListener(({ x, y, z }) => {
      const t = Date.now();
      detector.add({ x, y, z, t });
      if (detector.putDown(t)) set({ unlocked: false });
    });
  } else if (!want && sensorSub) {
    sensorSub.remove();
    sensorSub = null;
  }
}

/** נגיעה במסך (מהשורש, app/_layout.tsx) — הטלפון בשימוש, ולכן לא "מונח". */
export function noteFinanceTouch(): void {
  if (sensorSub) detector.touch(Date.now());
}

if (appLockPlatform) {
  void readJSON<{ enabled?: boolean }>(KEYS.appLock, {}).then((v) => set({ loaded: true, enabled: v?.enabled === true }));
  void Accelerometer.isAvailableAsync()
    .catch(() => false)
    .then((ok) => {
      sensorOk = ok;
      updateMonitor();
    });
  listeners.add(updateMonitor);
  let backgroundAt = 0;
  let downAtBackground = false;
  AppState.addEventListener('change', (st) => {
    if (st === 'background') {
      const now = Date.now();
      backgroundAt = now;
      downAtBackground = sensorSub != null && detector.stillFor(now) >= DOWN_AT_BACKGROUND_MS;
      // המסך כבה (הטלפון הונח / כפתור ההפעלה) — נועלים כבר עכשיו, לפני ההדלקה הבאה
      if (state.unlocked && isScreenOn() === false) set({ unlocked: false });
      appActive = false;
      updateMonitor();
    } else if (st === 'active') {
      // חלון זיהוי שהיה פתוח כשהאפליקציה ירדה לרקע (למשל המסך כבה) נסגר לפעמים בלי תוצאה —
      // אם הבקשה עדיין ממתינה אחרי השהייה קצרה, היא נזנחת, ולחיצה הבאה פותחת חלון חדש.
      const stale = session.pendingId();
      if (backgroundAt && stale != null) setTimeout(() => session.abandon(stale), STALE_AFTER_RESUME_MS);
      if (backgroundAt && state.unlocked) {
        const relock = shouldRelockOnResume({
          backgroundAt,
          now: Date.now(),
          screenOffAt: screenOffAt(),
          sensorOk: sensorOk === true,
          downAtBackground,
          relockAfterMs: RELOCK_AFTER_MS,
          relockAwayMs: RELOCK_AWAY_MS,
        });
        if (relock) set({ unlocked: false });
      }
      backgroundAt = 0;
      downAtBackground = false;
      appActive = true;
      updateMonitor();
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
