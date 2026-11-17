/**
 * טופס תיאום מס לכל מקום עבודה ולכל שנה לועזית: טעינה (PDF או תמונה), צפייה,
 * מחיקה ושליחה במייל. הקובץ נשמר ב־Cloud Storage של malka-apps תחת
 * `apps/reporting-hours/users/{uid}/files/tax/{workplaceId}-{year}.{ext}` (רק הבעלים —
 * storage.rules בריפו apps-platform), והפרטים שלו ב־`Workplace.taxFiles[year]`.
 *
 * שליחה: עד שהשליחה מהשרת תעלה (docs/fixes-spec-2026-11-17.md סעיף 3) — טיוטת
 * מייל במכשיר לנמען דוחות השכר, עם קישור הורדה לקובץ. השליחה מסמנת "נשלח".
 */
import * as DocumentPicker from 'expo-document-picker';
import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { APP_ID, cloudStorage } from './firebase';
import { authUser, getAccess } from './sync';
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

/** טיוטת מייל לנמען דוחות השכר, עם קישור לטופס. */
export function taxMailto(w: Workplace, year: string, url: string, senderName?: string | null): string {
  const to = w.payrollEmail ?? '';
  const params: string[] = [];
  const cc = (w.ccEmails ?? []).join(',');
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
