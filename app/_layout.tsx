import '../lib/rtl';

import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { DrawerProvider, HeaderStart } from '../components/AppDrawer';
import { ExitGuard } from '../components/ExitGuard';
import { ToastProvider } from '../components/Toast';
import { UpdateProvider } from '../components/UpdateChecker';
import { DemoSeeder } from '../components/DemoSeeder';
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
    <UpdateProvider>
      <DrawerProvider>
        <StatusBar style="light" />
        <DemoSeeder />
        <ExitGuard />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: colors.brand },
            headerTintColor: colors.textOnBrand,
            headerTitleStyle: { fontWeight: '700' },
            headerBackTitle: t('common.back'),
            contentStyle: { backgroundColor: colors.background },
            // בעברית תחילת הכותרת (headerLeft) מוצגת מימין: ☰ ואחריו חץ חזרה.
            headerLeft: (props) => (
              <HeaderStart canGoBack={props.canGoBack} tintColor={String(props.tintColor ?? colors.textOnBrand)} />
            ),
            headerBackVisible: false,
          }}
        >
          <Stack.Screen name="index" options={{ title: t('nav.home') }} />
          <Stack.Screen name="dashboard" options={{ title: t('nav.dashboard') }} />
          <Stack.Screen name="report" options={{ title: t('nav.report') }} />
          <Stack.Screen name="reports" options={{ title: t('nav.reports') }} />
          <Stack.Screen name="workplaces" options={{ title: t('nav.workplaces') }} />
          <Stack.Screen
            name="workplace-form"
            options={{ title: t('nav.workplaceForm') }}
          />
          <Stack.Screen name="payments" options={{ title: t('nav.payments') }} />
          <Stack.Screen name="tax" options={{ title: t('nav.tax') }} />
          <Stack.Screen name="profile" options={{ title: t('nav.profile') }} />
          <Stack.Screen name="payroll" options={{ title: t('nav.payroll') }} />
          <Stack.Screen name="payroll-report" options={{ title: 'דוח שכר' }} />
          <Stack.Screen name="course-form" options={{ title: 'קורס' }} />
          <Stack.Screen name="trash" options={{ title: t('nav.trash') }} />
          <Stack.Screen name="settings" options={{ title: t('nav.settings') }} />
          <Stack.Screen name="data" options={{ title: t('nav.data') }} />
        </Stack>
      </DrawerProvider>
    </UpdateProvider>
  );
}
