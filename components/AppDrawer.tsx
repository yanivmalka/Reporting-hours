/**
 * תפריט המבורגר צדדי (Drawer) לאפליקציה.
 *
 * נבנה מעל <Modal> ו־Animated בלבד — בלי תלות חדשה — כדי לעבוד זהה
 * ב־web ובאנדרואיד ולכבד כיווניות RTL/LTR. התפריט נשלף מהצד ה"טבעי"
 * של השפה (ימין בעברית, שמאל באנגלית).
 *
 * בתוכו: ניווט בין המסכים, בחירת מצב יום/לילה/מערכת, בחירת ערכת צבעים,
 * ובחירת שפה. מצב הפתיחה משותף דרך DrawerProvider כך שכפתור ההמבורגר
 * בכותרת (DrawerToggle) יכול לפתוח אותו.
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
import { useRouter, type Href } from 'expo-router';
import {
  Animated,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useI18n } from '../lib/i18n';
import type { Lang } from '../lib/strings';
import { useTheme } from '../theme/ThemeContext';
import type { ThemeMode } from '../theme/palettes';
import { radius, spacing } from '../theme/colors';
import { useStyles, type ColorScheme, type StyleLayout } from '../theme/useStyles';
import { SegmentedControl } from './SegmentedControl';

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

/** כפתור ההמבורגר לכותרת הניווט. */
export function DrawerToggle() {
  const { open } = useDrawer();
  const { colors } = useTheme();
  const { t } = useI18n();
  return (
    <Pressable
      onPress={open}
      accessibilityRole="button"
      accessibilityLabel={t('drawer.openMenu')}
      hitSlop={10}
      style={styles.toggle}
    >
      <View style={[styles.toggleBar, { backgroundColor: colors.textOnBrand }]} />
      <View style={[styles.toggleBar, { backgroundColor: colors.textOnBrand }]} />
      <View style={[styles.toggleBar, { backgroundColor: colors.textOnBrand }]} />
    </Pressable>
  );
}

const ANIM_MS = 220;

/** קישורי הניווט בתפריט; התוויות מתורגמות דרך t('nav.*'). */
const NAV_LINKS: { href: Href; key: string }[] = [
  { href: '/', key: 'nav.home' },
  { href: '/report', key: 'nav.report' },
  { href: '/reports', key: 'nav.reports' },
  { href: '/workplaces', key: 'nav.workplaces' },
  { href: '/settings', key: 'nav.settings' },
  { href: '/trash', key: 'nav.trash' },
];

function AppDrawer() {
  const { visible, close } = useDrawer();
  const { t, lang, setLang, langLabels, isRTL } = useI18n();
  const { mode, setMode, paletteId, setPaletteId, palettes } = useTheme();
  const drawerStyles = useStyles(makeStyles);
  const router = useRouter();

  function go(href: Href) {
    close();
    router.push(href);
  }

  const { width } = useWindowDimensions();
  const panelWidth = Math.min(320, Math.round(width * 0.84));
  // מהצד ה"טבעי": בעברית מימין, באנגלית משמאל.
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

  if (!mounted) return null;

  const translateX = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [hiddenOffset, 0],
  });

  const modeOptions: { value: ThemeMode; label: string }[] = [
    { value: 'light', label: t('drawer.mode.light') },
    { value: 'dark', label: t('drawer.mode.dark') },
    { value: 'system', label: t('drawer.mode.system') },
  ];
  const langOptions: { value: Lang; label: string }[] = [
    { value: 'he', label: langLabels.he },
    { value: 'en', label: langLabels.en },
  ];

  return (
    <Modal
      visible
      transparent
      animationType="none"
      onRequestClose={close}
      statusBarTranslucent
    >
      <View style={styles.fill}>
        <Animated.View
          style={[styles.backdrop, { opacity: progress }]}
          // מאחורי הפאנל — מקבל את הלחיצות לסגירה
        >
          <Pressable
            style={styles.fill}
            accessibilityLabel={t('drawer.closeMenu')}
            onPress={close}
          />
        </Animated.View>

        <Animated.View
          style={[
            drawerStyles.panel,
            {
              width: panelWidth,
              transform: [{ translateX }],
            },
            isRTL ? drawerStyles.panelEnd : drawerStyles.panelStart,
          ]}
        >
          <SafeAreaView style={styles.fill} edges={['top', 'bottom']}>
            <View style={drawerStyles.header}>
              <Text style={drawerStyles.title}>{t('drawer.title')}</Text>
              <Pressable
                onPress={close}
                accessibilityRole="button"
                accessibilityLabel={t('drawer.closeMenu')}
                hitSlop={10}
                style={drawerStyles.closeBtn}
              >
                <Text style={drawerStyles.closeIcon}>✕</Text>
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={drawerStyles.body}>
              <View style={drawerStyles.section}>
                <Text style={drawerStyles.sectionLabel}>
                  {t('drawer.navigation')}
                </Text>
                {NAV_LINKS.map((link) => (
                  <Pressable
                    key={String(link.href)}
                    onPress={() => go(link.href)}
                    accessibilityRole="link"
                    style={({ pressed }) => [
                      drawerStyles.navItem,
                      pressed && drawerStyles.navItemPressed,
                    ]}
                  >
                    <Text style={drawerStyles.navItemText}>{t(link.key)}</Text>
                  </Pressable>
                ))}
              </View>

              <View style={drawerStyles.section}>
                <Text style={drawerStyles.sectionLabel}>
                  {t('drawer.appearance')}
                </Text>
                <SegmentedControl
                  options={modeOptions}
                  value={mode}
                  onChange={setMode}
                />
              </View>

              <View style={drawerStyles.section}>
                <Text style={drawerStyles.sectionLabel}>
                  {t('drawer.palette')}
                </Text>
                <View style={drawerStyles.swatchRow}>
                  {palettes.map((palette) => {
                    const selected = palette.id === paletteId;
                    return (
                      <Pressable
                        key={palette.id}
                        onPress={() => setPaletteId(palette.id)}
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        accessibilityLabel={
                          lang === 'he' ? palette.labelHe : palette.labelEn
                        }
                        style={[
                          drawerStyles.swatch,
                          selected && drawerStyles.swatchSelected,
                        ]}
                      >
                        <View style={drawerStyles.swatchDisc}>
                          <View
                            style={[
                              drawerStyles.swatchHalf,
                              { backgroundColor: palette.light.brand },
                            ]}
                          />
                          <View
                            style={[
                              drawerStyles.swatchHalf,
                              { backgroundColor: palette.dark.brand },
                            ]}
                          />
                        </View>
                        <Text
                          style={[
                            drawerStyles.swatchLabel,
                            selected && drawerStyles.swatchLabelSelected,
                          ]}
                          numberOfLines={1}
                        >
                          {lang === 'he' ? palette.labelHe : palette.labelEn}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              <View style={drawerStyles.section}>
                <Text style={drawerStyles.sectionLabel}>
                  {t('drawer.language')}
                </Text>
                <SegmentedControl
                  options={langOptions}
                  value={lang}
                  onChange={setLang}
                />
              </View>
            </ScrollView>
          </SafeAreaView>
        </Animated.View>
      </View>
    </Modal>
  );
}

const makeStyles = (c: ColorScheme, layout: StyleLayout) =>
  StyleSheet.create({
    panel: {
      position: 'absolute',
      top: 0,
      bottom: 0,
      backgroundColor: c.background,
      borderColor: c.border,
    },
    panelStart: {
      left: 0,
      borderRightWidth: StyleSheet.hairlineWidth,
    },
    panelEnd: {
      right: 0,
      borderLeftWidth: StyleSheet.hairlineWidth,
    },
    header: {
      flexDirection: layout.rowStart,
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
      backgroundColor: c.brand,
    },
    title: {
      fontSize: 18,
      fontWeight: '800',
      color: c.textOnBrand,
    },
    closeBtn: {
      width: 36,
      height: 36,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radius.sm,
    },
    closeIcon: {
      fontSize: 18,
      fontWeight: '700',
      color: c.textOnBrand,
    },
    body: {
      padding: spacing.lg,
      gap: spacing.xl,
    },
    section: {
      gap: spacing.sm,
    },
    sectionLabel: {
      fontSize: 13,
      fontWeight: '700',
      color: c.textMuted,
      textAlign: layout.textStart,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    navItem: {
      minHeight: 44,
      justifyContent: 'center',
      paddingHorizontal: spacing.md,
      borderRadius: radius.md,
      backgroundColor: c.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border,
    },
    navItemPressed: {
      backgroundColor: c.brandLight,
    },
    navItemText: {
      fontSize: 15,
      fontWeight: '600',
      color: c.text,
      textAlign: layout.textStart,
    },
    swatchRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
    },
    swatch: {
      alignItems: 'center',
      gap: spacing.xs,
      padding: spacing.xs,
      borderRadius: radius.md,
      borderWidth: 2,
      borderColor: 'transparent',
      width: 76,
    },
    swatchSelected: {
      borderColor: c.brand,
      backgroundColor: c.brandLight,
    },
    swatchDisc: {
      width: 40,
      height: 40,
      borderRadius: 20,
      overflow: 'hidden',
      flexDirection: 'row',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border,
    },
    swatchHalf: {
      flex: 1,
    },
    swatchLabel: {
      fontSize: 12,
      color: c.textMuted,
      textAlign: 'center',
    },
    swatchLabelSelected: {
      color: c.text,
      fontWeight: '700',
    },
  });

const styles = StyleSheet.create({
  fill: { flex: 1 },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  toggle: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginHorizontal: spacing.xs,
  },
  toggleBar: {
    width: 20,
    height: 2,
    borderRadius: 1,
  },
});
