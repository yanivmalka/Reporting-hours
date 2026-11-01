import { useCallback, useEffect, useMemo, useState } from 'react';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Pressable } from '../components/Pressable';
import { SelectField } from '../components/SelectField';
import { RangeCalendar, type DateRangeValue } from '../components/RangeCalendar';
import { longDate } from '../components/DatePicker';
import { todayISO } from '../lib/time';
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
import { TEXT_RIGHT } from '../theme/align';

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
  /** החודש המוצג בלוח השנה, "YYYY-MM" — ברירת מחדל: החודש הנוכחי */
  const [calMonth, setCalMonth] = useState(() => todayISO().slice(0, 7));
  /** יום / טווח שנבחר בלוח; null = כל החודש */
  const [range, setRange] = useState<DateRangeValue>(null);
  /** כל הדיווחים, בלי הגבלת חודש */
  const [allTime, setAllTime] = useState(false);
  /**
   * "חודש נוכחי / קודם" לפי יום התשלום של כל מקום עבודה (מגיע מלוח הבקרה,
   * כשלא נבחר מקום עבודה יחיד) — גובר על לוח השנה עד שמנקים.
   */
  const [periodMode, setPeriodMode] = useState<'current' | 'previous' | null>(null);

  // סינון שמגיע מלוח הבקרה: ?wp=<מזהה>&when=current|previous|YYYY-MM
  useEffect(() => {
    if (params.wp !== undefined) setWpFilter(params.wp || null);
    const when = params.when;
    if (when === undefined) return;
    setAllTime(false);
    setPeriodMode(null);
    setRange(null);
    if (/^\d{4}-\d{2}$/.test(when)) {
      setCalMonth(when);
    } else if (when === 'current' || when === 'previous') {
      const w = workplaces.find((x) => x.id === params.wp);
      if (w) {
        // מקום עבודה יחיד — התקופה שלו כטווח בלוח השנה.
        const p = when === 'current' ? currentPayPeriod(w.payday) : previousPayPeriod(w.payday);
        setCalMonth(p.start.slice(0, 7));
        setRange({ from: p.start, to: p.end });
      } else if (!params.wp) {
        setPeriodMode(when);
      }
    }
  }, [params.wp, params.when, workplaces]);

  const byWorkplace = useMemo(
    () => (reports ?? []).filter((r) => wpFilter == null || r.workplaceId === wpFilter),
    [reports, wpFilter],
  );

  const filtered = useMemo(() => {
    return byWorkplace.filter((r) => {
      if (periodMode) {
        const w = workplaces.find((x) => x.id === r.workplaceId);
        if (!w) return false;
        const p = periodMode === 'current' ? currentPayPeriod(w.payday) : previousPayPeriod(w.payday);
        return r.date >= p.start && r.date <= p.end;
      }
      if (allTime) return true;
      if (range) return r.date >= range.from && r.date <= range.to;
      return r.date.startsWith(calMonth);
    });
  }, [byWorkplace, workplaces, periodMode, allTime, range, calMonth]);

  // מספר הדיווחים לכל יום — לסימון בלוח השנה (לפי סינון מקום העבודה).
  const counts = useMemo(() => {
    const out: Record<string, number> = {};
    for (const r of byWorkplace) out[r.date] = (out[r.date] ?? 0) + 1;
    return out;
  }, [byWorkplace]);

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
  const isFiltered = wpFilter != null || range != null || allTime || periodMode != null;
  const timeLabel = periodMode
    ? periodMode === 'current'
      ? 'חודש נוכחי — לפי יום התשלום של כל מקום'
      : 'חודש קודם — לפי יום התשלום של כל מקום'
    : allTime
      ? 'כל הדיווחים'
      : range
        ? range.from === range.to
          ? longDate(range.from)
          : dateRange(range.from, range.to, true)
        : monthName(calMonth);

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
      </View>

      {periodMode ? null : allTime ? (
        <Pressable onPress={() => setAllTime(false)} style={styles.calLink}>
          <Text style={styles.clear}>חזרה לתצוגה לפי חודש</Text>
        </Pressable>
      ) : (
        <>
          <RangeCalendar
            month={calMonth}
            onMonthChange={(m) => {
              setCalMonth(m);
              setRange(null);
            }}
            range={range}
            onRangeChange={setRange}
            counts={counts}
          />
          <View style={styles.calActions}>
            <Text style={styles.calHint}>
              {range ? 'לחיצה על יום נוסף — טווח' : 'לחיצה על יום — סינון; יום נוסף — טווח'}
            </Text>
            {range ? (
              <Pressable onPress={() => setRange(null)} hitSlop={8}>
                <Text style={styles.clear}>ניקוי — כל החודש</Text>
              </Pressable>
            ) : (
              <Pressable onPress={() => setAllTime(true)} hitSlop={8}>
                <Text style={styles.clear}>כל הדיווחים</Text>
              </Pressable>
            )}
          </View>
        </>
      )}

      <View style={styles.summary}>
        <Text style={styles.summaryLine}>{timeLabel}</Text>
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
              setRange(null);
              setAllTime(false);
              setPeriodMode(null);
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
    textAlign: TEXT_RIGHT,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 21,
    color: colors.textMuted,
    textAlign: TEXT_RIGHT,
  },
  list: {
    gap: spacing.md,
  },
  calActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
  },
  calHint: {
    flex: 1,
    fontSize: 12,
    color: colors.textMuted,
    textAlign: TEXT_RIGHT,
  },
  calLink: {
    alignSelf: 'flex-start',
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
    textAlign: TEXT_RIGHT,
  },
  summaryLine: {
    fontSize: 13,
    color: colors.brandDark,
    textAlign: TEXT_RIGHT,
  },
  clear: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.brandDark,
    textDecorationLine: 'underline',
    textAlign: TEXT_RIGHT,
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
