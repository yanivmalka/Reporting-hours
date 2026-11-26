/**
 * פירוט מועדי התשלום בסגנון "תנועות בחשבון" (עו"ש), מתחת לציר מועדי התשלום בלוח הבקרה:
 * שורה לכל תשלום מהחדש לישן — תאריך ומקום העבודה מימין, הסכום משמאל (ירוק — התקבל,
 * אפור — צפוי, אדום — עבר המועד ולא סומן) ומתחתיו המצטבר בתקופה. פס "היום" מפריד בין
 * מה שלפניך לבין מה שכבר עבר. לחיצה על שורה — דוח השכר.
 */
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Text } from './Text';
import { Pressable } from './Pressable';
import { EnterChevron, FoldChevron } from './Chevrons';
import type { ScheduledPayment } from '../lib/forecast';
import { paymentLedger, type LedgerRow } from '../lib/paymentLedger';
import { periodTitle } from '../lib/payroll';
import { money } from '../lib/travel';
import { AMOUNT_MODE_LABEL, useAmountMode } from '../lib/amountMode';
import { useTheme } from '../theme/ThemeContext';
import { useThemedStyles } from '../theme/useThemedStyles';
import { workplaceColor } from '../theme/workplaceColors';
import { cardShadow, radius, spacing, type AppColors } from '../theme/colors';
import { TEXT_RIGHT } from '../theme/align';

const dmy = (iso: string) => `${Number(iso.slice(8))}.${Number(iso.slice(5, 7))}.${iso.slice(0, 4)}`;

export function PaymentLedger({ payments, today }: { payments: readonly ScheduledPayment[]; today: string }) {
  const [open, setOpen] = useState(true);
  const router = useRouter();
  const amountMode = useAmountMode();
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { rows, todayIndex } = useMemo(
    () => paymentLedger(payments, today, (p) => (p.paidAt || amountMode === 'net' ? p.amount : p.gross)),
    [payments, today, amountMode],
  );
  if (payments.length === 0) return null;

  const status = (r: LedgerRow) =>
    r.kind === 'received'
      ? r.payment.daysLate > 0
        ? `התקבל · באיחור ${r.payment.daysLate} ימים`
        : 'התקבל'
      : r.kind === 'overdue'
        ? `טרם סומן · ${r.payment.daysLate} ימים אחרי המועד`
        : r.date === today
          ? 'צפוי היום'
          : 'צפוי';

  const amountStyle = (r: LedgerRow) =>
    r.kind === 'received' ? styles.received : r.kind === 'overdue' ? styles.overdue : styles.expected;

  const todayMark = (
    <View key="today" style={styles.todayRow} accessibilityLabel={`היום ${dmy(today)}`}>
      <View style={styles.todayLine} />
      <View style={styles.todayChip}>
        <Text style={styles.todayText}>היום · {dmy(today)}</Text>
      </View>
      <View style={styles.todayLine} />
    </View>
  );

  const items = rows.map((r) => (
    <Pressable
      key={`${r.payment.workplace.id}|${r.payment.period.start}`}
      accessibilityRole="button"
      onPress={() =>
        router.push({ pathname: '/payroll-report', params: { wp: r.payment.workplace.id, start: r.payment.period.start } })
      }
      style={({ pressed }) => [
        styles.row,
        { borderStartColor: workplaceColor(colors, r.payment.workplace) },
        !r.past && styles.futureRow,
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.texts}>
        <Text style={styles.date}>{dmy(r.date)}</Text>
        <Text style={styles.name} numberOfLines={1}>
          {r.payment.workplace.name}
        </Text>
        <Text style={[styles.sub, r.kind === 'overdue' && styles.warn]} numberOfLines={1}>
          {`שכר ${periodTitle(r.payment.period)} · ${status(r)}`}
        </Text>
      </View>
      <View style={styles.amounts}>
        <Text style={[styles.amount, amountStyle(r)]}>{money(r.amount)}</Text>
        <Text style={styles.running}>מצטבר {money(r.running)}</Text>
      </View>
      <EnterChevron size={16} />
    </Pressable>
  ));
  items.splice(todayIndex, 0, todayMark);

  return (
    <View style={styles.card}>
      <Pressable
        onPress={() => setOpen((o) => !o)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={styles.head}
      >
        <View style={styles.headTexts}>
          <Text style={styles.title}>פירוט תשלומים</Text>
          <Text style={styles.summary}>
            {`מהחדש לישן · ${AMOUNT_MODE_LABEL[amountMode]} · תשלום שהתקבל — הסכום בפועל`}
          </Text>
        </View>
        <FoldChevron open={open} color={colors.textMuted} />
      </Pressable>
      {open ? <View>{items}</View> : null}
    </View>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, gap: spacing.sm, ...cardShadow },
    head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 40 },
    headTexts: { flex: 1, minWidth: 0 },
    title: { fontSize: 16, fontWeight: '800', color: colors.text, textAlign: TEXT_RIGHT },
    summary: { fontSize: 12, color: colors.textMuted, textAlign: TEXT_RIGHT },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      minHeight: 64,
      paddingVertical: spacing.sm,
      paddingStart: spacing.sm,
      borderStartWidth: 4,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    futureRow: { backgroundColor: colors.background },
    pressed: { opacity: 0.7 },
    texts: { flex: 1, minWidth: 0 },
    date: { fontSize: 12, color: colors.textMuted, textAlign: TEXT_RIGHT },
    name: { fontSize: 15, fontWeight: '700', color: colors.text, textAlign: TEXT_RIGHT },
    sub: { fontSize: 12, color: colors.textMuted, textAlign: TEXT_RIGHT },
    warn: { color: colors.dangerText },
    amounts: { alignItems: 'flex-end' },
    amount: { fontSize: 18, fontWeight: '800' },
    received: { color: colors.success },
    expected: { color: colors.textMuted },
    overdue: { color: colors.dangerText },
    running: { fontSize: 11, color: colors.textMuted },
    todayRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.xs },
    todayLine: { flex: 1, height: 2, backgroundColor: colors.brandDark },
    todayChip: { backgroundColor: colors.brandDark, borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 2 },
    todayText: { fontSize: 12, fontWeight: '700', color: colors.textOnBrand },
  });
