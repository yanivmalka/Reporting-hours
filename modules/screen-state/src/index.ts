import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';

const native =
  Platform.OS === 'android'
    ? requireOptionalNativeModule<{ isScreenOn?(): boolean; screenOffAt?(): number }>('ScreenState')
    : null;

/** האם המסך דלוק. לא ידוע (web, גרסה ישנה בלי המודול) — null. */
export function isScreenOn(): boolean | null {
  try {
    return native?.isScreenOn ? native.isScreenOn() : null;
  } catch {
    return null;
  }
}

/** מתי המסך כבה לאחרונה (ms); 0 — לא כבה מאז שהאפליקציה עלתה; null — לא ידוע. */
export function screenOffAt(): number | null {
  try {
    return native?.screenOffAt ? native.screenOffAt() : null;
  } catch {
    return null;
  }
}
