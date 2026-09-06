import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  ARRIVAL_MODE_LABELS,
  PAYMENT_TYPE_LABELS,
  type Workplace,
} from '../lib/workplaces';
import { formatHours } from '../lib/pay';
import { formatShekels } from '../lib/travel';
import { useTheme } from '../theme/ThemeContext';
import { useThemedStyles } from '../theme/useThemedStyles';
import { radius, spacing, type AppColors } from '../theme/colors';

type WorkplaceCardProps = {
  workplace: Workplace;
  onPress: () => void;
  /** כשמסופק — מוצג פח אשפה אדום (בריחוף העכבר באתר, תמיד באפליקציה) שמעביר לאשפה. */
  onTrash?: () => void;
  /** עלות הנסיעות המצטברת שחושבה למקום העבודה (שלב 5). מוצגת רק בתחבורה ציבורית. */
  travelCost?: number;
  /** מספר ימי העבודה שדווחו ושלפיהם חושבה עלות הנסיעות. */
  travelDays?: number;
  /** השכר המחושב המצטבר למקום העבודה (שלב 4), ב־₪. */
  pay?: number;
  /** שעות משולמות מצטברות (למקום שעתי); לא מוגדר למקום בתשלום חודשי. */
  payHours?: number;
  /** תווית בסיס החישוב — "שעות אקדמיות" / "שעות רגילות". */
  payBasisLabel?: string;
};

/** אייקון פח אשפה מצויר, בצבע אזהרה. */
function TrashGlyph({ color }: { color: string }) {
  return (
    <View style={glyph.wrap}>
      <View style={[glyph.handle, { borderColor: color }]} />
      <View style={[glyph.lid, { backgroundColor: color }]} />
      <View style={[glyph.body, { borderColor: color }]}>
        <View style={[glyph.stripe, { backgroundColor: color }]} />
        <View style={[glyph.stripe, { backgroundColor: color }]} />
      </View>
    </View>
  );
}

/** שורת רשימה למקום עבודה: שם ותקציר תנאי השכר והנסיעה. */
export function WorkplaceCard({
  workplace,
  onPress,
  onTrash,
  travelCost,
  travelDays,
  pay,
  payHours,
  payBasisLabel,
}: WorkplaceCardProps) {
  const styles = useThemedStyles(makeStyles);
  const { colors } = useTheme();
  const [hovered, setHovered] = useState(false);

  const { name, rate, paymentType, payday, arrivalMode } = workplace;
  const rateText =
    paymentType === 'hourly' ? `${rate} ₪ לשעה` : `${rate} ₪ לחודש`;

  // שכר מחושב מצטבר (שלב 4). למקום שעתי מוצגות גם השעות שהתעריף הוכפל בהן.
  const showPay = typeof pay === 'number';
  const payText =
    paymentType === 'monthly'
      ? `שכר: ${formatShekels(pay ?? 0)}`
      : payHours && payHours > 0
        ? `שכר: ${formatShekels(pay ?? 0)} · ${formatHours(payHours)} ${
            payBasisLabel ?? 'שע׳'
          }`
        : `שכר: ${formatShekels(pay ?? 0)}`;

  // עלות נסיעות מוצגת רק כשמגיעים בתחבורה ציבורית וכשחושב ערך (שלב 5).
  const showTravel =
    arrivalMode === 'public_transport' && typeof travelCost === 'number';
  const travelText =
    travelDays && travelDays > 0
      ? `נסיעות: ${formatShekels(travelCost ?? 0)} · ${travelDays} ימים`
      : `נסיעות: ${formatShekels(travelCost ?? 0)}`;

  // באתר הפח מופיע רק בריחוף העכבר; באפליקציה (מגע) הוא גלוי תמיד.
  const showTrash = Boolean(onTrash) && (Platform.OS !== 'web' || hovered);

  return (
    <Pressable
      onPress={onPress}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.texts}>
        <Text style={styles.name}>{name}</Text>
        <Text style={styles.line}>
          {PAYMENT_TYPE_LABELS[paymentType]} · {rateText} · תשלום ב־{payday} לחודש
        </Text>
        <Text style={styles.line}>הגעה: {ARRIVAL_MODE_LABELS[arrivalMode]}</Text>
        {showPay ? <Text style={styles.pay}>{payText}</Text> : null}
        {showTravel ? (
          <Text style={styles.travel}>{travelText}</Text>
        ) : null}
      </View>

      {onTrash ? (
        <Pressable
          onPress={onTrash}
          disabled={!showTrash}
          focusable={showTrash}
          hitSlop={8}
          accessibilityElementsHidden={!showTrash}
          importantForAccessibility={showTrash ? 'auto' : 'no-hide-descendants'}
          accessibilityLabel={`העברת ${name} לאשפה`}
          style={[styles.trash, !showTrash && styles.trashHidden]}
        >
          <TrashGlyph color={colors.danger} />
        </Pressable>
      ) : null}

      <Text style={styles.chevron}>‹</Text>
    </Pressable>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
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
    pay: {
      fontSize: 14,
      fontWeight: '800',
      color: colors.brandDark,
      textAlign: 'right',
    },
    travel: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.brandDark,
      textAlign: 'right',
    },
    trash: {
      width: 36,
      height: 36,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radius.sm,
      borderWidth: 1,
      borderColor: colors.danger,
      backgroundColor: colors.surface,
    },
    // מוסתר בלי לשנות פריסה — כדי שהכרטיס לא "יקפוץ" בריחוף.
    trashHidden: {
      opacity: 0,
    },
    chevron: {
      fontSize: 26,
      color: colors.brand,
    },
  });

const glyph = StyleSheet.create({
  wrap: {
    width: 16,
    height: 16,
    alignItems: 'center',
  },
  handle: {
    width: 6,
    height: 3,
    borderWidth: 1.5,
    borderBottomWidth: 0,
    borderTopStartRadius: 2,
    borderTopEndRadius: 2,
  },
  lid: {
    width: 16,
    height: 2,
    borderRadius: 1,
    marginTop: 1,
  },
  body: {
    width: 12,
    height: 10,
    marginTop: 1,
    borderWidth: 1.5,
    borderTopWidth: 0,
    borderBottomStartRadius: 3,
    borderBottomEndRadius: 3,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 2,
  },
  stripe: {
    width: 1.5,
    height: 6,
    borderRadius: 1,
  },
});
