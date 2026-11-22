import '../lib/rtl';

import { Fragment, type ReactNode } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { View } from 'react-native';
import { DrawerProvider, HeaderEnd, HeaderStart, SideNav, useWideLayout } from '../components/AppDrawer';
import { ExitGuard } from '../components/ExitGuard';
import { ToastProvider } from '../components/Toast';
import { WheelOverlayHost } from '../components/WheelOverlay';
import { UpdateProvider } from '../components/UpdateChecker';
import { DemoSeeder } from '../components/DemoSeeder';
import { BackupScheduler } from '../components/BackupScheduler';
import { MailSync } from '../components/MailSync';
import { PushScheduler } from '../components/PushScheduler';
import { SyncProvider, useCloudSync } from '../components/CloudSync';
import { BlockedWriteNotice } from '../components/Access';
import { HeaderTitle } from '../components/HeaderTitle';
import { I18nProvider, useI18n } from '../lib/i18n';
import { PayBasisProvider } from '../lib/payBasis';
import { ThemeProvider, useTheme } from '../theme/ThemeContext';

export default function RootLayout() {
  return (
    <I18nProvider>
      <ThemeProvider>
        {/* מעל SyncedTree: טעינה מחדש של המסכים (משיכה מהענן) לא סוגרת את חלון העדכון באמצע הורדה */}
        <UpdateProvider>
          <SyncProvider>
            <SyncedTree>
              <PayBasisProvider>
                <SafeAreaProvider>
                  <ToastProvider>
                    <Chrome />
                    <WheelOverlayHost />
                  </ToastProvider>
                </SafeAreaProvider>
              </PayBasisProvider>
            </SyncedTree>
          </SyncProvider>
        </UpdateProvider>
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
  // כותרת בהירה בצבע הרקע — המסך והכותרת משטח אחד, בלי פס צבע.
  const barBg = colors.background;
  const barFg = colors.text;
  const wide = useWideLayout();

  return (
    <DrawerProvider>
      <StatusBar style="dark" />
      <DemoSeeder />
      <BackupScheduler />
      <MailSync />
      <PushScheduler />
      <ExitGuard />
      <BlockedWriteNotice />
      {/* במסך רחב: תפריט קבוע בצד ההתחלה (ימין בעברית) והניווט לצדו */}
      <View style={{ flex: 1, flexDirection: 'row' }}>
        {wide ? <SideNav /> : null}
        <View style={{ flex: 1 }}>
          <Stack
            screenOptions={{
              headerStyle: { backgroundColor: barBg },
              headerTintColor: barFg,
              headerTitleStyle: { fontWeight: '700', fontSize: 20 },
              headerShadowVisible: false,
              headerBackTitle: t('common.back'),
              contentStyle: { backgroundColor: colors.background },
              // דפוס אנדרואיד/Google בעברית: headerLeft מוצג מימין — ☰ במסך הראשי,
              // חץ חזרה במסכים פנימיים; headerRight מוצג משמאל — ⋮ במסכים פנימיים.
              headerLeft: (props) => (
                <HeaderStart canGoBack={props.canGoBack} tintColor={String(props.tintColor ?? barFg)} />
              ),
              headerBackVisible: false,
              // הכותרת ולצדה סימני מצב: נתונים של משתמש אחר (👤) ומצב צפייה בלבד (👁)
              headerTitle: (props) => (
                <HeaderTitle title={String(props.children ?? '')} tintColor={String(props.tintColor ?? barFg)} />
              ),
              headerRight: (props) => (
                <HeaderEnd canGoBack={props.canGoBack} tintColor={String(props.tintColor ?? barFg)} />
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
            <Stack.Screen name="export" options={{ title: t('nav.export') }} />
            <Stack.Screen name="profile" options={{ title: t('nav.profile') }} />
            <Stack.Screen name="payroll" options={{ title: t('nav.payroll') }} />
            <Stack.Screen name="payroll-report" options={{ title: 'דוח שכר' }} />
            <Stack.Screen name="course-form" options={{ title: 'קורס' }} />
            <Stack.Screen name="trash" options={{ title: t('nav.trash') }} />
            <Stack.Screen name="archive" options={{ title: t('nav.archive') }} />
            <Stack.Screen name="settings" options={{ title: t('nav.settings') }} />
            <Stack.Screen name="holidays" options={{ title: t('nav.holidays') }} />
            <Stack.Screen name="data" options={{ title: t('nav.data') }} />
            <Stack.Screen name="sharing" options={{ title: t('nav.sharing') }} />
            <Stack.Screen name="mail-report" options={{ title: t('nav.mailReport') }} />
            <Stack.Screen name="preferences" options={{ title: t('nav.preferences') }} />
          </Stack>
        </View>
      </View>
    </DrawerProvider>
  );
}
