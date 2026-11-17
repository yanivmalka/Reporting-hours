/**
 * נעילת המידע הכספי (lib/appLock.ts):
 *  - `FinanceGate` — מסך כספי שלם (לוח בקרה, דוחות שכר, תשלומים, תיאום מס): כשנעול, במקום התוכן
 *    מוצגת בקשת זיהוי (וחלון הזיהוי נפתח מיד).
 *  - `FinanceSection` — קבוצה בתוך מסך (תנאי שכר בעריכת מקום עבודה): כשנעולה — שורה "מידע כספי נעול · פתיחה".
 *  - `AppLockSetting` — תיבת הסימון ב"הגדרות ותצוגה".
 */
import { useEffect, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from './Text';
import { Button } from './Button';
import { Icon } from './Icon';
import { Pressable } from './Pressable';
import { Checkbox } from './Checkbox';
import {
  appLockPlatform,
  lockAvailable,
  setAppLockEnabled,
  unlockFinance,
  useAppLockEnabled,
  useFinanceLocked,
} from '../lib/appLock';
import { useTheme } from '../theme/ThemeContext';
import { radius, spacing } from '../theme/colors';
import { TEXT_RIGHT } from '../theme/align';

export function FinanceGate({ children }: { children: ReactNode }) {
  const locked = useFinanceLocked();
  const { colors } = useTheme();
  const [failed, setFailed] = useState(false);
  async function open() {
    setFailed(!(await unlockFinance()));
  }
  useEffect(() => {
    if (locked) void open();
  }, [locked]);
  if (!locked) return <>{children}</>;
  return (
    <View style={[styles.gate, { backgroundColor: colors.background }]}>
      <Icon name="fingerprint" size={56} color={colors.brand} />
      <Text style={[styles.title, { color: colors.text }]}>מידע כספי נעול</Text>
      <Text style={[styles.body, { color: colors.textMuted }]}>
        {failed ? 'הזיהוי לא הושלם. אפשר לנסות שוב.' : 'פתיחה בטביעת אצבע או בקוד המכשיר.'}
      </Text>
      <View style={styles.button}>
        <Button label="פתיחה" onPress={() => void open()} />
      </View>
    </View>
  );
}

export function FinanceSection({ children }: { children: ReactNode }) {
  const locked = useFinanceLocked();
  const { colors } = useTheme();
  if (!locked) return <>{children}</>;
  return (
    <Pressable
      onPress={() => void unlockFinance()}
      accessibilityRole="button"
      accessibilityLabel="מידע כספי נעול — פתיחה"
      style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}
    >
      <Icon name="fingerprint" size={24} color={colors.brand} />
      <Text style={[styles.sectionText, { color: colors.textMuted }]}>מידע כספי נעול</Text>
      <Text style={[styles.sectionLink, { color: colors.brand }]}>פתיחה</Text>
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
  gate: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.xl },
  title: { fontSize: 22, fontWeight: '700' },
  body: { fontSize: 15, textAlign: 'center', lineHeight: 22 },
  button: { alignSelf: 'stretch', maxWidth: 320, width: '100%', marginTop: spacing.sm },
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
  hint: { fontSize: 13, lineHeight: 19, textAlign: TEXT_RIGHT },
});
