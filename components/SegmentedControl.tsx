import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useThemedStyles } from '../theme/useThemedStyles';
import { radius, spacing, type AppColors } from '../theme/colors';

type Option<T extends string> = { value: T; label: string };

type SegmentedControlProps<T extends string> = {
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
};

/** בורר יחיד מתוך כמה אפשרויות, מוצג כרצועת כפתורים צמודים. */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: SegmentedControlProps<T>) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.row}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            style={[styles.segment, selected && styles.segmentSelected]}
          >
            <Text style={[styles.label, selected && styles.labelSelected]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      gap: spacing.xs,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      padding: spacing.xs,
    },
    segment: {
      flex: 1,
      minHeight: 40,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radius.sm,
      paddingHorizontal: spacing.sm,
    },
    segmentSelected: {
      backgroundColor: colors.brand,
    },
    label: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text,
    },
    labelSelected: {
      color: colors.textOnBrand,
    },
  });
