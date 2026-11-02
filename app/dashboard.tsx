import { useCallback, useMemo, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Pressable } from '../components/Pressable';
import { Button } from '../components/Button';
import { Panel, ShareRow, StatTile, TileGrid } from '../components/Charts';
import { ForecastChart } from '../components/ForecastChart';
import { Icon } from '../components/Icon';
import { Screen } from '../components/Screen';
import { SegmentedControl } from '../components/SegmentedControl';
import { ACADEMIC_HOUR_MINUTES } from '../lib/academic';
import { accumulatedTotal, loadAccumulated, redeemableHours, type AccumulatedEntry } from '../lib/accumulated';
import {
  currentPeriods,
  monthName,
  monthlyTrend,
  roundingStats,
  shortDate,
  sumTotals,
  weekdayProfile,
  workplaceShares,
} from '../lib/dashboard';
import { loadCourses, type Course } from '../lib/courses';
import { forecastYear, STATUS_LABEL, type ForecastMode, type PeriodStatus } from '../lib/forecast';
import { hebrewMonthNames } from '../lib/hebrewDate';
import { loadPayrollStatus, type StatusMap } from '../lib/payroll';
import { usePayBasis } from '../lib/payBasis';
import { todayISO } from '../lib/time';
import { loadReports, type WorkReport } from '../lib/reports';
import { formatShekels } from '../lib/travel';
import { loadWorkplaces, paymentTermsLabel, type Workplace } from '../lib/workplaces';
import { useTheme } from '../theme/ThemeContext';
import { useThemedStyles } from '../theme/useThemedStyles';
import { radius, spacing, type AppColors } from '../theme/colors';
import { familyShades } from '../theme/shades';
import { TEXT_RIGHT } from '../theme/align';

type PeriodChoice = 'current' | 'previous';

const TREND_MONTHS = 6;

const MONTHS_LONG = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];

/** ₪ מעוגל לשקל שלם עם מפריד אלפים, למשל "12,480 ₪". */
function money(amount: number): string {
  return `${Math.round(amount).toLocaleString('en-US')} ₪`;
}

/** שעות עם ספרה אחת אחרי הנקודה (בלי ".0"). */
function hoursText(hours: number): string {
  const r = Math.round(hours * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

const academicHours = (minutes: number) => minutes / ACADEMIC_HOUR_MINUTES;
const regularHours = (minutes: number) => minutes / 60;


export default function DashboardScreen() {
  const router = useRouter();
  const styles = useThemedStyles(makeStyles);
  const { colors } = useTheme();
  const { basis } = usePayBasis();
  const [data, setData] = useState<{
    reports: WorkReport[];
    workplaces: Workplace[];
    accumulated: AccumulatedEntry;
    redeemable: number;
    courses: Course[];
    statuses: StatusMap;
  } | null>(null);
  const [which, setWhich] = useState<PeriodChoice>('current');
  // ── צפי תשלומים ──
  const [year, setYear] = useState(() => new Date().getFullYear());
  /** החודש המסונן (0–11); null = כל השנה */
  const [month, setMonth] = useState<number | null>(() => new Date().getMonth());
  /** מקום העבודה המודגש; null = כולם */
  const [selWp, setSelWp] = useState<string | null>(null);
  const [mode, setMode] = useState<ForecastMode>('work');

  /** מעבר ל"הדיווחים שלי" עם סינון מוכן. */
  // n — מזהה ייחודי לכל מעבר, כדי שהסינון יוחל גם כשנכנסים שוב עם אותם ערכים.
  const openReports = (filter: { wp?: string; when?: string; from?: string; to?: string }) =>
    router.push({
      pathname: '/reports',
      params: {
        wp: filter.wp ?? '',
        when: filter.when ?? '',
        from: filter.from ?? '',
        to: filter.to ?? '',
        n: String(Date.now()),
      },
    });

  useFocusEffect(
    useCallback(() => {
      let active = true;
      Promise.all([loadReports(), loadWorkplaces(), loadAccumulated(), loadCourses(), loadPayrollStatus()]).then(
        ([reports, workplaces, accumulated, courses, statuses]) => {
          if (!active) return;
          setData({
            reports,
            workplaces,
            courses,
            statuses,
            accumulated: accumulatedTotal(accumulated),
            redeemable: Object.values(accumulated.byWorkplace).reduce((n, e) => n + redeemableHours(e), 0),
          });
        },
      );
      return () => {
        active = false;
      };
    }, []),
  );

  const view = useMemo(() => {
    if (!data) return null;
    const { reports, workplaces } = data;
    const today = new Date();
    const periods = currentPeriods(workplaces, reports, basis, today, which);
    const totals = sumTotals(periods.map((p) => p.totals));
    // ימי עבודה ייחודיים בכל התקופות יחד (יום עם שני סמינרים נספר פעם אחת).
    const dates = new Set<string>();
    for (const p of periods) {
      for (const r of reports) {
        if (r.workplaceId === p.workplace.id && r.date >= p.period.start && r.date <= p.period.end) {
          dates.add(r.date);
        }
      }
    }
    const trend = monthlyTrend(workplaces, reports, basis, TREND_MONTHS, today);
    const windowStart = `${trend[0].key}-01`;
    const recent = reports.filter((r) => r.date >= windowStart);
    return {
      periods: [...periods].sort((a, b) => a.expectedPayment.localeCompare(b.expectedPayment)),
      totals,
      uniqueDays: dates.size,
      trend,
      shares: workplaceShares(workplaces, recent, basis),
      weekdays: weekdayProfile(recent).filter((w) => w.days > 0),
      rounding: roundingStats(recent),
      firstMonth: trend[0].key,
    };
  }, [data, basis, which]);

  const forecast = useMemo(
    () =>
      data
        ? forecastYear(data.workplaces, data.reports, data.courses, data.statuses, basis, year, mode)
        : null,
    [data, basis, year, mode],
  );

  if (!data || !view) {
    return (
      <Screen scroll={false}>
        <View style={styles.center}>
          <ActivityIndicator color={colors.brand} />
        </View>
      </Screen>
    );
  }

  if (data.reports.length === 0 && data.courses.length === 0) {
    return (
      <Screen>
        <Text style={styles.title}>לוח בקרה</Text>
        <View style={styles.empty}>
          <Text style={styles.emptyText}>
            עדיין אין דיווחים להצגה. אפשר להתחיל לדווח, או לטעון נתוני הדגמה כדי לראות
            איך הדשבורד נראה.
          </Text>
          <Button label="דיווח יום עבודה" onPress={() => router.push('/report')} />
          <Button label="ניהול נתונים" variant="secondary" onPress={() => router.push('/data')} />
        </View>
      </Screen>
    );
  }

  const { totals, accumulated } = { totals: view.totals, accumulated: data.accumulated };

  // ── צפי: גוונים מאותה משפחה לכל מקום עבודה, וסיכום לחודש / לשנה המסוננים ──
  const shades = familyShades(colors, data.workplaces.length);
  const series = data.workplaces.map((w, i) => ({ id: w.id, color: shades[i] }));
  const cells = forecast ? (month == null ? forecast : [forecast[month]]) : [];
  const rows = data.workplaces.map((w) => {
    let reported = 0;
    let planned = 0;
    const periods = cells.flatMap((m) => {
      const c = m.byWorkplace[w.id];
      reported += c?.reported ?? 0;
      planned += c?.planned ?? 0;
      return c?.periods ?? [];
    });
    const last = month != null ? periods[periods.length - 1] : undefined;
    return {
      workplace: w,
      reported,
      planned,
      status: (last && (last.reported > 0 || last.planned > 0) ? last.status : null) as PeriodStatus | null,
      expected: last && (last.reported > 0 || last.planned > 0) ? last.expected : null,
      workPeriod: last ? monthName(last.period.start.slice(0, 7)) : null,
    };
  });
  const scope = {
    rows,
    reported: rows.reduce((a, r) => a + r.reported, 0),
    planned: rows.reduce((a, r) => a + r.planned, 0),
  };
  const chipTone = (st: PeriodStatus) =>
    st === 'paid'
      ? { backgroundColor: colors.brandLight, color: colors.brandDark }
      : st === 'sent'
        ? { backgroundColor: colors.brandLight, color: colors.brand }
        : st === 'closed'
          ? { backgroundColor: colors.background, color: colors.warning }
          : st === 'open'
            ? { backgroundColor: colors.background, color: colors.warning }
            : { backgroundColor: colors.background, color: colors.textMuted };
  const maxWeekday = Math.max(...view.weekdays.map((w) => w.avgAcademicHours), 1);
  const r = view.rounding;
  const roundingTotal = r.exact + r.withLeftover || 1;

  return (
    <Screen>
      <View style={styles.modeRow}>
        {(
          [
            ['work', 'לפי חודש עבודה'],
            ['pay', 'לפי מועד תשלום'],
          ] as [ForecastMode, string][]
        ).map(([value, label]) => (
          <Pressable
            key={value}
            onPress={() => setMode(value)}
            accessibilityRole="button"
            accessibilityState={{ selected: mode === value }}
            style={[styles.modeChip, mode === value && styles.modeChipOn]}
          >
            <Text style={[styles.modeText, mode === value && styles.modeTextOn]}>{label}</Text>
          </Pressable>
        ))}
      </View>

      {forecast ? (
        <ForecastChart
          year={year}
          onYearChange={(y) => {
            setYear(y);
            setMonth(null);
          }}
          months={forecast}
          series={series}
          selectedMonth={month}
          onPickMonth={(m) => setMonth((cur) => (cur === m ? null : m))}
          selectedWp={selWp}
          currentKey={todayISO().slice(0, 7)}
        />
      ) : null}

      <View style={styles.periodHead}>
        <View style={{ flex: 1 }}>
          <Text style={styles.periodTitle}>
            {month == null ? `כל ${year}` : `${MONTHS_LONG[month]} ${year}`}
          </Text>
          <Text style={styles.periodSub}>
            {month == null ? 'סיכום שנתי' : hebrewMonthNames(year, month).join('–')}
            {mode === 'pay' ? ' · לפי מועד התשלום הצפוי' : ' · לפי חודש העבודה'}
          </Text>
        </View>
        {month != null ? (
          <Pressable onPress={() => setMonth(null)} hitSlop={8} accessibilityRole="button">
            <Text style={styles.link}>כל השנה</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.totalsRow}>
        <View>
          <Text style={styles.totalLabel}>דווח</Text>
          <Text style={styles.totalValue}>{money(scope.reported)}</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={styles.totalLabel}>לפי תכנון</Text>
          <Text style={[styles.totalValue, styles.totalPlanned]}>{money(scope.planned)}</Text>
        </View>
      </View>

      {scope.rows.map((row, i) => {
        const on = selWp === row.workplace.id;
        return (
          <View
            key={row.workplace.id}
            style={[
              styles.wpCard,
              on && { borderColor: series[i].color, borderWidth: 2 },
              selWp != null && !on && styles.wpFaded,
            ]}
          >
            <Pressable
              onPress={() => setSelWp((cur) => (cur === row.workplace.id ? null : row.workplace.id))}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              style={styles.wpMain}
            >
              <View style={styles.wpHead}>
                <View style={[styles.dot, { backgroundColor: series[i].color }]} />
                <Text style={styles.wpName} numberOfLines={1}>
                  {row.workplace.name}
                </Text>
                {row.status ? (
                  <View style={[styles.chip, chipTone(row.status)]}>
                    <Text style={[styles.chipText, { color: chipTone(row.status).color }]}>
                      {STATUS_LABEL[row.status]}
                    </Text>
                  </View>
                ) : null}
              </View>
              <Text style={styles.wpAmounts}>
                דווח <Text style={styles.bold}>{money(row.reported)}</Text>
                {'   '}
                <Text style={styles.muted}>תכנון {money(row.planned)}</Text>
              </Text>
              {row.expected ? (
                <Text style={styles.wpMeta}>
                  {mode === 'pay' && row.workPeriod ? `עבור ${row.workPeriod} · ` : ''}
                  צפי תשלום {shortDate(row.expected)} · {paymentTermsLabel(row.workplace)}
                </Text>
              ) : null}
            </Pressable>
            <Pressable
              onPress={() => router.push({ pathname: '/workplace', params: { id: row.workplace.id } })}
              accessibilityRole="button"
              accessibilityLabel={`פירוט ${row.workplace.name}`}
              style={({ pressed }) => [styles.drill, pressed && styles.pressed]}
            >
              <Icon name="chevron-left" size={24} color={colors.brandDark} />
            </Pressable>
          </View>
        );
      })}

      <Text style={styles.sectionTitle}>החודש הנוכחי לפי תקופת שכר</Text>

      <SegmentedControl<PeriodChoice>
        options={[
          { value: 'current', label: 'חודש נוכחי' },
          { value: 'previous', label: 'חודש קודם' },
        ]}
        value={which}
        onChange={setWhich}
      />

      <TileGrid>
        <StatTile
          onPress={() => openReports({ when: which })}
          accent
          label={which === 'current' ? 'סכום עד כה' : 'סכום החודש'}
          value={money(totals.pay)}
          sub={`כולל ${data.workplaces.filter((w) => w.paymentType === 'monthly').length} משכורות חודשיות קבועות`}
        />
        <StatTile
          onPress={() => openReports({ when: which })}
          label="שעות אקדמיות"
          value={hoursText(academicHours(totals.netMinutes))}
          sub={`${hoursText(regularHours(totals.netMinutes))} שעות רגילות`}
        />
        <StatTile
          onPress={() => openReports({ when: which })}
          label="ימי עבודה"
          value={String(view.uniqueDays)}
          sub={`${totals.reports} דיווחים · ${hoursText(regularHours(totals.breakMinutes))} שע׳ הפסקות`}
        />
        <StatTile onPress={() => openReports({ when: which })} label="נסיעות" value={money(totals.travel)} sub="תחבורה ציבורית בלבד" />
        <StatTile
          onPress={() => router.push('/settings')}
          label="דקות מצטברות"
          value={String(accumulated.minutes)}
          sub={`בכל הסמינרים · ${data.redeemable} שע׳ זמינות לפדיון · ${accumulated.redeemedHours} נפדו`}
        />
        <StatTile
          onPress={() => openReports({ when: which })}
          label="ממוצע ליום עבודה"
          value={view.uniqueDays ? money(totals.pay / view.uniqueDays) : '—'}
          sub={
            view.uniqueDays
              ? `${hoursText(academicHours(totals.netMinutes) / view.uniqueDays)} שע׳ אקדמיות ליום`
              : undefined
          }
        />
      </TileGrid>

      <Panel title="פילוח לפי מקום עבודה" subtitle={`חלק מסך השכר · ${TREND_MONTHS} החודשים האחרונים`}>
        {view.shares.map((s) => (
          <ShareRow
            key={s.workplace.id}
            onPress={() =>
              openReports({ wp: s.workplace.id, from: `${view.firstMonth}-01`, to: todayISO() })
            }
            label={s.workplace.name}
            value={`${money(s.totals.pay)} · ${Math.round(s.share * 100)}%`}
            fraction={s.share / (view.shares[0]?.share || 1)}
            sub={`${s.totals.days} ימים · ${hoursText(academicHours(s.totals.netMinutes))} שע׳ אקדמיות${
              s.workplace.paymentType === 'monthly' ? ' · משכורת חודשית' : ` · ${s.workplace.rate} ₪ לשעה`
            }`}
          />
        ))}
      </Panel>

      <Panel title="שבוע עבודה טיפוסי" subtitle="ממוצע שעות אקדמיות ביום עבודה, לפי יום בשבוע">
        {view.weekdays.map((w) => (
          <ShareRow
            key={w.weekday}
            label={`יום ${w.label}`}
            value={`${hoursText(w.avgAcademicHours)} שע׳`}
            fraction={w.avgAcademicHours / maxWeekday}
            sub={`${w.days} ימים שדווחו`}
          />
        ))}
      </Panel>

      <Panel
        title="עיגול שעות"
        subtitle="מה קרה לדקות שאינן משלימות שעה אקדמית (45 דק׳) בכל דיווח"
      >
        <TileGrid>
          <StatTile label="דיווחים עגולים" value={String(r.exact)} sub="שעות אקדמיות שלמות בדיוק" />
          <StatTile label="עם דקות עודפות" value={String(r.withLeftover)} sub={`${Math.round((r.withLeftover / roundingTotal) * 100)}% מהדיווחים`} />
          <StatTile label="הועברו למונה" value={String(r.carried)} sub={`${r.carriedMinutes} דק׳ ≈ ${hoursText(academicHours(r.carriedMinutes))} שע׳ אקד׳`} />
          <StatTile label="נכללו בדיווח" value={String(r.included)} sub="שולמו כחלק משעה" />
        </TileGrid>
        <ShareRow
          label="שיעור הדקות שהועברו למונה"
          value={`${Math.round((r.carried / (r.withLeftover || 1)) * 100)}%`}
          fraction={r.carried / (r.withLeftover || 1)}
        />
        <Button label="למונה הדקות המצטברות" variant="secondary" onPress={() => router.push('/settings')} />
      </Panel>
    </Screen>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    modeRow: { flexDirection: 'row', gap: spacing.sm },
    modeChip: {
      minHeight: 36,
      paddingHorizontal: 14,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      justifyContent: 'center',
    },
    modeChipOn: { backgroundColor: colors.brand, borderColor: colors.brand },
    modeText: { fontSize: 14, fontWeight: '600', color: colors.text },
    modeTextOn: { color: colors.textOnBrand },
    periodHead: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, marginTop: spacing.sm },
    periodTitle: { fontSize: 18, fontWeight: '800', color: colors.text, textAlign: TEXT_RIGHT },
    periodSub: { fontSize: 13, color: colors.textMuted, textAlign: TEXT_RIGHT },
    link: { fontSize: 14, fontWeight: '700', color: colors.brand },
    totalsRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      backgroundColor: colors.brandLight,
      borderRadius: radius.md,
      padding: spacing.md,
    },
    totalLabel: { fontSize: 12, color: colors.textMuted, textAlign: TEXT_RIGHT },
    totalValue: { fontSize: 20, fontWeight: '800', color: colors.text, textAlign: TEXT_RIGHT },
    totalPlanned: { color: colors.brandDark },
    wpCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      padding: 14,
      borderRadius: 16,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    wpFaded: { opacity: 0.55 },
    wpMain: { flex: 1, gap: 6 },
    wpHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    dot: { width: 12, height: 12, borderRadius: 6 },
    wpName: { flex: 1, fontSize: 16, fontWeight: '700', color: colors.text, textAlign: TEXT_RIGHT },
    chip: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 10 },
    chipText: { fontSize: 12, fontWeight: '700' },
    wpAmounts: { fontSize: 14, color: colors.text, textAlign: TEXT_RIGHT },
    bold: { fontWeight: '800' },
    muted: { color: colors.textMuted },
    wpMeta: { fontSize: 13, color: colors.textMuted, textAlign: TEXT_RIGHT },
    drill: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.brandLight,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sectionTitle: {
      marginTop: spacing.lg,
      fontSize: 18,
      fontWeight: '800',
      color: colors.text,
      textAlign: TEXT_RIGHT,
    },
    center: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    intro: {
      gap: spacing.xs,
    },
    title: {
      fontSize: 22,
      fontWeight: '800',
      color: colors.text,
      textAlign: TEXT_RIGHT,
    },
    subtitle: {
      fontSize: 13,
      lineHeight: 20,
      color: colors.textMuted,
      textAlign: TEXT_RIGHT,
    },
    empty: {
      gap: spacing.md,
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.lg,
    },
    emptyText: {
      fontSize: 14,
      lineHeight: 21,
      color: colors.textMuted,
      textAlign: TEXT_RIGHT,
    },
    pressed: {
      opacity: 0.7,
    },
    payRow: {
      gap: 4,
      paddingBottom: spacing.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    payHead: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: spacing.sm,
    },
    payName: {
      flex: 1,
      fontSize: 14,
      fontWeight: '700',
      color: colors.text,
      textAlign: TEXT_RIGHT,
    },
    payAmount: {
      fontSize: 15,
      fontWeight: '800',
      color: colors.brandDark,
    },
    payMeta: {
      fontSize: 12,
      color: colors.textMuted,
      textAlign: TEXT_RIGHT,
    },
  });
