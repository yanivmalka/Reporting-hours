import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { Icon } from '../components/Icon';
import { Text } from '../components/Text';
import { Pressable } from '../components/Pressable';
import { SelectField } from '../components/SelectField';
import { RangeCalendar, type DateRangeValue } from '../components/RangeCalendar';
import { useDayStatus } from '../components/DayDot';
import { WeekStrip, monthOfWeek, shiftWeek, weekStartOf } from '../components/WeekStrip';
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
import { PlanList, SessionRow, buildSessionRows, openSession, type SessionRowData } from '../components/PlanList';
import { readJSON, writeJSON } from '../lib/storage';
import { SegmentedControl } from '../components/SegmentedControl';
import { loadCourses, type Course } from '../lib/courses';
import { Screen } from '../components/Screen';
import { reportPay } from '../lib/pay';
import { usePayBasis } from '../lib/payBasis';
import { loadReports, type WorkReport } from '../lib/reports';
import { formatShekels, travelCostForDay } from '../lib/travel';
import { isLocked, loadPayrollStatus, statusKey, type PayrollStatus } from '../lib/payroll';
import { activeWorkplaces, isArchived, loadWorkplaces, type Workplace } from '../lib/workplaces';
import { useTheme } from '../theme/ThemeContext';
import { useThemedStyles } from '../theme/useThemedStyles';
import { radius, spacing, type AppColors } from '../theme/colors';
import { TEXT_RIGHT } from '../theme/align';
import { workplaceColor } from '../theme/workplaceColors';

/**
 * מצב התאריכון ביומן: 'auto' — התאריכון המלא מתחלף בפס השבוע בגלילה;
 * 'full' — התאריכון המלא נעוץ; 'week' — פס השבוע נעוץ, במקום התאריכון המלא.
 * (ערך ישן true = 'full'.)
 */
type CalMode = 'auto' | 'full' | 'week';
const CAL_PIN_KEY = 'reporting-hours/journal-calendar-pin/v1';

/** מיון: תאריך יורד, ובאותו תאריך לפי סדר ההזנה היורד. */
function byNewest(a: WorkReport, b: WorkReport): number {
  if (a.date !== b.date) return a.date < b.date ? 1 : -1;
  return b.createdAt - a.createdAt;
}

/**
 * "יומן": תכנון ודיווחים בדף אחד, עם בורר "תכנון · דיווחים". התאריכון, השורה
 * המוצמדת וסינון מקום העבודה משותפים. ?tab=reports פותח על "דיווחים"
 * (ברירת המחדל — "תכנון").
 */
export default function ReportsScreen() {
  const router = useRouter();
  const styles = useThemedStyles(makeStyles);
  const { colors } = useTheme();
  const { basis } = usePayBasis();
  const [reports, setReports] = useState<WorkReport[] | null>(null);
  const [workplaces, setWorkplaces] = useState<Workplace[]>([]);
  // סינון התחלתי יכול להגיע מלוח הבקרה: ?wp=<מזהה>&when=current|previous|YYYY-MM
  const params = useLocalSearchParams<{
    wp?: string;
    when?: string;
    from?: string;
    to?: string;
    n?: string;
    tab?: string;
    /** יום לגלול אליו ולסמן (למשל "הקורס הבא" מדף הבית) */
    day?: string;
  }>();
  const [tab, setTab] = useState<'plan' | 'reports'>(params.tab === 'reports' ? 'reports' : 'plan');
  useEffect(() => {
    if (params.tab === 'reports' || params.tab === 'plan') setTab(params.tab);
  }, [params.tab, params.n]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [reloadTick, setReloadTick] = useState(0);
  const [statuses, setStatuses] = useState<Record<string, PayrollStatus>>({});
  /** סינון: מזהה מקום עבודה; null = הכול */
  const [wpFilter, setWpFilter] = useState<string | null>(params.wp || null);
  /** החודש המוצג בלוח השנה, "YYYY-MM" — ברירת מחדל: החודש הנוכחי */
  const [calMonth, setCalMonth] = useState(() => todayISO().slice(0, 7));
  /** טווח שנבחר בלוח (רק במצב "בחירת טווח"); null = כל החודש */
  const [range, setRange] = useState<DateRangeValue>(null);
  /** מצב "בחירת טווח" — רק כשהתיבה מסומנת לחיצה על ימים בוחרת טווח ומסננת */
  const [rangeMode, setRangeMode] = useState(false);
  /** בלי בחירת טווח: היום שנבחר בלחיצה — הרשימה נגללת אליו, בלי סינון */
  const [focusDay, setFocusDay] = useState<string | null>(null);
  /** כל הדיווחים, בלי הגבלת חודש */
  /**
   * "חודש נוכחי / קודם" לפי יום התשלום של כל מקום עבודה (מגיע מלוח הבקרה,
   * כשלא נבחר מקום עבודה יחיד) — גובר על לוח השנה עד שמנקים.
   */
  const [periodMode, setPeriodMode] = useState<'current' | 'previous' | null>(null);
  /** ראש לוח השנה החודשי בתוך הגלילה — כשהוא נגלל החוצה מוצג פס השבוע המוצמד */
  const [calTop, setCalTop] = useState<number | null>(null);
  const [calHeight, setCalHeight] = useState(0);
  const [pinned, setPinned] = useState(false);
  /** נעיצת התאריכון המלא: מוצמד כמו שהוא, בלי מעבר לפס השבוע */
  const [calMode, setCalModeState] = useState<CalMode>('auto');
  useEffect(() => {
    readJSON<unknown>(CAL_PIN_KEY, 'auto').then((v) =>
      setCalModeState(v === true || v === 'full' ? 'full' : v === 'week' ? 'week' : 'auto'),
    );
  }, []);
  const setCalMode = (m: CalMode) => {
    setCalModeState(m);
    setPinned(false);
    void writeJSON(CAL_PIN_KEY, m);
  };
  const calPin = calMode === 'full';
  const toggleCalPin = () => setCalMode(calPin ? 'auto' : 'full');
  /** היום שמסומן בתאריכון לפי הגלילה — האריח שמתחת לתחתית התאריכון המוצמד */
  const [scrollDay, setScrollDay] = useState<string | null>(null);
  /** גובה הפס / התאריכון המוצמד (נמדד) — כדי שהיום שגוללים אליו לא יוסתר מתחתיו */
  const [weekStripHeight, setStripHeight] = useState(120);
  /** גובה התאריכון הנעוץ כשהוא מוצמד (נמדד) */
  const [pinCalHeight, setPinCalHeight] = useState(360);
  const stripHeight = calPin ? pinCalHeight : weekStripHeight;
  const scrollRef = useRef<ScrollView>(null);
  /** מיקומי הימים ברשימה הנוכחית: ראש הרשימה + y של כל יום (המופע העליון) */
  const listTop = useRef(0);
  const dayPos = useRef<{ key: string; map: Map<string, { y: number; bottom: number }> }>({
    key: '',
    map: new Map(),
  });
  /** גלילה שממתינה למדידת הרשימה: ליום מסוים, או לתחילת שבוע */
  const pending = useRef<{ kind: 'day' | 'week'; date: string } | null>(null);
  const resolveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** בזמן גלילה יזומה (מעבר ליום / לשבוע) — הפס לא עוקב אחרי הגלילה */
  const autoScrollUntil = useRef(0);
  /** השבוע שמוצג בפס המכווץ (יום ראשון שלו) */
  const [weekStart, setWeekStart] = useState(() => weekStartOf(todayISO()));

  // פס השבוע עוקב אחרי החודש / הבחירה בלוח החודשי: אם השבוע שמוצג כבר לא
  // שייך אליהם — קופצים לשבוע של תחילת הבחירה, של היום (בחודש הנוכחי) או ל־1 בחודש.
  useEffect(() => {
    setWeekStart((ws) => {
      const sel = range ?? (focusDay ? { from: focusDay, to: focusDay } : null);
      if (sel) {
        const end = shiftWeek(ws, 1);
        return sel.from >= ws && sel.from < end ? ws : weekStartOf(sel.from);
      }
      if (monthOfWeek(ws) === calMonth) return ws;
      const today = todayISO();
      return weekStartOf(today.startsWith(calMonth) ? today : `${calMonth}-01`);
    });
  }, [calMonth, range, focusDay]);

  /** הגלילה בפועל: לפי המיקומים שנמדדו, מתחת לפס המוצמד, בגלילה מונפשת. */
  function resolveScroll() {
    const p = pending.current;
    if (!p) return;
    const dates = [...dayPos.current.map.keys()].sort();
    let target: string | undefined;
    if (p.kind === 'week') {
      const end = shiftWeek(p.date, 1);
      target = dates.find((d) => d >= p.date && d < end);
    } else {
      target = dates.find((d) => d >= p.date) ?? dates[dates.length - 1];
    }
    pending.current = null;
    if (!target) return;
    const y = listTop.current + (dayPos.current.map.get(target)?.y ?? 0);
    autoScrollUntil.current = Date.now() + 700;
    scrollRef.current?.scrollTo({ y: Math.max(0, y - stripHeight - 8), animated: true });
  }

  /**
   * הגלילה מסמנת יום בתאריכון: האריח הראשון שמתחת לתחתית הפס / התאריכון
   * המוצמד. גם פס השבוע עוקב אחריו.
   */
  function followScroll(y: number) {
    if (Date.now() < autoScrollUntil.current) return;
    const edge = y + stripHeight - listTop.current;
    let top: string | null = null;
    let topY = Infinity;
    for (const [date, pos] of dayPos.current.map) {
      if (pos.bottom > edge + 4 && pos.y < topY) {
        top = date;
        topY = pos.y;
      }
    }
    if (!top) return;
    if (top !== scrollDay) setScrollDay(top);
    const ws = weekStartOf(top);
    if (ws !== weekStart) setWeekStart(ws);
  }

  /** מבקש גלילה — מתבצעת אחרי שהרשימה (אולי של חודש אחר) נמדדה. */
  function requestScroll(kind: 'day' | 'week', date: string) {
    pending.current = { kind, date };
    scheduleResolve();
  }

  function scheduleResolve() {
    if (!pending.current) return;
    if (resolveTimer.current) clearTimeout(resolveTimer.current);
    resolveTimer.current = setTimeout(resolveScroll, 120);
  }

  /** מדידת יום ברשימה — המופע העליון של כל תאריך. */
  function onDayLayout(date: string, y: number, height: number) {
    const map = dayPos.current.map;
    const prev = map.get(date);
    map.set(date, {
      y: prev == null ? y : Math.min(prev.y, y),
      bottom: prev == null ? y + height : Math.max(prev.bottom, y + height),
    });
    scheduleResolve();
  }

  /** לחיצה על יום בלי בחירת טווח: מסמנים אותו וגוללים אליו ברשימה. */
  function focusOn(day: string) {
    setFocusDay(day);
    setScrollDay(null);
    if (day.slice(0, 7) !== calMonth) setCalMonth(day.slice(0, 7));
    requestScroll('day', day);
  }

  /** מעבר שבוע בפס המכווץ — החודש המוצג ברשימה מתעדכן, והרשימה נגללת לתחילת השבוע. */
  function changeWeek(ws: string) {
    setWeekStart(ws);
    requestScroll('week', ws);
    const mm = monthOfWeek(ws);
    if (mm !== calMonth) {
      setCalMonth(mm);
      const end = shiftWeek(ws, 1);
      if (range && (range.to < ws || range.from >= end)) setRange(null);
    }
  }

  function goToday() {
    const today = todayISO();
    setRange(null);
    setFocusDay(null);
    setCalMonth(today.slice(0, 7));
    setWeekStart(weekStartOf(today));
  }

  // ?day=YYYY-MM-DD — גלילה ליום וסימונו בתאריכון.
  useEffect(() => {
    if (!params.day || !/^\d{4}-\d{2}-\d{2}$/.test(params.day)) return;
    setRangeMode(false);
    setRange(null);
    setPeriodMode(null);
    focusOn(params.day);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.day, params.n]);

  // סינון שמגיע מלוח הבקרה: ?wp=<מזהה>&when=current|previous|YYYY-MM
  useEffect(() => {
    if (params.wp !== undefined) setWpFilter(params.wp || null);
    const when = params.when;
    if (when === undefined) return;
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
        setRangeMode(true);
        setRange({ from: p.start, to: p.end });
      } else if (!params.wp) {
        setPeriodMode(when);
      }
    }
    // טווח מפורש (למשל "6 החודשים האחרונים" מלוח הבקרה)
  }, [params.wp, params.when, params.n, workplaces]);

  useEffect(() => {
    if (params.from && params.to) {
      setPeriodMode(null);
      setCalMonth(params.to.slice(0, 7));
      setRangeMode(true);
      setRange({ from: params.from, to: params.to });
    }
  }, [params.from, params.to, params.n]);

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
      if (range) return r.date >= range.from && r.date <= range.to;
      return r.date.startsWith(calMonth);
    });
  }, [byWorkplace, workplaces, periodMode, range, calMonth]);

  // מספר הדיווחים לכל יום — לסימון בלוח השנה (לפי סינון מקום העבודה).
  const counts = useMemo(() => {
    const out: Record<string, number> = {};
    for (const r of byWorkplace) out[r.date] = (out[r.date] ?? 0) + 1;
    return out;
  }, [byWorkplace]);

  // נקודות המצב בתאריכונים — לפי סינון מקום העבודה.
  const statusInput = useMemo(
    () =>
      wpFilter && reports
        ? {
            courses: courses.filter((c) => c.workplaceId === wpFilter),
            workplaces: workplaces.filter((w) => w.id === wpFilter),
            reports: reports.filter((r) => r.workplaceId === wpFilter),
          }
        : undefined,
    [wpFilter, reports, courses, workplaces],
  );
  const filteredStatus = useDayStatus(statusInput);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      Promise.all([loadReports(), loadWorkplaces(), loadPayrollStatus(), loadCourses()]).then(([r, w, st, crs]) => {
        if (!active) return;
        setCourses(crs);
        setStatuses(st);
        setReports([...r].sort(byNewest));
        setWorkplaces(w);
      });
      return () => {
        active = false;
      };
    }, [reloadTick]),
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

  // כל מקומות העבודה הפעילים, וגם מקום בארכיון שיש לו דיווחים או קורסים —
  // לא רק מקומות שכבר דווחו בהם (בתכנון מופיעים גם מקומות בלי דיווח).
  const filterWorkplaces = workplaces.filter(
    (w) =>
      !isArchived(w) ||
      reports.some((r) => r.workplaceId === w.id) ||
      courses.some((c) => c.workplaceId === w.id),
  );
  const wpOptions = [
    { value: null, label: 'הכול' },
    ...filterWorkplaces.map((w) => ({ value: w.id, label: w.name, color: workplaceColor(colors, w) })),
  ];
  const totals = totalsFor(
    wpFilter ? workplaces.filter((w) => w.id === wpFilter) : workplaces,
    filtered,
    basis,
  );
  // נסיעות: מוצגות בדיווח הראשון (לפי שעה) של המקום באותו יום.
  const firstOfDay = new Map<string, string>();
  for (const r of [...(reports ?? [])].sort((a, b) => a.start.localeCompare(b.start))) {
    const k = `${r.workplaceId}|${r.date}`;
    if (!firstOfDay.has(k)) firstOfDay.set(k, r.id);
  }
  const travelOf = (r: WorkReport): number | null | undefined => {
    const w = workplaceOf(r.workplaceId);
    if (!w) return undefined;
    const cost = travelCostForDay(w, r.date);
    if (cost <= 0) return undefined;
    return firstOfDay.get(`${r.workplaceId}|${r.date}`) === r.id ? cost : null;
  };
  /** תחילת החודש (לפי יום התשלום) של הדוח לשכר שנשלח ונועל את הדיווח, או null */
  const lockOf = (r: WorkReport): string | null => {
    const w = workplaceOf(r.workplaceId);
    if (!w) return null;
    const [y, m, d] = r.date.split('-').map(Number);
    const p = currentPayPeriod(w.payday, new Date(y, m - 1, d));
    return isLocked(statuses[statusKey(w.id, p.start)]) ? p.start : null;
  };

  // חלון התכנון: הטווח שנבחר, או החודש שבתאריכון.
  const [cy, cm] = calMonth.split('-').map(Number);
  const planFrom = range ? range.from : `${calMonth}-01`;
  const planTo = range ? range.to : `${calMonth}-${String(new Date(cy, cm, 0).getDate()).padStart(2, '0')}`;

  // "דיווחים": גם מפגשים שעוד לא דווחו — של היום ("ממתין") ושעברו ("חסר").
  // מפגשים עתידיים שייכים ל"תכנון" ולא מוצגים כאן.
  const dueWorkplaces = activeWorkplaces(workplaces).filter((w) => !wpFilter || w.id === wpFilter);
  const today = todayISO();
  const dueRows: SessionRowData[] =
    tab !== 'reports'
      ? []
      : periodMode
        ? dueWorkplaces.flatMap((w) => {
            const p = periodMode === 'current' ? currentPayPeriod(w.payday) : previousPayPeriod(w.payday);
            return buildSessionRows(courses, [w], reports, p.start, p.end > today ? today : p.end);
          })
        : planFrom > today
          ? []
          : buildSessionRows(courses, dueWorkplaces, reports, planFrom, planTo > today ? today : planTo);
  const due = dueRows.filter((r) => r.status === 'pending' || r.status === 'missing');
  type Item = { kind: 'report'; report: WorkReport } | { kind: 'session'; row: SessionRowData };
  const items: Item[] = [
    ...filtered.map((report) => ({ kind: 'report' as const, report })),
    ...due.map((row) => ({ kind: 'session' as const, row })),
  ].sort((a, b) => {
    const da = a.kind === 'report' ? a.report.date : a.row.date;
    const db = b.kind === 'report' ? b.report.date : b.row.date;
    if (da !== db) return da < db ? 1 : -1;
    const sa = a.kind === 'report' ? a.report.start : a.row.course.start;
    const sb = b.kind === 'report' ? b.report.start : b.row.course.start;
    return sa.localeCompare(sb);
  });
  const missingCount = due.filter((r) => r.status === 'missing').length;
  const pendingCount = due.length - missingCount;

  const isFiltered = wpFilter != null || range != null || periodMode != null;
  const timeLabel = periodMode
    ? periodMode === 'current'
      ? 'חודש נוכחי — לפי יום התשלום של כל מקום'
      : 'חודש קודם — לפי יום התשלום של כל מקום'
    : range
      ? range.from === range.to
        ? longDate(range.from)
        : dateRange(range.from, range.to, true)
      : monthName(calMonth);

  // מיקומי הימים שנמדדו שייכים לרשימה מסוימת — בכל שינוי שלה מתחילים מחדש.
  const listKey = `${tab}|${planFrom}|${planTo}|${wpFilter}|${periodMode}|${reloadTick}|${reports.length}`;
  if (dayPos.current.key !== listKey) dayPos.current = { key: listKey, map: new Map() };

  /** הסימון בתאריכון: הטווח (במצב טווח) או היום שאליו גוללים */
  const markDay = (pinned ? scrollDay : null) ?? focusDay;
  const shownRange: DateRangeValue = rangeMode ? range : markDay ? { from: markDay, to: markDay } : null;
  const dayPress = rangeMode ? undefined : focusOn;

  const showCalendar = !periodMode;
  const calendar = (
    <RangeCalendar
      month={calMonth}
      onMonthChange={(m) => {
        setCalMonth(m);
        setRange(null);
        setFocusDay(null);
        setScrollDay(null);
      }}
      range={shownRange}
      onRangeChange={setRange}
      onDayPress={dayPress}
      counts={counts}
      statusOf={filteredStatus}
    />
  );
  const calActions = (
    <View style={styles.calActions}>
      <Pressable
        onPress={() => {
          setRangeMode((on) => !on);
          setRange(null);
          setFocusDay(null);
        }}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: rangeMode }}
        hitSlop={6}
        style={styles.checkRow}
      >
        <Icon
          name={rangeMode ? 'checkbox-marked' : 'checkbox-blank-outline'}
          size={22}
          color={rangeMode ? colors.brand : colors.textMuted}
        />
        <Text style={styles.checkText}>בחירת טווח</Text>
      </Pressable>
      <View style={{ flex: 1 }} />
      {range ? (
        <Pressable onPress={() => setRange(null)} hitSlop={8}>
          <Text style={styles.clear}>ניקוי — כל החודש</Text>
        </Pressable>
      ) : null}
      <Pressable
        onPress={() => {
          goToday();
          requestScroll('day', todayISO());
        }}
        accessibilityRole="link"
        hitSlop={8}
        style={styles.todayLink}
      >
        <Icon name="calendar-today" size={16} color={colors.brandDark} />
        <Text style={styles.todayText}>היום</Text>
      </Pressable>
      <Pressable
        onPress={toggleCalPin}
        accessibilityRole="switch"
        accessibilityState={{ checked: calPin }}
        accessibilityLabel={calPin ? 'ביטול נעיצת התאריכון' : 'נעיצת התאריכון המלא'}
        hitSlop={8}
        style={[styles.pinBtn, calPin && styles.pinBtnOn]}
      >
        <Icon name={calPin ? 'pin' : 'pin-outline'} size={18} color={calPin ? colors.textOnBrand : colors.textMuted} />
        <Text style={[styles.pinText, calPin && styles.pinTextOn]}>{calPin ? 'נעוץ' : 'נעץ'}</Text>
      </Pressable>
    </View>
  );
  const weekStrip = (
        <WeekStrip
          weekStart={weekStart}
          onWeekChange={changeWeek}
          onToday={() => {
            goToday();
            requestScroll('day', todayISO());
          }}
          range={shownRange}
          onRangeChange={setRange}
          onDayPress={dayPress}
          counts={counts}
          onTitlePress={() => {
            if (calMode === 'week') setCalMode('auto');
            scrollRef.current?.scrollTo({ y: 0, animated: true });
          }}
          onExpand={() => {
            if (calMode === 'week') setCalMode('auto');
            scrollRef.current?.scrollTo({ y: 0, animated: true });
          }}
          pinned={calMode === 'week'}
          onPin={() => setCalMode(calMode === 'week' ? 'auto' : 'week')}
          statusOf={filteredStatus}
          extra={
            <SelectField<string | null>
              compact
              title="סינון לפי מקום עבודה"
              value={wpFilter}
              active={wpFilter != null}
              onChange={setWpFilter}
              options={wpOptions}
            />
          }
        />
  );
  const strip =
    showCalendar && pinned && calPin ? (
      <View style={styles.pinnedCal} onLayout={(e) => setPinCalHeight(e.nativeEvent.layout.height)}>
        {calendar}
        {calActions}
      </View>
    ) : showCalendar && pinned ? (
      <View style={styles.pinnedStrip} onLayout={(e) => setStripHeight(e.nativeEvent.layout.height)}>
        {weekStrip}
      </View>
    ) : null;

  return (
    <Screen
      overlay={strip}
      scrollRef={scrollRef}
      onScroll={(e) => {
        const y = e.nativeEvent.contentOffset.y;
        // הפס המוצמד מחליף את התאריכון החודשי רק כשהתאריכון כמעט כולו נגלל
        // מתחתיו — כך לא מוצגים שניהם יחד. תאריכון נעוץ — מוצמד כמו שהוא
        // מהרגע שראשו מגיע לראש המסך.
        const next =
          calTop != null && calHeight > 0 && (calMode !== 'auto' ? y > calTop : y > calTop + calHeight - weekStripHeight);
        if (next !== pinned) {
          setPinned(next);
          if (!next) setScrollDay(null);
        }
        if (next) followScroll(y);
      }}
    >
      <SegmentedControl<'plan' | 'reports'>
        options={[
          { value: 'plan', label: 'תכנון' },
          { value: 'reports', label: 'דיווחים' },
        ]}
        value={tab}
        onChange={setTab}
      />
      <View style={styles.filters}>
        <SelectField<string | null>
          label="מקום עבודה:"
          title="סינון לפי מקום עבודה"
          value={wpFilter}
          active={wpFilter != null}
          onChange={setWpFilter}
          options={wpOptions}
        />
      </View>

      {periodMode ? null : (
        <>
          <View
            onLayout={(e) => {
              setCalTop(e.nativeEvent.layout.y);
              setCalHeight(e.nativeEvent.layout.height);
            }}
            style={pinned ? styles.calHidden : undefined}
          >
          {calMode === 'week' ? weekStrip : calendar}
          </View>
          <View style={pinned && calPin ? styles.calHidden : undefined}>{calActions}</View>
        </>
      )}

      {tab === 'plan' ? (
        <View onLayout={(e) => (listTop.current = e.nativeEvent.layout.y)}>
        <PlanList
          onDayLayout={onDayLayout}
          courses={courses}
          workplaces={workplaces}
          reports={reports}
          from={planFrom}
          to={planTo}
          wpFilter={wpFilter}
          basis={basis}
          onChanged={() => setReloadTick((n) => n + 1)}
        />
        </View>
      ) : (
        <>
      <View style={styles.summary}>
        <Text style={styles.summaryLine}>{timeLabel}</Text>
        <Text style={styles.summaryTitle}>
          {filtered.length} דיווחים · {totals.days} ימי עבודה
          {missingCount ? ` · ${missingCount} חסרים` : ''}
          {pendingCount ? ` · ${pendingCount} ממתינים` : ''}
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
              setPeriodMode(null);
            }}
          >
            <Text style={styles.clear}>ניקוי סינון</Text>
          </Pressable>
        ) : null}
      </View>

      {items.length === 0 && reports.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>עדיין לא נשמרו דיווחים.</Text>
        </View>
      ) : items.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>אין דיווחים שמתאימים לסינון.</Text>
        </View>
      ) : (
        <View style={styles.list} onLayout={(e) => (listTop.current = e.nativeEvent.layout.y)}>
          {items.map((item) =>
            item.kind === 'session' ? (
              <View
                key={`s:${item.row.course.id}@${item.row.date}`}
                style={styles.dueCard}
                onLayout={(e) => onDayLayout(item.row.date, e.nativeEvent.layout.y, e.nativeEvent.layout.height)}
              >
                <SessionRow row={item.row} showDate onPress={() => openSession(router, item.row)} />
              </View>
            ) : (
              <View
                key={item.report.id}
                onLayout={(e) =>
                  onDayLayout(item.report.date, e.nativeEvent.layout.y, e.nativeEvent.layout.height)
                }
              >
                <ReportCard
                  report={item.report}
                  workplaceName={nameOf(item.report.workplaceId)}
                  color={
                    workplaceOf(item.report.workplaceId)
                      ? workplaceColor(colors, workplaceOf(item.report.workplaceId))
                      : undefined
                  }
                  pay={payOf(item.report)}
                  travel={travelOf(item.report)}
                  locked={lockOf(item.report) != null}
                  onPress={() => router.push({ pathname: '/report-view', params: { id: item.report.id } })}
                />
              </View>
            ),
          )}
        </View>
      )}

        </>
      )}

      <View style={styles.action}>
        <Button
          label="דיווח יום עבודה"
          onPress={() =>
            // מסונן למקום עבודה / ליום אחד — האשף נפתח עם אותו מקום ותאריך.
            router.push({
              pathname: '/report',
              params: {
                wp: wpFilter ?? '',
                date: shownRange && shownRange.from === shownRange.to ? shownRange.from : '',
              },
            })
          }
        />
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
  calHidden: {
    opacity: 0,
  },
  pinnedCal: {
    backgroundColor: colors.background,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    gap: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  pinnedStrip: {
    backgroundColor: colors.background,
  },
  todayLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  todayText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.brandDark,
    textDecorationLine: 'underline',
  },
  pinBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  pinBtnOn: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },
  pinText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
  },
  pinTextOn: {
    color: colors.textOnBrand,
  },
  dueCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  checkText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
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
