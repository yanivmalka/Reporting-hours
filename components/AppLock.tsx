/**
 * נעילת המידע הכספי (lib/appLock.ts):
 *  - `FinanceGate` — מסך כספי שלם (לוח בקרה, דוחות שכר, תשלומים, תיאום מס): כשנעול, במקום התוכן
 *    מוצגת בקשת זיהוי (וחלון הזיהוי נפתח מיד). אחרי פתיחה המנעול הסגור מתחלף בפתוח, ורק אחרי
 *    השהייה קצרה (כ־1.7 שנ׳ בסך הכול) מוצגים הנתונים.
 *  - `FinanceSection` — קבוצה בתוך מסך (תנאי שכר בעריכת מקום עבודה): כשנעולה — שורה "מידע כספי נעול · פתיחה".
 *  - `AppLockSetting` — תיבת הסימון בדף "הגדרות" (app/preferences.tsx).
 *  - `FinanceLockToggle` — מתג קטן בדף הבית: מנעול סגור (הצגה) / פתוח (נעילה).
 *  - `HeaderFinanceLock` — מנעול בשורת הכותרת של כל מסך שמוצג בו מידע כספי (lib/financeScreens.ts).
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { Text } from './Text';
import { Button } from './Button';
import { Icon } from './Icon';
import { Pressable } from './Pressable';
import { Checkbox } from './Checkbox';
import {
  appLockPlatform,
  lockAvailable,
  lockFinance,
  useFinanceUnlocked,
  setAppLockEnabled,
  unlockFinance,
  useAppLockEnabled,
  useFinanceLocked,
} from '../lib/appLock';
import { useScreenHasFinance } from '../lib/financeScreens';
import { useMarkFinanceScreen } from './useMarkFinanceScreen';
import { brandImages } from '../theme/brandAssets';
import { useTheme } from '../theme/ThemeContext';
import { radius, spacing } from '../theme/colors';
import { TEXT_RIGHT } from '../theme/align';

/**
 * אחרי פתיחה: המנעול הסגור נשאר רגע (חלון הזיהוי של המערכת נסגר), מתחלף בפתוח,
 * ורק אחרי השהייה קצרה מוצגים הנתונים.
 */
const UNLOCK_WAIT_MS = 350;
const UNLOCK_SWAP_MS = 450;
const UNLOCK_HOLD_MS = 900;

type GatePhase = 'locked' | 'revealing' | 'open';

export function FinanceGate({ children }: { children: ReactNode }) {
  const locked = useFinanceLocked();
  useMarkFinanceScreen(true);
  const { colors, paletteId } = useTheme();
  const [failed, setFailed] = useState(false);
  // השלב נגזר בזמן הרינדור — כך אין רינדור ביניים שבו הנתונים מוצגים לפני המעבר.
  const [phase, setPhase] = useState<GatePhase>(locked ? 'locked' : 'open');
  if (locked && phase !== 'locked') setPhase('locked');
  if (!locked && phase === 'locked') setPhase('revealing');
  const revealing = phase === 'revealing';
  const swap = useRef(new Animated.Value(0)).current;
  const images = brandImages(paletteId);
  async function open() {
    setFailed(!(await unlockFinance()));
  }
  useEffect(() => {
    if (locked) void open();
  }, [locked]);
  useEffect(() => {
    if (phase === 'locked') {
      swap.setValue(0);
      return;
    }
    if (phase !== 'revealing') return;
    swap.setValue(0);
    const anim = Animated.timing(swap, {
      toValue: 1,
      duration: UNLOCK_SWAP_MS,
      delay: UNLOCK_WAIT_MS,
      easing: Easing.inOut(Easing.quad),
      useNativeDriver: true,
    });
    anim.start();
    const timer = setTimeout(() => setPhase('open'), UNLOCK_WAIT_MS + UNLOCK_SWAP_MS + UNLOCK_HOLD_MS);
    return () => {
      anim.stop();
      clearTimeout(timer);
    };
  }, [phase, swap]);
  if (phase === 'open') return <>{children}</>;
  const pop = swap.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [1, 1.1, 1],
  });
  return (
    <View style={[styles.gate, { backgroundColor: colors.background }]}>
      <Animated.View style={[styles.gateIcon, { transform: [{ scale: pop }] }]}>
        <Animated.Image
          source={images.locked}
          style={[
            StyleSheet.absoluteFill,
            styles.gateImage,
            {
              opacity: swap.interpolate({
                inputRange: [0, 1],
                outputRange: [1, 0],
              }),
            },
          ]}
          accessibilityIgnoresInvertColors
          accessibilityLabel={revealing ? undefined : 'שעון החול של שיעור עם מנעול במקום המטבעות'}
        />
        <Animated.Image
          source={images.unlocked}
          style={[StyleSheet.absoluteFill, styles.gateImage, { opacity: swap }]}
          accessibilityIgnoresInvertColors
          accessibilityLabel={revealing ? 'שעון החול של שיעור עם המטבעות ומנעול פתוח' : undefined}
        />
      </Animated.View>
      <Text style={[styles.title, { color: colors.text }]}>{revealing ? 'המידע הכספי נפתח' : 'מידע כספי נעול'}</Text>
      <Text style={[styles.body, { color: colors.textMuted }]}>
        {revealing ? ' ' : failed ? 'הזיהוי לא הושלם. אפשר לנסות שוב.' : 'פתיחה בטביעת אצבע או בקוד המכשיר.'}
      </Text>
      <View style={[styles.button, revealing && styles.hidden]} pointerEvents={revealing ? 'none' : 'auto'}>
        <Button label="פתיחה" onPress={() => void open()} />
      </View>
    </View>
  );
}

export function FinanceSection({ children }: { children: ReactNode }) {
  const locked = useFinanceLocked();
  useMarkFinanceScreen(true);
  const unlocked = useFinanceUnlocked();
  const { colors } = useTheme();
  if (!locked) {
    if (!unlocked) return <>{children}</>;
    // ההגדרה מופעלת והמידע פתוח — מנעול פתוח קטן מעל הקבוצה, ולחיצה נועלת שוב.
    return (
      <View style={styles.openWrap}>
        <Pressable
          onPress={lockFinance}
          accessibilityRole="button"
          accessibilityLabel="מידע כספי פתוח — נעילה"
          hitSlop={8}
          style={styles.openRow}
        >
          <Icon name="lock-open-variant-outline" size={16} color={colors.textMuted} />
          <Text style={[styles.openText, { color: colors.textMuted }]}>מידע כספי פתוח · נעילה</Text>
        </Pressable>
        {children}
      </View>
    );
  }
  return (
    <Pressable
      onPress={() => void unlockFinance()}
      accessibilityRole="button"
      accessibilityLabel="מידע כספי נעול — פתיחה"
      style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}
    >
      <Icon name="lock-outline" size={24} color={colors.brand} />
      <Text style={[styles.sectionText, { color: colors.textMuted }]}>מידע כספי נעול</Text>
      <Text style={[styles.sectionLink, { color: colors.brand }]}>פתיחה</Text>
    </Pressable>
  );
}

/**
 * מתג קטן בדף הבית (לא בולט): מנעול סגור — לחיצה פותחת בזיהוי; מנעול פתוח — לחיצה נועלת.
 * מוצג רק כשההגדרה מופעלת.
 */
export function FinanceLockToggle() {
  const enabled = useAppLockEnabled();
  const locked = useFinanceLocked();
  const { colors } = useTheme();
  if (!appLockPlatform || !enabled) return null;
  return (
    <Pressable
      onPress={() => (locked ? void unlockFinance() : lockFinance())}
      accessibilityRole="button"
      accessibilityLabel={locked ? 'מידע כספי נעול — הצגה' : 'מידע כספי מוצג — נעילה'}
      hitSlop={10}
      style={styles.toggle}
    >
      <Icon name={locked ? 'lock-outline' : 'lock-open-variant-outline'} size={18} color={colors.textMuted} />
      <Text style={[styles.toggleText, { color: colors.textMuted }]}>{locked ? 'הצגת סכומים' : 'נעילה'}</Text>
    </Pressable>
  );
}

/**
 * מנעול בשורת הכותרת — בכל מסך שמוצג בו מידע כספי (סכום, מסך / קבוצה כספיים), כשההגדרה מופעלת:
 * סגור — לחיצה פותחת בזיהוי; פתוח — לחיצה נועלת.
 */
export function HeaderFinanceLock({ routeKey }: { routeKey?: string }) {
  const enabled = useAppLockEnabled();
  const locked = useFinanceLocked();
  const has = useScreenHasFinance(routeKey);
  const { colors } = useTheme();
  if (!appLockPlatform || !enabled || !has) return null;
  return (
    <Pressable
      onPress={() => (locked ? void unlockFinance() : lockFinance())}
      accessibilityRole="button"
      accessibilityLabel={locked ? 'מידע כספי נעול — הצגה' : 'מידע כספי מוצג — נעילה'}
      hitSlop={8}
      style={styles.headerLock}
    >
      <Icon name={locked ? 'lock-outline' : 'lock-open-variant-outline'} size={22} color={colors.brand} />
    </Pressable>
  );
}

/**
 * ההגדרה בתפריט: מוצגת רק באנדרואיד; כשאין במכשיר אמצעי זיהוי — הסבר במקום תיבת הסימון.
 */
export function AppLockSetting() {
  const enabled = useAppLockEnabled();
  const { colors } = useTheme();
  const [available, setAvailable] = useState<boolean | null>(null);
  useEffect(() => {
    void lockAvailable().then(setAvailable);
  }, []);
  if (!appLockPlatform || available === null) return null;
  if (!available) {
    return (
      <Text style={[styles.hint, { color: colors.textMuted }]}>
        נעילת המידע הכספי: יש להגדיר במכשיר טביעת אצבע או קוד נעילה.
      </Text>
    );
  }
  return (
    <Checkbox
      checked={enabled}
      onChange={(on) => void setAppLockEnabled(on)}
      label="נעילת מידע כספי בטביעת אצבע"
      hint="סכומים, לוח הבקרה, דוחות השכר ותנאי השכר — רק אחרי טביעת אצבע, זיהוי פנים או קוד המכשיר. דיווח ותכנון פתוחים תמיד."
    />
  );
}

const styles = StyleSheet.create({
  gateIcon: { width: 120, height: 120 },
  gateImage: { width: 120, height: 120, borderRadius: 28 },
  hidden: { opacity: 0 },
  gate: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.xl,
  },
  title: { fontSize: 22, fontWeight: '700' },
  body: { fontSize: 15, textAlign: 'center', lineHeight: 22 },
  button: {
    alignSelf: 'stretch',
    maxWidth: 320,
    width: '100%',
    marginTop: spacing.sm,
  },
  section: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  sectionText: { flex: 1, fontSize: 15, textAlign: TEXT_RIGHT },
  sectionLink: { fontSize: 15, fontWeight: '700' },
  openWrap: { gap: spacing.xs },
  openRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
  },
  openText: { fontSize: 12 },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 4, opacity: 0.8 },
  headerLock: { padding: 2 },
  toggleText: { fontSize: 12 },
  hint: { fontSize: 13, lineHeight: 19, textAlign: TEXT_RIGHT },
});
