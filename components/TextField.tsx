import { StyleSheet } from 'react-native';
import { TextInput } from './Text';
import { useTheme } from '../theme/ThemeContext';
import { useThemedStyles } from '../theme/useThemedStyles';
import { radius, spacing, type AppColors } from '../theme/colors';

type TextFieldProps = {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  numeric?: boolean;
  /** כתובת מייל: מקלדת מייל, בלי אות גדולה אוטומטית, משמאל לימין */
  email?: boolean;
  /** מספר טלפון: מקלדת חיוג, משמאל לימין */
  phone?: boolean;
  invalid?: boolean;
};

/** שדה טקסט אחיד. `numeric` מפעיל מקלדת מספרית ומיישר לשמאל. */
export function TextField({
  value,
  onChangeText,
  placeholder,
  numeric,
  email,
  phone,
  invalid,
}: TextFieldProps) {
  const styles = useThemedStyles(makeStyles);
  const { colors } = useTheme();
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={colors.textMuted}
      keyboardType={numeric ? 'numeric' : email ? 'email-address' : phone ? 'phone-pad' : 'default'}
      inputMode={numeric ? 'decimal' : email ? 'email' : phone ? 'tel' : 'text'}
      autoCapitalize={email ? 'none' : undefined}
      autoCorrect={email ? false : undefined}
      style={[
        styles.input,
        (numeric || email || phone) && styles.numeric,
        invalid && styles.invalid,
      ]}
    />
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
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
