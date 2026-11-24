/**
 * כפתור "נטו | ברוטו" — בוחר אם סכומי ההכנסה מוצגים אחרי מס או לפניו (lib/amountMode.ts).
 * רצועה קומפקטית; הבחירה משותפת לכל המסכים (לוח הבקרה, מועדי תשלום, דף מקום עבודה).
 */
import { StyleSheet, View } from 'react-native';
import { Text } from './Text';
import { Pressable } from './Pressable';
import { useThemedStyles } from '../theme/useThemedStyles';
import { cardShadow, type AppColors } from '../theme/colors';
import { AMOUNT_MODE_LABEL, setAmountMode, useAmountMode, type AmountMode } from '../lib/amountMode';

const MODES: AmountMode[] = ['net', 'gross'];

export function AmountModeToggle() {
  const styles = useThemedStyles(makeStyles);
  const mode = useAmountMode();
  return (
    <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel="הצגת סכומים">
      {MODES.map((m) => {
        const on = m === mode;
        return (
          <Pressable
            key={m}
            onPress={() => void setAmountMode(m)}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            accessibilityLabel={m === 'net' ? 'נטו — אחרי מס' : 'ברוטו — לפני מס'}
            hitSlop={6}
            style={[styles.seg, on && styles.segOn]}
          >
            <Text style={[styles.label, on && styles.labelOn]}>{AMOUNT_MODE_LABEL[m]}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    row: { flexDirection: 'row', backgroundColor: colors.border, borderRadius: 16, padding: 3, gap: 2 },
    seg: {
      minHeight: 32,
      minWidth: 54,
      paddingHorizontal: 10,
      borderRadius: 13,
      alignItems: 'center',
      justifyContent: 'center',
    },
    segOn: { backgroundColor: colors.surface, ...cardShadow },
    label: { fontSize: 13, color: colors.textMuted },
    labelOn: { fontWeight: '700', color: colors.text },
  });
