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
 * מעבר רך בין ימים בלו״ז הבית, בשני שלבים — כך שהתוכן מתחלף רק כשהוא שקוף לגמרי, ואין הבהוב:
 *   1. יציאה: התוכן הנוכחי דוהה ומחליק מעט הצידה (`OUT_MS`).
 *   2. בסוף היציאה מוחלף היום (`swap`), והתוכן החדש נכנס מהצד השני בדעיכה איטית (`IN_MS`).
 * `go(dir, swap)` נקרא בלחיצה / בהחלקה במקום להחליף את היום ישירות. לחיצה באמצע מעבר — ממשיכה ממנו.
 */
const OUT_MS = 140;
const IN_MS = 280;
export function useSlideFade() {
  const op = useRef(new Animated.Value(1)).current;
  const tx = useRef(new Animated.Value(0)).current;
  const pendingIn = useRef<1 | -1 | null>(null);
  const [tick, setTick] = useState(0);

  const go = useCallback(
    (dir: 1 | -1, swap: () => void) => {
      op.stopAnimation();
      tx.stopAnimation();
      // RTL: היום הבא משמאל — התוכן הנוכחי יוצא ימינה, והחדש נכנס משמאל.
      Animated.parallel([
        Animated.timing(op, { toValue: 0, duration: OUT_MS, easing: Easing.in(Easing.quad), useNativeDriver: true }),
        Animated.timing(tx, { toValue: dir * 16, duration: OUT_MS, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      ]).start(({ finished }) => {
        if (!finished) return;
        pendingIn.current = dir;
        swap();
        setTick((n) => n + 1);
      });
    },
    [op, tx],
  );

  // אחרי שהיום החדש צויר (עדיין שקוף) — כניסה.
  useLayoutEffect(() => {
    const dir = pendingIn.current;
    if (dir == null) return;
    pendingIn.current = null;
    tx.setValue(dir * -24);
    Animated.parallel([
      Animated.timing(op, { toValue: 1, duration: IN_MS, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(tx, { toValue: 0, duration: IN_MS, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
  }, [tick, op, tx]);

  return { style: { opacity: op, transform: [{ translateX: tx }] }, go };
}
