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
 * - מיזוג: לכל מפתח נשמר במכשיר "בסיס" — הערך האחרון שסונכרן. כששני הצדדים שינו
 *   מאז, הערכים ממוזגים לפי רשומה (lib/merge.ts), כך שבעלים ומורשה (או שני מכשירים)
 *   לא דורסים זה את זה. הדחיפה רצה בטרנזקציה מול הערך שבענן.
 * - שיתוף (docs/sharing-spec.md): "חשבון הנתונים" יכול להיות של בעלים אחר ששיתף
 *   עם המשתמש. אז המסלול בענן הוא של הבעלים, נדחפים רק מפתחות שהרמה מתירה,
 *   והעדפות תצוגה נשארות במכשיר. גיבויים, שחזור ומחיקת הכול — רק בנתונים שלך.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  runTransaction,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { APP_ID, firestore, type CloudUser } from './firebase';
import { merge3Raw } from './merge';

const PREFIX = 'reporting-hours/';
const META_KEY = 'reporting-hours-sync/meta/v1';
/** הערך האחרון שסונכרן לכל מפתח (לא מסונכרן בעצמו — התחילית שונה). */
const BASE_PREFIX = 'reporting-hours-sync/base/';
/** החשבון שהנתונים שלו מוצגים (כשמורשה צופה בנתוני בעלים אחר). */
const ACTIVE_KEY = 'reporting-hours-sync/active/v1';
/** מפתחות שנשארים לכל מכשיר בנפרד: העדפות תצוגה וסימוני הדגמה. */
const LOCAL_ONLY = new Set([
  'reporting-hours/lang/v1',
  'reporting-hours/theme/v1',
  'reporting-hours/demo/v1',
  'reporting-hours/demo-auto/v1',
]);
/** כשצופים בנתוני אחר — גם העדפות התצוגה האלה נשארות במכשיר ולא נכתבות לבעלים. */
const SHARED_LOCAL_ONLY = new Set([
  'reporting-hours/home-dismissed/v1',
  'reporting-hours/recommend-dismissed/v1',
  'reporting-hours/journal-calendar-pin/v1',
  'reporting-hours/show-hebrew-dates/v1',
]);
/** מה שמורשה ברמת "מדווח" רשאי לשנות (זהה לחוקי האבטחה ב־apps-platform). */
const REPORTER_KEYS = new Set([
  'reporting-hours/reports/v1',
  'reporting-hours/sessions/v1',
  'reporting-hours/accumulated/v2',
]);
/** מונה: שינויים מקבילים מצטברים במיזוג. */
const ADDITIVE_KEYS = new Set(['reporting-hours/accumulated/v2']);
const DEMO_META_KEY = 'reporting-hours/demo/v1';
const PUSH_DELAY_MS = 1500;

export type SyncStatus = 'off' | 'syncing' | 'synced' | 'paused-demo' | 'error';

export type ShareRole = 'view' | 'report' | 'full';
/** חשבון של בעלים אחר שהמשתמש צופה בו. null — הנתונים של המשתמש עצמו. */
export type SharedAccess = { ownerUid: string; ownerName: string; ownerEmail: string; role: ShareRole };

type Meta = {
  uid: string | null;
  stamps: Record<string, number>;
  /** חותמת `updated` של הגרסה בענן שממנה נלקח הבסיס */
  remote?: Record<string, number>;
};

export function isSyncedKey(key: string): boolean {
  if (!key.startsWith(PREFIX) || LOCAL_ONLY.has(key)) return false;
  if (access && SHARED_LOCAL_ONLY.has(key)) return false;
  return true;
}

/** האם הרמה הנוכחית מתירה לשנות את המפתח (בנתונים שלך — הכול). */
export function canWriteKey(key: string): boolean {
  if (!access || !isSyncedKey(key)) return true;
  if (access.role === 'full') return true;
  return access.role === 'report' && REPORTER_KEYS.has(key);
}

const toDocId = (key: string) => key.slice(PREFIX.length).replace(/\//g, '~');
const fromDocId = (id: string) => PREFIX + id.replace(/~/g, '/');

let user: CloudUser | null = null;
let access: SharedAccess | null = null;
let meta: Meta = { uid: null, stamps: {}, remote: {} };
let metaLoaded = false;
const dirty = new Set<string>();
let pushTimer: ReturnType<typeof setTimeout> | null = null;
let status: SyncStatus = 'off';
const statusListeners = new Set<(s: SyncStatus) => void>();
const remoteListeners = new Set<() => void>();
const accessListeners = new Set<(a: SharedAccess | null, lost: boolean) => void>();
const blockedListeners = new Set<(key: string) => void>();
/** שינוי מקומי שהרמה לא מתירה — לא נשמר בחשבון, ויוחלף במשיכה הבאה. */
export function onBlockedWrite(l: (key: string) => void): () => void {
  blockedListeners.add(l);
  return () => blockedListeners.delete(l);
}

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
/** שינוי בחשבון הנתונים הפעיל. `lost` — ההרשאה בוטלה והאפליקציה חזרה לנתונים שלך. */
export function onAccessChange(l: (a: SharedAccess | null, lost: boolean) => void): () => void {
  accessListeners.add(l);
  return () => accessListeners.delete(l);
}
export function getAccess(): SharedAccess | null {
  return access;
}

/** uid שהנתונים שלו מסונכרנים: הבעלים ששיתף, או המשתמש עצמו. */
function dataUid(): string | null {
  return access?.ownerUid ?? user?.uid ?? null;
}

async function loadMeta(): Promise<void> {
  if (metaLoaded) return;
  try {
    const raw = await AsyncStorage.getItem(META_KEY);
    if (raw) meta = { uid: null, stamps: {}, ...JSON.parse(raw) };
  } catch {
    // אין אחסון — נתחיל מאפס.
  }
  meta.remote ??= {};
  metaLoaded = true;
}
async function saveMeta(): Promise<void> {
  try {
    await AsyncStorage.setItem(META_KEY, JSON.stringify(meta));
  } catch {
    // מתעלמים.
  }
}
const getBase = (key: string) => AsyncStorage.getItem(BASE_PREFIX + key).catch(() => null);
async function setBase(key: string, raw: string | null): Promise<void> {
  try {
    if (raw == null) await AsyncStorage.removeItem(BASE_PREFIX + key);
    else await AsyncStorage.setItem(BASE_PREFIX + key, raw);
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
const isDenied = (e: unknown) => (e as { code?: string })?.code === 'permission-denied';

/** נקרא מ־writeJSON אחרי כל כתיבה מקומית. */
export function noteLocalWrite(key: string): void {
  if (!isSyncedKey(key)) return;
  void (async () => {
    await loadMeta();
    meta.stamps[key] = Date.now();
    await saveMeta();
    // מכשיר שעוד לא סונכרן עם החשבון — המשיכה הראשונה תמזג; לא דוחפים לפניה.
    if (!user || meta.uid !== dataUid()) return;
    if (!canWriteKey(key)) {
      blockedListeners.forEach((l) => l(key));
      return;
    }
    dirty.add(key);
    schedulePush();
  })();
}

function schedulePush() {
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => void flush(), PUSH_DELAY_MS);
}

/** דוחף מפתח אחד (בטרנזקציה, עם מיזוג מול הענן). מחזיר true אם הערך במכשיר השתנה במיזוג. */
async function pushKey(uid: string, key: string): Promise<boolean> {
  const ref = kvDoc(uid, key);
  const db = firestore();
  if (!ref || !db) return false;
  const raw = await AsyncStorage.getItem(key);
  if (raw == null) {
    await deleteDoc(ref);
    await setBase(key, null);
    delete meta.remote![key];
    return false;
  }
  const base = await getBase(key);
  const known = meta.remote![key];
  let written = raw;
  let updated = 0;
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    written = raw;
    if (snap.exists()) {
      const d = snap.data() as { v?: unknown; updated?: unknown };
      const ru = Number(d.updated) || 0;
      // מישהו אחר כתב מאז הבסיס שלנו — ממזגים במקום לדרוס.
      if (typeof d.v === 'string' && ru !== known && d.v !== raw) {
        written = merge3Raw(base, raw, d.v, ADDITIVE_KEYS.has(key));
      }
    }
    updated = Date.now();
    tx.set(ref, { v: written, updated });
  });
  let localChanged = false;
  if (written !== raw) {
    // ייתכן שבזמן הדחיפה נכתב ערך מקומי חדש — ממזגים גם אותו.
    const now = await AsyncStorage.getItem(key);
    if (now != null && now !== raw) {
      await AsyncStorage.setItem(key, merge3Raw(raw, now, written, ADDITIVE_KEYS.has(key)));
      dirty.add(key);
    } else {
      await AsyncStorage.setItem(key, written);
    }
    localChanged = true;
  }
  await setBase(key, written);
  meta.remote![key] = updated;
  meta.stamps[key] = updated;
  return localChanged;
}

/** דוחף לענן את כל המפתחות שהשתנו מאז הדחיפה האחרונה. */
export async function flush(): Promise<void> {
  const uid = dataUid();
  if (!user || !uid || dirty.size === 0) return;
  if (await demoActive()) {
    setStatus('paused-demo');
    return;
  }
  await loadMeta();
  const keys = [...dirty].filter(canWriteKey);
  dirty.clear();
  if (!keys.length) return;
  setStatus('syncing');
  let changed = false;
  try {
    for (const k of keys) changed = (await pushKey(uid, k)) || changed;
    await saveMeta();
    setStatus('synced');
  } catch (e) {
    keys.forEach((k) => dirty.add(k));
    console.warn('[sync] push failed', e);
    setStatus('error');
    if (access && isDenied(e)) void verifyAccess();
  }
  if (changed) remoteListeners.forEach((l) => l());
  if (dirty.size) schedulePush();
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

/** מוחק מהמכשיר את כל הנתונים המסונכרנים (במעבר בין חשבונות). */
async function wipeLocal(uid: string): Promise<boolean> {
  const all = await AsyncStorage.getAllKeys();
  const keys = all.filter((k) => isSyncedKey(k) || k.startsWith(BASE_PREFIX));
  // נתוני ההדגמה של החשבון הקודם נמחקו יחד עם המפתחות — גם הסימון שלהם.
  if (all.includes(DEMO_META_KEY)) keys.push(DEMO_META_KEY);
  await AsyncStorage.multiRemove(keys);
  meta = { uid, stamps: {}, remote: {} };
  dirty.clear();
  return keys.some((k) => !k.startsWith(BASE_PREFIX));
}

async function pullOnce(): Promise<boolean> {
  const uid = dataUid();
  if (!user || !uid) return false;
  await loadMeta();
  let changed = false;
  // חשבון אחר מזה שסונכרן קודם במכשיר — לא מערבבים נתונים בין חשבונות.
  if (meta.uid && meta.uid !== uid) {
    changed = await wipeLocal(uid);
    await saveMeta();
  }
  if (await demoActive()) {
    setStatus('paused-demo');
    if (changed) remoteListeners.forEach((l) => l());
    return changed;
  }
  const col = kvCollection(uid);
  if (!col) return changed;
  setStatus('syncing');
  try {
    const snap = await getDocs(col);
    const cloud = new Map<string, { v: string; updated: number }>();
    snap.forEach((d) => {
      const data = d.data() as { v?: unknown; updated?: unknown };
      if (typeof data.v === 'string') cloud.set(fromDocId(d.id), { v: data.v, updated: Number(data.updated) || 0 });
    });

    const firstSyncOnDevice = meta.uid == null;
    const remote = meta.remote!;
    const take = async (key: string, v: string, updated: number) => {
      await AsyncStorage.setItem(key, v);
      await setBase(key, v);
      remote[key] = updated;
      meta.stamps[key] = updated;
      changed = true;
    };
    // ענן → מכשיר.
    for (const [key, c] of cloud) {
      if (!isSyncedKey(key)) continue;
      const local = await AsyncStorage.getItem(key);
      if (firstSyncOnDevice) {
        // סנכרון ראשון במכשיר שכבר יש בו נתונים: רשימות (דיווחים, מקומות עבודה…) מאוחדות לפי id
        // כדי שלא יאבד דבר; בשאר הערכים הענן מנצח (גם אם המכשיר כתב לאחרונה, למשל הסרת הדגמה).
        const merged = canWriteKey(key) ? mergeLists(local, c.v) : null;
        await take(key, merged ?? c.v, c.updated);
        if (merged != null) dirty.add(key);
        continue;
      }
      if (local === c.v) {
        if (remote[key] !== c.updated) {
          await setBase(key, c.v);
          remote[key] = c.updated;
        }
        continue;
      }
      if (!canWriteKey(key) || local == null) {
        await take(key, c.v, c.updated);
        continue;
      }
      const base = await getBase(key);
      if (base == null) {
        // מכשיר מגרסה קודמת (בלי בסיס): הכלל הישן — החדש יותר מנצח.
        if (c.updated > (meta.stamps[key] || 0)) await take(key, c.v, c.updated);
        else {
          await setBase(key, c.v);
          remote[key] = c.updated;
          dirty.add(key);
        }
        continue;
      }
      if (remote[key] === c.updated) {
        // הענן לא השתנה מאז הבסיס — השינוי מקומי וממתין לדחיפה.
        if (local !== base) dirty.add(key);
        continue;
      }
      if (local === base) {
        await take(key, c.v, c.updated);
        continue;
      }
      // שני הצדדים שינו — מיזוג.
      const merged = merge3Raw(base, local, c.v, ADDITIVE_KEYS.has(key));
      if (merged !== local) {
        await AsyncStorage.setItem(key, merged);
        changed = true;
      }
      await setBase(key, c.v);
      remote[key] = c.updated;
      if (merged !== c.v) dirty.add(key);
    }
    // מכשיר → ענן: מה שאין בענן (כולל המיגרציה הראשונה).
    const localKeys = (await AsyncStorage.getAllKeys()).filter(isSyncedKey);
    for (const key of localKeys) {
      if (!cloud.has(key) && canWriteKey(key)) dirty.add(key);
    }
    meta.uid = uid;
    await saveMeta();
    setStatus('synced');
  } catch (e) {
    console.warn('[sync] pull failed', e);
    setStatus('error');
    if (access && isDenied(e)) await verifyAccess();
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

/** המשתמש המחובר כשהוא עובד על הנתונים של עצמו (או null) — לגיבויים בענן. */
export function syncUser(): CloudUser | null {
  return access ? null : user;
}

/** המשתמש המחובר (גם כשהוא צופה בנתונים של אחר). */
export function authUser(): CloudUser | null {
  return user;
}

/** מי ביצע את השינוי, כשמורשה עובד על נתוני בעלים (לתיעוד בדיווח). */
export function actingAs(): { name: string; email: string } | null {
  if (!access || !user) return null;
  return { name: user.name || user.email || '', email: user.email || '' };
}

/** האם נתוני הדגמה טעונים (ואז לא מעלים לענן). */
export function isDemoActive(): Promise<boolean> {
  return demoActive();
}

function ownDataOnly() {
  if (access) throw new Error('shared-account');
}

/**
 * החלפת כל נתוני המשתמש — בשרת ובמכשיר — בתמונת מצב (שחזור מגיבוי).
 *
 * בשרת: כל מפתח בתמונה נכתב עם חותמת "עכשיו", ומפתחות שאינם בה נמחקים —
 * כך השחזור גובר על כל מכשיר אחר ומגיע אליו במשיכה הבאה. במכשיר: אותו דבר,
 * ונתוני ההדגמה (אם נטענו) יורדים. לבסוף כל העץ נטען מחדש.
 */
export async function replaceAllUserData(snapshot: Record<string, string>): Promise<void> {
  ownDataOnly();
  if (!user) throw new Error('not-signed-in');
  const uid = user.uid;
  const col = kvCollection(uid);
  const db = firestore();
  if (!col || !db) throw new Error('cloud-unavailable');
  await loadMeta();
  const now = Date.now();
  const entries = Object.entries(snapshot).filter(([k]) => isSyncedKey(k));
  const keep = new Set(entries.map(([k]) => k));

  // שרת — באצווה אחת (אטומית).
  const existing = await getDocs(col);
  const batch = writeBatch(db);
  existing.forEach((d) => {
    const key = fromDocId(d.id);
    if (isSyncedKey(key) && !keep.has(key)) batch.delete(d.ref);
  });
  for (const [k, v] of entries) {
    const ref = kvDoc(uid, k);
    if (ref) batch.set(ref, { v, updated: now });
  }
  await batch.commit();

  // מכשיר.
  const allKeys = await AsyncStorage.getAllKeys();
  const stale = allKeys.filter((k) => (isSyncedKey(k) && !keep.has(k)) || k.startsWith(BASE_PREFIX));
  if (stale.length) await AsyncStorage.multiRemove(stale);
  await AsyncStorage.multiSet(entries);
  await AsyncStorage.multiSet(entries.map(([k, v]) => [BASE_PREFIX + k, v]));
  await AsyncStorage.removeItem(DEMO_META_KEY).catch(() => {});
  meta = {
    uid,
    stamps: Object.fromEntries(entries.map(([k]) => [k, now])),
    remote: Object.fromEntries(entries.map(([k]) => [k, now])),
  };
  dirty.clear();
  await saveMeta();
  setStatus('synced');
  remoteListeners.forEach((l) => l());
}

// ---------- שיתוף: חשבון הנתונים הפעיל ----------

type ActiveStore = { authUid: string; access: SharedAccess };

async function readActive(): Promise<ActiveStore | null> {
  try {
    const raw = await AsyncStorage.getItem(ACTIVE_KEY);
    return raw ? (JSON.parse(raw) as ActiveStore) : null;
  } catch {
    return null;
  }
}
async function writeActive(a: SharedAccess | null): Promise<void> {
  try {
    if (a && user) await AsyncStorage.setItem(ACTIVE_KEY, JSON.stringify({ authUid: user.uid, access: a }));
    else await AsyncStorage.removeItem(ACTIVE_KEY);
  } catch {
    // מתעלמים.
  }
}

export const emailKey = (email: string) => email.trim().toLowerCase();

/** קורא את ההרשאה של המשתמש המחובר אצל בעלים. null — אין (או בוטלה). */
async function readGrant(ownerUid: string): Promise<ShareRole | null> {
  const db = firestore();
  if (!db || !user?.email) return null;
  const ref = doc(db, 'apps', APP_ID, 'users', ownerUid, 'grants', emailKey(user.email));
  try {
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    const role = (snap.data() as { role?: string }).role;
    if (role !== 'view' && role !== 'report' && role !== 'full') return null;
    // השם וזמן הכניסה — כדי שהבעלים יראו מי נכנס (לא קריטי).
    void updateDoc(ref, { granteeName: (user.name || '').slice(0, 80), seen: Date.now() }).catch(() => {});
    return role;
  } catch (e) {
    if (isDenied(e)) return null;
    throw e;
  }
}

function emitAccess(lost: boolean) {
  accessListeners.forEach((l) => l(access, lost));
}

/** בודק שההרשאה הפעילה עדיין קיימת; אם בוטלה — חוזרים לנתונים שלך. */
async function verifyAccess(): Promise<void> {
  if (!access) return;
  let role: ShareRole | null;
  try {
    role = await readGrant(access.ownerUid);
  } catch {
    return; // אין רשת — ננסה בפעם הבאה
  }
  if (!role) {
    access = null;
    await writeActive(null);
    emitAccess(true);
    void pull();
  } else if (role !== access.role) {
    access = { ...access, role };
    await writeActive(access);
    emitAccess(false);
  }
}

/**
 * מעבר לחשבון נתונים אחר: null — הנתונים שלך; אחרת — בעלים ששיתף איתך.
 * מה שממתין לדחיפה נדחף קודם, והנתונים במכשיר מוחלפים בנתוני החשבון החדש.
 */
export async function switchAccount(next: SharedAccess | null): Promise<void> {
  if (!user) throw new Error('not-signed-in');
  if (next && next.ownerUid === user.uid) next = null;
  if (next) {
    const role = await readGrant(next.ownerUid);
    if (!role) throw new Error('no-access');
    next = { ...next, role };
  }
  await flush();
  // שינויים שלא הגיעו לענן (אין רשת) היו נמחקים במעבר — לא עוברים.
  if (dirty.size && !(await demoActive())) throw new Error('pending-changes');
  if (pushTimer) clearTimeout(pushTimer);
  dirty.clear();
  access = next;
  await writeActive(next);
  emitAccess(false);
  await pull();
}

/** נקרא מה־SyncProvider בכל שינוי התחברות. */
export async function setSyncUser(u: CloudUser | null): Promise<void> {
  user = u;
  if (!u) {
    dirty.clear();
    if (access) {
      access = null;
      emitAccess(false);
    }
    setStatus('off');
    return;
  }
  const stored = await readActive();
  if (stored && stored.authUid === u.uid) {
    access = stored.access;
    emitAccess(false);
    await verifyAccess();
  } else if (access) {
    access = null;
    await writeActive(null);
    emitAccess(false);
  }
  await pull();
}

/** האם יש לחשבון הנתונים נתונים בענן (למשל ממכשיר אחר). */
export async function cloudHasData(): Promise<boolean> {
  const uid = dataUid();
  if (!user || !uid) return false;
  const col = kvCollection(uid);
  if (!col) return false;
  try {
    return !(await getDocs(col)).empty;
  } catch {
    return false;
  }
}

/** מחיקת כל הנתונים מהענן (חלק מ"מחיקת כל נתוני האפליקציה"). רק בנתונים שלך. */
export async function clearCloudData(): Promise<void> {
  ownDataOnly();
  await loadMeta();
  meta.stamps = {};
  meta.remote = {};
  await saveMeta();
  dirty.clear();
  const keys = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith(BASE_PREFIX));
  if (keys.length) await AsyncStorage.multiRemove(keys).catch(() => {});
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
