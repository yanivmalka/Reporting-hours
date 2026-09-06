import '../lib/rtl';

import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { colors } from '../theme/colors';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.brand },
          headerTintColor: colors.textOnBrand,
          headerTitleStyle: { fontWeight: '700' },
          headerBackTitle: 'חזרה',
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="index" options={{ title: 'דיווח שעות' }} />
        <Stack.Screen name="report" options={{ title: 'דיווח יום עבודה' }} />
        <Stack.Screen name="reports" options={{ title: 'הדיווחים שלי' }} />
        <Stack.Screen name="workplaces" options={{ title: 'מקומות עבודה' }} />
        <Stack.Screen name="workplace-form" options={{ title: 'מקום עבודה' }} />
        <Stack.Screen name="settings" options={{ title: 'הגדרות ותגיות' }} />
      </Stack>
    </SafeAreaProvider>
  );
}
