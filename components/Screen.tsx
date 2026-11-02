import { ReactNode, useEffect, useState } from 'react';
import {
  Keyboard,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemedStyles } from '../theme/useThemedStyles';
import { spacing, type AppColors } from '../theme/colors';

type ScreenProps = {
  children: ReactNode;
  scroll?: boolean;
  /**
   * פוטר קבוע בתחתית הגלילה בגובה מקלדת — למסכי טפסים, כדי שאפשר יהיה
   * לגלול כל שדה (גם האחרון) אל מעל המקלדת.
   */
  keyboardFooter?: boolean;
  /** מאזין לגלילה (למשל לכיווץ פקד בראש המסך) */
  onScroll?: (e: NativeSyntheticEvent<NativeScrollEvent>) => void;
  /** שכבה קבועה בראש המסך, מעל התוכן הנגלל (פקד מוצמד) */
  overlay?: ReactNode;
};

/** גובה מינימלי לפוטר בכל מסך (מעבר לשוליים הבטוחים של המערכת). */
const FOOTER_MIN = 12;

/** גובה המקלדת האחרון שנמדד — משמש לפוטר הקבוע גם כשהמקלדת סגורה. */
let lastKeyboardHeight = 0;

/**
 * גובה המקלדת הפתוחה (0 כשסגורה). באנדרואיד עם תצוגה מקצה לקצה המסך לא
 * מתכווץ אוטומטית, ולכן מוסיפים בתחתית הגלילה "פוטר" בגובה המקלדת —
 * כך אפשר לגלול כל שדה אל מעליה.
 */
function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const show = Keyboard.addListener('keyboardDidShow', (e) => {
      lastKeyboardHeight = e.endCoordinates.height;
      setHeight(e.endCoordinates.height);
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => setHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return height;
}

/** מעטפת מסך אחידה: רקע, שוליים בטוחים וריווח פנימי. */
export function Screen({ children, scroll = true, keyboardFooter = false, onScroll, overlay }: ScreenProps) {
  const styles = useThemedStyles(makeStyles);
  const keyboard = useKeyboardHeight();
  const { height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  // פוטר בכל מסך: מרווח מעל סרגל הניווט של המערכת, כדי שכפתורים בתחתית
  // לא יוסתרו. בטופס: פוטר קבוע בגובה המקלדת (או ~40% מהמסך לפני שנמדדה).
  const base = insets.bottom + FOOTER_MIN;
  // הפוטר הקבוע בטפסים: חמישית מגובה המקלדת; כשהמקלדת פתוחה — בגובה המלא שלה.
  const footer = keyboardFooter
    ? Math.max(keyboard, Math.round((lastKeyboardHeight || windowHeight * 0.4) / 5), base)
    : Math.max(keyboard, base);
  const inner = (
    <View style={styles.content}>
      {children}
      {scroll ? <View style={{ height: footer }} /> : <View style={{ height: insets.bottom }} />}
    </View>
  );
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          onScroll={onScroll}
          scrollEventThrottle={onScroll ? 16 : undefined}
        >
          {inner}
        </ScrollView>
      ) : (
        inner
      )}
      {overlay ? <View style={styles.overlay}>{overlay}</View> : null}
    </SafeAreaView>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    safe: {
      flex: 1,
      backgroundColor: colors.background,
    },
    scroll: {
      flexGrow: 1,
    },
    overlay: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
    },
    content: {
      flex: 1,
      padding: spacing.lg,
      gap: spacing.md,
    },
  });
