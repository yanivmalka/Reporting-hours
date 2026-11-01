import { ReactNode, useEffect, useState } from 'react';
import { Keyboard, Platform, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
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
};

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
export function Screen({ children, scroll = true, keyboardFooter = false }: ScreenProps) {
  const styles = useThemedStyles(makeStyles);
  const keyboard = useKeyboardHeight();
  const { height: windowHeight } = useWindowDimensions();
  // טופס: פוטר קבוע בגובה המקלדת (או ~40% מהמסך לפני שנמדדה). מסך רגיל:
  // רווח רק כשהמקלדת פתוחה.
  const footer = keyboardFooter
    ? Math.max(keyboard, lastKeyboardHeight || Math.round(windowHeight * 0.4))
    : keyboard;
  const inner = (
    <View style={styles.content}>
      {children}
      {scroll && footer > 0 ? <View style={{ height: footer }} /> : null}
    </View>
  );
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          {inner}
        </ScrollView>
      ) : (
        inner
      )}
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
    content: {
      flex: 1,
      padding: spacing.lg,
      gap: spacing.md,
    },
  });
