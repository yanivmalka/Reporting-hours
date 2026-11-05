/**
 * קבוצה מתקפלת: כותרת לחיצה עם חץ קיפול (⌄/⌃) ושורת תקציר כשהיא סגורה.
 * סגורה כברירת מחדל — להגדרות שקובעים פעם אחת ולפירוטים משניים.
 */
import { useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { FoldChevron } from './Chevrons';
import { Pressable } from './Pressable';
import { Text } from './Text';
import { useTheme } from '../theme/ThemeContext';
import { radius, spacing } from '../theme/colors';
import { TEXT_RIGHT } from '../theme/align';

type Props = {
  title: string;
  /** שורת תקציר שמוצגת כשהקבוצה סגורה */
  summary?: string;
  /** מספר / ערך קטן בקצה הכותרת */
  meta?: string;
  defaultOpen?: boolean;
  /** בלי מסגרת ורקע — כותרת קבוצה בתוך המסך */
  plain?: boolean;
  children: ReactNode;
};

export function FoldSection({ title, summary, meta, defaultOpen = false, plain, children }: Props) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(defaultOpen);
  return (
    <View
      style={
        plain
          ? styles.plain
          : [styles.box, { backgroundColor: colors.surface, borderColor: colors.border }]
      }
    >
      <Pressable
        onPress={() => setOpen((o) => !o)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={({ pressed }) => [styles.head, plain ? null : styles.headPad, pressed && { opacity: 0.7 }]}
      >
        <View style={styles.texts}>
          <Text style={[plain ? styles.titlePlain : styles.title, { color: colors.text }]}>{title}</Text>
          {!open && summary ? (
            <Text style={[styles.summary, { color: colors.textMuted }]} numberOfLines={2}>
              {summary}
            </Text>
          ) : null}
        </View>
        {meta ? <Text style={[styles.meta, { color: colors.textMuted }]}>{meta}</Text> : null}
        <FoldChevron open={open} />
      </Pressable>
      {open ? <View style={[styles.body, plain ? null : styles.bodyPad]}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderWidth: 1, borderRadius: radius.md },
  plain: { gap: spacing.sm },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 44 },
  headPad: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  texts: { flex: 1, gap: 2 },
  title: { fontSize: 16, fontWeight: '700', textAlign: TEXT_RIGHT },
  titlePlain: { fontSize: 20, fontWeight: '800', textAlign: TEXT_RIGHT },
  summary: { fontSize: 13, textAlign: TEXT_RIGHT },
  meta: { fontSize: 14 },
  body: { gap: spacing.sm },
  bodyPad: { paddingHorizontal: spacing.md, paddingBottom: spacing.md },
});
