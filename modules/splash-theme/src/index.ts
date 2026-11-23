import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';

const native = Platform.OS === 'android' ? requireOptionalNativeModule<{ setTheme(id: string): boolean }>('SplashTheme') : null;

/**
 * מסך הפתיחה בפתיחה הבאה — בצבע הערכה (אנדרואיד 13+). בלי המודול (web, גרסה ישנה) — לא עושה כלום.
 */
export function setSplashTheme(id: string): void {
  try {
    native?.setTheme(id);
  } catch {
    // לא קריטי — מסך הפתיחה נשאר בצבע ברירת המחדל
  }
}
