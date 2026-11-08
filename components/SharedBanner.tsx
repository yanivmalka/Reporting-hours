/**
 * פס קבוע בראש כל מסך (components/Screen.tsx) כשצופים בנתונים של בעלים אחר,
 * והודעה כשההרשאה בוטלה (docs/sharing-spec.md).
 */
import { View } from 'react-native';
import { Text } from './Text';
import { Pressable } from './Pressable';
import { useCloudSync } from './CloudSync';
import { ROLE_LABELS } from '../lib/sharing';
import { spacing } from '../theme/colors';
import { useStyles, type ColorScheme, type StyleLayout } from '../theme/useStyles';

export function SharedBanner() {
  const styles = useStyles(makeStyles);
  const { access, accessLost, dismissAccessLost, switchAccount } = useCloudSync();
  if (accessLost) {
    return (
      <View style={[styles.bar, styles.lost]}>
        <Text style={styles.text} numberOfLines={2}>
          ההרשאה לנתונים של {accessLost} בוטלה. מוצגים הנתונים שלך.
        </Text>
        <Pressable onPress={dismissAccessLost} hitSlop={8}>
          <Text style={styles.link}>סגירה</Text>
        </Pressable>
      </View>
    );
  }
  if (!access) return null;
  return (
    <View style={styles.bar}>
      <Text style={styles.text} numberOfLines={1}>
        הנתונים של {access.ownerName || access.ownerEmail} · {ROLE_LABELS[access.role]}
      </Text>
      <Pressable onPress={() => void switchAccount(null).catch(() => {})} hitSlop={8}>
        <Text style={styles.link}>לנתונים שלי</Text>
      </Pressable>
    </View>
  );
}

function makeStyles(c: ColorScheme, layout: StyleLayout) {
  return {
    bar: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: spacing.md,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
      backgroundColor: c.brandLight,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    lost: { backgroundColor: c.dangerSoft },
    text: { flex: 1, fontSize: 14, color: c.text, textAlign: layout.textStart },
    link: { fontSize: 14, fontWeight: '700' as const, color: c.brandDark },
  };
}
