/**
 * מסך הנעילה (lib/appLock.ts): מכסה את כל האפליקציה כשהיא נעולה. האפליקציה עצמה נשארת טעונה
 * מתחת (סנכרון, טופס באמצע עריכה), כך שפתיחה מחזירה בדיוק למקום שבו עזבו.
 * בהופעת המסך נפתח מיד חלון הזיהוי של המערכת; "פתיחה" — ניסיון חוזר.
 */
import { useEffect, useRef, useState } from 'react';
import { BackHandler, Image, Modal, StyleSheet, View } from 'react-native';
import { Text } from './Text';
import { Button } from './Button';
import { Icon } from './Icon';
import { appLockPlatform, lockAvailable, setAppLockEnabled, unlock, useAppLock } from '../lib/appLock';
import { Checkbox } from './Checkbox';
import { useTheme } from '../theme/ThemeContext';
import { spacing } from '../theme/colors';
import { TEXT_RIGHT } from '../theme/align';

export function AppLockScreen() {
  const { loaded, enabled, locked } = useAppLock();
  const { colors } = useTheme();
  const [failed, setFailed] = useState(false);
  const busy = useRef(false);
  const show = !loaded || (enabled && locked);

  async function tryUnlock() {
    if (busy.current) return;
    busy.current = true;
    const ok = await unlock();
    busy.current = false;
    setFailed(!ok);
  }

  useEffect(() => {
    if (loaded && enabled && locked) {
      setFailed(false);
      void tryUnlock();
    }
  }, [loaded, enabled, locked]);

  if (!show) return null;
  return (
    // בלי אנימציה: עד שההגדרה נטענת מוצג רקע בלבד (מתחת למסך הפתיחה של המערכת), כדי שהתוכן לא ייחשף לרגע.
    <Modal visible animationType="none" statusBarTranslucent onRequestClose={() => BackHandler.exitApp()}>
      <View style={[styles.screen, { backgroundColor: colors.background }]}>
        {loaded ? (
          <>
            <Image source={require('../assets/icon.png')} style={styles.icon} />
            <Text style={[styles.title, { color: colors.text }]}>דיווח שעות</Text>
            <Icon name="fingerprint" size={56} color={colors.brand} />
            <Text style={[styles.body, { color: colors.textMuted }]}>
              {failed ? 'הזיהוי לא הושלם. אפשר לנסות שוב.' : 'האפליקציה נעולה. פתיחה בטביעת אצבע או בקוד המכשיר.'}
            </Text>
            <View style={styles.button}>
              <Button label="פתיחה" onPress={() => void tryUnlock()} />
            </View>
          </>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.lg, padding: spacing.xl },
  icon: { width: 96, height: 96, borderRadius: 22 },
  title: { fontSize: 24, fontWeight: '700' },
  body: { fontSize: 15, textAlign: 'center', lineHeight: 22 },
  button: { alignSelf: 'stretch', maxWidth: 320, width: '100%' },
  hint: { fontSize: 13, lineHeight: 19, textAlign: TEXT_RIGHT },
});

/**
 * ההגדרה בתפריט ("הגדרות ותצוגה"): נעילה בטביעת אצבע / קוד המכשיר. הפעלה דורשת זיהוי מוצלח.
 * מוצגת רק באנדרואיד; כשאין במכשיר אמצעי זיהוי — הסבר במקום תיבת הסימון.
 */
export function AppLockSetting() {
  const { enabled } = useAppLock();
  const { colors } = useTheme();
  const [available, setAvailable] = useState<boolean | null>(null);
  useEffect(() => {
    void lockAvailable().then(setAvailable);
  }, []);
  if (!appLockPlatform || available === null) return null;
  if (!available) {
    return (
      <Text style={[styles.hint, { color: colors.textMuted }]}>
        נעילת האפליקציה: יש להגדיר במכשיר טביעת אצבע או קוד נעילה.
      </Text>
    );
  }
  return (
    <Checkbox
      checked={enabled}
      onChange={(on) => void setAppLockEnabled(on)}
      label="נעילה בטביעת אצבע"
      hint="בפתיחת האפליקציה, ובחזרה אליה אחרי יותר מדקה — טביעת אצבע, זיהוי פנים או קוד המכשיר."
    />
  );
}
