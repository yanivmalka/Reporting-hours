/**
 * תצוגה מקדימה של מייל דוח השכר — נושא, נמענים וגוף, בגופן ברוחב קבוע (כמו הטבלה במייל).
 * עם `lines` ו־`onLinePress` — כל שורה ששייכת לרכיב לחיצה (בעורך הפירוט: מעבר לפקד שלו).
 */
import { Platform, StyleSheet, View } from 'react-native';
import { Text } from '../Text';
import { Pressable } from '../Pressable';
import type { PreviewLine, PreviewTarget } from '../../lib/payroll';
import { useTheme } from '../../theme/ThemeContext';
import { radius, spacing } from '../../theme/colors';
import { TEXT_RIGHT } from '../../theme/align';

const MONO = Platform.select({ ios: 'Menlo', default: 'monospace' });

export function MailPreview({
  to,
  cc,
  subject,
  body,
  lines,
  onLinePress,
  compact,
}: {
  to?: string;
  cc?: string[];
  subject: string;
  body?: string;
  lines?: PreviewLine[];
  onLinePress?: (target: PreviewTarget) => void;
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
      {lines && onLinePress ? (
        <View>
          {lines.map((l, i) => {
            const style = [styles.body, { color: colors.text, fontFamily: MONO }];
            const target = l.target;
            return target ? (
              <Pressable
                key={i}
                onPress={() => onLinePress(target)}
                accessibilityRole="button"
                accessibilityHint="מעבר לפקד שמשנה את השורה"
                style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
                  styles.line,
                  (pressed || hovered) && { backgroundColor: colors.brandLight },
                ]}
              >
                <Text style={style}>{l.text}</Text>
              </Pressable>
            ) : (
              <Text key={i} style={[style, styles.line]}>
                {l.text || ' '}
              </Text>
            );
          })}
        </View>
      ) : (
        <Text style={[styles.body, { color: colors.text, fontFamily: MONO }]} selectable>
          {body ?? lines?.map((l) => l.text).join('\n')}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.sm, padding: spacing.sm, gap: 4 },
  meta: { fontSize: 12, textAlign: TEXT_RIGHT },
  subject: { fontSize: 14, fontWeight: '700', textAlign: TEXT_RIGHT },
  sep: { height: StyleSheet.hairlineWidth, marginVertical: 2 },
  line: { borderRadius: 4 },
  body: { fontSize: 11, lineHeight: 16, textAlign: TEXT_RIGHT, writingDirection: 'rtl' },
});
