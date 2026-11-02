import '../lib/rtl';

import { Fragment, type ReactNode } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { DrawerProvider, HeaderEnd, HeaderStart } from '../components/AppDrawer';
import { ExitGuard } from '../components/ExitGuard';
import { ToastProvider } from '../components/Toast';
import { UpdateProvider } from '../components/UpdateChecker';
import { DemoSeeder } from '../components/DemoSeeder';
import { SyncProvider, useCloudSync } from '../components/CloudSync';
import { I18nProvider, useI18n } from '../lib/i18n';
import { PayBasisProvider } from '../lib/payBasis';
import { ThemeProvider, useTheme } from '../theme/ThemeContext';

export default function RootLayout() {
  return (
    <I18nProvider>
      <ThemeProvider>
        <SyncProvider>
          <SyncedTree>
            <PayBasisProvider>
              <SafeAreaProvider>
                <ToastProvider>
                  <Chrome />
                </ToastProvider>
              </SafeAreaProvider>
            </PayBasisProvider>
          </SyncedTree>
        </SyncProvider>
      </ThemeProvider>
    </I18nProvider>
  );
}

/** כשהמשיכה מהענן משנה נתונים במכשיר, העץ נטען מחדש (key) כדי שכל המסכים יציגו אותם. */
function SyncedTree({ children }: { children: ReactNode }) {
  const { revision } = useCloudSync();
  return <Fragment key={revision}>{children}</Fragment>;
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
            // דפוס אנדרואיד/Google בעברית: headerLeft מוצג מימין — ☰ במסך הראשי,
            // חץ חזרה במסכים פנימיים; headerRight מוצג משמאל — ⋮ במסכים פנימיים.
            headerLeft: (props) => (
              <HeaderStart canGoBack={props.canGoBack} tintColor={String(props.tintColor ?? colors.textOnBrand)} />
            ),
            headerBackVisible: false,
            headerRight: (props) => (
              <HeaderEnd canGoBack={props.canGoBack} tintColor={String(props.tintColor ?? colors.textOnBrand)} />
            ),
          }}
        >
          <Stack.Screen name="index" options={{ title: t('nav.home') }} />
          <Stack.Screen name="dashboard" options={{ title: t('nav.dashboard') }} />
          <Stack.Screen name="report" options={{ title: t('nav.report') }} />
          <Stack.Screen name="reports" options={{ title: t('nav.reports') }} />
          <Stack.Screen name="report-view" options={{ title: 'דיווח' }} />
          <Stack.Screen name="workplaces" options={{ title: t('nav.workplaces') }} />
          <Stack.Screen name="workplace" options={{ title: t('nav.workplaceForm') }} />
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
