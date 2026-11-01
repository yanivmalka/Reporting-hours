import { ReactNode, useEffect, useState } from 'react';
import { Keyboard, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useThemedStyles } from '../theme/useThemedStyles';
import { spacing, type AppColors } from '../theme/colors';

type ScreenProps = {
  children: ReactNode;
  scroll?: boolean;
};

/**
 * גובה המקלדת הפתוחה (0 כשסגורה). באנדרואיד עם תצוגה מקצה לקצה המסך לא
 * מתכווץ אוטומטית, ולכן מוסיפים בתחתית הגלילה "פוטר" בגובה המקלדת —
 * כך אפשר לגלול כל שדה אל מעליה.
 */
function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const show = Keyboard.addListener('keyboardDidShow', (e) =>
      setHeight(e.endCoordinates.height),
    );
    const hide = Keyboard.addListener('keyboardDidHide', () => setHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return height;
}

/** מעטפת מסך אחידה: רקע, שוליים בטוחים וריווח פנימי. */
export function Screen({ children, scroll = true }: ScreenProps) {
  const styles = useThemedStyles(makeStyles);
  const keyboard = useKeyboardHeight();
  const inner = (
    <View style={styles.content}>
      {children}
      {scroll && keyboard > 0 ? <View style={{ height: keyboard }} /> : null}
    </View>
  );
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >{inner}</ScrollView>
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
