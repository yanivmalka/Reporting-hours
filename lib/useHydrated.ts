/**
 * ב־web המסכים מרונדרים מראש בזמן הבנייה (static export), בלי חלון אמיתי
 * ובלי גופנים טעונים. כל מה שתלוי בדפדפן — רוחב החלון, טעינת גופן האייקונים —
 * חייב להיראות ברינדור הראשון בדיוק כמו בשרת, אחרת React מזהה אי־התאמה
 * (שגיאה #418) ובונה את כל העץ מחדש.
 *
 * useHydrated מחזיר false עד סיום ה־hydration ו־true מאז ואילך. אחרי
 * ה־hydration הראשון (דגל גלובלי) רכיבים חדשים מקבלים true מיד, בלי הבהוב.
 * באנדרואיד אין רינדור מראש — תמיד true.
 */
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

let hydrated = Platform.OS !== 'web';

export function useHydrated(): boolean {
  const [ready, setReady] = useState(hydrated);
  useEffect(() => {
    hydrated = true;
    if (!ready) setReady(true);
  }, [ready]);
  return ready;
}
