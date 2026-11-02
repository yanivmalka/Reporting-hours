/**
 * התחברות גוגל באנדרואיד: בורר החשבונות הנייטיבי של גוגל מחזיר idToken,
 * ו־Firebase מקבל אותו כ־credential. ההתחברות נשמרת במכשיר (AsyncStorage).
 * גרסת האתר: authPlatform.web.ts.
 *
 * דרישה בצד גוגל: אפליקציית אנדרואיד רשומה ב־Firebase (malka-apps) עם החבילה
 * com.reportinghours.app וטביעת ה־SHA-1 של מפתח החתימה — אחרת גוגל דוחה (DEVELOPER_ERROR).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { GoogleSignin, isSuccessResponse } from '@react-native-google-signin/google-signin';
import type { FirebaseApp } from 'firebase/app';
import { GoogleAuthProvider, getAuth, initializeAuth, signInWithCredential, type Auth, type Persistence } from 'firebase/auth';

/** Web client ID של הפרויקט (ציבורי). Firebase מאמת מולו את ה־idToken. */
const WEB_CLIENT_ID = '141711225817-2ftkm9a8sdnd556m5hdpsbj642bgfapl.apps.googleusercontent.com';

// getReactNativePersistence קיים רק בבניית React Native של firebase/auth (שאליה Metro מפנה),
// ולכן אינו מופיע בטיפוסים של הדפדפן ש־TypeScript קורא.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { getReactNativePersistence } = require('firebase/auth') as {
  getReactNativePersistence: (storage: typeof AsyncStorage) => Persistence;
};

export function createAuth(app: FirebaseApp): Auth {
  try {
    return initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) });
  } catch {
    return getAuth(app); // כבר אותחל (טעינה חמה בפיתוח)
  }
}

let configured = false;
function configure() {
  if (configured) return;
  GoogleSignin.configure({ webClientId: WEB_CLIENT_ID });
  configured = true;
}

export async function platformSignIn(auth: Auth): Promise<void> {
  configure();
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  const res = await GoogleSignin.signIn();
  if (!isSuccessResponse(res)) {
    // המשתמש סגר את הבורר — כמו סגירת החלון באתר.
    throw Object.assign(new Error('cancelled'), { code: 'auth/popup-closed-by-user' });
  }
  const token = res.data.idToken;
  if (!token) throw new Error('google-no-id-token');
  await signInWithCredential(auth, GoogleAuthProvider.credential(token));
}

/** ניתוק גם מגוגל במכשיר — כדי שבפעם הבאה יוצג שוב בורר החשבונות. */
export async function platformSignOut(): Promise<void> {
  configure();
  try {
    await GoogleSignin.signOut();
  } catch {
    // לא מחובר — אין מה לנתק.
  }
}
