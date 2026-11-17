import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Animated, Easing } from 'react-native';

/**
 * אפקט חזותי מינימלי למעבר תקופה / עמוד: הבהוב (שקיפות) והחלקה קצרה
 * מהכיוון שאליו עברו. מחזיר סגנון ל־Animated.View. לא פועל בטעינה הראשונה.
 * @param key  משתנה כשהתוכן מתחלף (למשל כותרת החודש)
 * @param dir  1 = קדימה, -1 = אחורה (קובע את כיוון ההחלקה)
 */
export function useFlash(key: unknown, dir: 1 | -1 = 1) {
  const v = useRef(new Animated.Value(1)).current;
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    v.setValue(0);
    Animated.timing(v, { toValue: 1, duration: 360, useNativeDriver: true }).start();
  }, [key, v]);
  return {
    opacity: v.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0.15, 0.6, 1] }),
    // RTL: "קדימה" נמצא משמאל — התוכן החדש מגיע משמאל.
    transform: [{ translateX: v.interpolate({ inputRange: [0, 1], outputRange: [dir * -18, 0] }) }],
  };
}

/**
 * עמעום קצר בלבד (בלי החלקה) — למעבר בין שלבי אשף הדיווח ובין ימים בלו״ז.
 * לא פועל בטעינה הראשונה.
 */
export function useFade(key: unknown, duration = 120) {
  const v = useRef(new Animated.Value(1)).current;
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    v.setValue(0.25);
    Animated.timing(v, { toValue: 1, duration, useNativeDriver: true }).start();
  }, [key, v, duration]);
  return { opacity: v };
}

/**
 * מעבר רך בין ימים בלו״ז הבית: התוכן החדש נכנס בהחלקה קצרה מכיוון המעבר, עם עמעום הדרגתי
 * והאטה בסוף.
 *
 * `prime(dir)` נקרא באירוע הלחיצה, **לפני** החלפת היום: הוא מסתיר את התוכן מיד, כך שהתוכן החדש
 * לא מצויר אף פעם במלוא השקיפות לפני שהאנימציה מתחילה (זה היה ה"הבהוב" — useEffect רץ רק אחרי
 * שהמסך כבר צויר). ההופעה מתחילה כשהמפתח (`key`) משתנה.
 */
export function useSlideFade(key: unknown, duration = 260) {
  const v = useRef(new Animated.Value(1)).current;
  const dir = useRef<1 | -1>(1);
  const [, force] = useState(0);
  const primed = useRef(false);
  const prime = useCallback(
    (d: 1 | -1) => {
      v.stopAnimation();
      v.setValue(0);
      if (dir.current !== d) {
        dir.current = d;
        force((n) => n + 1);
      }
      primed.current = true;
    },
    [v],
  );
  useLayoutEffect(() => {
    if (!primed.current) return;
    primed.current = false;
    Animated.timing(v, { toValue: 1, duration, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [key, v, duration]);
  const style = {
    opacity: v.interpolate({ inputRange: [0, 0.25, 1], outputRange: [0, 0.55, 1] }),
    // RTL: היום הבא נמצא משמאל — התוכן החדש מגיע משמאל.
    transform: [{ translateX: v.interpolate({ inputRange: [0, 1], outputRange: [dir.current * -28, 0] }) }],
  };
  return { style, prime };
}
