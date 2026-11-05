/**
 * תזכורות במסך הבית ובלוח הבקרה:
 *  - דוחות שכר שטרם נשלחו (חודש שנסגר);
 *  - דוחות שנשלחו ומועד התשלום שלהם (לפי "שוטף +") עבר — וטרם סומנו כשולמו;
 *  - מקומות עבודה שלא נכללו בתיאום המס של השנה הלועזית.
 * כל באנר מוביל למסך המתאים. לא מוצג דבר כשאין מה להזכיר.
 */
import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { Text } from './Text';
import { Pressable } from './Pressable';
import { onDataChanged } from '../lib/demo';
import { loadPayrollStatus, overduePayments, payrollItems, pendingPayroll } from '../lib/payroll';
import { loadReports } from '../lib/reports';
import { loadWorkplaces, missingTaxCoordination } from '../lib/workplaces';
import { TEXT_RIGHT } from '../theme/align';
import { useThemedStyles } from '../theme/useThemedStyles';
import { useTheme } from '../theme/ThemeContext';
import { radius, spacing, type AppColors } from '../theme/colors';
import { EnterChevron } from './Chevrons';

type Alert = { key: string; icon: string; title: string; sub: string; href: Href; tone: 'warn' | 'danger' };

const names = (list: string[]) => {
  const u = [...new Set(list)];
  return u.slice(0, 3).join(' · ') + (u.length > 3 ? ` ועוד ${u.length - 3}` : '');
};

export function PayrollReminder() {
  const router = useRouter();
  const styles = useThemedStyles(makeStyles);
  const { colors } = useTheme();
  const [alerts, setAlerts] = useState<Alert[]>([]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      const load = () =>
        Promise.all([loadWorkplaces(), loadReports(), loadPayrollStatus()]).then(([w, r, st]) => {
          if (!active) return;
          const items = payrollItems(w, r, st);
          const pending = pendingPayroll(items);
          const overdue = overduePayments(items);
          const year = String(new Date().getFullYear());
          const noTax = missingTaxCoordination(w, year);
          const next: Alert[] = [];
          if (overdue.length) {
            next.push({
              key: 'overdue',
              icon: '💰',
              title:
                overdue.length === 1
                  ? 'תשלום אחד באיחור — טרם סומן כשולם'
                  : `${overdue.length} תשלומים באיחור — טרם סומנו כשולמו`,
              sub: names(overdue.map((o) => o.workplace.name)),
              href: '/payments',
              tone: 'danger',
            });
          }
          if (pending.length) {
            next.push({
              key: 'pending',
              icon: '📨',
              title:
                pending.length === 1 ? 'דוח שכר אחד ממתין לשליחה' : `${pending.length} דוחות שכר ממתינים לשליחה`,
              sub: names(pending.map((p) => p.workplace.name)),
              href: '/payroll',
              tone: 'warn',
            });
          }
          if (noTax.length) {
            next.push({
              key: 'tax',
              icon: '🧾',
              title: `תיאום מס ${year}: ${noTax.length === 1 ? 'מקום עבודה אחד לא נכלל' : `${noTax.length} מקומות עבודה לא נכללו`}`,
              sub: names(noTax.map((x) => x.name)),
              href: '/tax',
              tone: 'warn',
            });
          }
          setAlerts(next);
        });
      void load();
      const off = onDataChanged(() => void load());
      return () => {
        active = false;
        off();
      };
    }, []),
  );

  if (alerts.length === 0) return null;

  return (
    <View style={styles.wrap}>
      {alerts.map((a) => (
        <Pressable
          key={a.key}
          onPress={() => router.push(a.href)}
          style={({ pressed }) => [
            styles.banner,
            a.tone === 'danger' && styles.bannerDanger,
            pressed && { opacity: 0.8 },
          ]}
          accessibilityRole="button"
        >
          <Text style={styles.icon}>{a.icon}</Text>
          <View style={styles.texts}>
            <Text style={styles.title}>{a.title}</Text>
            <Text style={styles.sub} numberOfLines={2}>
              {a.sub}
            </Text>
          </View>
          <EnterChevron size={24} color={a.tone === 'danger' ? colors.danger : colors.warning} />
        </Pressable>
      ))}
    </View>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    wrap: { gap: spacing.sm },
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
    bannerDanger: { borderColor: colors.danger },
    icon: { fontSize: 22 },
    texts: { flex: 1, gap: 2 },
    title: { fontSize: 15, fontWeight: '800', color: colors.text, textAlign: TEXT_RIGHT },
    sub: { fontSize: 12, color: colors.textMuted, textAlign: TEXT_RIGHT },
    chevron: { fontSize: 24, color: colors.warning },
    chevronDanger: { color: colors.danger },
  });
