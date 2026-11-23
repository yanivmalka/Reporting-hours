/**
 * שורת התפריט (app/_layout.tsx):
 * - HeaderTitle — כותרת המסך.
 * - HeaderBadges — סימני מצב, בצמוד לשמאל השורה (בצד ה־⋮, לא ליד הכותרת):
 *   - תמונת המשתמש מחשבון Google (components/Avatar.tsx). כשמוצגים נתונים של משתמש אחר (חשבון
 *     ששותף, docs/sharing-spec.md) — התמונה שלו (`Profile.photoUrl`) עם כובע: "בכובע של" המשתמש האחר.
 *   - עין — מצב צפייה בלבד (lib/viewOnly.ts).
 *   לחיצה על סימן פותחת דיאלוג עם הפרטים והמעבר חזרה ("לנתונים שלי" / "מעבר לעריכה").
 */
import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { Avatar } from './Avatar';
import { loadProfile } from '../lib/profile';
import { View } from 'react-native';
import { Text } from './Text';
import { Pressable } from './Pressable';
import { Icon } from './Icon';
import { Dialog } from './Dialog';
import { Button } from './Button';
import { useCloudSync } from './CloudSync';
import { ROLE_LABELS } from '../lib/sharing';
import { setViewOnly, useViewOnly } from '../lib/viewOnly';
import { spacing } from '../theme/colors';
import { useStyles, type ColorScheme, type StyleLayout } from '../theme/useStyles';

export function HeaderTitle({ title, tintColor }: { title: string; tintColor: string }) {
  const styles = useStyles(makeStyles);
  return (
    <Text style={[styles.title, { color: tintColor }]} numberOfLines={1}>
      {title}
    </Text>
  );
}

export function HeaderBadges() {
  const styles = useStyles(makeStyles);
  const router = useRouter();
  const { user, access, switchAccount } = useCloudSync();
  const viewOnly = useViewOnly();
  const [open, setOpen] = useState<'account' | 'me' | 'viewOnly' | null>(null);
  // בחשבון ששותף — התמונה של הבעלים, מהפרטים המסונכרנים שלו
  const [ownerPhoto, setOwnerPhoto] = useState<string | undefined>();
  useEffect(() => {
    if (!access) return;
    let alive = true;
    void loadProfile().then((p) => alive && setOwnerPhoto(p.photoUrl));
    return () => {
      alive = false;
    };
  }, [access]);
  const close = () => setOpen(null);
  const owner = access ? access.ownerName || access.ownerEmail : '';

  return (
    <View style={styles.row}>
      {access ? (
        <Pressable
          onPress={() => setOpen('account')}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`הנתונים של ${owner}`}
          style={styles.badge}
        >
          <Avatar photo={ownerPhoto} name={owner} size={28} hat />
        </Pressable>
      ) : user ? (
        <Pressable
          onPress={() => setOpen('me')}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`מחובר כ־${user.name || user.email || ''}`}
          style={styles.badge}
        >
          <Avatar photo={user.photo} name={user.name || user.email} size={28} />
        </Pressable>
      ) : null}
      {viewOnly ? (
        <Pressable
          onPress={() => setOpen('viewOnly')}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="מצב צפייה בלבד"
          style={styles.badge}
        >
          <Icon name="eye-outline" size={22} color={styles.accent.color} />
        </Pressable>
      ) : null}

      {open === 'account' && access ? (
        <Dialog
          title="נתונים של משתמש אחר"
          onClose={close}
          actions={[
            <Button
              key="mine"
              label="לנתונים שלי"
              onPress={() => {
                close();
                void switchAccount(null).catch(() => {});
              }}
            />,
            <Button key="close" label="סגירה" variant="secondary" onPress={close} />,
          ]}
        >
          <View style={styles.who}>
            <Avatar photo={ownerPhoto} name={owner} size={44} hat />
          </View>
          <Text style={styles.body}>
            עכשיו "בכובע של" {owner} — מוצגים הנתונים בחשבון הזה
            {access.ownerEmail && access.ownerEmail !== owner ? ` (${access.ownerEmail})` : ''}.
          </Text>
          <Text style={styles.body}>הרשאה: {ROLE_LABELS[access.role]}</Text>
        </Dialog>
      ) : null}

      {open === 'me' && user ? (
        <Dialog
          title="החשבון שלך"
          onClose={close}
          actions={[
            <Button
              key="settings"
              label="הגדרות"
              onPress={() => {
                close();
                router.push('/preferences');
              }}
            />,
            <Button key="close" label="סגירה" variant="secondary" onPress={close} />,
          ]}
        >
          <View style={styles.who}>
            <Avatar photo={user.photo} name={user.name || user.email} size={44} />
          </View>
          <Text style={styles.body}>{user.name || user.email}</Text>
          {user.name && user.email ? <Text style={styles.body}>{user.email}</Text> : null}
        </Dialog>
      ) : null}

      {open === 'viewOnly' ? (
        <Dialog
          title="מצב צפייה בלבד"
          onClose={close}
          actions={[
            <Button
              key="edit"
              label="מעבר לעריכה"
              onPress={() => {
                close();
                void setViewOnly(false);
              }}
            />,
            <Button key="close" label="סגירה" variant="secondary" onPress={close} />,
          ]}
        >
          <Text style={styles.body}>הדיווח והעריכה מוסתרים, כדי לעיין בלי חשש לשינוי בטעות.</Text>
        </Dialog>
      ) : null}
    </View>
  );
}

function makeStyles(c: ColorScheme, layout: StyleLayout) {
  return {
    row: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.sm, marginHorizontal: spacing.sm },
    title: { fontSize: 20, fontWeight: '700' as const, flexShrink: 1 },
    badge: { padding: 2 },
    who: { alignItems: 'flex-start' as const, marginBottom: spacing.xs },
    accent: { color: c.brand },
    body: { fontSize: 15, color: c.text, textAlign: layout.textStart },
  };
}
