/**
 * גיבוי יומי אוטומטי בשרת, ושחזור עד 30 יום אחורה.
 *
 * - איפה: בשרת בלבד (Firestore, בחשבון גוגל של המשתמש), לא במכשיר. בלי
 *   התחברות אין גיבויים.
 *     apps/reporting-hours/users/{uid}/backups/{id}      — פרטים (תאריך, סוג, סיכום)
 *     apps/reporting-hours/users/{uid}/backup-data/{id}  — התוכן עצמו
 *   הפיצול מאפשר להציג את רשימת הגיבויים בלי להוריד את התוכן; התוכן נטען
 *   רק כשבוחרים תאריך לשחזור.
 * - מה: נתוני המשתמש בלבד — דיווחים, מקומות עבודה, קורסים, ביטולי מפגשים,
 *   מונים, דוחות שכר, פרופיל והגדרות חישוב. נתוני הדגמה מסוננים (כל פריט
 *   שמסומן demo, וכל מה שמשויך למקום עבודה / קורס / דיווח של הדגמה), וכך גם
 *   העדפות התצוגה של המכשיר (שפה, ערכת צבעים).
 * - מתי: פעם ביום, אוטומטית — בפתיחת האפליקציה, בחזרה אליה ופעם בשעה כשהיא
 *   פתוחה (components/BackupScheduler.tsx). "גיבוי עכשיו" מחליף את הגיבוי של היום.
 * - שחזור: בוחרים תאריך → קודם נשמר גיבוי "לפני שחזור" של המצב הנוכחי (מופיע
 *   ראשון ברשימה, כדי שאפשר יהיה להתחרט) → כל נתוני המשתמש מוחלפים בשרת
 *   ובמכשיר (lib/sync.ts → replaceAllUserData), ומשם לכל המכשירים.
 * - שמירה: גיבויים מעל 30 יום נמחקים.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  setDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { APP_ID, firestore } from './firebase';
import { replaceAllUserData, syncUser } from './sync';

export const BACKUP_RETENTION_DAYS = 30;

const DATA_PREFIX = 'reporting-hours/';
/** לא נכללים בגיבוי: העדפות המכשיר וסימוני ההדגמה. */
const EXCLUDED = new Set([
  'reporting-hours/lang/v1',
  'reporting-hours/theme/v1',
  'reporting-hours/demo/v1',
  'reporting-hours/demo-auto/v1',
]);
const DEMO_META_KEY = 'reporting-hours/demo/v1';
/** סימון מקומי קטן: באיזה יום כבר גובה (לכל משתמש) — כדי לא לבדוק בשרת בכל פעם. */
const DONE_KEY = 'reporting-hours-backup/done/v1';

export type BackupKind = 'auto' | 'manual' | 'before-restore';

export type BackupSummary = { reports: number; workplaces: number; courses: number };

export type BackupMeta = {
  /** "YYYY-MM-DD" לגיבוי יומי, "pre-<זמן>" לגיבוי שלפני שחזור */
  id: string;
  createdAt: number;
  kind: BackupKind;
  summary: BackupSummary;
};

type Snapshot = Record<string, string>;

// ───────────────────────── עזר ─────────────────────────

function isoDay(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const cutoffMs = () => Date.now() - BACKUP_RETENTION_DAYS * 86_400_000;

function refs(uid: string) {
  const db = firestore();
  if (!db) return null;
  return {
    db,
    metaCol: collection(db, 'apps', APP_ID, 'users', uid, 'backups'),
    meta: (id: string) => doc(db, 'apps', APP_ID, 'users', uid, 'backups', id),
    data: (id: string) => doc(db, 'apps', APP_ID, 'users', uid, 'backup-data', id),
  };
}

/** המשתמש המחובר, או null — בלי התחברות אין גיבוי בשרת. */
export function backupUid(): string | null {
  return syncUser()?.uid ?? null;
}

// ───────────────────────── סינון הדגמה ─────────────────────────

type Rec = Record<string, unknown>;
const isRec = (x: unknown): x is Rec => x != null && typeof x === 'object' && !Array.isArray(x);

/** מזהי מקומות העבודה, הקורסים והדיווחים של ההדגמה. */
function demoIds(raw: Snapshot): Set<string> {
  const ids = new Set<string>();
  for (const key of ['reporting-hours/workplaces/v1', 'reporting-hours/courses/v1', 'reporting-hours/reports/v1']) {
    try {
      const list: unknown = JSON.parse(raw[key] ?? '[]');
      if (Array.isArray(list)) for (const x of list) if (isRec(x) && x.demo === true && typeof x.id === 'string') ids.add(x.id);
    } catch {
      // ערך פגום — מדלגים.
    }
  }
  return ids;
}

/**
 * מסיר מערך שמור כל מה ששייך להדגמה: פריטים עם demo, פריטים שמשויכים
 * (workplaceId / courseId / reportId) לפריט הדגמה, ומפתחות במפות שמכילים
 * מזהה הדגמה (למשל סטטוס דוח שכר "wp|תאריך", מונה לפי מקום עבודה).
 */
function stripDemo(value: unknown, ids: Set<string>): unknown {
  const linked = (x: Rec) =>
    x.demo === true ||
    ['id', 'workplaceId', 'courseId', 'reportId'].some((f) => typeof x[f] === 'string' && ids.has(x[f] as string));
  if (Array.isArray(value)) return value.filter((x) => !(isRec(x) && linked(x))).map((x) => stripDemo(x, ids));
  if (isRec(value)) {
    const out: Rec = {};
    for (const [k, v] of Object.entries(value)) {
      if ([...ids].some((id) => k === id || k.startsWith(`${id}|`))) continue;
      out[k] = stripDemo(v, ids);
    }
    return out;
  }
  return value;
}

/** תמונת מצב של נתוני המשתמש במכשיר, בלי הדגמה ובלי העדפות מכשיר. */
async function userSnapshot(): Promise<Snapshot> {
  const keys = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith(DATA_PREFIX) && !EXCLUDED.has(k));
  const raw: Snapshot = {};
  for (const [k, v] of await AsyncStorage.multiGet(keys)) if (v != null) raw[k] = v;
  const demoLoaded = (await AsyncStorage.getItem(DEMO_META_KEY)) != null;
  const ids = demoIds(raw);
  if (!demoLoaded && ids.size === 0) return raw;
  const out: Snapshot = {};
  for (const [k, v] of Object.entries(raw)) {
    try {
      out[k] = JSON.stringify(stripDemo(JSON.parse(v), ids));
    } catch {
      out[k] = v;
    }
  }
  return out;
}

function count(raw: string | undefined): number {
  try {
    const v: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? v.filter((x) => !(isRec(x) && x.deletedAt)).length : 0;
  } catch {
    return 0;
  }
}

function summarize(s: Snapshot): BackupSummary {
  return {
    reports: count(s['reporting-hours/reports/v1']),
    workplaces: count(s['reporting-hours/workplaces/v1']),
    courses: count(s['reporting-hours/courses/v1']),
  };
}

const isEmpty = (s: BackupSummary) => s.reports + s.workplaces + s.courses === 0;

// ───────────────────────── גיבוי ─────────────────────────

const listeners = new Set<() => void>();
/** מאזין לגיבוי חדש / שחזור (למסך ניהול הנתונים). */
export function onBackupChange(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export type BackupResult =
  | { ok: true; meta: BackupMeta }
  | { ok: false; reason: 'signed-out' | 'empty' | 'error' };

/**
 * גיבוי עכשיו לשרת. 'auto' ו־'manual' — הגיבוי של היום (מחליף אותו);
 * 'before-restore' — גיבוי נפרד לפני שחזור.
 */
export async function createBackup(kind: BackupKind = 'manual'): Promise<BackupResult> {
  const uid = backupUid();
  const r = uid ? refs(uid) : null;
  if (!uid || !r) return { ok: false, reason: 'signed-out' };
  const snapshot = await userSnapshot();
  const now = Date.now();
  const meta: BackupMeta = {
    id: kind === 'before-restore' ? `pre-${now}` : isoDay(new Date(now)),
    createdAt: now,
    kind,
    summary: summarize(snapshot),
  };
  // אין נתוני משתמש (רק הדגמה, או אפליקציה ריקה) — אין מה לגבות.
  if (isEmpty(meta.summary) && kind !== 'before-restore') return { ok: false, reason: 'empty' };
  try {
    const batch = writeBatch(r.db);
    batch.set(r.data(meta.id), { v: JSON.stringify(snapshot) });
    batch.set(r.meta(meta.id), meta);
    await batch.commit();
  } catch (e) {
    console.warn('[backup] failed', e);
    return { ok: false, reason: 'error' };
  }
  if (kind !== 'before-restore') {
    const done = await readDone();
    await AsyncStorage.setItem(DONE_KEY, JSON.stringify({ ...done, [uid]: meta.id })).catch(() => {});
  }
  void pruneOld(uid);
  listeners.forEach((l) => l());
  return { ok: true, meta };
}

async function readDone(): Promise<Record<string, string>> {
  try {
    return JSON.parse((await AsyncStorage.getItem(DONE_KEY)) ?? '{}') as Record<string, string>;
  } catch {
    return {};
  }
}

/** מחיקת גיבויים מעל 30 יום (פרטים ותוכן). */
async function pruneOld(uid: string): Promise<void> {
  const r = refs(uid);
  if (!r) return;
  try {
    const old = await getDocs(query(r.metaCol, where('createdAt', '<', cutoffMs())));
    if (old.empty) return;
    const batch = writeBatch(r.db);
    old.forEach((d) => {
      batch.delete(d.ref);
      batch.delete(r.data(d.id));
    });
    await batch.commit();
  } catch {
    // ננסה שוב בגיבוי הבא.
  }
}

/**
 * הגיבוי היומי האוטומטי. מגבה פעם ביום, רק כשמחוברים. קודם בודק סימון
 * מקומי, ואז את השרת (אולי מכשיר אחר כבר גיבה היום).
 */
export async function runDailyBackup(): Promise<void> {
  const uid = backupUid();
  const r = uid ? refs(uid) : null;
  if (!uid || !r) return;
  const today = isoDay();
  if ((await readDone())[uid] === today) return;
  try {
    const existing = await getDoc(r.meta(today));
    if (existing.exists()) {
      const done = await readDone();
      await AsyncStorage.setItem(DONE_KEY, JSON.stringify({ ...done, [uid]: today })).catch(() => {});
      return;
    }
  } catch {
    return; // אין רשת — ננסה בפעם הבאה.
  }
  await createBackup('auto');
}

/** הגיבוי האחרון בשרת (לסטטוס), או null. */
export async function lastBackup(): Promise<BackupMeta | null> {
  const uid = backupUid();
  const r = uid ? refs(uid) : null;
  if (!r) return null;
  const snap = await getDocs(query(r.metaCol, orderBy('createdAt', 'desc'), limit(1)));
  return snap.empty ? null : (snap.docs[0].data() as BackupMeta);
}

/** רשימת הגיבויים (פרטים בלבד, בלי התוכן), מהחדש לישן — נטענת לפי דרישה. */
export async function listBackups(): Promise<BackupMeta[]> {
  const uid = backupUid();
  const r = uid ? refs(uid) : null;
  if (!r) return [];
  const snap = await getDocs(query(r.metaCol, orderBy('createdAt', 'desc')));
  return snap.docs.map((d) => d.data() as BackupMeta).filter((m) => m.createdAt >= cutoffMs());
}

/**
 * שחזור: קודם גיבוי "לפני שחזור" של המצב הנוכחי (כדי שאפשר להתחרט), ואז
 * טעינת תוכן הגיבוי שנבחר והחלפת כל נתוני המשתמש בשרת ובמכשיר.
 */
export async function restoreBackup(meta: BackupMeta): Promise<void> {
  const uid = backupUid();
  const r = uid ? refs(uid) : null;
  if (!uid || !r) throw new Error('signed-out');
  const d = await getDoc(r.data(meta.id));
  const raw = d.exists() ? (d.data() as { v?: string }).v : undefined;
  if (!raw) throw new Error('backup-missing');
  const snapshot = JSON.parse(raw) as Snapshot;
  const undo = await createBackup('before-restore');
  if (!undo.ok) throw new Error('undo-backup-failed');
  await replaceAllUserData(snapshot);
  listeners.forEach((l) => l());
}

