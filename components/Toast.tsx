import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Animated, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius, spacing } from '../theme/colors';

/**
 * הודעות קופצות (Toast) קצרות בתחתית המסך — בלי תלות חיצונית, זהה
 * ב־web ובאנדרואיד. משמש בעיקר להתראה בכל פעם שדקות נכנסות למונה
 * "דקות עבודה מצטברות" (סעיף 4, שלב 7 ב־WISHLIST).
 */

type ToastContextValue = {
  /** מציג הודעה קופצת קצרה; קריאה נוספת מחליפה את הקודמת. */
  showToast: (message: string) => void;
};

const ToastContext = createContext<ToastContextValue>({ showToast: () => {} });

/** גישה לפונקציית ההודעות הקופצות. */
export function useToast(): ToastContextValue {
  return useContext(ToastContext);
}

const VISIBLE_MS = 3600;
const FADE_MS = 220;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<string | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback(
    (next: string) => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
      setMessage(next);
      Animated.timing(opacity, {
        toValue: 1,
        duration: FADE_MS,
        useNativeDriver: true,
      }).start();
      hideTimer.current = setTimeout(() => {
        Animated.timing(opacity, {
          toValue: 0,
          duration: FADE_MS,
          useNativeDriver: true,
        }).start(({ finished }) => {
          if (finished) setMessage(null);
        });
      }, VISIBLE_MS);
    },
    [opacity],
  );

  useEffect(
    () => () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    },
    [],
  );

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {message != null ? (
        <SafeAreaView pointerEvents="none" style={styles.host} edges={['bottom']}>
          <Animated.View style={[styles.toast, { opacity }]}>
            <Text style={styles.text}>{message}</Text>
          </Animated.View>
        </SafeAreaView>
      ) : null}
    </ToastContext.Provider>
  );
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
  },
  toast: {
    maxWidth: 460,
    backgroundColor: colors.brandDark,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  text: {
    color: colors.textOnBrand,
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
});
