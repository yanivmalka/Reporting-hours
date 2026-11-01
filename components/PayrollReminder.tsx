/**
 * תזכורת לדוחות שכר שטרם נשלחו — באנר שמוביל למסך "דוחות שכר".
 * לא מוצג כשאין דוחות ממתינים.
 */
import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { Pressable } from './Pressable';
import { onDataChanged } from '../lib/demo';
import { loadPayrollStatus, payrollItems, pendingPayroll, type PayrollItem } from '../lib/payroll';
import { loadReports } from '../lib/reports';
import { loadWorkplaces } from '../lib/workplaces';
import { TEXT_RIGHT } from '../theme/align';
import { useThemedStyles } from '../theme/useThemedStyles';
import { radius, spacing, type AppColors } from '../theme/colors';

export function PayrollReminder() {
  const router = useRouter();
  const styles = useThemedStyles(makeStyles);
  const [pending, setPending] = useState<PayrollItem[]>([]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      const load = () =>
        Promise.all([loadWorkplaces(), loadReports(), loadPayrollStatus()]).then(([w, r, st]) => {
          if (active) setPending(pendingPayroll(payrollItems(w, r, st)));
        });
      void load();
      const off = onDataChanged(() => void load());
      return () => {
        active = false;
        off();
      };
    }, []),
  );

  if (pending.length === 0) return null;
  const names = [...new Set(pending.map((p) => p.workplace.name))];

  return (
    <Pressable
      onPress={() => router.push('/payroll')}
      style={({ pressed }) => [styles.banner, pressed && { opacity: 0.8 }]}
      accessibilityRole="button"
    >
      <Text style={styles.icon}>📨</Text>
      <View style={styles.texts}>
        <Text style={styles.title}>
          {pending.length === 1 ? 'דוח שכר אחד ממתין לשליחה' : `${pending.length} דוחות שכר ממתינים לשליחה`}
        </Text>
        <Text style={styles.sub} numberOfLines={2}>
          {names.slice(0, 3).join(' · ')}
          {names.length > 3 ? ` ועוד ${names.length - 3}` : ''}
        </Text>
      </View>
      <Text style={styles.chevron}>‹</Text>
    </Pressable>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    banner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      backgroundColor: colors.surface,
      borderWidth: 1.5,
      borderColor: colors.warning,
      borderRadius: radius.md,
      padding: spacing.md,
    },
    icon: { fontSize: 22 },
    texts: { flex: 1, gap: 2 },
    title: { fontSize: 15, fontWeight: '800', color: colors.text, textAlign: TEXT_RIGHT },
    sub: { fontSize: 12, color: colors.textMuted, textAlign: TEXT_RIGHT },
    chevron: { fontSize: 24, color: colors.warning },
  });
