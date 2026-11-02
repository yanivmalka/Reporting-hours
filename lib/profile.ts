/**
 * פרטים אישיים של המרצה — לשימוש בדוחות ובמיילים לשכר (חתימה וזיהוי).
 * נשמרים במכשיר, ומסונכרנים לחשבון כשהמשתמש מחובר (lib/sync.ts).
 */
import { readJSON, writeJSON } from './storage';

export type Profile = {
  fullName: string;
  phone: string;
  email: string;
  address: string;
};

const KEY = 'reporting-hours/profile/v1';

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

/** חתימת מייל: שם, מספר עובד, טלפון ומייל (כשקיימים). */
export function signatureLines(p: Profile, employeeNumber?: string): string[] {
  const lines: string[] = [];
  if (p.fullName) lines.push(p.fullName);
  if (employeeNumber) lines.push(`מספר עובד ${employeeNumber}`);
  const contact = [p.phone, p.email].filter(Boolean);
  if (contact.length) lines.push(contact.join(' · '));
  return lines;
}
