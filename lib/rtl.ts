import { I18nManager } from 'react-native';

/**
 * כפיית כיווניות מימין־לשמאל (RTL) לכל האפליקציה.
 *
 * הקובץ מיובא ראשון ב־app/_layout.tsx כדי שההגדרה תחול לפני רינדור המסכים.
 * ב־Metro (פיתוח) השינוי נכנס לתוקף אחרי רענון; ב־build ל־APK הוא חל בהפעלה הראשונה.
 */
export function enforceRTL(): void {
  try {
    I18nManager.allowRTL(true);
    if (!I18nManager.isRTL) {
      I18nManager.forceRTL(true);
    }
  } catch {
    // אם המודול לא זמין (למשל בסביבת בדיקות) פשוט מתעלמים
  }
}

enforceRTL();
