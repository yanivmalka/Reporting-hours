/**
 * הודעה בראש כל מסך (components/Screen.tsx) כשההרשאה לנתונים של בעלים אחר
 * בוטלה (docs/sharing-spec.md). הסימון שצופים בנתונים של משתמש אחר, ומצב צפייה
 * בלבד — אייקונים בשורת התפריט ליד הכותרת (components/HeaderTitle.tsx).
 */
import { View } from 'react-native';
import { Text } from './Text';
import { Pressable } from './Pressable';
import { useCloudSync } from './CloudSync';
import { spacing } from '../theme/colors';
import { useStyles, type ColorScheme, type StyleLayout } from '../theme/useStyles';

export function SharedBanner() {
  const styles = useStyles(makeStyles);
  const { accessLost, dismissAccessLost } = useCloudSync();
  if (!accessLost) return null;
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
