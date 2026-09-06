import '../lib/rtl';

import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { DrawerProvider, DrawerToggle } from '../components/AppDrawer';
import { ToastProvider } from '../components/Toast';
import { I18nProvider, useI18n } from '../lib/i18n';
import { PayBasisProvider } from '../lib/payBasis';
import { ThemeProvider, useTheme } from '../theme/ThemeContext';

export default function RootLayout() {
  return (
    <I18nProvider>
      <ThemeProvider>
        <PayBasisProvider>
          <SafeAreaProvider>
            <ToastProvider>
              <Chrome />
            </ToastProvider>
          </SafeAreaProvider>
        </PayBasisProvider>
      </ThemeProvider>
    </I18nProvider>
  );
}

/** קליפת האפליקציה — כותרת, ניווט ותפריט ההמבורגר — תלויי ערכת צבעים ושפה. */
function Chrome() {
  const { colors } = useTheme();
  const { t } = useI18n();

  return (
    <DrawerProvider>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.brand },
          headerTintColor: colors.textOnBrand,
          headerTitleStyle: { fontWeight: '700' },
          headerBackTitle: t('common.back'),
          contentStyle: { backgroundColor: colors.background },
          headerRight: () => <DrawerToggle />,
        }}
      >
        <Stack.Screen name="index" options={{ title: t('nav.home') }} />
        <Stack.Screen name="report" options={{ title: t('nav.report') }} />
        <Stack.Screen name="reports" options={{ title: t('nav.reports') }} />
        <Stack.Screen name="workplaces" options={{ title: t('nav.workplaces') }} />
        <Stack.Screen
          name="workplace-form"
          options={{ title: t('nav.workplaceForm') }}
        />
        <Stack.Screen name="trash" options={{ title: t('nav.trash') }} />
        <Stack.Screen name="settings" options={{ title: t('nav.settings') }} />
      </Stack>
    </DrawerProvider>
  );
}
