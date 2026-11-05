/**
 * תיבת סימון עם כותרת והסבר — שורה לחיצה כולה (כמו ב"חגים וחופשות").
 */
import { StyleSheet, View } from 'react-native';
import { Icon } from './Icon';
import { Pressable } from './Pressable';
import { Text } from './Text';
import { useTheme } from '../theme/ThemeContext';
import { spacing } from '../theme/colors';
import { TEXT_RIGHT } from '../theme/align';

type Props = {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  hint?: string;
  disabled?: boolean;
};

export function Checkbox({ checked, onChange, label, hint, disabled }: Props) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={() => onChange(!checked)}
      disabled={disabled}
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled }}
      style={({ pressed }) => [styles.row, (pressed || disabled) && { opacity: disabled ? 0.5 : 0.85 }]}
    >
      <Icon
        name={checked ? 'checkbox-marked' : 'checkbox-blank-outline'}
        size={26}
        color={checked ? colors.brand : colors.textMuted}
      />
      <View style={styles.texts}>
        <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
        {hint ? <Text style={[styles.hint, { color: colors.textMuted }]}>{hint}</Text> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, paddingVertical: spacing.xs },
  texts: { flex: 1, gap: 2 },
  label: { fontSize: 15, fontWeight: '700', textAlign: TEXT_RIGHT },
  hint: { fontSize: 13, textAlign: TEXT_RIGHT },
});
