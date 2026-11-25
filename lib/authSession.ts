/**
 * בקשת זיהוי אחת בכל רגע (lib/appLock.ts), עם התאוששות מבקשה "תקועה".
 *
 * הבאג (25.11.2026): הטלפון הונח בצד כשהאפליקציה פתוחה, המסך כבה, וחלון הזיהוי של המערכת
 * נסגר בלי שהודיע על תוצאה. מאז:
 *  - ב־JS נשארה בקשה ממתינה, וכל לחיצה על "פתיחה" / על סכום קיבלה אותה בקשה שלא תסתיים;
 *  - ב־expo-local-authentication נשאר הדגל `isAuthenticating`, וכל בקשה חדשה נענתה מיד
 *    ב־`app_cancel` — כלומר הנעילה לא השתחררה עד סגירת האפליקציה.
 * התיקון: `app_cancel` ← ביטול הבקשה הישנה במודול (`cancel`) וניסיון חוזר אחד; וכשהאפליקציה
 * חוזרת מהרקע — בקשה שעדיין ממתינה אחרי השהייה קצרה נזנחת (`abandon`), כדי שלחיצה הבאה תפתח
 * חלון זיהוי חדש.
 */

export type AuthResult = { success: boolean; error?: string };

export type AuthDriver = {
  /** חלון הזיהוי של המערכת (LocalAuthentication.authenticateAsync). */
  authenticate: () => Promise<AuthResult>;
  /** ביטול בקשה פתוחה במודול (LocalAuthentication.cancelAuthenticate). */
  cancel: () => Promise<void>;
};

/** זמן ההמתנה אחרי חזרה מהרקע לפני שבקשה שעדיין ממתינה נחשבת תקועה (זיהוי בקוד המכשיר מסתיים לפני). */
export const STALE_AFTER_RESUME_MS = 1500;

async function safeCancel(driver: AuthDriver) {
  try {
    await driver.cancel();
  } catch {
    // אין בקשה פתוחה / המודול לא זמין — אין מה לבטל.
  }
}

async function attempt(driver: AuthDriver): Promise<AuthResult> {
  try {
    return await driver.authenticate();
  } catch {
    return { success: false, error: 'exception' };
  }
}

/** זיהוי אחד; אם המודול חושב שבקשה קודמת עדיין פתוחה — מבטלים אותה ומנסים שוב פעם אחת. */
export async function authenticateWithRecovery(driver: AuthDriver): Promise<boolean> {
  let r = await attempt(driver);
  if (!r.success && r.error === 'app_cancel') {
    await safeCancel(driver);
    r = await attempt(driver);
  }
  return r.success;
}

export function createAuthSession(driver: AuthDriver) {
  let current: { id: number; promise: Promise<boolean> } | null = null;
  let seq = 0;
  return {
    /** בקשה חופפת מקבלת את הבקשה הפתוחה (חלון זיהוי אחד). `onSuccess` — גם אם הבקשה נזנחה בינתיים. */
    run(onSuccess: () => void): Promise<boolean> {
      if (current) return current.promise;
      const id = ++seq;
      const promise = authenticateWithRecovery(driver).then((ok) => {
        if (current?.id === id) current = null;
        if (ok) onSuccess();
        return ok;
      });
      current = { id, promise };
      return promise;
    },
    /** מזהה הבקשה הפתוחה (או null). */
    pendingId(): number | null {
      return current?.id ?? null;
    },
    /** זניחת בקשה (רק אם היא עדיין הפתוחה) וביטולה במודול — הבקשה הבאה תפתח חלון חדש. */
    abandon(id: number): void {
      if (current?.id !== id) return;
      current = null;
      void safeCancel(driver);
    },
  };
}
