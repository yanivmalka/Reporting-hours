import { useCallback, useEffect, useMemo, useState } from 'react';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SelectField } from '../components/SelectField';
import { ACADEMIC_HOUR_MINUTES } from '../lib/academic';
import {
  currentPayPeriod,
  monthName,
  previousPayPeriod,
  dateRange,
  totalsFor,
} from '../lib/dashboard';
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
  // סינון התחלתי יכול להגיע מלוח הבקרה: ?wp=<מזהה>&when=current|previous|YYYY-MM
  const params = useLocalSearchParams<{ wp?: string; when?: string }>();
  /** סינון: מזהה מקום עבודה; null = הכול */
  const [wpFilter, setWpFilter] = useState<string | null>(params.wp || null);
  /**
   * סינון זמן: null = הכול · 'current' / 'previous' = החודש הנוכחי / הקודם של
   * כל מקום עבודה (לפי יום התשלום שלו) · "YYYY-MM" = חודש קלנדרי.
   */
  const [monthFilter, setMonthFilter] = useState<string | null>(params.when || null);

  // כשנכנסים שוב מלוח הבקרה עם סינון אחר — מעדכנים.
  useEffect(() => {
    if (params.wp !== undefined) setWpFilter(params.wp || null);
    if (params.when !== undefined) setMonthFilter(params.when || null);
  }, [params.wp, params.when]);

  const filtered = useMemo(() => {
    const inTime = (r: WorkReport) => {
      if (monthFilter == null) return true;
      if (monthFilter === 'current' || monthFilter === 'previous') {
        const w = workplaces.find((x) => x.id === r.workplaceId);
        if (!w) return false;
        const p =
          monthFilter === 'current' ? currentPayPeriod(w.payday) : previousPayPeriod(w.payday);
        return r.date >= p.start && r.date <= p.end;
      }
      return r.date.startsWith(monthFilter);
    };
    return (reports ?? []).filter(
      (r) => (wpFilter == null || r.workplaceId === wpFilter) && inTime(r),
    );
  }, [reports, workplaces, wpFilter, monthFilter]);
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
  const selectedWp = wpFilter ? workplaces.find((w) => w.id === wpFilter) : undefined;
  const periodHint =
    selectedWp && (monthFilter === 'current' || monthFilter === 'previous')
      ? (() => {
          const p =
            monthFilter === 'current'
              ? currentPayPeriod(selectedWp.payday)
              : previousPayPeriod(selectedWp.payday);
          return dateRange(p.start, p.end);
        })()
      : null;

  return (
    <Screen>
      <View style={styles.filters}>
        <SelectField<string | null>
          label="מקום עבודה:"
          title="סינון לפי מקום עבודה"
          value={wpFilter}
          active={wpFilter != null}
          onChange={setWpFilter}
          options={[
            { value: null, label: 'הכול' },
            ...usedWorkplaces.map((w) => ({ value: w.id, label: w.name })),
          ]}
        />
        <SelectField<string | null>
          label="חודש:"
          title="סינון לפי חודש"
          value={monthFilter}
          active={monthFilter != null}
          onChange={setMonthFilter}
          options={[
            { value: null, label: 'הכול' },
            {
              value: 'current',
              label: 'חודש נוכחי',
              sub: 'לכל מקום עבודה — מיום התשלום שלו',
            },
            { value: 'previous', label: 'חודש קודם', sub: 'לכל מקום עבודה — מיום התשלום שלו' },
            ...months.map((m) => ({ value: m, label: monthName(m) })),
          ]}
        />
      </View>

      <View style={styles.summary}>
        <Text style={styles.summaryTitle}>
          {filtered.length} דיווחים · {totals.days} ימי עבודה
        </Text>
        {periodHint ? <Text style={styles.summaryLine}>{periodHint}</Text> : null}
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
  filters: {
    gap: spacing.sm,
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
