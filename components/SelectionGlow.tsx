/**
 * מסגרת מודגשת ליום הנבחר ברשימה — מצוירת מעל האריח ונכנסת בדהייה.
 *
 * נפרדת מהגלילה: הרשימה מסמנת את היום רק אחרי שהיא נעצרת (ראו
 * `useJournal.followScroll`), והמסגרת לא משנה את גובה האריח — כך הגלילה
 * לא נתקעת ברינדור מחדש של הרקע / המסגרת בכל צעד.
 */
import { useEffect, useRef } from 'react';
import { Animated, StyleSheet } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { radius } from '../theme/colors';

/** משך הדהייה פנימה / החוצה (מ״ש). */
const FADE_IN = 260;
const FADE_OUT = 120;

export function SelectionGlow({ on }: { on: boolean }) {
  const { colors } = useTheme();
  const opacity = useRef(new Animated.Value(on ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(opacity, {
      toValue: on ? 1 : 0,
      duration: on ? FADE_IN : FADE_OUT,
      useNativeDriver: true,
    }).start();
  }, [on, opacity]);
  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.glow, { borderColor: colors.brandDark, opacity }]}
    />
  );
}

const styles = StyleSheet.create({
  glow: {
    position: 'absolute',
    top: -2,
    left: -2,
    right: -2,
    bottom: -2,
    borderWidth: 3,
    borderRadius: radius.md + 2,
  },
});
