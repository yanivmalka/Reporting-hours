/**
 * פרטים אישיים של המרצה — לשימוש בדוחות ובמיילים לשכר (חתימה וזיהוי).
 * נשמרים במכשיר, ומסונכרנים לחשבון כשהמשתמש מחובר (lib/sync.ts).
 */
import { readJSON, writeJSON } from './storage';
import { KEYS } from './keys';
import { authUser, getAccess } from './sync';

export type Profile = {
  fullName: string;
  phone: string;
  email: string;
  address: string;
  /**
   * תמונת הפרופיל מחשבון Google של בעל החשבון — נשמרת אוטומטית (`syncGooglePhoto`), כדי שמורשה
   * שצופה בחשבון יראה אותה (עם כובע — components/Avatar.tsx). לא נערכת בטופס.
   */
  photoUrl?: string;
};

const KEY = KEYS.profile;

export const EMPTY_PROFILE: Profile = { fullName: '', phone: '', email: '', address: '' };

export async function loadProfile(): Promise<Profile> {
  const saved = await readJSON<Partial<Profile> & { idNumber?: string }>(KEY, {});
  // שדה תעודת הזהות הוסר: מוחקים ערך ישן מהמכשיר (ומשם, בסנכרון, גם מהענן).
  if ('idNumber' in saved) {
    const { idNumber: _removed, ...rest } = saved;
    await writeJSON(KEY, rest);
    return { ...EMPTY_PROFILE, ...rest };
  }
  return { ...EMPTY_PROFILE, ...saved };
}

export async function saveProfile(p: Profile): Promise<void> {
  await writeJSON(KEY, p);
}

/** שמירת תמונת Google של הבעלים בפרטים המסונכרנים (רק בנתונים שלך, ורק כשהשתנתה). */
export async function syncGooglePhoto(photo: string | null | undefined): Promise<void> {
  if (!photo || getAccess()) return;
  const p = await loadProfile();
  if (p.photoUrl !== photo) await saveProfile({ ...p, photoUrl: photo });
}

/** חתימת מייל: שם, מספר עובד, טלפון ומייל (כשקיימים). */
export function signatureLines(p: Profile, employeeNumber?: string): string[] {
  const lines: string[] = [];
  if (p.fullName) lines.push(p.fullName);
  if (employeeNumber) lines.push(`מספר עובד ${employeeNumber}`);
  const contact = [p.phone, p.email].filter(Boolean);
  if (contact.length) lines.push(contact.join(' · '));
  return lines;
}

/**
 * השם שבו יוצאים מיילים "בשם המשתמש": השם המלא מהפרטים האישיים של בעל החשבון.
 * בחשבון ששותף — הפרטים הנטענים הם של הבעלים, ובלי שם מלא — שם הבעלים מההרשאה (לא שם המורשה).
 */
export function senderName(p: Profile | null | undefined): string {
  const full = p?.fullName?.trim();
  if (full) return full;
  const access = getAccess();
  if (access) return access.ownerName || '';
  return authUser()?.name ?? '';
}
