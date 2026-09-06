import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  ARRIVAL_MODE_LABELS,
  PAYMENT_TYPE_LABELS,
  type Workplace,
} from '../lib/workplaces';
import { colors, radius, spacing } from '../theme/colors';

type WorkplaceCardProps = {
  workplace: Workplace;
  onPress: () => void;
};

/** שורת רשימה למקום עבודה: שם ותקציר תנאי השכר והנסיעה. */
export function WorkplaceCard({ workplace, onPress }: WorkplaceCardProps) {
  const { name, rate, paymentType, payday, arrivalMode } = workplace;
  const pay =
    paymentType === 'hourly'
      ? `${rate} ₪ לשעה`
      : `${rate} ₪ לחודש`;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.texts}>
        <Text style={styles.name}>{name}</Text>
        <Text style={styles.line}>
          {PAYMENT_TYPE_LABELS[paymentType]} · {pay} · תשלום ב־{payday} לחודש
        </Text>
        <Text style={styles.line}>הגעה: {ARRIVAL_MODE_LABELS[arrivalMode]}</Text>
      </View>
      <Text style={styles.chevron}>‹</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.md,
  },
  pressed: {
    backgroundColor: colors.brandLight,
  },
  texts: {
    flex: 1,
    gap: spacing.xs,
  },
  name: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'right',
  },
  line: {
    fontSize: 13,
    color: colors.textMuted,
    textAlign: 'right',
  },
  chevron: {
    fontSize: 26,
    color: colors.brand,
  },
});
