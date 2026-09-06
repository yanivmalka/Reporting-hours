import { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useThemedStyles } from '../theme/useThemedStyles';
import { spacing, type AppColors } from '../theme/colors';

type FormFieldProps = {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
};

/** שורת טופס: תווית, שדה קלט, ורמז או הודעת שגיאה מתחתיו. */
export function FormField({ label, hint, error, children }: FormFieldProps) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      {children}
      {error ? (
        <Text style={styles.error}>{error}</Text>
      ) : hint ? (
        <Text style={styles.hint}>{hint}</Text>
      ) : null}
    </View>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    wrap: {
      gap: spacing.xs,
    },
    label: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text,
      textAlign: 'right',
    },
    hint: {
      fontSize: 12,
      color: colors.textMuted,
      textAlign: 'right',
    },
    error: {
      fontSize: 12,
      color: colors.danger,
      textAlign: 'right',
    },
  });
