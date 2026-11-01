/**
 * חיבור לפרויקט Firebase המשותף `malka-apps` (הפלטפורמה של כל האפליקציות,
 * ריפו yanivmalka/apps-platform). הנתונים של אפליקציה זו נשמרים תחת
 * `apps/reporting-hours/users/{uid}/...` — רק המשתמש עצמו קורא וכותב (firestore.rules שם).
 *
 * ההגדרות כאן ציבוריות (לא סוד): ההרשאות נאכפות בחוקי האבטחה של Firestore.
 *
 * בשלב זה ההתחברות והסנכרון פעילים בגרסת האתר בלבד. באנדרואיד התחברות גוגל
 * דורשת build ייעודי (EAS) — יתווסף בהמשך; עד אז האפליקציה שומרת מקומית בלבד.
 */
import { Platform } from 'react-native';
import { getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import {
  GoogleAuthProvider,
  browserLocalPersistence,
  getAuth,
  onAuthStateChanged,
  setPersistence,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type Auth,
  type User,
} from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';

export const APP_ID = 'reporting-hours';

const firebaseConfig = {
  apiKey: 'AIzaSyAVyw2RUh3T0UPaxbCluCgFKzkLaGZOIyQ',
  authDomain: 'malka-apps.firebaseapp.com',
  projectId: 'malka-apps',
  storageBucket: 'malka-apps.firebasestorage.app',
  messagingSenderId: '141711225817',
  appId: '1:141711225817:web:30ceb430dee31b59ebdfc8',
};

/** סנכרון ענן נתמך כרגע רק בדפדפן (ולא בזמן בניית הדפים הסטטיים). */
export const cloudSupported = Platform.OS === 'web' && typeof window !== 'undefined';

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;

function ensure(): { auth: Auth; db: Firestore } | null {
  if (!cloudSupported) return null;
  if (!app) {
    app = getApps()[0] ?? initializeApp(firebaseConfig);
    auth = getAuth(app);
    void setPersistence(auth, browserLocalPersistence).catch(() => {});
    db = getFirestore(app);
  }
  return { auth: auth!, db: db! };
}

export function firestore(): Firestore | null {
  return ensure()?.db ?? null;
}

export type CloudUser = { uid: string; name: string | null; email: string | null };

function toCloudUser(u: User | null): CloudUser | null {
  return u ? { uid: u.uid, name: u.displayName, email: u.email } : null;
}

/** מאזין לשינויי התחברות. מחזיר פונקציית ביטול. */
export function watchUser(cb: (u: CloudUser | null) => void): () => void {
  const f = ensure();
  if (!f) {
    cb(null);
    return () => {};
  }
  return onAuthStateChanged(f.auth, (u) => cb(toCloudUser(u)));
}

export async function signInWithGoogle(): Promise<void> {
  const f = ensure();
  if (!f) throw new Error('cloud-unsupported');
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  try {
    await signInWithPopup(f.auth, provider);
  } catch (e: unknown) {
    const code = (e as { code?: string })?.code ?? '';
    // חלון קופץ חסום (למשל בדפדפן מובייל) — מעבר להתחברות בהפניה.
    if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment') {
      await signInWithRedirect(f.auth, provider);
      return;
    }
    throw e;
  }
}

export async function signOutCloud(): Promise<void> {
  const f = ensure();
  if (f) await signOut(f.auth);
}
