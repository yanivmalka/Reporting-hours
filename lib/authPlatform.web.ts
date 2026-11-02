/**
 * התחברות גוגל באתר: חלון קופץ של Firebase (ובחסימה — מעבר בהפניה).
 * גרסת אנדרואיד: authPlatform.ts.
 */
import {
  GoogleAuthProvider,
  browserLocalPersistence,
  getAuth,
  setPersistence,
  signInWithPopup,
  signInWithRedirect,
  type Auth,
} from 'firebase/auth';
import type { FirebaseApp } from 'firebase/app';

export function createAuth(app: FirebaseApp): Auth {
  const auth = getAuth(app);
  void setPersistence(auth, browserLocalPersistence).catch(() => {});
  return auth;
}

export async function platformSignIn(auth: Auth): Promise<void> {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  try {
    await signInWithPopup(auth, provider);
  } catch (e: unknown) {
    const code = (e as { code?: string })?.code ?? '';
    // חלון קופץ חסום (למשל בדפדפן מובייל) — מעבר להתחברות בהפניה.
    if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment') {
      await signInWithRedirect(auth, provider);
      return;
    }
    throw e;
  }
}

export async function platformSignOut(): Promise<void> {}
