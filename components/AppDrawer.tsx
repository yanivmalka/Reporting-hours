/**
 * תפריט המבורגר צדדי (Drawer) לאפליקציה.
 *
 * נבנה מעל <Modal> ו־Animated בלבד כדי לעבוד זהה ב־web ובאנדרואיד ולכבד
 * כיווניות RTL/LTR. התפריט נשלף מהצד ה"טבעי" של השפה (ימין בעברית,
 * שמאל באנגלית). ההצמדה נעשית בזרימת flex ('row' מתחיל מצד ההתחלה של
 * השפה) ולא ב־left/right — אלה מוחלפים אוטומטית באנדרואיד ב־RTL ולכן
 * הפאנל נצמד לצד הלא נכון.
 *
 * בתוכו: ניווט ראשי (5), שכר ומס (3), ו"הגדרות ותצוגה" מתקפל — מסכי
 * ההגדרות, מצב יום/לילה, ערכת צבעים, שפה, חשבון ועדכונים. מצב הפתיחה משותף דרך DrawerProvider כך שכפתור ההמבורגר
 * בכותרת (DrawerToggle) יכול לפתוח אותו.
 *
 * במסך רחב (דפדפן במחשב, טאבלט לרוחב) התפריט מוצג קבוע בצד (SideNav),
 * בלי ☰ ובלי ⋮ — כמו Google Calendar ו־Gmail בדפדפן.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { usePathname, useRouter, type Href } from 'expo-router';
import { Animated, Modal, Platform, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Pressable } from './Pressable';
import { Icon } from './Icon';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useI18n } from '../lib/i18n';
import type { Lang } from '../lib/strings';
import { useTheme } from '../theme/ThemeContext';
import type { ThemeMode } from '../theme/palettes';
import { radius, spacing } from '../theme/colors';
import { useStyles, type ColorScheme, type StyleLayout } from '../theme/useStyles';
import { SegmentedControl } from './SegmentedControl';
import { UpdateSection } from './UpdateChecker';
import { AccountSection } from './CloudSync';
import { useHydrated } from '../lib/useHydrated';

type DrawerContextValue = {
  open: () => void;
  close: () => void;
  visible: boolean;
};

const DrawerContext = createContext<DrawerContextValue | null>(null);

export function DrawerProvider({ children }: { children: ReactNode }) {
  const [visible, setVisible] = useState(false);
  const value = useMemo<DrawerContextValue>(
    () => ({
      open: () => setVisible(true),
      close: () => setVisible(false),
      visible,
    }),
    [visible],
  );
  return (
    <DrawerContext.Provider value={value}>
      {children}
      <AppDrawer />
    </DrawerContext.Provider>
  );
}

export function useDrawer(): DrawerContextValue {
  const ctx = useContext(DrawerContext);
  if (!ctx) throw new Error('useDrawer חייב לרוץ בתוך <DrawerProvider>');
  return ctx;
}

/** רוחב החלון שממנו התפריט מוצג קבוע בצד. */
export const WIDE_MIN_WIDTH = 1000;

/** מסך רחב: התפריט קבוע בצד והתוכן ממורכז ברוחב מוגבל. */
export function useWideLayout(): boolean {
  const { width } = useWindowDimensions();
  // ברינדור מראש אין רוחב חלון — עד סיום ה־hydration תמיד הפריסה הצרה.
  const hydrated = useHydrated();
  return hydrated && width >= WIDE_MIN_WIDTH;
}

/** כפתור ההמבורגר לכותרת הניווט. */
export function DrawerToggle({ tintColor }: { tintColor?: string }) {
  const { open } = useDrawer();
  const { colors } = useTheme();
  const { t } = useI18n();
  return (
    <Pressable
      onPress={open}
      accessibilityRole="button"
      accessibilityLabel={t('drawer.openMenu')}
      hitSlop={10}
      style={styles.iconBtn}
    >
      <Icon name="menu" size={26} color={tintColor ?? colors.textOnBrand} />
    </Pressable>
  );
}

/**
 * תחילת הכותרת (בעברית — צד ימין), לפי הדפוס הסטנדרטי של אנדרואיד/Google:
 * במסך הראשי — כפתור התפריט ☰; במסכים פנימיים (צלילה) — חץ חזרה בלבד.
 */
export function HeaderStart({ canGoBack, tintColor }: { canGoBack?: boolean; tintColor?: string }) {
  const router = useRouter();
  const { isRTL } = useI18n();
  const wide = useWideLayout();
  if (!canGoBack) return wide ? null : <DrawerToggle tintColor={tintColor} />;
  return (
    <Pressable
      onPress={() => router.back()}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel="חזרה"
      style={styles.iconBtn}
    >
      <Icon name={isRTL ? 'arrow-right' : 'arrow-left'} size={24} color={tintColor ?? '#fff'} />
    </Pressable>
  );
}

type NavLink = { href: Href; key: string; icon: string };

/** ניווט ראשי — הפעולות היומיומיות. */
const MAIN_LINKS: NavLink[] = [
  { href: '/', key: 'nav.homeLink', icon: 'home-outline' },
  { href: '/report', key: 'nav.report', icon: 'clipboard-edit-outline' },
  { href: '/reports', key: 'nav.reports', icon: 'format-list-bulleted' },
  { href: '/dashboard', key: 'nav.dashboard', icon: 'view-dashboard-outline' },
  { href: '/workplaces', key: 'nav.workplaces', icon: 'briefcase-outline' },
];

/** שכר ומס. */
const PAY_LINKS: NavLink[] = [
  { href: '/payroll', key: 'nav.payroll', icon: 'file-document-outline' },
  { href: '/payments', key: 'nav.payments', icon: 'cash-check' },
  { href: '/tax', key: 'nav.tax', icon: 'receipt-text-outline' },
];

/** מסכי הגדרה — בתוך "הגדרות ותצוגה" המתקפל. (האשפה — ממסך מקומות העבודה.) */
const SETTINGS_LINKS: NavLink[] = [
  { href: '/settings', key: 'nav.settings', icon: 'timer-cog-outline' },
  { href: '/profile', key: 'nav.profile', icon: 'account-circle-outline' },
  { href: '/data', key: 'nav.data', icon: 'database-cog-outline' },
];

/** האם הקישור הוא המסך הנוכחי. */
const isCurrent = (href: Href, pathname: string) => String(href) === pathname;

/**
 * סוף הכותרת (בעברית — צד שמאל): במסכים פנימיים — תפריט ⋮ שמשכפל את
 * הניווט של תפריט ☰ (כמו ביומן Google). במסך הראשי — ריק.
 */
export function HeaderEnd({ canGoBack, tintColor }: { canGoBack?: boolean; tintColor?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const { t } = useI18n();
  const { colors } = useTheme();
  const { open: openDrawer } = useDrawer();
  const menuStyles = useStyles(makeOverflowStyles);
  const [open, setOpen] = useState(false);
  const wide = useWideLayout();
  // במסך רחב התפריט כבר גלוי בצד — אין צורך בשכפול שלו.
  if (!canGoBack || wide) return null;

  function go(href: Href) {
    setOpen(false);
    if (href === '/') router.dismissTo('/');
    else router.push(href);
  }

  const item = (link: NavLink) => {
    const current = isCurrent(link.href, pathname);
    return (
      <Pressable
        key={String(link.href)}
        onPress={() => go(link.href)}
        style={({ pressed }) => [menuStyles.item, (pressed || current) && menuStyles.itemPressed]}
      >
        <Icon name={link.icon} size={20} color={current ? colors.brand : colors.textMuted} />
        <Text style={menuStyles.itemText}>{t(link.key)}</Text>
      </Pressable>
    );
  };

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel="תפריט נוסף"
        style={styles.iconBtn}
      >
        <Icon name="dots-vertical" size={24} color={tintColor ?? '#fff'} />
      </Pressable>
      <Modal transparent visible={open} animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={menuStyles.backdrop} onPress={() => setOpen(false)}>
          {/* שורה ברוחב מלא שמצמידה את התפריט לסוף (שמאל בעברית) — בלי left/right */}
          <View style={menuStyles.anchorRow} pointerEvents="box-none">
            <View style={menuStyles.menu}>
              <ScrollView style={{ flexGrow: 0 }}>
                {MAIN_LINKS.map(item)}
                <View style={menuStyles.divider} />
                {PAY_LINKS.map(item)}
                <View style={menuStyles.divider} />
                <Pressable
                  onPress={() => {
                    setOpen(false);
                    openDrawer();
                  }}
                  style={({ pressed }) => [menuStyles.item, pressed && menuStyles.itemPressed]}
                >
                  <Icon name="cog-outline" size={20} color={colors.textMuted} />
                  <Text style={menuStyles.itemText}>הגדרות ותצוגה…</Text>
                </Pressable>
              </ScrollView>
            </View>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const makeOverflowStyles = (c: ColorScheme, layout: StyleLayout) =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.15)',
    },
    anchorRow: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      paddingTop: Platform.OS === 'web' ? 52 : 44,
      paddingHorizontal: 8,
    },
    menu: {
      minWidth: 230,
      maxHeight: '85%',
      backgroundColor: c.surface,
      borderRadius: radius.md,
      paddingVertical: spacing.xs,
      elevation: 8,
      shadowColor: '#000',
      shadowOpacity: 0.2,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 4 },
    },
    item: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingHorizontal: spacing.md,
      minHeight: 44,
    },
    itemPressed: {
      backgroundColor: c.brandLight,
    },
    itemText: {
      flex: 1,
      fontSize: 15,
      color: c.text,
      textAlign: layout.textStart,
    },
    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: c.border,
      marginVertical: spacing.xs,
    },
  });

const ANIM_MS = 220;

function AppDrawer() {
  const { visible, close } = useDrawer();
  const { t, isRTL } = useI18n();
  const { colors } = useTheme();
  const drawerStyles = useStyles(makeStyles);
  const wide = useWideLayout();

  const { width } = useWindowDimensions();
  const panelWidth = Math.min(320, Math.round(width * 0.84));
  // הפאנל נצמד לצד ההתחלה (ימין בעברית); מוסתר בהזזה החוצה לאותו צד.
  // transform אינו מתהפך ב־RTL, ולכן הכיוון נקבע כאן במפורש.
  const hiddenOffset = isRTL ? panelWidth : -panelWidth;

  const [mounted, setMounted] = useState(visible);
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.timing(progress, {
        toValue: 1,
        duration: ANIM_MS,
        useNativeDriver: Platform.OS !== 'web',
      }).start();
    } else if (mounted) {
      Animated.timing(progress, {
        toValue: 0,
        duration: ANIM_MS,
        useNativeDriver: Platform.OS !== 'web',
      }).start(({ finished }) => {
        if (finished) setMounted(false);
      });
    }
  }, [visible, mounted, progress]);

  // הרחבת החלון כשהמגירה פתוחה — התפריט הקבוע מחליף אותה.
  useEffect(() => {
    if (wide && visible) close();
  }, [wide, visible, close]);

  if (!mounted || wide) return null;

  const translateX = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [hiddenOffset, 0],
  });

  return (
    <Modal visible transparent animationType="none" onRequestClose={close} statusBarTranslucent>
      {/* שורה: הילד הראשון מוצב בצד ההתחלה של השפה — ימין בעברית */}
      <View style={styles.row}>
        <Animated.View style={[styles.backdrop, { opacity: progress }]}>
          <Pressable style={styles.fill} accessibilityLabel={t('drawer.closeMenu')} onPress={close} />
        </Animated.View>

        <Animated.View style={[drawerStyles.panel, { width: panelWidth, transform: [{ translateX }] }]}>
          <SafeAreaView style={styles.fill} edges={['top', 'bottom']}>
            <View style={drawerStyles.header}>
              <Icon name="clock-check-outline" size={26} color={colors.textOnBrand} />
              <Text style={drawerStyles.title}>{t('nav.home')}</Text>
              <Pressable
                onPress={close}
                accessibilityRole="button"
                accessibilityLabel={t('drawer.closeMenu')}
                hitSlop={10}
                style={styles.iconBtn}
              >
                <Icon name="close" size={22} color={colors.textOnBrand} />
              </Pressable>
            </View>
            <DrawerBody onNavigate={close} />
          </SafeAreaView>
        </Animated.View>
      </View>
    </Modal>
  );
}

/** רוחב התפריט הקבוע במסך רחב. */
const SIDE_NAV_WIDTH = 280;

/**
 * התפריט הקבוע בצד במסך רחב (בעברית — מימין). מוצב כילד ראשון בשורה
 * לצד הניווט, ולכן נצמד לצד ההתחלה של השפה.
 */
export function SideNav() {
  const { t } = useI18n();
  const { colors } = useTheme();
  const drawerStyles = useStyles(makeStyles);
  return (
    <View style={[drawerStyles.sideNav, { width: SIDE_NAV_WIDTH }]}>
      <SafeAreaView style={styles.fill} edges={['top', 'bottom']}>
        <View style={[drawerStyles.header, drawerStyles.sideHeader]}>
          <Icon name="clock-check-outline" size={26} color={colors.textOnBrand} />
          <Text style={drawerStyles.title}>{t('nav.home')}</Text>
        </View>
        <DrawerBody />
      </SafeAreaView>
    </View>
  );
}

/** תוכן התפריט — משותף למגירה ולתפריט הקבוע. */
function DrawerBody({ onNavigate }: { onNavigate?: () => void }) {
  const { t, lang, setLang, langLabels } = useI18n();
  const { mode, setMode, paletteId, setPaletteId, palettes, colors } = useTheme();
  const drawerStyles = useStyles(makeStyles);
  const router = useRouter();
  const pathname = usePathname();
  const [settingsOpen, setSettingsOpen] = useState(false);

  function go(href: Href) {
    onNavigate?.();
    if (isCurrent(href, pathname)) return;
    if (href === '/') router.dismissTo('/');
    else router.push(href);
  }

  const modeOptions: { value: ThemeMode; label: string }[] = [
    { value: 'light', label: t('drawer.mode.light') },
    { value: 'dark', label: t('drawer.mode.dark') },
    { value: 'system', label: t('drawer.mode.system') },
  ];
  const langOptions: { value: Lang; label: string }[] = [
    { value: 'he', label: langLabels.he },
    { value: 'en', label: langLabels.en },
  ];

  const navItem = (link: NavLink) => {
    const current = isCurrent(link.href, pathname);
    return (
      <Pressable
        key={String(link.href)}
        onPress={() => go(link.href)}
        accessibilityRole="link"
        accessibilityState={{ selected: current }}
        style={({ pressed }) => [
          drawerStyles.navItem,
          current && drawerStyles.navItemCurrent,
          pressed && drawerStyles.navItemPressed,
        ]}
      >
        <Icon name={link.icon} size={22} color={current ? colors.brand : colors.textMuted} />
        <Text style={[drawerStyles.navItemText, current && drawerStyles.navItemTextCurrent]}>
          {t(link.key)}
        </Text>
      </Pressable>
    );
  };

  return (
    <ScrollView contentContainerStyle={drawerStyles.body}>
      {MAIN_LINKS.map(navItem)}
      <View style={drawerStyles.divider} />
      {PAY_LINKS.map(navItem)}
      <View style={drawerStyles.divider} />

      <Pressable
        onPress={() => setSettingsOpen((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded: settingsOpen }}
        style={({ pressed }) => [drawerStyles.navItem, pressed && drawerStyles.navItemPressed]}
      >
        <Icon name="cog-outline" size={22} color={colors.textMuted} />
        <Text style={drawerStyles.navItemText}>הגדרות ותצוגה</Text>
        <Icon name={settingsOpen ? 'chevron-up' : 'chevron-down'} size={22} color={colors.textMuted} />
      </Pressable>

      {settingsOpen ? (
        <View style={drawerStyles.settings}>
          {SETTINGS_LINKS.map(navItem)}

          <View style={drawerStyles.section}>
            <SectionLabel icon="theme-light-dark" text={t('drawer.appearance')} />
            <SegmentedControl options={modeOptions} value={mode} onChange={setMode} />
          </View>

          <View style={drawerStyles.section}>
            <SectionLabel icon="palette-outline" text={t('drawer.palette')} />
            <View style={drawerStyles.swatchRow}>
              {palettes.map((palette) => {
                const selected = palette.id === paletteId;
                const label = lang === 'he' ? palette.labelHe : palette.labelEn;
                return (
                  <Pressable
                    key={palette.id}
                    onPress={() => setPaletteId(palette.id)}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    accessibilityLabel={label}
                    style={[drawerStyles.swatch, selected && drawerStyles.swatchSelected]}
                  >
                    <View style={drawerStyles.swatchDisc}>
                      <View style={[drawerStyles.swatchHalf, { backgroundColor: palette.light.brand }]} />
                      <View style={[drawerStyles.swatchHalf, { backgroundColor: palette.dark.brand }]} />
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={drawerStyles.section}>
            <SectionLabel icon="translate" text={t('drawer.language')} />
            <SegmentedControl options={langOptions} value={lang} onChange={setLang} />
          </View>

          <AccountSection />
          <UpdateSection />
        </View>
      ) : null}
    </ScrollView>
  );
}

function SectionLabel({ icon, text }: { icon: string; text: string }) {
  const drawerStyles = useStyles(makeStyles);
  const { colors } = useTheme();
  return (
    <View style={drawerStyles.sectionHead}>
      <Icon name={icon} size={16} color={colors.textMuted} />
      <Text style={drawerStyles.sectionLabel}>{text}</Text>
    </View>
  );
}

const makeStyles = (c: ColorScheme, layout: StyleLayout) =>
  StyleSheet.create({
    panel: {
      height: '100%',
      backgroundColor: c.background,
      elevation: 16,
      shadowColor: '#000',
      shadowOpacity: 0.25,
      shadowRadius: 16,
    },
    sideNav: {
      height: '100%',
      backgroundColor: c.background,
      borderEndWidth: StyleSheet.hairlineWidth,
      borderEndColor: c.border,
    },
    sideHeader: {
      minHeight: 64,
      paddingVertical: 0,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingStart: spacing.md,
      paddingEnd: spacing.xs,
      paddingVertical: spacing.sm,
      backgroundColor: c.brand,
    },
    title: {
      flex: 1,
      fontSize: 18,
      fontWeight: '800',
      color: c.textOnBrand,
      textAlign: layout.textStart,
    },
    body: {
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.sm,
      gap: 2,
    },
    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: c.border,
      marginVertical: spacing.sm,
      marginHorizontal: spacing.sm,
    },
    navItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      minHeight: 48,
      paddingHorizontal: spacing.md,
      borderRadius: 24,
    },
    navItemCurrent: {
      backgroundColor: c.brandLight,
    },
    navItemPressed: {
      backgroundColor: c.brandLight,
    },
    navItemText: {
      flex: 1,
      fontSize: 15,
      fontWeight: '600',
      color: c.text,
      textAlign: layout.textStart,
    },
    navItemTextCurrent: {
      color: c.brand,
      fontWeight: '800',
    },
    settings: {
      gap: spacing.md,
      paddingTop: spacing.xs,
      paddingHorizontal: spacing.sm,
    },
    section: {
      gap: spacing.sm,
    },
    sectionHead: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
    },
    sectionLabel: {
      fontSize: 13,
      fontWeight: '700',
      color: c.textMuted,
      textAlign: layout.textStart,
    },
    swatchRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
    },
    swatch: {
      padding: 3,
      borderRadius: 24,
      borderWidth: 2,
      borderColor: 'transparent',
    },
    swatchSelected: {
      borderColor: c.brand,
    },
    swatchDisc: {
      width: 36,
      height: 36,
      borderRadius: 18,
      overflow: 'hidden',
      flexDirection: 'row',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border,
    },
    swatchHalf: {
      flex: 1,
    },
  });

const styles = StyleSheet.create({
  iconBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fill: { flex: 1 },
  row: {
    flex: 1,
    flexDirection: 'row',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
});
