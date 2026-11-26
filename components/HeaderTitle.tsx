/**
 * שורת התפריט (app/_layout.tsx):
 * - HeaderTitle — כותרת המסך.
 * - HeaderBadges — סימני מצב, בצמוד לשמאל השורה (בצד ה־⋮, לא ליד הכותרת):
 *   - תמונת המשתמש מחשבון Google (components/Avatar.tsx); בחשבון ששותף (docs/sharing-spec.md) — התמונה
 *     של הבעלים (`Profile.photoUrl`). לחיצה — תפריט החשבון (components/AccountMenu.tsx).
 *   - עין — מצב צפייה בלבד (lib/viewOnly.ts).
 *   - מנעול — נעילה / פתיחה של המידע הכספי, רק במסך שמוצג בו מידע כספי (`HeaderFinanceLock`).
 *   לחיצה על סימן פותחת דיאלוג עם הפרטים והמעבר חזרה ("לנתונים שלי" / "מעבר לעריכה").
 */
import { useEffect, useState } from 'react';
import { Avatar } from './Avatar';
import { HeaderFinanceLock } from './AppLock';
import { AccountMenu, signOutMessage } from './AccountMenu';
import { useConfirm } from './ConfirmDialog';
import { loadProfile } from '../lib/profile';
import { flush } from '../lib/sync';
import { useWindowDimensions, View } from 'react-native';
import { Text } from './Text';
import { Pressable } from './Pressable';
import { Icon } from './Icon';
import { Dialog } from './Dialog';
import { Button } from './Button';
import { useCloudSync } from './CloudSync';
import { setViewOnly, useViewOnly } from '../lib/viewOnly';
import { spacing } from '../theme/colors';
import { useStyles, type ColorScheme, type StyleLayout } from '../theme/useStyles';

/** רוחב שמור לכפתורי שורת הכותרת משני צדי הכותרת */
const HEADER_RESERVED = 210;

export function HeaderTitle({ title, tintColor }: { title: string; tintColor: string }) {
  const styles = useStyles(makeStyles);
  const { width } = useWindowDimensions();
  // הכותרת נחתכה לעיתים לאות אחת ("ג…") למרות מקום פנוי בשורה: בשורת הכותרת של אנדרואיד הכותרת
  // הצטמצמה (flexShrink) לרוחב שנמדד לפני שהשם נטען. עכשיו היא לא מצטמצמת, אלא מוגבלת לרוחב
  // המסך פחות הכפתורים (חץ / ☰, מנעול, תמונה, ⋮), ו־key={title} מודד מחדש כשהכותרת מתעדכנת.
  return (
    <Text
      key={title}
      style={[styles.title, { color: tintColor, maxWidth: Math.max(120, width - HEADER_RESERVED) }]}
      numberOfLines={1}
    >
      {title}
    </Text>
  );
}

export function HeaderBadges({ routeKey }: { routeKey?: string } = {}) {
  const styles = useStyles(makeStyles);
  const { user, access, switchAccount, signOut } = useCloudSync();
  const viewOnly = useViewOnly();
  const confirm = useConfirm();
  const [open, setOpen] = useState<'account' | 'viewOnly' | null>(null);
  const close = () => setOpen(null);
  const owner = access ? access.ownerName || access.ownerEmail : '';
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

  function askSignOut() {
    if (!user) return;
    close();
    confirm({
      title: 'להתנתק מהחשבון?',
      message: signOutMessage(user.email || user.name || '', access ? owner : null),
      confirmLabel: 'התנתקות',
      onConfirm: async () => {
        if (access) await switchAccount(null).catch(() => {});
        await flush().catch(() => {});
        await signOut();
      },
    });
  }

  return (
    <View style={styles.row}>
      {/* מנעול המידע הכספי — רק במסך שמוצג בו מידע כספי */}
      <HeaderFinanceLock routeKey={routeKey} />
      {user ? (
        <Pressable
          onPress={() => setOpen('account')}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={access ? `הנתונים של ${owner} · תפריט החשבון` : 'תפריט החשבון'}
          style={styles.badge}
        >
          {access ? (
            <Avatar photo={ownerPhoto} name={owner} size={28} />
          ) : (
            <Avatar photo={user.photo} name={user.name || user.email} size={28} />
          )}
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

      {open === 'account' ? <AccountMenu onClose={close} onSignOut={askSignOut} /> : null}
      {confirm.dialog}

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
    title: { fontSize: 20, fontWeight: '700' as const, flexShrink: 0 },
    badge: { padding: 2 },
    accent: { color: c.brand },
    body: { fontSize: 15, color: c.text, textAlign: layout.textStart },
  };
}
