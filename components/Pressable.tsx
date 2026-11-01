/**
 * Pressable שכל השטח שלו לחיץ — לא רק הטקסט שבתוכו.
 *
 * באנדרואיד (ארכיטקטורה חדשה) View שאין לו תוכן משלו עלול "להשתטח" ולצאת
 * מעץ התצוגה, ואז רק הטקסט שבתוך הכפתור נתפס כמטרה ללחיצה. כאן נוספת
 * שכבה שקופה בגודל הכפתור כולו, *מתחת* לתוכן (ילד ראשון), שאינה משתטחת
 * (collapsable={false}) — כך לחיצה בכל נקודה בכפתור מגיעה אליו, וכפתורים
 * פנימיים (למשל ✎) נשארים מעליה ולחיצים.
 *
 * ממשק זהה ל־Pressable של react-native — מייבאים אותו במקומו.
 */
import { forwardRef } from 'react';
import {
  Pressable as RNPressable,
  StyleSheet,
  View,
  type PressableProps,
  type PressableStateCallbackType,
} from 'react-native';

export type { PressableProps };

export const Pressable = forwardRef<View, PressableProps>(function Pressable(
  { children, ...props },
  ref,
) {
  return (
    <RNPressable ref={ref} {...props}>
      {(state: PressableStateCallbackType) => (
        <>
          <View style={StyleSheet.absoluteFill} collapsable={false} />
          {typeof children === 'function' ? children(state) : children}
        </>
      )}
    </RNPressable>
  );
});
