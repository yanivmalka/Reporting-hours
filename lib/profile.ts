/**
 * פרטים אישיים של המרצה — לשימוש בדוחות ובמיילים לשכר (חתימה וזיהוי).
 * נשמרים במכשיר בלבד.
 */
import { readJSON, writeJSON } from './storage';

export type Profile = {
  fullName: string;
  /** מספר תעודת זהות */
  idNumber: string;
  phone: string;
  email: string;
  address: string;
};

const KEY = 'reporting-hours/profile/v1';

export const EMPTY_PROFILE: Profile = { fullName: '', idNumber: '', phone: '', email: '', address: '' };

export async function loadProfile(): Promise<Profile> {
  return { ...EMPTY_PROFILE, ...(await readJSON<Partial<Profile>>(KEY, {})) };
}

export async function saveProfile(p: Profile): Promise<void> {
  await writeJSON(KEY, p);
}

/** חתימת מייל: שם, ת"ז, טלפון, מייל ומספר עובד (כשקיימים). */
export function signatureLines(p: Profile, employeeNumber?: string): string[] {
  const lines: string[] = [];
  if (p.fullName) lines.push(p.fullName);
  const ids = [
    p.idNumber ? `ת״ז ${p.idNumber}` : '',
    employeeNumber ? `מספר עובד ${employeeNumber}` : '',
  ].filter(Boolean);
  if (ids.length) lines.push(ids.join(' · '));
  const contact = [p.phone, p.email].filter(Boolean);
  if (contact.length) lines.push(contact.join(' · '));
  return lines;
}
