/**
 * שיתוף החשבון עם בן משפחה (docs/sharing-spec.md).
 *
 * הבעלים מוסיפים כתובת Gmail ורמה. ההרשאה נשמרת בשני מקומות, באצווה אחת:
 *
 *   apps/reporting-hours/users/{owner}/grants/{email}     — ההרשאה עצמה (חוקי האבטחה בודקים אותה)
 *   apps/reporting-hours/shared/{email}/owners/{owner}    — אינדקס, כדי שהמורשה יראה מי שיתף איתו
 *
 * המעבר בין חשבונות והסנכרון עצמו — ב־lib/sync.ts (`switchAccount`).
 */
import { collection, doc, getDocs, writeBatch } from 'firebase/firestore';
import { APP_ID, firestore } from './firebase';
import { authUser, emailKey, getAccess, type SharedAccess, type ShareRole } from './sync';

export type { ShareRole, SharedAccess };

export type Grant = {
  email: string;
  role: ShareRole;
  created: number;
  /** שם המורשה — מתעדכן כשהוא נכנס */
  granteeName?: string;
  /** הכניסה האחרונה של המורשה (מילישניות) */
  seen?: number;
};

export const ROLE_LABELS: Record<ShareRole, string> = {
  view: 'צפייה בלבד',
  report: 'מדווח',
  full: 'הרשאה מלאה',
};

export const ROLE_HINTS: Record<ShareRole, string> = {
  view: 'רואה הכול — לוח בקרה, יומן, דוחות שכר — ולא משנה דבר.',
  report: 'מדווח מפגשים, עורך ומוחק דיווחים, ומסמן מפגש כבוטל או מועבר.',
  full: 'כמו הבעלים: גם מקומות עבודה, קורסים, חופשות, דוחות שכר והגדרות. בלי גיבויים וניהול הרשאות.',
};

/** כתובת האפליקציה, להודעת ההזמנה. */
export const APP_URL = 'https://yanivmalka.github.io/Reporting-hours/';

export const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

function me() {
  const u = authUser();
  const db = firestore();
  if (!u || !db) throw new Error('not-signed-in');
  if (getAccess()) throw new Error('shared-account');
  return { u, db };
}

/** ההרשאות שהבעלים נתנו. */
export async function listGrants(): Promise<Grant[]> {
  const { u, db } = me();
  const snap = await getDocs(collection(db, 'apps', APP_ID, 'users', u.uid, 'grants'));
  const out: Grant[] = [];
  snap.forEach((d) => {
    const g = d.data() as Partial<Grant>;
    if (g.email && g.role) out.push({ email: g.email, role: g.role, created: Number(g.created) || 0, granteeName: g.granteeName, seen: g.seen });
  });
  return out.sort((a, b) => a.created - b.created);
}

/** הוספת מורשה או שינוי הרמה שלו. */
export async function saveGrant(email: string, role: ShareRole, created = Date.now()): Promise<void> {
  const { u, db } = me();
  const key = emailKey(email);
  if (!isValidEmail(key)) throw new Error('bad-email');
  if (u.email && emailKey(u.email) === key) throw new Error('self');
  const common = {
    email: key,
    role,
    ownerName: (u.name || u.email || '').slice(0, 80),
    ownerEmail: u.email || '',
    created,
  };
  const batch = writeBatch(db);
  batch.set(doc(db, 'apps', APP_ID, 'users', u.uid, 'grants', key), common, { merge: true });
  batch.set(doc(db, 'apps', APP_ID, 'shared', key, 'owners', u.uid), common);
  await batch.commit();
}

/** הסרת מורשה — חלה מיד. */
export async function removeGrant(email: string): Promise<void> {
  const { u, db } = me();
  const key = emailKey(email);
  const batch = writeBatch(db);
  batch.delete(doc(db, 'apps', APP_ID, 'users', u.uid, 'grants', key));
  batch.delete(doc(db, 'apps', APP_ID, 'shared', key, 'owners', u.uid));
  await batch.commit();
}

/** החשבונות ששותפו עם המשתמש המחובר. */
export async function listSharedWithMe(): Promise<SharedAccess[]> {
  const u = authUser();
  const db = firestore();
  if (!u?.email || !db) return [];
  const snap = await getDocs(collection(db, 'apps', APP_ID, 'shared', emailKey(u.email), 'owners'));
  const out: SharedAccess[] = [];
  snap.forEach((d) => {
    const g = d.data() as { role?: ShareRole; ownerName?: string; ownerEmail?: string };
    if (g.role) out.push({ ownerUid: d.id, ownerName: g.ownerName || g.ownerEmail || '', ownerEmail: g.ownerEmail || '', role: g.role });
  });
  return out.sort((a, b) => a.ownerName.localeCompare(b.ownerName, 'he'));
}

/** המורשה מוותר על השיתוף. */
export async function leaveShare(ownerUid: string): Promise<void> {
  const u = authUser();
  const db = firestore();
  if (!u?.email || !db) throw new Error('not-signed-in');
  const key = emailKey(u.email);
  const batch = writeBatch(db);
  batch.delete(doc(db, 'apps', APP_ID, 'users', ownerUid, 'grants', key));
  batch.delete(doc(db, 'apps', APP_ID, 'shared', key, 'owners', ownerUid));
  await batch.commit();
}

/** נוסח ההודעה שהבעלים שולחים למורשה. */
export function inviteMessage(email: string, role: ShareRole): string {
  const u = authUser();
  const name = u?.name || u?.email || '';
  return [
    `${name} שיתף/ה איתך את אפליקציית "דיווח שעות" (${ROLE_LABELS[role]}).`,
    `להיכנס: ${APP_URL}`,
    `בתפריט ☰ ← "חשבון וסנכרון" ← התחברות עם Google בחשבון ${emailKey(email)}, ואז לבחור את החשבון ששותף.`,
  ].join('\n');
}
