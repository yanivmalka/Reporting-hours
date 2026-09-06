import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Button } from '../components/Button';
import { ReportCard } from '../components/ReportCard';
import { Screen } from '../components/Screen';
import { reportPay } from '../lib/pay';
import { usePayBasis } from '../lib/payBasis';
import { loadReports, type WorkReport } from '../lib/reports';
import { loadWorkplaces, type Workplace } from '../lib/workplaces';
import { useTheme } from '../theme/ThemeContext';
import { useThemedStyles } from '../theme/useThemedStyles';
import { spacing, type AppColors } from '../theme/colors';

/** מיון: תאריך יורד, ובאותו תאריך לפי סדר ההזנה היורד. */
function byNewest(a: WorkReport, b: WorkReport): number {
  if (a.date !== b.date) return a.date < b.date ? 1 : -1;
  return b.createdAt - a.createdAt;
}

export default function ReportsScreen() {
  const router = useRouter();
  const styles = useThemedStyles(makeStyles);
  const { colors } = useTheme();
  const { basis } = usePayBasis();
  const [reports, setReports] = useState<WorkReport[] | null>(null);
  const [workplaces, setWorkplaces] = useState<Workplace[]>([]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      Promise.all([loadReports(), loadWorkplaces()]).then(([r, w]) => {
        if (!active) return;
        setReports([...r].sort(byNewest));
        setWorkplaces(w);
      });
      return () => {
        active = false;
      };
    }, []),
  );

  if (reports === null) {
    return (
      <Screen scroll={false}>
        <View style={styles.center}>
          <ActivityIndicator color={colors.brand} />
        </View>
      </Screen>
    );
  }

  const workplaceOf = (id: string) => workplaces.find((w) => w.id === id);
  const nameOf = (id: string) => workplaceOf(id)?.name ?? 'מקום עבודה שנמחק';
  // שכר לכל דיווח (שלב 4): מספר ₪ למקום שעתי, null לחודשי, undefined כשמקום
  // העבודה נמחק ואי אפשר לדעת את התעריף.
  const payOf = (report: WorkReport) => {
    const workplace = workplaceOf(report.workplaceId);
    return workplace ? reportPay(report, workplace, basis) : undefined;
  };

  return (
    <Screen>
      <View style={styles.intro}>
        <Text style={styles.title}>הדיווחים שלי</Text>
        <Text style={styles.subtitle}>
          כל ימי העבודה שדווחו, מהחדש לישן — זמן עבודה נטו, שעות אקדמיות
          והשכר המחושב לכל אחד.
        </Text>
      </View>

      {reports.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>עדיין לא נשמרו דיווחים.</Text>
        </View>
      ) : (
        <View style={styles.list}>
          {reports.map((report) => (
            <ReportCard
              key={report.id}
              report={report}
              workplaceName={nameOf(report.workplaceId)}
              pay={payOf(report)}
            />
          ))}
        </View>
      )}

      <View style={styles.action}>
        <Button label="דיווח יום עבודה" onPress={() => router.push('/report')} />
      </View>
    </Screen>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  intro: {
    gap: spacing.sm,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'right',
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 21,
    color: colors.textMuted,
    textAlign: 'right',
  },
  list: {
    gap: spacing.md,
  },
  empty: {
    paddingVertical: spacing.xl,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 15,
    color: colors.textMuted,
  },
  action: {
    marginTop: spacing.sm,
  },
});
