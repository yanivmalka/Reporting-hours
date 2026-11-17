import { useEffect, useRef } from 'react';
import { Animated } from 'react-native';

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
