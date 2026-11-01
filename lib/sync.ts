/**
 * סנכרון הנתונים המקומיים עם Firestore.
 *
 * המכשיר נשאר מקור האמת המיידי: כל המסכים ממשיכים לקרוא ולכתוב דרך
 * lib/storage.ts (AsyncStorage / localStorage), והאפליקציה עובדת גם בלי רשת.
 * כשהמשתמש מחובר עם גוגל, כל מפתח אחסון משוכפל למסמך אחד:
 *
 *   apps/reporting-hours/users/{uid}/kv/{key}   { v: <JSON כמחרוזת>, updated: <ms> }
 *
 * - כתיבה מקומית → חותמת זמן למפתח + דחיפה מושהית לענן.
 * - משיכה (בהתחברות ובחזרה ללשונית): לכל מפתח, הגרסה עם החותמת המאוחרת יותר מנצחת.
 * - התחברות ראשונה: מה שיש במכשיר ואין בענן עולה לחשבון (מיגרציה חד־פעמית).
 * - החלפת חשבון: הנתונים של החשבון הקודם נמחקים מהמכשיר לפני המשיכה.
 * - במצב הדגמה (נתוני דמו טעונים) הסנכרון מושהה, כדי שהדמו לא יעלה לחשבון.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { collection, deleteDoc, doc, getDocs, setDoc } from 'firebase/firestore';
import { APP_ID, firestore, type CloudUser } from './firebase';

const PREFIX = 'reporting-hours/';
const META_KEY = 'reporting-hours-sync/meta/v1';
/** מפתחות שנשארים לכל מכשיר בנפרד: העדפות תצוגה וסימוני הדגמה. */
const LOCAL_ONLY = new Set([
  'reporting-hours/lang/v1',
  'reporting-hours/theme/v1',
  'reporting-hours/demo/v1',
  'reporting-hours/demo-auto/v1',
]);
const DEMO_META_KEY = 'reporting-hours/demo/v1';
const PUSH_DELAY_MS = 1500;

export type SyncStatus = 'off' | 'syncing' | 'synced' | 'paused-demo' | 'error';

type Meta = { uid: string | null; stamps: Record<string, number> };

export function isSyncedKey(key: string): boolean {
  return key.startsWith(PREFIX) && !LOCAL_ONLY.has(key);
}

const toDocId = (key: string) => key.slice(PREFIX.length).replace(/\//g, '~');
const fromDocId = (id: string) => PREFIX + id.replace(/~/g, '/');

let user: CloudUser | null = null;
let meta: Meta = { uid: null, stamps: {} };
let metaLoaded = false;
const dirty = new Set<string>();
let pushTimer: ReturnType<typeof setTimeout> | null = null;
let status: SyncStatus = 'off';
const statusListeners = new Set<(s: SyncStatus) => void>();
const remoteListeners = new Set<() => void>();

function setStatus(s: SyncStatus) {
  status = s;
  statusListeners.forEach((l) => l(s));
}
export function getSyncStatus(): SyncStatus {
  return status;
}
export function onSyncStatus(l: (s: SyncStatus) => void): () => void {
  statusListeners.add(l);
  return () => statusListeners.delete(l);
}
/** נקרא כשהמשיכה מהענן שינתה נתונים במכשיר — המסכים צריכים להיטען מחדש. */
export function onRemoteChange(l: () => void): () => void {
  remoteListeners.add(l);
  return () => remoteListeners.delete(l);
}

async function loadMeta(): Promise<void> {
  if (metaLoaded) return;
  try {
    const raw = await AsyncStorage.getItem(META_KEY);
    if (raw) meta = { uid: null, stamps: {}, ...JSON.parse(raw) };
  } catch {
    // אין אחסון — נתחיל מאפס.
  }
  metaLoaded = true;
}
async function saveMeta(): Promise<void> {
  try {
    await AsyncStorage.setItem(META_KEY, JSON.stringify(meta));
  } catch {
    // מתעלמים.
  }
}

async function demoActive(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(DEMO_META_KEY)) != null;
  } catch {
    return false;
  }
}

function kvCollection(uid: string) {
  const db = firestore();
  return db ? collection(db, 'apps', APP_ID, 'users', uid, 'kv') : null;
}
function kvDoc(uid: string, key: string) {
  const db = firestore();
  return db ? doc(db, 'apps', APP_ID, 'users', uid, 'kv', toDocId(key)) : null;
}

/** נקרא מ־writeJSON אחרי כל כתיבה מקומית. */
export function noteLocalWrite(key: string): void {
  if (!isSyncedKey(key)) return;
  void (async () => {
    await loadMeta();
    meta.stamps[key] = Date.now();
    await saveMeta();
    // מכשיר שעוד לא סונכרן עם החשבון — המשיכה הראשונה תמזג; לא דוחפים לפניה.
    if (!user || meta.uid !== user.uid) return;
    dirty.add(key);
    schedulePush();
  })();
}

function schedulePush() {
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => void flush(), PUSH_DELAY_MS);
}

async function pushKey(uid: string, key: string): Promise<void> {
  const ref = kvDoc(uid, key);
  if (!ref) return;
  const raw = await AsyncStorage.getItem(key);
  if (raw == null) {
    await deleteDoc(ref);
    return;
  }
  const updated = meta.stamps[key] || Date.now();
  meta.stamps[key] = updated;
  await setDoc(ref, { v: raw, updated });
}

/** דוחף לענן את כל המפתחות שהשתנו מאז הדחיפה האחרונה. */
export async function flush(): Promise<void> {
  if (!user || dirty.size === 0) return;
  if (await demoActive()) {
    setStatus('paused-demo');
    return;
  }
  const uid = user.uid;
  const keys = [...dirty];
  dirty.clear();
  setStatus('syncing');
  try {
    for (const k of keys) await pushKey(uid, k);
    await saveMeta();
    setStatus('synced');
  } catch (e) {
    keys.forEach((k) => dirty.add(k));
    console.warn('[sync] push failed', e);
    setStatus('error');
  }
}

let pulling: Promise<boolean> | null = null;
let pullAgain = false;

/** משיכה ומיזוג מלא מול הענן. מחזיר true אם נתונים במכשיר השתנו. קריאות חופפות מתאחדות. */
export async function pull(): Promise<boolean> {
  if (pulling) {
    pullAgain = true;
    return pulling;
  }
  pulling = (async () => {
    let changed = false;
    do {
      pullAgain = false;
      changed = (await pullOnce()) || changed;
    } while (pullAgain);
    return changed;
  })();
  try {
    return await pulling;
  } finally {
    pulling = null;
  }
}

async function pullOnce(): Promise<boolean> {
  if (!user) return false;
  const uid = user.uid;
  await loadMeta();
  if (await demoActive()) {
    setStatus('paused-demo');
    return false;
  }
  const col = kvCollection(uid);
  if (!col) return false;
  setStatus('syncing');
  let changed = false;
  try {
    // חשבון אחר מזה שסונכרן קודם במכשיר — לא מערבבים נתונים בין חשבונות.
    if (meta.uid && meta.uid !== uid) {
      const keys = (await AsyncStorage.getAllKeys()).filter(isSyncedKey);
      await AsyncStorage.multiRemove(keys);
      meta = { uid, stamps: {} };
      changed = keys.length > 0;
    }
    const snap = await getDocs(col);
    const cloud = new Map<string, { v: string; updated: number }>();
    snap.forEach((d) => {
      const data = d.data() as { v?: unknown; updated?: unknown };
      if (typeof data.v === 'string') cloud.set(fromDocId(d.id), { v: data.v, updated: Number(data.updated) || 0 });
    });

    const firstSyncOnDevice = meta.uid == null;
    // ענן → מכשיר: מה שחדש יותר בענן.
    for (const [key, c] of cloud) {
      if (!isSyncedKey(key)) continue;
      const local = meta.stamps[key] || 0;
      if (firstSyncOnDevice) {
        // סנכרון ראשון במכשיר שכבר יש בו נתונים: רשימות (דיווחים, מקומות עבודה…) מאוחדות לפי id
        // כדי שלא יאבד דבר; בשאר הערכים הענן מנצח (גם אם המכשיר כתב לאחרונה, למשל הסרת הדגמה).
        const merged = mergeLists(await AsyncStorage.getItem(key), c.v);
        await AsyncStorage.setItem(key, merged ?? c.v);
        meta.stamps[key] = merged != null ? Date.now() : c.updated;
        changed = true;
        continue;
      }
      if (c.updated > local) {
        await AsyncStorage.setItem(key, c.v);
        meta.stamps[key] = c.updated;
        changed = true;
      }
    }
    // מכשיר → ענן: מה שאין בענן (כולל המיגרציה הראשונה) או חדש יותר במכשיר.
    const localKeys = (await AsyncStorage.getAllKeys()).filter(isSyncedKey);
    for (const key of localKeys) {
      const c = cloud.get(key);
      if (!c || (meta.stamps[key] || 0) > c.updated) dirty.add(key);
    }
    meta.uid = uid;
    await saveMeta();
    setStatus('synced');
  } catch (e) {
    console.warn('[sync] pull failed', e);
    setStatus('error');
  }
  if (dirty.size) await flush();
  if (changed) remoteListeners.forEach((l) => l());
  return changed;
}

/**
 * איחוד שתי רשימות JSON של אובייקטים עם `id` (הענן מנצח בכפילות).
 * מחזיר null אם אחד הצדדים אינו רשימה כזו, או שאין במכשיר פריטים שחסרים בענן.
 */
function mergeLists(localRaw: string | null, cloudRaw: string): string | null {
  try {
    if (localRaw == null) return null;
    const a: unknown = JSON.parse(localRaw);
    const b: unknown = JSON.parse(cloudRaw);
    const isIdList = (x: unknown): x is { id: string }[] =>
      Array.isArray(x) && x.every((i) => i && typeof i === 'object' && typeof (i as { id?: unknown }).id === 'string');
    if (!isIdList(a) || !isIdList(b)) return null;
    const ids = new Set(b.map((i) => i.id));
    const extra = a.filter((i) => !ids.has(i.id));
    if (extra.length === 0) return null;
    return JSON.stringify([...b, ...extra]);
  } catch {
    return null;
  }
}

/** נקרא מה־SyncProvider בכל שינוי התחברות. */
export async function setSyncUser(u: CloudUser | null): Promise<void> {
  user = u;
  if (!u) {
    dirty.clear();
    setStatus('off');
    return;
  }
  await pull();
}

/** האם יש לחשבון המחובר נתונים בענן (למשל ממכשיר אחר). */
export async function cloudHasData(): Promise<boolean> {
  if (!user) return false;
  const col = kvCollection(user.uid);
  if (!col) return false;
  try {
    return !(await getDocs(col)).empty;
  } catch {
    return false;
  }
}

/** מחיקת כל הנתונים מהענן (חלק מ"מחיקת כל נתוני האפליקציה"). */
export async function clearCloudData(): Promise<void> {
  await loadMeta();
  meta.stamps = {};
  await saveMeta();
  dirty.clear();
  if (!user) return;
  const col = kvCollection(user.uid);
  if (!col) return;
  try {
    const snap = await getDocs(col);
    await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
  } catch (e) {
    console.warn('[sync] clear failed', e);
    setStatus('error');
  }
}
