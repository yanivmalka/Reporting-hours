import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Text } from './Text';
import { Pressable } from './Pressable';
import { Icon } from './Icon';
import { useTheme } from '../theme/ThemeContext';
import { useThemedStyles } from '../theme/useThemedStyles';
import { radius, spacing, type AppColors } from '../theme/colors';

type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'dangerLink';
  disabled?: boolean;
  loading?: boolean;
  /** אייקון לפני התווית (למשל פח ב"מחיקת הדיווח") */
  icon?: string;
  /** בזמן טעינה: סמל טעינה ולצדו התווית הזו (למשל "בודק…"), במקום סמל בלבד */
  loadingLabel?: string;
};

/**
 * כפתור פעולה אחיד. `primary` מלא בצבע המותג, `secondary` מתאר.
 * פעולות הרסניות — אדום רק בטקסט או ברקע בהיר, לא כמסגרת ולא כמילוי בוהק:
 * `danger` — רקע ורוד בהיר וטקסט אדום כהה; `dangerLink` — טקסט אדום כהה בלבד.
 */
export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  icon,
  loadingLabel,
}: ButtonProps) {
  const styles = useThemedStyles(makeStyles);
  const { colors } = useTheme();
  const isDisabled = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        styles[variant],
        pressed && !isDisabled && styles.pressed,
        isDisabled && styles.disabled,
      ]}
    >
      {loading && loadingLabel ? (
        <View style={styles.content}>
          <ActivityIndicator size="small" color={variant === 'primary' ? colors.textOnBrand : colors.brand} />
          <Text style={[styles.label, styles[`${variant}Label`]]}>{loadingLabel}</Text>
        </View>
      ) : loading ? (
        <ActivityIndicator
          color={variant === 'primary' ? colors.textOnBrand : colors.brand}
        />
      ) : (
        <View style={styles.content}>
          {icon ? (
            <Icon
              name={icon}
              size={20}
              color={
                variant === 'primary'
                  ? colors.textOnBrand
                  : variant === 'secondary'
                    ? colors.text
                    : colors.dangerText
              }
            />
          ) : null}
          <Text style={[styles.label, styles[`${variant}Label`]]}>{label}</Text>
        </View>
      )}
    </Pressable>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    base: {
      minHeight: 48,
      borderRadius: radius.md,
      paddingHorizontal: spacing.lg,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
    },
    pressed: {
      opacity: 0.85,
    },
    disabled: {
      opacity: 0.5,
    },
    label: {
      fontSize: 16,
      fontWeight: '700',
    },
    primary: {
      backgroundColor: colors.brand,
      borderColor: colors.brand,
    },
    primaryLabel: {
      color: colors.textOnBrand,
    },
    secondary: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
    },
    secondaryLabel: {
      color: colors.text,
    },
    content: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    danger: {
      backgroundColor: colors.dangerSoft,
      borderColor: colors.dangerSoft,
    },
    dangerLabel: {
      color: colors.dangerText,
    },
    dangerLink: {
      backgroundColor: 'transparent',
      borderColor: 'transparent',
    },
    dangerLinkLabel: {
      color: colors.dangerText,
    },
  });
