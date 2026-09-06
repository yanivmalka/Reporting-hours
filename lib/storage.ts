import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * עטיפה דקה מעל AsyncStorage לשמירה וטעינה של ערכי JSON.
 *
 * AsyncStorage נתמך גם ב־web (react-native-web ממפה אותו ל־localStorage),
 * כך שאותו קוד אחסון עובד גם באתר וגם באפליקציית האנדרואיד.
 * כל השגיאות נבלעות בכוונה — אם האחסון לא זמין (למשל גלישה פרטית),
 * המשתמש עדיין יכול להשתמש באפליקציה, פשוט בלי התמדה.
 */
export async function readJSON<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (raw == null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export async function writeJSON<T>(key: string, value: T): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch {
    // מתעלמים משגיאות אחסון (מכסת דיסק, גלישה פרטית וכו').
  }
}
