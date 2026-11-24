/** תצוגה מקדימה של מייל דוח השכר — נושא, נמענים וגוף, בגופן ברוחב קבוע (כמו הטבלה במייל). */
import { Platform, StyleSheet, View } from 'react-native';
import { Text } from '../Text';
import { useTheme } from '../../theme/ThemeContext';
import { radius, spacing } from '../../theme/colors';
import { TEXT_RIGHT } from '../../theme/align';

const MONO = Platform.select({ ios: 'Menlo', default: 'monospace' });

export function MailPreview({
  to,
  cc,
  subject,
  body,
  compact,
}: {
  to?: string;
  cc?: string[];
  subject: string;
  body: string;
  /** בתוך עורך הפירוט — מסגרת בלי שורות הנמענים */
  compact?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View style={[styles.box, { borderColor: colors.border, backgroundColor: colors.background }]}>
      {!compact ? (
        <>
          <Text style={[styles.meta, { color: colors.textMuted }]}>
            אל: {to || 'לא הוגדר מייל לשכר'}
            {cc?.length ? ` · העתק: ${cc.join(', ')}` : ''}
          </Text>
        </>
      ) : null}
      <Text style={[styles.subject, { color: colors.text }]}>{subject}</Text>
      <View style={[styles.sep, { backgroundColor: colors.border }]} />
      <Text style={[styles.body, { color: colors.text, fontFamily: MONO }]} selectable>
        {body}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.sm, padding: spacing.sm, gap: 4 },
  meta: { fontSize: 12, textAlign: TEXT_RIGHT },
  subject: { fontSize: 14, fontWeight: '700', textAlign: TEXT_RIGHT },
  sep: { height: StyleSheet.hairlineWidth, marginVertical: 2 },
  body: { fontSize: 11, lineHeight: 16, textAlign: TEXT_RIGHT, writingDirection: 'rtl' },
});
