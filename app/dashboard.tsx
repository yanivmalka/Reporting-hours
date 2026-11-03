import { useCallback, useMemo, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { ActivityIndicator, Animated, StyleSheet, View } from 'react-native';
import { Text } from '../components/Text';
import { Pressable } from '../components/Pressable';
import { Button } from '../components/Button';
import { Panel, ShareRow, StatTile, TileGrid } from '../components/Charts';
import { ForecastChart, HEADROOM, realization } from '../components/ForecastChart';
import { useFlash } from '../components/useFlash';
import { useSwipe } from '../components/useSwipe';
import { WorkplaceTile } from '../components/WorkplaceTile';
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
import {
  forecastMonths,
  monthsInView,
  semesterOf,
  shiftAnchor,
  STATUS_LABEL,
  type ChartResolution,
  type ForecastMode,
  type MonthRef,
  type PeriodStatus,
} from '../lib/forecast';
import { hebrewMonthNames, hebrewYearSpan } from '../lib/hebrewDate';
import { loadPayrollStatus, type StatusMap } from '../lib/payroll';
import { usePayBasis } from '../lib/payBasis';
import { todayISO } from '../lib/time';
import { loadReports, type WorkReport } from '../lib/reports';
import { formatShekels } from '../lib/travel';
import { loadWorkplaces, paymentTermsLabel, type Workplace } from '../lib/workplaces';
import { useTheme } from '../theme/ThemeContext';
import { useThemedStyles } from '../theme/useThemedStyles';
import { radius, spacing, type AppColors } from '../theme/colors';
import { distinctShades } from '../theme/shades';
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
  /** רזולוציית הגרף — ברירת מחדל: החודש הנוכחי, עמודה לכל מקום עבודה */
  const [res, setRes] = useState<ChartResolution>('month');
  /** חודש העוגן של התצוגה */
  const [anchor, setAnchor] = useState<MonthRef>(() => {
    const d = new Date();
    return { year: d.getFullYear(), month0: d.getMonth() };
  });
  /** מקום העבודה המסונן; null = כולם */
  const [selWp, setSelWp] = useState<string | null>(null);
  /** חודש מסונן ("YYYY-MM") בתצוגת סמסטר / שנה; null = כל התצוגה */
  const [selMonth, setSelMonth] = useState<string | null>(null);
  const [mode, setMode] = useState<ForecastMode>('work');
  /** אריחי מקומות עבודה פתוחים */
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  /** כיוון הדפדוף האחרון — לאנימציה */
  const [navDir, setNavDir] = useState<1 | -1>(1);
  /** עמוד בלוח הבקרה: 0 — צפי ותשלומים · 1 — סיכום וניתוח (התקופה לפי שכר, פילוחים ומגמות) */
  const [page, setPage] = useState<0 | 1>(0);
  const [pageDir, setPageDir] = useState<1 | -1>(1);
  const pageFlash = useFlash(page, pageDir);
  const pageSwipe = useSwipe(
    () => {
      setPageDir(1);
      setPage(1);
    },
    () => {
      setPageDir(-1);
      setPage(0);
    },
  );
  const listFlash = useFlash(`${res}|${anchor.year}-${anchor.month0}|${selMonth}|${selWp}`, navDir);

  /** דפדוף — אינו סינון: מאפס רק את החודש המסונן (שכבר לא בתצוגה). */
  const shift = (d: 1 | -1) => {
    setNavDir(d);
    setSelMonth(null);
    setAnchor((a) => shiftAnchor(res, a, d));
  };
  const clearFilter = () => {
    setSelWp(null);
    setSelMonth(null);
  };
  const goToday = () => {
    const d = new Date();
    setNavDir(-1);
    setSelMonth(null);
    setRes('month');
    setAnchor({ year: d.getFullYear(), month0: d.getMonth() });
  };

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
        ? forecastMonths(
            monthsInView(res, anchor),
            data.workplaces,
            data.reports,
            data.courses,
            data.statuses,
            basis,
            mode,
          )
        : null,
    [data, basis, res, anchor, mode],
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
  const shades = distinctShades(colors, data.workplaces.length);
  const series = data.workplaces.map((w, i) => ({ id: w.id, color: shades[i], name: w.name }));
  const cells = forecast ?? [];
  const now = new Date();
  const nowRef: MonthRef = { year: now.getFullYear(), month0: now.getMonth() };
  const atNow = anchor.year === nowRef.year && anchor.month0 === nowRef.month0;
  // בלי נתונים בתצוגה: קישור לחודש של הדיווח האחרון (של המקום המסונן, אם יש), או לחודש הנוכחי.
  const lastDate = data.reports
    .filter((r) => !selWp || r.workplaceId === selWp)
    .reduce<string | null>((m, r) => (m == null || r.date > m ? r.date : m), null);
  const lastRef: MonthRef | null = lastDate
    ? { year: Number(lastDate.slice(0, 4)), month0: Number(lastDate.slice(5, 7)) - 1 }
    : null;
  const emptyLink = lastRef
    ? {
        label: `לחודש הדיווח האחרון · ${MONTHS_LONG[lastRef.month0]} ${lastRef.year}`,
        onPress: () => {
          setAnchor(lastRef);
          setRes('month');
        },
      }
    : {
        label: 'לחודש הנוכחי',
        onPress: () => {
          setAnchor(nowRef);
          setRes('month');
        },
      };
  const sem = semesterOf(anchor);
  const chartView =
    res === 'month'
      ? { title: `${MONTHS_LONG[anchor.month0]} ${anchor.year}`, sub: hebrewMonthNames(anchor.year, anchor.month0).join('–') }
      : res === 'year'
        ? { title: String(anchor.year), sub: hebrewYearSpan(anchor.year) }
        : {
            title: `${sem.name} ${sem.start.year}${sem.start.month0 + sem.count > 12 ? `–${String(sem.start.year + 1).slice(2)}` : ''}`,
            sub: cells.length
              ? `${MONTHS_LONG[cells[0].month0]} ${cells[0].year} – ${MONTHS_LONG[cells[cells.length - 1].month0]} ${cells[cells.length - 1].year}`
              : '',
          };
  // ── סינון: מקום עבודה (מסתיר את השאר) וחודש (בסמסטר / שנה) ──
  const shown = series.filter((s) => !selWp || s.id === selWp);
  const inView = selMonth ? cells.filter((m) => m.key === selMonth) : cells;
  const single = res === 'month' || selMonth != null;
  const listTitle = selMonth
    ? (() => {
        const m = cells.find((x) => x.key === selMonth);
        return m ? `${MONTHS_LONG[m.month0]} ${m.year}` : chartView.title;
      })()
    : res === 'year'
      ? `כל ${anchor.year}`
      : chartView.title;
  const rowsAll = data.workplaces.map((w, i) => {
    let reported = 0;
    let planned = 0;
    const periods = inView.flatMap((m) => {
      const c = m.byWorkplace[w.id];
      reported += c?.reported ?? 0;
      planned += c?.planned ?? 0;
      return c?.periods ?? [];
    });
    const last = single ? periods[periods.length - 1] : undefined;
    const active = last && (last.reported > 0 || last.planned > 0) ? last : undefined;
    return { workplace: w, color: series[i].color, reported, planned, last: active };
  });
  const totalAll = {
    reported: rowsAll.reduce((a, r) => a + r.reported, 0),
    planned: rowsAll.reduce((a, r) => a + r.planned, 0),
  };
  const rows = rowsAll
    .filter((r) => (!selWp || r.workplace.id === selWp) && (r.reported > 0 || r.planned > 0 || r.workplace.id === selWp))
    .sort((a, b) => b.reported - a.reported || b.planned - a.planned);
  const sel = selWp ? rowsAll.find((r) => r.workplace.id === selWp) : undefined;
  const scaleRows = Math.max(0, ...rows.map((r) => r.reported)) * HEADROOM || Math.max(1, ...rows.map((r) => r.planned));
  const pctTotal = realization(sel ? sel.reported : totalAll.reported, sel ? sel.planned : totalAll.planned);
  const chipTone = (st: PeriodStatus) =>
    st === 'paid'
      ? { bg: colors.brandLight, fg: colors.brandDark }
      : st === 'sent'
        ? { bg: colors.brandLight, fg: colors.brand }
        : st === 'closed' || st === 'open'
          ? { bg: colors.background, fg: colors.warning }
          : { bg: colors.background, fg: colors.textMuted };
  const detailsOf = (row: (typeof rowsAll)[number]) => {
    const out: { text: string; tone?: 'warn' | 'muted' }[] = [];
    if (row.last) {
      if (mode === 'pay') out.push({ text: `עבור ${monthName(row.last.period.start.slice(0, 7))}` });
      out.push({
        text: `יום אחרון לדיווח שכר ${shortDate(row.last.period.end)} · צפי תשלום ${shortDate(row.last.expected)} · ${paymentTermsLabel(row.workplace)}`,
      });
      if (row.last.late)
        out.push({ text: 'הדוח לא נשלח עד היום האחרון — התשלום נדחה בחודש', tone: 'warn' });
    } else if (!single) {
      out.push({ text: `סיכום ${listTitle} · לחיצה על חודש בגרף מציגה צפי תשלום` });
    }
    if (row.workplace.paymentType === 'monthly') out.push({ text: 'משכורת חודשית קבועה' });
    return out;
  };
  const filtered = selWp != null || selMonth != null;
  const maxWeekday = Math.max(...view.weekdays.map((w) => w.avgAcademicHours), 1);
  const r = view.rounding;
  const roundingTotal = r.exact + r.withLeftover || 1;
  const goPage = (p: 0 | 1) => {
    setPageDir(p > page ? 1 : -1);
    setPage(p);
  };

  return (
    <Screen>
      <View style={styles.pager} accessibilityRole="tablist">
        {(['צפי ותשלומים', 'סיכום וניתוח'] as const).map((label, i) => (
          <Pressable
            key={label}
            onPress={() => goPage(i as 0 | 1)}
            accessibilityRole="tab"
            accessibilityState={{ selected: page === i }}
            style={[styles.pageTab, page === i && styles.pageTabOn]}
          >
            <Text style={[styles.pageTabText, page === i && styles.pageTabTextOn]}>{label}</Text>
          </Pressable>
        ))}
      </View>

      <Animated.View style={[styles.page, pageFlash]} {...pageSwipe}>
      {page === 0 ? (
        <>
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
          res={res}
          onResChange={(v) => {
            setRes(v);
            setSelMonth(null);
          }}
          title={chartView.title}
          subtitle={chartView.sub}
          dir={navDir}
          onPrev={() => shift(-1)}
          onNext={() => shift(1)}
          months={forecast}
          series={shown}
          selectedMonth={selMonth}
          onPickMonth={(m) => setSelMonth((cur) => (cur === m.key ? null : m.key))}
          currentKey={todayISO().slice(0, 7)}
          emptyLink={emptyLink}
          onClearFilter={filtered ? clearFilter : undefined}
          onToday={!atNow || res !== 'month' ? goToday : undefined}
        />
      ) : null}

      <Animated.View style={[styles.periodHead, listFlash]}>
        <Text style={styles.periodTitle}>{listTitle}</Text>
        <Text style={styles.periodSub}>
          {mode === 'pay' ? 'לפי מועד התשלום הצפוי' : 'לפי חודש העבודה'}
          {sel ? ` · מסונן: ${sel.workplace.name}` : ''}
        </Text>
      </Animated.View>

      <View style={styles.totalsBox}>
        <View style={styles.totalsRow}>
          <View>
            <Text style={styles.totalLabel}>{sel ? 'דווח במקום הנבחר' : 'דווח'}</Text>
            <Text style={styles.totalValue}>{money(sel ? sel.reported : totalAll.reported)}</Text>
            {sel ? <Text style={styles.totalOf}>מתוך {money(totalAll.reported)} בכל המקומות</Text> : null}
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={styles.totalLabel}>פוטנציאל</Text>
            <Text style={[styles.totalValue, styles.totalPlanned]}>{money(sel ? sel.planned : totalAll.planned)}</Text>
            {sel ? <Text style={styles.totalOf}>מתוך {money(totalAll.planned)}</Text> : null}
          </View>
        </View>
        <Text style={styles.totalPct}>
          {pctTotal == null
            ? 'אין תכנון קורסים לתקופה'
            : pctTotal > 100
              ? `${pctTotal}% — הדיווח עולה על התכנון`
              : `מימוש ${pctTotal}% מהפוטנציאל`}
        </Text>
      </View>

      {rows.map((row) => (
        <WorkplaceTile
          key={row.workplace.id}
          name={row.workplace.name}
          color={row.color}
          reported={row.reported}
          planned={row.planned}
          scale={scaleRows}
          expanded={open.has(row.workplace.id)}
          onToggle={() =>
            setOpen((cur) => {
              const next = new Set(cur);
              if (next.has(row.workplace.id)) next.delete(row.workplace.id);
              else next.add(row.workplace.id);
              return next;
            })
          }
          status={row.last ? { label: STATUS_LABEL[row.last.status], ...chipTone(row.last.status) } : null}
          details={detailsOf(row)}
          filtered={selWp === row.workplace.id}
          onFilter={() => setSelWp((cur) => (cur === row.workplace.id ? null : row.workplace.id))}
          onOpen={() => router.push({ pathname: '/workplace', params: { id: row.workplace.id } })}
        />
      ))}
      {rows.length === 0 ? <Text style={styles.periodSub}>אין מקומות עבודה עם נתונים בתקופה.</Text> : null}

      <Button label="סיכום וניתוח ←" variant="secondary" onPress={() => goPage(1)} />
        </>
      ) : (
        <>
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
      <Button label="→ צפי ותשלומים" variant="secondary" onPress={() => goPage(0)} />
        </>
      )}
      </Animated.View>
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
    periodHead: { gap: 2, marginTop: spacing.xs },
    periodTitle: { fontSize: 18, fontWeight: '800', color: colors.text, textAlign: TEXT_RIGHT },
    periodSub: { fontSize: 13, color: colors.textMuted, textAlign: TEXT_RIGHT },
    link: { fontSize: 14, fontWeight: '700', color: colors.brand },
    pager: {
      flexDirection: 'row',
      padding: 3,
      gap: 2,
      borderRadius: 22,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    pageTab: { flex: 1, minHeight: 40, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
    pageTabOn: { backgroundColor: colors.brand },
    pageTabText: { fontSize: 14, fontWeight: '700', color: colors.text },
    pageTabTextOn: { color: colors.textOnBrand },
    page: { gap: spacing.md },
    totalsBox: {
      backgroundColor: colors.brandLight,
      borderRadius: radius.md,
      padding: spacing.md,
      gap: spacing.xs,
    },
    totalsRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    totalOf: { fontSize: 12, color: colors.textMuted, textAlign: TEXT_RIGHT },
    totalPct: { fontSize: 13, fontWeight: '700', color: colors.brandDark, textAlign: TEXT_RIGHT },
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
