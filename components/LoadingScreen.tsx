/** מסך טעינה אחיד: אינדיקטור במרכז המסך (וכותרת, אם צריך לקבוע אותה כבר בטעינה). */
import { Stack } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { Screen } from './Screen';

export function LoadingScreen({ title }: { title?: string }) {
  const { colors } = useTheme();
  return (
    <Screen scroll={false}>
      {title ? <Stack.Screen options={{ title }} /> : null}
      <View style={styles.center}>
        <ActivityIndicator color={colors.brand} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
