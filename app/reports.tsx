import { useCallback, useMemo, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ACADEMIC_HOUR_MINUTES } from '../lib/academic';
import { monthName, totalsFor } from '../lib/dashboard';
import { Button } from '../components/Button';
import { ReportCard } from '../components/ReportCard';
import { Screen } from '../components/Screen';
import { reportPay } from '../lib/pay';
import { usePayBasis } from '../lib/payBasis';
import { loadReports, type WorkReport } from '../lib/reports';
import { formatShekels } from '../lib/travel';
import { loadWorkplaces, type Workplace } from '../lib/workplaces';
import { useTheme } from '../theme/ThemeContext';
import { useThemedStyles } from '../theme/useThemedStyles';
import { radius, spacing, type AppColors } from '../theme/colors';

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
  /** סינון: מזהה מקום עבודה / חודש "YYYY-MM"; null = הכול */
  const [wpFilter, setWpFilter] = useState<string | null>(null);
  const [monthFilter, setMonthFilter] = useState<string | null>(null);

  const filtered = useMemo(
    () =>
      (reports ?? []).filter(
        (r) =>
          (wpFilter == null || r.workplaceId === wpFilter) &&
          (monthFilter == null || r.date.startsWith(monthFilter)),
      ),
    [reports, wpFilter, monthFilter],
  );
  const months = useMemo(
    () => [...new Set((reports ?? []).map((r) => r.date.slice(0, 7)))].sort((a, b) => b.localeCompare(a)),
    [reports],
  );

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

  const usedWorkplaces = workplaces.filter((w) => reports.some((r) => r.workplaceId === w.id));
  const totals = totalsFor(
    wpFilter ? workplaces.filter((w) => w.id === wpFilter) : workplaces,
    filtered,
    basis,
  );
  const isFiltered = wpFilter != null || monthFilter != null;

  return (
    <Screen>
      <FilterRow
        options={[
          { key: null, label: 'כל מקומות העבודה' },
          ...usedWorkplaces.map((w) => ({ key: w.id, label: w.name })),
        ]}
        value={wpFilter}
        onChange={setWpFilter}
        styles={styles}
      />
      <FilterRow
        options={[
          { key: null, label: 'כל החודשים' },
          ...months.map((m) => ({ key: m, label: monthName(m) })),
        ]}
        value={monthFilter}
        onChange={setMonthFilter}
        styles={styles}
      />

      <View style={styles.summary}>
        <Text style={styles.summaryTitle}>
          {filtered.length} דיווחים · {totals.days} ימי עבודה
        </Text>
        <Text style={styles.summaryLine}>
          {Math.round((totals.netMinutes / ACADEMIC_HOUR_MINUTES) * 10) / 10} שע׳ אקדמיות · שכר{' '}
          {formatShekels(Math.round(totals.pay))}
          {totals.travel > 0 ? ` · נסיעות ${formatShekels(totals.travel)}` : ''}
        </Text>
        {isFiltered ? (
          <Pressable
            onPress={() => {
              setWpFilter(null);
              setMonthFilter(null);
            }}
          >
            <Text style={styles.clear}>ניקוי סינון</Text>
          </Pressable>
        ) : null}
      </View>

      {reports.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>עדיין לא נשמרו דיווחים.</Text>
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>אין דיווחים שמתאימים לסינון.</Text>
        </View>
      ) : (
        <View style={styles.list}>
          {filtered.map((report) => (
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

/** שורת סינון — כפתורים בגלילה אופקית, בחירה אחת. */
function FilterRow({
  options,
  value,
  onChange,
  styles,
}: {
  options: { key: string | null; label: string }[];
  value: string | null;
  onChange: (key: string | null) => void;
  styles: ReturnType<typeof makeStyles>;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ flexGrow: 0 }}
      contentContainerStyle={styles.chips}
    >
      {options.map((o) => {
        const on = o.key === value;
        return (
          <Pressable
            key={o.key ?? 'all'}
            onPress={() => onChange(o.key)}
            style={[styles.chip, on && styles.chipOn]}
          >
            <Text style={[styles.chipText, on && styles.chipTextOn]} numberOfLines={1}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
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
  chips: {
    gap: spacing.sm,
    paddingVertical: 2,
  },
  chip: {
    height: 36,
    maxWidth: 260,
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipOn: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
  },
  chipTextOn: {
    color: colors.textOnBrand,
  },
  summary: {
    backgroundColor: colors.brandLight,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 2,
  },
  summaryTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.brandDark,
    textAlign: 'right',
  },
  summaryLine: {
    fontSize: 13,
    color: colors.brandDark,
    textAlign: 'right',
  },
  clear: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.brandDark,
    textDecorationLine: 'underline',
    textAlign: 'right',
    marginTop: spacing.xs,
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
