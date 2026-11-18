/**
 * הגדרת ההתראות לטלפון (lib/push.ts) — בדף "הגדרות". אנדרואיד בלבד.
 * הפעלה מבקשת הרשאה; בלי הרשאה — הסבר איך לאפשר בהגדרות הטלפון.
 */
import { useEffect, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { Text } from './Text';
import { Checkbox } from './Checkbox';
import { Pressable } from './Pressable';
import { pushPermitted, pushPlatform, setPushEnabled, setPushKind, usePushPrefs } from '../lib/push';
import type { PushKind } from '../lib/pushPlan';
import { useTheme } from '../theme/ThemeContext';
import { spacing } from '../theme/colors';
import { TEXT_RIGHT } from '../theme/align';

const KINDS: { kind: PushKind; label: string; hint: string }[] = [
  { kind: 'missing', label: 'דיווח חסר', hint: 'בערב, על מפגש של היום שלא דווח' },
  { kind: 'reminder', label: 'תזכורות מפגש', hint: 'הגשה, מבחן ותזכורות מ"פרטי המפגש"' },
  { kind: 'taxi', label: 'הזמנת מונית', hint: 'לפי ההגדרה של כל מקום עבודה' },
  { kind: 'payroll', label: 'יום אחרון לדיווח שכר', hint: 'סיכום התקופה בערב שלפני ובבוקר עצמו, בלי סכומים' },
];

export function PushSetting() {
  const { enabled, off, loaded } = usePushPrefs();
  const { colors } = useTheme();
  const [denied, setDenied] = useState(false);
  // ההרשאה בוטלה בהגדרות הטלפון אחרי ההפעלה — ההתראות לא יוצגו.
  useEffect(() => {
    if (enabled) void pushPermitted().then((ok) => setDenied(!ok));
  }, [enabled]);
  if (!pushPlatform || !loaded) return null;

  async function toggle(on: boolean) {
    const ok = await setPushEnabled(on);
    setDenied(on && !ok);
  }

  return (
    <View style={styles.wrap}>
      <Checkbox
        checked={enabled}
        onChange={(on) => void toggle(on)}
        label="התראות לטלפון"
        hint="גם כשהאפליקציה סגורה. לפי הנתונים שלך בלבד, לא בחשבון ששותף איתך."
      />
      {denied ? (
        <Pressable onPress={() => void Linking.openSettings()} accessibilityRole="link" hitSlop={6}>
          <Text style={[styles.note, { color: colors.danger }]}>
            אין הרשאה להתראות בטלפון. לאישור בהגדרות הטלפון — לחיצה כאן.
          </Text>
        </Pressable>
      ) : null}
      {enabled ? (
        <View style={styles.kinds}>
          {KINDS.map((k) => (
            <Checkbox
              key={k.kind}
              checked={!off.includes(k.kind)}
              onChange={(on) => void setPushKind(k.kind, on)}
              label={k.label}
              hint={k.hint}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs },
  kinds: { paddingStart: spacing.lg, gap: spacing.xs },
  note: { fontSize: 13, lineHeight: 19, textAlign: TEXT_RIGHT },
});
