/**
 * טופס תיאום מס לכל מקום עבודה ולכל שנה לועזית: טעינה (PDF או תמונה), צפייה,
 * מחיקה ושליחה במייל. הקובץ נשמר ב־Cloud Storage של malka-apps תחת
 * `apps/reporting-hours/users/{uid}/files/tax/{workplaceId}-{year}.{ext}` (רק הבעלים —
 * storage.rules בריפו apps-platform), והפרטים שלו ב־`Workplace.taxFiles[year]`.
 *
 * שליחה מהשרת (`sendTaxFormFromServer`): בקשה ב־`users/{uid}/taxSend/{id}`, ו־Cloud Function ‏`taxSend`
 * בריפו apps-platform (`functions/src/taxSend.mjs`) שולחת את הקובץ כקובץ מצורף מתיבת האפליקציה — למייל מחלקת
 * השכר ולמכותבים שבנתוני מקום העבודה (לא מהבקשה), עם עותק ו־Reply-To אליך — ומסמנת "נשלח" בנתונים המסונכרנים.
 * בלי מייל מחלקת שכר (או כשמבטלים את הסימון) — נשלח אליך בלבד. גיבוי: טיוטת מייל במכשיר עם קישור (`taxMailto`).
 */
import * as DocumentPicker from 'expo-document-picker';
import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { addDoc, collection, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { APP_ID, cloudStorage, firestore } from './firebase';
import { authUser, flush, getAccess, isDemoActive } from './sync';
import { setTaxCoordination, setTaxFile, type TaxFile, type Workplace } from './workplaces';
import { todayISO } from './time';

/** עד 10MB, כמו בחוקי האבטחה */
export const TAX_FILE_MAX = 10 * 1024 * 1024;

export type TaxFileError = 'signedOut' | 'shared' | 'tooBig' | 'type' | 'failed';

export const TAX_FILE_ERROR: Record<TaxFileError, string> = {
  signedOut: 'כדי לשמור קבצים צריך להתחבר עם חשבון Google (תפריט ☰).',
  shared: 'בחשבון ששותף איתך אפשר רק לצפות בטפסים — את הקבצים טוען הבעלים.',
  tooBig: 'הקובץ גדול מ־10MB.',
  type: 'אפשר לטעון רק PDF או תמונה.',
  failed: 'הטעינה נכשלה. כדאי לבדוק את החיבור ולנסות שוב.',
};

const extOf = (name: string, type: string) => {
  const m = /\.([a-z0-9]{2,5})$/i.exec(name);
  if (m) return m[1].toLowerCase();
  return type === 'application/pdf' ? 'pdf' : type.split('/')[1] || 'bin';
};

const okType = (type: string) => type === 'application/pdf' || type.startsWith('image/');

/**
 * בחירת קובץ וטעינה. מחזיר את מקומות העבודה המעודכנים, null כשבוטלה הבחירה,
 * או שגיאה.
 */
export async function pickAndUploadTaxFile(
  w: Workplace,
  year: string,
): Promise<{ list: Workplace[] } | { error: TaxFileError } | null> {
  const user = authUser();
  const storage = cloudStorage();
  if (!user || !storage) return { error: 'signedOut' };
  if (getAccess()) return { error: 'shared' };

  const res = await DocumentPicker.getDocumentAsync({
    type: ['application/pdf', 'image/*'],
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (res.canceled || !res.assets?.length) return null;
  const a = res.assets[0];
  const type = a.mimeType ?? (a.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : '');
  if (!okType(type)) return { error: 'type' };
  if ((a.size ?? 0) > TAX_FILE_MAX) return { error: 'tooBig' };

  try {
    const blob: Blob = a.file ?? (await (await fetch(a.uri)).blob());
    if (blob.size > TAX_FILE_MAX) return { error: 'tooBig' };
    const path = `apps/${APP_ID}/users/${user.uid}/files/tax/${w.id}-${year}.${extOf(a.name, type)}`;
    // קובץ קודם באותה שנה בסיומת אחרת — נמחק אחרי שהחדש נטען.
    const prev = w.taxFiles?.[year];
    await uploadBytes(ref(storage, path), blob, { contentType: type });
    if (prev && prev.path !== path) await deleteObject(ref(storage, prev.path)).catch(() => {});
    const file: TaxFile = { path, name: a.name, contentType: type, size: blob.size, uploadedAt: Date.now() };
    return { list: await setTaxFile(w.id, year, file) };
  } catch {
    return { error: 'failed' };
  }
}

/** קישור לצפייה / הורדה (מוגבל לבעלים בחוקים; הקישור עצמו כולל אסימון). */
export async function taxFileUrl(file: TaxFile): Promise<string | null> {
  const storage = cloudStorage();
  if (!storage) return null;
  try {
    return await getDownloadURL(ref(storage, file.path));
  } catch {
    return null;
  }
}

/** מחיקת הקובץ (הסטטוס "נשלח" נשאר). */
export async function deleteTaxFile(w: Workplace, year: string): Promise<Workplace[]> {
  const file = w.taxFiles?.[year];
  const storage = cloudStorage();
  if (file && storage) await deleteObject(ref(storage, file.path)).catch(() => {});
  return setTaxFile(w.id, year, null);
}

/**
 * טיוטת מייל עם קישור לטופס. `toPayroll` (ברירת מחדל) — ממוענת למייל מחלקת השכר (ולמכותבים);
 * אחרת — בלי נמען, והמשתמש בוחר בעצמו בטיוטה.
 */
export function taxMailto(
  w: Workplace,
  year: string,
  url: string,
  senderName?: string | null,
  toPayroll = true,
): string {
  const to = toPayroll ? (w.payrollEmail ?? '') : '';
  const params: string[] = [];
  const cc = toPayroll ? (w.ccEmails ?? []).join(',') : '';
  if (cc) params.push(`cc=${encodeURIComponent(cc)}`);
  params.push(`subject=${encodeURIComponent(`טופס תיאום מס ${year}${senderName ? ` — ${senderName}` : ''}`)}`);
  const body = [
    'שלום,',
    '',
    `מצורף טופס תיאום מס לשנת ${year}${w.employeeNumber ? ` (מספר עובד ${w.employeeNumber})` : ''}:`,
    url,
    '',
    'בברכה,',
    senderName ?? '',
  ].join('\n');
  params.push(`body=${encodeURIComponent(body)}`);
  return `mailto:${encodeURIComponent(to).replace(/%40/g, '@')}?${params.join('&')}`;
}

/** סימון "נשלח" היום (אחרי פתיחת טיוטת המייל). */
export function markTaxSent(w: Workplace, year: string): Promise<Workplace[]> {
  return setTaxCoordination(w.id, year, todayISO());
}

/** כמה לחכות לתשובת השרת לפני שמציעים טיוטה במכשיר. */
const SERVER_TIMEOUT_MS = 45_000;

export type ServerSendError =
  | 'signedOut'
  | 'shared'
  | 'demo'
  | 'timeout'
  | 'failed'
  // מהשרת (functions/src/taxSend.mjs)
  | 'year'
  | 'workplace'
  | 'file'
  | 'user'
  | 'recipient'
  | 'limit'
  | 'storage'
  | 'send';

export const SERVER_SEND_ERROR: Record<ServerSendError, string> = {
  signedOut: 'כדי לשלוח מהשרת צריך להתחבר עם חשבון Google.',
  shared: 'בחשבון ששותף איתך אפשר רק לצפות בטפסים.',
  demo: 'בנתוני הדגמה אין שליחה מהשרת.',
  timeout: 'השרת לא ענה בזמן.',
  failed: 'השליחה נכשלה.',
  year: 'שנה לא תקינה.',
  workplace: 'מקום העבודה לא נמצא בשרת — אולי עוד לא סונכרן. אפשר לנסות שוב בעוד דקה.',
  file: 'הטופס עוד לא הגיע לשרת — אולי עוד לא סונכרן. אפשר לנסות שוב בעוד דקה.',
  user: 'לא נמצאה כתובת המייל שלך בחשבון.',
  recipient: 'לא הוגדר מייל מחלקת השכר במקום העבודה.',
  limit: 'הגעת למכסת השליחות להיום.',
  storage: 'הקובץ לא נמצא באחסון. כדאי לטעון אותו שוב.',
  send: 'שליחת המייל נכשלה.',
};

/** שגיאות שבהן כדאי להציע טיוטת מייל במכשיר במקום. */
export const draftHelps = (e: ServerSendError) => e === 'timeout' || e === 'failed' || e === 'send' || e === 'demo';

/**
 * שליחת הטופס מהשרת. `toPayroll` — למייל מחלקת השכר (ולמכותבים); אחרת — אליך בלבד.
 * מחכה לתשובת השרת; בהצלחה מסמן "נשלח" גם במכשיר (השרת מסמן בנתונים המסונכרנים).
 */
export async function sendTaxFormFromServer(
  w: Workplace,
  year: string,
  toPayroll: boolean,
  senderName?: string | null,
): Promise<{ ok: true; to: string; list: Workplace[] } | { ok: false; error: ServerSendError }> {
  const user = authUser();
  const db = firestore();
  if (!user || !db) return { ok: false, error: 'signedOut' };
  if (getAccess()) return { ok: false, error: 'shared' };
  if (await isDemoActive()) return { ok: false, error: 'demo' };
  try {
    // השרת קורא את מקום העבודה והקובץ מהנתונים המסונכרנים — דוחפים קודם שינויים שעוד לא עלו.
    await flush();
    const ref = await addDoc(collection(db, 'apps', APP_ID, 'users', user.uid, 'taxSend'), {
      workplaceId: w.id,
      year,
      toPayroll,
      senderName: senderName ?? '',
      status: 'pending',
      created: serverTimestamp(),
    });
    const result = await new Promise<{ status: string; error?: string; to?: string } | null>((resolve) => {
      const timer = setTimeout(() => {
        off();
        resolve(null);
      }, SERVER_TIMEOUT_MS);
      const off = onSnapshot(
        ref,
        (snap) => {
          const d = snap.data();
          if (!d || d.status === 'pending') return;
          clearTimeout(timer);
          off();
          resolve(d as { status: string; error?: string; to?: string });
        },
        () => {
          clearTimeout(timer);
          resolve({ status: 'error', error: 'failed' });
        },
      );
    });
    if (!result) return { ok: false, error: 'timeout' };
    if (result.status !== 'sent') {
      const e = (result.error ?? 'failed') as ServerSendError;
      return { ok: false, error: e in SERVER_SEND_ERROR ? e : 'failed' };
    }
    return { ok: true, to: result.to ?? '', list: await markTaxSent(w, year) };
  } catch {
    return { ok: false, error: 'failed' };
  }
}
