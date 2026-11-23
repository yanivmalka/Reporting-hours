/**
 * תפריט החשבון — נפתח בלחיצה על תמונת המשתמש בשורת התפריט (`HeaderBadges`):
 * מי מחובר (ובחשבון ששותף — של מי הנתונים), החלפת חשבון, פרטים אישיים, שיתוף והרשאות,
 * מצב צפייה בלבד, ערכת צבעים, והתנתקות (אחרי הסבר ואישור — `signOutMessage`).
 */
import { StyleSheet, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { Text } from './Text';
import { Pressable } from './Pressable';
import { Icon } from './Icon';
import { EnterChevron } from './Chevrons';
import { Dialog } from './Dialog';
import { Button } from './Button';
import { Checkbox } from './Checkbox';
import { Avatar } from './Avatar';
import { AccountSwitcher, useCloudSync } from './CloudSync';
import { ROLE_LABELS } from '../lib/sharing';
import { setViewOnly, useViewOnly } from '../lib/viewOnly';
import { useI18n } from '../lib/i18n';
import { useTheme } from '../theme/ThemeContext';
import { useThemedStyles } from '../theme/useThemedStyles';
import { radius, spacing, type AppColors } from '../theme/colors';
import { TEXT_RIGHT } from '../theme/align';

/** ההסבר לפני התנתקות — מה קורה לנתונים ולמה שתלוי בחיבור. */
export function signOutMessage(email: string, shared: string | null): string {
  return [
    `ההתנתקות מ־${email}:`,
    shared ? `• קודם חוזרים מהנתונים של ${shared} לנתונים שלך.` : null,
    '• שינויים שעוד לא נשלחו לענן נשלחים עכשיו (כשיש חיבור לרשת).',
    '• הנתונים נשארים בטלפון, אבל לא יסונכרנו יותר עם מכשירים אחרים ועם מי ששיתפת איתו.',
    '• הגיבוי היומי בשרת, הדיווח במייל וחשבונות ששותפו איתך — מפסיקים עד ההתחברות הבאה.',
    '• אפשר להתחבר שוב בכל עת מהתפריט ☰, והנתונים יסונכרנו מחדש.',
  ]
    .filter(Boolean)
    .join('\n');
}

export function AccountMenu({ onClose, onSignOut }: { onClose: () => void; onSignOut: () => void }) {
  const styles = useThemedStyles(makeStyles);
  const router = useRouter();
  const { user, access } = useCloudSync();
  const viewOnly = useViewOnly();
  const { lang } = useI18n();
  const { palettes, paletteId, setPaletteId } = useTheme();
  if (!user) return null;
  const owner = access ? access.ownerName || access.ownerEmail : null;

  const link = (href: Href, icon: string, label: string) => (
    <Pressable
      key={String(href)}
      onPress={() => {
        onClose();
        router.push(href);
      }}
      accessibilityRole="link"
      style={({ pressed }) => [styles.link, pressed && styles.pressed]}
    >
      <Icon name={icon} size={22} color={styles.icon.color} />
      <Text style={styles.linkText}>{label}</Text>
      <EnterChevron />
    </Pressable>
  );

  return (
    <Dialog
      title="החשבון שלך"
      onClose={onClose}
      actions={[
        <Button key="out" label="התנתקות מהחשבון" icon="logout" variant="danger" onPress={onSignOut} />,
        <Button key="close" label="סגירה" variant="secondary" onPress={onClose} />,
      ]}
    >
      <View style={styles.who}>
        <Avatar photo={user.photo} name={user.name || user.email} size={48} />
        <View style={{ flex: 1 }}>
          <Text style={styles.name}>{user.name || user.email}</Text>
          {user.name && user.email ? <Text style={styles.sub}>{user.email}</Text> : null}
        </View>
      </View>
      {access ? (
        <Text style={styles.shared}>
          מוצגים עכשיו הנתונים של {owner} · {ROLE_LABELS[access.role]}
        </Text>
      ) : null}

      <AccountSwitcher onSwitched={onClose} />

      <View style={styles.links}>
        {link('/profile', 'card-account-details-outline', 'פרטים אישיים')}
        {link('/sharing', 'account-multiple-outline', 'שיתוף והרשאות')}
      </View>

      <Checkbox
        checked={viewOnly}
        onChange={(on) => void setViewOnly(on)}
        label="מצב צפייה בלבד"
        hint="הדיווח והעריכה מוסתרים — לעיון בלי חשש לשינוי בטעות"
      />

      <Text style={styles.label}>ערכת צבעים</Text>
      <View style={styles.swatchRow}>
        {palettes.map((p) => {
          const selected = p.id === paletteId;
          return (
            <Pressable
              key={p.id}
              onPress={() => setPaletteId(p.id)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={lang === 'he' ? p.labelHe : p.labelEn}
              style={[styles.swatch, selected && styles.swatchSelected]}
            >
              <View style={styles.swatchDisc}>
                <View style={[styles.swatchHalf, { backgroundColor: p.colors.brand }]} />
                <View style={[styles.swatchHalf, { backgroundColor: p.swatchTint }]} />
              </View>
            </Pressable>
          );
        })}
      </View>
    </Dialog>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    who: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    name: { fontSize: 17, fontWeight: '700', color: colors.text, textAlign: TEXT_RIGHT },
    sub: { fontSize: 14, color: colors.textMuted, textAlign: TEXT_RIGHT },
    shared: {
      fontSize: 14,
      color: colors.text,
      textAlign: TEXT_RIGHT,
      backgroundColor: colors.brandLight,
      borderRadius: radius.sm,
      padding: spacing.sm,
    },
    links: { gap: 2 },
    link: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 48 },
    linkText: { flex: 1, fontSize: 16, color: colors.text, textAlign: TEXT_RIGHT },
    icon: { color: colors.brand },
    pressed: { opacity: 0.6 },
    label: { fontSize: 14, fontWeight: '700', color: colors.textMuted, textAlign: TEXT_RIGHT },
    swatchRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    swatch: { padding: 3, borderRadius: 24, borderWidth: 2, borderColor: 'transparent' },
    swatchSelected: { borderColor: colors.brand },
    swatchDisc: {
      width: 36,
      height: 36,
      borderRadius: 18,
      overflow: 'hidden',
      flexDirection: 'row',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    swatchHalf: { flex: 1 },
  });
