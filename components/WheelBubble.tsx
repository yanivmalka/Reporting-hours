/**
 * בועת ערך מעל האצבע בזמן גרירת גלגלת (`useWheel`): מציגה את מה שנערך,
 * כי האגודל מסתיר את התיבה. ממוקמת יחסית להורה (position: relative),
 * ממורכזת אופקית על האצבע ומעליה, וזזה איתה.
 */
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { radius } from '../theme/colors';

const WIDTH = 132;
const HEIGHT = 60;
/** המרחק מעל נקודת המגע — כדי שהבועה לא תוסתר מתחת לאגודל */
const LIFT = 78;

export function WheelBubble({ x, y, children }: { x: number; y: number; children: ReactNode }) {
  const { colors } = useTheme();
  return (
    <View
      pointerEvents="none"
      style={[
        styles.bubble,
        {
          left: x - WIDTH / 2,
          top: y - LIFT - HEIGHT / 2,
          backgroundColor: colors.surface,
          borderColor: colors.brand,
          shadowColor: '#000',
        },
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  bubble: {
    position: 'absolute',
    width: WIDTH,
    height: HEIGHT,
    borderRadius: radius.md,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 50,
    elevation: 8,
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
});
