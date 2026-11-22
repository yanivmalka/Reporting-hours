/**
 * כותרת המסך בשורת התפריט (app/_layout.tsx), ולצדה סימני מצב:
 * - אייקון משתמש — מוצגים נתונים של משתמש אחר (חשבון ששותף, docs/sharing-spec.md).
 * - עין — מצב צפייה בלבד (lib/viewOnly.ts).
 * לחיצה על סימן פותחת דיאלוג עם הפרטים והמעבר חזרה ("לנתונים שלי" / "מעבר לעריכה").
 */
import { useState } from 'react';
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
  const { access, switchAccount } = useCloudSync();
  const viewOnly = useViewOnly();
  const [open, setOpen] = useState<'account' | 'viewOnly' | null>(null);
  const close = () => setOpen(null);
  const owner = access ? access.ownerName || access.ownerEmail : '';

  return (
    <View style={styles.row}>
      <Text style={[styles.title, { color: tintColor }]} numberOfLines={1}>
        {title}
      </Text>
      {access ? (
        <Pressable
          onPress={() => setOpen('account')}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`הנתונים של ${owner}`}
          style={styles.badge}
        >
          <Icon name="account-circle" size={24} color={styles.accent.color} />
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
          <Text style={styles.body}>
            מוצגים הנתונים של {owner}
            {access.ownerEmail && access.ownerEmail !== owner ? ` (${access.ownerEmail})` : ''}.
          </Text>
          <Text style={styles.body}>הרשאה: {ROLE_LABELS[access.role]}</Text>
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
    row: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: spacing.sm, flexShrink: 1 },
    title: { fontSize: 20, fontWeight: '700' as const, flexShrink: 1 },
    badge: { padding: 2 },
    accent: { color: c.brand },
    body: { fontSize: 15, color: c.text, textAlign: layout.textStart },
  };
}
