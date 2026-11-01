import { useCallback, useMemo, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Button } from '../components/Button';
import { BarChart, Panel, ProgressBar, ShareRow, StatTile, TileGrid } from '../components/Charts';
import { Screen } from '../components/Screen';
import { SegmentedControl } from '../components/SegmentedControl';
import { ACADEMIC_HOUR_MINUTES } from '../lib/academic';
import { accumulatedTotal, loadAccumulated, redeemableHours, type AccumulatedEntry } from '../lib/accumulated';
import {
  currentPeriods,
  monthName,
  monthlyTrend,
  roundingStats,
  dateRange,
  shortDate,
  sumTotals,
  weekdayProfile,
  workplaceShares,
} from '../lib/dashboard';
import { usePayBasis } from '../lib/payBasis';
import { loadReports, type WorkReport } from '../lib/reports';
import { formatShekels } from '../lib/travel';
import { loadWorkplaces, paymentTermsLabel, type Workplace } from '../lib/workplaces';
import { useTheme } from '../theme/ThemeContext';
import { useThemedStyles } from '../theme/useThemedStyles';
import { radius, spacing, type AppColors } from '../theme/colors';
import { TEXT_RIGHT } from '../theme/align';

type PeriodChoice = 'current' | 'previous';
type Metric = 'pay' | 'hours' | 'travel';

const TREND_MONTHS = 6;

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

function daysText(n: number): string {
  if (n === 0) return 'היום';
  if (n === 1) return 'מחר';
  return `בעוד ${n} ימים`;
}

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
  } | null>(null);
  const [which, setWhich] = useState<PeriodChoice>('current');
  const [metric, setMetric] = useState<Metric>('pay');

  /** מעבר ל"הדיווחים שלי" עם סינון מוכן. */
  const openReports = (filter: { wp?: string; when?: string }) =>
    router.push({ pathname: '/reports', params: { wp: filter.wp ?? '', when: filter.when ?? '' } });

  useFocusEffect(
    useCallback(() => {
      let active = true;
      Promise.all([loadReports(), loadWorkplaces(), loadAccumulated()]).then(
        ([reports, workplaces, accumulated]) => {
          if (!active) return;
          setData({
            reports,
            workplaces,
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

  if (!data || !view) {
    return (
      <Screen scroll={false}>
        <View style={styles.center}>
          <ActivityIndicator color={colors.brand} />
        </View>
      </Screen>
    );
  }

  if (data.reports.length === 0) {
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
  const metricOf = (t: (typeof view.trend)[number]['totals']) =>
    metric === 'pay' ? t.pay : metric === 'travel' ? t.travel : academicHours(t.netMinutes);
  const metricFormat = (v: number) =>
    metric === 'hours' ? `${hoursText(v)} שע׳ אקדמיות` : money(v);
  const maxWeekday = Math.max(...view.weekdays.map((w) => w.avgAcademicHours), 1);
  const r = view.rounding;
  const roundingTotal = r.exact + r.withLeftover || 1;

  return (
    <Screen>
      <View style={styles.intro}>
        <Text style={styles.title}>לוח בקרה</Text>
        <Text style={styles.subtitle}>
          "החודש" של כל מקום עבודה נמדד מיום התשלום שלו ועד יום התשלום הבא. הקישו על נתון לפירוט.
        </Text>
      </View>

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

      <Panel
        title={which === 'current' ? 'תשלומים קרובים' : 'תשלומים אחרונים'}
        subtitle={
          which === 'current'
            ? 'הסכום שנצבר בכל מקום עבודה עד עכשיו, ומתי ישולם לפי תנאי התשלום (שוטף +)'
            : 'מה ששולם (או ישולם) עבור החודש הקודם'
        }
      >
        {view.periods.map(({ workplace, period, totals: t, expectedPayment, daysToExpected }) => (
          <Pressable
            key={workplace.id}
            style={({ pressed }) => [styles.payRow, pressed && styles.pressed]}
            onPress={() => openReports({ wp: workplace.id, when: which })}
          >
            <View style={styles.payHead}>
              <Text style={styles.payName} numberOfLines={1}>
                {workplace.name}
              </Text>
              <Text style={styles.payAmount}>{money(t.pay)}</Text>
            </View>
            <Text style={styles.payMeta}>
              {dateRange(period.start, period.end)} ·{' '}
              {`תשלום צפוי ${shortDate(expectedPayment)} (${paymentTermsLabel(workplace)}${
                daysToExpected >= 0 ? `, ${daysText(daysToExpected)}` : ', עבר'
              })`}
              {' · '}
              {t.days} ימים
              {workplace.paymentType === 'monthly' ? ' · חודשי' : ` · ${hoursText(academicHours(t.netMinutes))} שע׳ אק׳`}
              {t.travel > 0 ? ` · נסיעות ${formatShekels(t.travel)}` : ''}
            </Text>
            {which === 'current' ? <ProgressBar fraction={period.elapsed} thin /> : null}
          </Pressable>
        ))}
      </Panel>

      <Panel
        title="מגמה חודשית"
        subtitle={`${monthName(view.firstMonth)} עד היום · לפי חודשים קלנדריים · הקישו על עמודה`}
      >
        <SegmentedControl<Metric>
          options={[
            { value: 'pay', label: 'שכר' },
            { value: 'hours', label: 'שעות' },
            { value: 'travel', label: 'נסיעות' },
          ]}
          value={metric}
          onChange={setMetric}
        />
        <BarChart
          data={view.trend.map((p) => ({ key: p.key, label: p.label, value: metricOf(p.totals) }))}
          format={metricFormat}
          onOpen={(key) => openReports({ when: key })}
        />
      </Panel>

      <Panel title="פילוח לפי מקום עבודה" subtitle={`חלק מסך השכר · ${TREND_MONTHS} החודשים האחרונים`}>
        {view.shares.map((s) => (
          <ShareRow
            key={s.workplace.id}
            onPress={() => openReports({ wp: s.workplace.id })}
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
