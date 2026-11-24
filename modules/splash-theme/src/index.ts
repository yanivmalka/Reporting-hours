import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';

const native = Platform.OS === 'android' ? requireOptionalNativeModule<{
      setTheme(id: string): boolean;
      setLauncherIcon?(id: string, ids: string[]): boolean;
    }>('SplashTheme') : null;

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

/**
 * אייקון האפליקציה בצבעי הערכה (activity-alias לכל ערכה — plugins/withThemedIcons.js).
 * בלי המודול / בגרסה ישנה — לא עושה כלום.
 */
export function setLauncherIcon(id: string, ids: readonly string[]): void {
  try {
    native?.setLauncherIcon?.(id, [...ids]);
  } catch {
    // לא קריטי — האייקון נשאר כפי שהוא
  }
}
