import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { NavCard } from '../components/NavCard';
import { PayrollReminder } from '../components/PayrollReminder';
import { ACADEMIC_HOUR_MINUTES } from '../lib/academic';
import { currentPeriods, sumTotals, type Totals } from '../lib/dashboard';
import { onDataChanged } from '../lib/demo';
import { usePayBasis } from '../lib/payBasis';
import { loadReports } from '../lib/reports';
import { loadWorkplaces } from '../lib/workplaces';
import { Screen } from '../components/Screen';
import { useThemedStyles } from '../theme/useThemedStyles';
import { spacing, type AppColors } from '../theme/colors';
import { TEXT_RIGHT } from '../theme/align';

export default function HomeScreen() {
  const router = useRouter();
  const styles = useThemedStyles(makeStyles);
  const { basis } = usePayBasis();
  const [summary, setSummary] = useState<{ totals: Totals; nextPay: number | null } | null>(null);

  // תקציר "החודש" לכרטיס העליון — סכום עד כה, שעות, והתשלום הקרוב.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      const load = () =>
        Promise.all([loadReports(), loadWorkplaces()]).then(([reports, workplaces]) => {
        if (!active) return;
        if (reports.length === 0) {
          setSummary(null);
          return;
        }
        const periods = currentPeriods(workplaces, reports, basis);
        const nextPay = periods.length
          ? Math.min(...periods.map((p) => p.daysToExpected).filter((d) => d >= 0))
          : null;
        setSummary({ totals: sumTotals(periods.map((p) => p.totals)), nextPay });
      });
      void load();
      // טעינת נתוני הדגמה בהפעלה הראשונה מסתיימת אחרי שהמסך כבר נטען.
      const unsubscribe = onDataChanged(() => void load());
      return () => {
        active = false;
        unsubscribe();
      };
    }, [basis]),
  );

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.title}>ברוך הבא 👋</Text>
        <Text style={styles.subtitle}>
          דיווח עצמי של שעות עבודה לפי מקום עבודה, כולל שעות אקדמיות, הפסקות,
          נסיעות וסיכומים חודשיים.
        </Text>
      </View>

      {summary ? (
        <Pressable
          style={({ pressed }) => [styles.summary, pressed && styles.summaryPressed]}
          onPress={() => router.push('/dashboard')}
          accessibilityRole="button"
        >
          <Text style={styles.summaryLabel}>החודש עד כה · לוח בקרה ←</Text>
          <Text style={styles.summaryValue}>
            {Math.round(summary.totals.pay).toLocaleString('en-US')} ₪
          </Text>
          <Text style={styles.summaryMeta}>
            {Math.round((summary.totals.netMinutes / ACADEMIC_HOUR_MINUTES) * 10) / 10} שע׳
            אקדמיות · {summary.totals.reports} דיווחים
            {summary.nextPay != null
              ? ` · תשלום קרוב ${summary.nextPay === 0 ? 'היום' : `בעוד ${summary.nextPay} ימים`}`
              : ''}
          </Text>
        </Pressable>
      ) : null}

      <PayrollReminder />

      <View style={styles.cards}>
        <NavCard
          title="לוח בקרה"
          subtitle="סכומים לפי תקופת שכר, תשלומים קרובים, מגמות ועיגול שעות"
          onPress={() => router.push('/dashboard')}
        />
        <NavCard
          title="דיווח יום עבודה"
          subtitle="בחירת מקום עבודה, טווח שעות והפסקות"
          onPress={() => router.push('/report')}
        />
        <NavCard
          title="הדיווחים שלי"
          subtitle="רשימת ימי העבודה שדווחו וזמן העבודה נטו"
          onPress={() => router.push('/reports')}
        />
        <NavCard
          title="דוחות שכר"
          subtitle="דוח שעות חודשי לכל מקום עבודה ומייל מוכן לשליחה"
          onPress={() => router.push('/payroll')}
        />
        <NavCard
          title="מקומות עבודה"
          subtitle="הגדרת תעריפים, סוג תשלום ונסיעות"
          onPress={() => router.push('/workplaces')}
        />
        <NavCard
          title="דקות מצטברות"
          subtitle="בסיס חישוב השכר, מונה הדקות המצטברות, וסיכומי החודש"
          onPress={() => router.push('/settings')}
        />
        <NavCard
          title="ניהול נתונים"
          subtitle="נתוני הדגמה, איפוס דיווחים או איפוס מלא"
          onPress={() => router.push('/data')}
        />
      </View>

      <Text style={styles.footnote}>
        לוח הבקרה מסכם כל מקום עבודה לפי תקופת השכר שלו (מיום התשלום ועד הבא),
        לפי בסיס חישוב השכר שנקבע בהגדרות.
      </Text>
    </Screen>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
  header: {
    gap: spacing.sm,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: colors.text,
    textAlign: TEXT_RIGHT,
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.textMuted,
    textAlign: TEXT_RIGHT,
  },
  summary: {
    backgroundColor: colors.brand,
    borderRadius: 16,
    padding: spacing.lg,
    gap: 2,
  },
  summaryPressed: {
    opacity: 0.9,
  },
  summaryLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textOnBrand,
    opacity: 0.9,
    textAlign: TEXT_RIGHT,
  },
  summaryValue: {
    fontSize: 32,
    fontWeight: '800',
    color: colors.textOnBrand,
    textAlign: TEXT_RIGHT,
  },
  summaryMeta: {
    fontSize: 13,
    color: colors.textOnBrand,
    opacity: 0.9,
    textAlign: TEXT_RIGHT,
  },
  cards: {
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  footnote: {
    marginTop: 'auto',
    fontSize: 12,
    color: colors.textMuted,
    textAlign: 'center',
  },
});
