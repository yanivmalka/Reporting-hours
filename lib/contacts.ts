/**
 * בחירה מאנשי הקשר של המכשיר — טלפון המונית ואנשי הקשר של מקום עבודה.
 *
 * באנדרואיד נפתח בורר אנשי הקשר של המערכת. ב־web אין גישה לאנשי קשר —
 * `contactsSupported` שקרי, והמשתמש מקליד את המספר ידנית.
 */
import { Platform } from 'react-native';
import * as Contacts from 'expo-contacts/legacy';

export const contactsSupported = Platform.OS !== 'web';

export type PickedPhone = { name: string; phone: string };
export type PickedContact = { name: string; phone: string; email: string };

/** בוחר איש קשר מלא (שם, טלפון ומייל ראשונים). null — בוטל או אין הרשאה. */
export async function pickContact(): Promise<PickedContact | null> {
  if (!contactsSupported) return null;
  try {
    const { status } = await Contacts.requestPermissionsAsync();
    if (status !== 'granted') return null;
    const c = await Contacts.presentContactPickerAsync();
    if (!c) return null;
    return {
      name: c.name ?? '',
      phone: (c.phoneNumbers?.find((p) => p.number)?.number ?? '').replace(/[^\d+*#]/g, ''),
      email: c.emails?.find((e) => e.email)?.email ?? '',
    };
  } catch {
    return null;
  }
}

/** פותח את בורר אנשי הקשר. null — בוטל, אין הרשאה או שלאיש הקשר אין טלפון. */
export async function pickContactPhone(): Promise<PickedPhone | null> {
  if (!contactsSupported) return null;
  try {
    const { status } = await Contacts.requestPermissionsAsync();
    if (status !== 'granted') return null;
    const contact = await Contacts.presentContactPickerAsync();
    const phone = contact?.phoneNumbers?.find((p) => p.number)?.number;
    if (!contact || !phone) return null;
    return { name: contact.name ?? '', phone: phone.replace(/[^\d+*#]/g, '') };
  } catch {
    return null;
  }
}
