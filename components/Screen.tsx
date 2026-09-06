import { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useThemedStyles } from '../theme/useThemedStyles';
import { spacing, type AppColors } from '../theme/colors';

type ScreenProps = {
  children: ReactNode;
  scroll?: boolean;
};

/** מעטפת מסך אחידה: רקע, שוליים בטוחים וריווח פנימי. */
export function Screen({ children, scroll = true }: ScreenProps) {
  const styles = useThemedStyles(makeStyles);
  const inner = <View style={styles.content}>{children}</View>;
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      {scroll ? (
        <ScrollView contentContainerStyle={styles.scroll}>{inner}</ScrollView>
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
