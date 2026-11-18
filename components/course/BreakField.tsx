/**
 * הפסקה קבועה בטופס הקורס — בשורה אחת: "ללא", 10, 15 דק׳, ותיבה להזנה ידנית (0–59).
 * זמן ההפסקה אינו בתשלום (יורד מהזמן נטו).
 */
import { StyleSheet, View } from 'react-native';
import { Text, TextInput } from '../Text';
import { Pressable } from '../Pressable';
import { useTheme } from '../../theme/ThemeContext';
import { useThemedStyles } from '../../theme/useThemedStyles';
import { radius, spacing, type AppColors } from '../../theme/colors';

const OPTIONS = [0, 10, 15];

export function BreakField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const styles = useThemedStyles(makeStyles);
  const { colors } = useTheme();
  const n = Number(value) || 0;
  const custom = !OPTIONS.includes(n);
  return (
    <View style={styles.row}>
      {OPTIONS.map((o) => {
        const on = !custom && n === o;
        return (
          <Pressable
            key={o}
            onPress={() => onChange(String(o))}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            style={[styles.chip, on && styles.chipOn]}
          >
            <Text style={[styles.chipText, on && styles.chipTextOn]}>{o === 0 ? 'ללא' : `${o} דק׳`}</Text>
          </Pressable>
        );
      })}
      <View style={[styles.customBox, custom && styles.chipOn]}>
        <TextInput
          value={custom ? String(n) : ''}
          onChangeText={(t) => {
            const d = t.replace(/\D/g, '').slice(0, 2);
            onChange(d === '' ? '0' : String(Math.min(59, Number(d))));
          }}
          placeholder="אחר"
          placeholderTextColor={custom ? colors.textOnBrand : colors.textMuted}
          keyboardType="number-pad"
          inputMode="numeric"
          maxLength={2}
          accessibilityLabel="הפסקה בדקות (0–59)"
          style={[styles.customInput, custom && styles.chipTextOn]}
        />
        <Text style={[styles.unit, custom && styles.chipTextOn]}>דק׳</Text>
      </View>
    </View>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    row: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
    chip: {
      height: 38,
      paddingHorizontal: spacing.md,
      justifyContent: 'center',
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    chipOn: { backgroundColor: colors.brand, borderColor: colors.brand },
    chipText: { fontSize: 14, fontWeight: '600', color: colors.text },
    chipTextOn: { color: colors.textOnBrand },
    customBox: {
      flex: 1,
      minWidth: 80,
      height: 38,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: spacing.sm,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    customInput: {
      flex: 1,
      minWidth: 0,
      height: 36,
      paddingVertical: 0,
      fontSize: 14,
      fontWeight: '600',
      color: colors.text,
      textAlign: 'center',
    },
    unit: { fontSize: 13, color: colors.textMuted },
  });
