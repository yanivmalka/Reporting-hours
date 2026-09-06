import { StyleSheet, TextInput } from 'react-native';
import { colors, radius, spacing } from '../theme/colors';

type TextFieldProps = {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  numeric?: boolean;
  invalid?: boolean;
};

/** שדה טקסט אחיד. `numeric` מפעיל מקלדת מספרית ומיישר לשמאל. */
export function TextField({
  value,
  onChangeText,
  placeholder,
  numeric,
  invalid,
}: TextFieldProps) {
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={colors.textMuted}
      keyboardType={numeric ? 'numeric' : 'default'}
      inputMode={numeric ? 'decimal' : 'text'}
      style={[
        styles.input,
        numeric && styles.numeric,
        invalid && styles.invalid,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  input: {
    minHeight: 48,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    fontSize: 16,
    color: colors.text,
    textAlign: 'right',
  },
  numeric: {
    textAlign: 'left',
    writingDirection: 'ltr',
  },
  invalid: {
    borderColor: colors.danger,
  },
});
