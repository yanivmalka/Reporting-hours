import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Pressable } from '../components/Pressable';
import { Screen } from '../components/Screen';
import { dateRange } from '../lib/dashboard';
import {
  loadPayrollStatus,
  payrollItems,
  pendingPayroll,
  periodTitle,
  type PayrollItem,
} from '../lib/payroll';
import { loadReports } from '../lib/reports';
import { formatDateWithHebrew } from '../lib/time';
import { loadWorkplaces } from '../lib/workplaces';
import { TEXT_RIGHT } from '../theme/align';
import { useTheme } from '../theme/ThemeContext';
import { useThemedStyles } from '../theme/useThemedStyles';
import { radius, spacing, type AppColors } from '../theme/colors';

/** מסך דוחות שכר: ממתינים לשליחה, החודש הנוכחי (בהכנה), ודוחות שנשלחו. */
export default function PayrollScreen() {
  const router = useRouter();
  const styles = useThemedStyles(makeStyles);
  const { colors } = useTheme();
  const [items, setItems] = useState<PayrollItem[] | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      Promise.all([loadWorkplaces(), loadReports(), loadPayrollStatus()]).then(([w, r, st]) => {
        if (active) setItems(payrollItems(w, r, st));
      });
      return () => {
        active = false;
      };
    }, []),
  );

  if (!items) {
    return (
      <Screen scroll={false}>
        <View style={styles.center}>
          <ActivityIndicator color={colors.brand} />
        </View>
      </Screen>
    );
  }

  const pending = pendingPayroll(items);
  const current = items.filter((i) => !i.closed);
  const sent = items
    .filter((i) => i.status.sentAt)
    .sort((a, b) => (b.status.sentAt ?? 0) - (a.status.sentAt ?? 0))
    .slice(0, 12);

  const open = (i: PayrollItem) =>
    router.push({
      pathname: '/payroll-report',
      params: { wp: i.workplace.id, start: i.period.start },
    });

  const Row = ({ item, kind }: { item: PayrollItem; kind: 'pending' | 'current' | 'sent' }) => (
    <Pressable onPress={() => open(item)} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <View style={styles.rowHead}>
        <Text style={styles.rowName} numberOfLines={2}>
          {item.workplace.name}
        </Text>
        <Text
          style={[
            styles.badge,
            kind === 'pending' && styles.badgePending,
            kind === 'sent' && styles.badgeSent,
          ]}
        >
          {kind === 'sent'
            ? '✓ נשלח'
            : kind === 'current'
              ? 'בהכנה'
              : item.status.generatedAt
                ? 'מייל נוצר'
                : 'ממתין'}
        </Text>
      </View>
      <Text style={styles.rowMeta}>
        {periodTitle(item.period)} · {dateRange(item.period.start, item.period.end)} · {item.reports}{' '}
        דיווחים
        {kind === 'sent' && item.status.sentAt
          ? ` · נשלח ${formatDateWithHebrew(new Date(item.status.sentAt).toISOString().slice(0, 10), false)}`
          : ''}
        {kind === 'current' ? ` · נסגר בעוד ${item.period.daysToPayday} ימים` : ''}
      </Text>
      {kind === 'pending' && !item.workplace.payrollEmail ? (
        <Text style={styles.warn}>לא הוגדר מייל לשכר למקום זה</Text>
      ) : null}
    </Pressable>
  );

  return (
    <Screen>
      <View style={styles.intro}>
        <Text style={styles.title}>דוחות שכר</Text>
        <Text style={styles.subtitle}>
          דוח שעות חודשי לכל מקום עבודה — לפי יום התשלום שלו — עם פירוט לפי קורס, סה״כ שעות
          ונסיעות. יוצרים מייל מוכן לשליחה ומסמנים כשנשלח.
        </Text>
      </View>

      <Text style={styles.section}>
        ממתינים לשליחה {pending.length > 0 ? `(${pending.length})` : ''}
      </Text>
      {pending.length === 0 ? (
        <Text style={styles.empty}>אין דוחות שממתינים לשליחה 🎉</Text>
      ) : (
        <View style={styles.list}>
          {pending.map((i) => (
            <Row key={`${i.workplace.id}|${i.period.start}`} item={i} kind="pending" />
          ))}
        </View>
      )}

      <Text style={styles.section}>החודש הנוכחי — בהכנה</Text>
      <View style={styles.list}>
        {current.map((i) => (
          <Row key={`${i.workplace.id}|${i.period.start}`} item={i} kind="current" />
        ))}
      </View>

      {sent.length > 0 ? (
        <>
          <Text style={styles.section}>נשלחו לאחרונה</Text>
          <View style={styles.list}>
            {sent.map((i) => (
              <Row key={`${i.workplace.id}|${i.period.start}`} item={i} kind="sent" />
            ))}
          </View>
        </>
      ) : null}
    </Screen>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    intro: { gap: spacing.sm },
    title: { fontSize: 22, fontWeight: '800', color: colors.text, textAlign: TEXT_RIGHT },
    subtitle: { fontSize: 14, lineHeight: 21, color: colors.textMuted, textAlign: TEXT_RIGHT },
    section: {
      fontSize: 15,
      fontWeight: '800',
      color: colors.text,
      textAlign: TEXT_RIGHT,
      marginTop: spacing.sm,
    },
    empty: { fontSize: 14, color: colors.textMuted, textAlign: TEXT_RIGHT },
    list: { gap: spacing.sm },
    row: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      padding: spacing.md,
      gap: 4,
    },
    pressed: { opacity: 0.7 },
    rowHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    rowName: { flex: 1, fontSize: 15, fontWeight: '700', color: colors.text, textAlign: TEXT_RIGHT },
    rowMeta: { fontSize: 12, color: colors.textMuted, textAlign: TEXT_RIGHT },
    warn: { fontSize: 12, color: colors.danger, textAlign: TEXT_RIGHT },
    badge: {
      fontSize: 12,
      fontWeight: '800',
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
      borderRadius: 10,
      overflow: 'hidden',
      backgroundColor: colors.brandLight,
      color: colors.brandDark,
    },
    badgePending: { backgroundColor: colors.warning, color: '#fff' },
    badgeSent: { backgroundColor: colors.success, color: '#fff' },
  });
