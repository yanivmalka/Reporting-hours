import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { recallJournal, rememberJournal } from './journalMemory';
import { ScrollView, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { type DateRangeValue } from '../RangeCalendar';
import { useDayStatus } from '../DayDot';
import { monthOfWeek, shiftWeek, weekStartOf } from '../WeekStrip';
import { longDate } from '../DatePicker';
import { todayISO } from '../../lib/time';
import { nearDates, shiftISO } from '../../lib/nearDays';
import { currentPayPeriod, monthName, previousPayPeriod, dateRange, totalsFor } from '../../lib/dashboard';
import { buildSessionRows, type SessionRowData } from '../PlanList';
import { readJSON, writeJSON } from '../../lib/storage';
import { loadCourses, type Course } from '../../lib/courses';
import { reportPay } from '../../lib/pay';
import { usePayBasis } from '../../lib/payBasis';
import { loadReports, type WorkReport } from '../../lib/reports';
import { travelCostForDay } from '../../lib/travel';
import { isLocked, loadPayrollStatus, statusKey, type PayrollStatus } from '../../lib/payroll';
import { activeWorkplaces, isArchived, loadWorkplaces, type Workplace } from '../../lib/workplaces';
import { useTheme } from '../../theme/ThemeContext';
import { useThemedStyles } from '../../theme/useThemedStyles';
import { workplaceColor } from '../../theme/workplaceColors';
import { CalMode, CAL_PIN_KEY, byNewest, monthEnd, shiftMonth } from './shared';
import { getTrackingStart } from '../../lib/trackingStart';
import { makeJournalStyles as makeStyles } from './styles';
import { useScreenData } from '../useScreenData';

/**
 * הלוגיקה של היומן (app/reports.tsx): טעינה, סינון, מצב התאריכון (מלא / פס שבוע /
 * נעוץ), מעקב הגלילה אחרי היום, ובחירת טווח.
 * useJournal — כל ה־hooks; journalView — נגזרות אחרי הטעינה (שורות, סיכומים, טווח התכנון).
 * רכיבי היומן (components/journal) מקבלים את שניהם יחד כ־`w`.
 */
export function useJournal() {
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
  // חזרה ליומן — לאותה לשונית, סינון ויום שמהם יצאו (journalMemory), אלא אם הכתובת קובעת אחרת.
  const recalled = useRef(recallJournal()).current;
  const [tab, setTab] = useState<'plan' | 'reports'>(
    params.tab === 'reports' || params.tab === 'plan' ? params.tab : recalled?.tab ?? 'plan',
  );
  useEffect(() => {
    if (params.tab === 'reports' || params.tab === 'plan') setTab(params.tab);
  }, [params.tab, params.n]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [reloadTick, setReloadTick] = useState(0);
  const [statuses, setStatuses] = useState<Record<string, PayrollStatus>>({});
  /** סינון: מזהה מקום עבודה; null = הכול */
  const [wpFilter, setWpFilter] = useState<string | null>(
    params.wp !== undefined ? params.wp || null : recalled?.wp ?? null,
  );
  /** החודש המוצג בלוח השנה, "YYYY-MM" — ברירת מחדל: החודש הנוכחי */
  const [calMonth, setCalMonth] = useState(() => todayISO().slice(0, 7));
  /**
   * חלון הרשימה הרציפה (חודשים "YYYY-MM", כולל): מתחיל בחודש שבתאריכון ומתרחב
   * בגלילה לסוף הרשימה, או בקישור בראשה. `epoch` גדל כשמיקומי הימים משתנים כולם
   * (איפוס או הוספה בראש) — כדי למדוד אותם מחדש.
   */
  const [win, setWin] = useState(() => {
    const m = todayISO().slice(0, 7);
    return { from: m, to: m, epoch: 0 };
  });
  // חודש שמחוץ לחלון (מעבר חודש, קפיצה ליום / לשבוע) — החלון מתאפס אליו.
  useEffect(() => {
    setWin((w) => (calMonth < w.from || calMonth > w.to ? { from: calMonth, to: calMonth, epoch: w.epoch + 1 } : w));
  }, [calMonth]);
  /** מעבר חודש מפורש בתאריכון — הרשימה מתחילה מחדש מאותו חודש. */
  function resetWindow(m: string) {
    setWin((w) => ({ from: m, to: m, epoch: w.epoch + 1 }));
  }
  /** בחודש הנוכחי הימים שלפני היום מקופלים (אריח היום בראש התכנון) — עד "הצגה" */
  const [earlierShown, setEarlierShown] = useState(false);
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
  const [weekStripHeight, setStripHeight] = useState(170);
  /** שורת הבקרה (תכנון | דיווחים, סינון): ראשה בגלילה — כשהיא נגללת החוצה היא מוצמדת */
  const [ctrlTop, setCtrlTop] = useState<number | null>(null);
  const [ctrlPinned, setCtrlPinned] = useState(false);
  /** גובה שורת הבקרה המוצמדת (נמדד) — התאריכון הנעוץ מוצמד מתחתיה */
  const [ctrlBarHeight, setCtrlBarHeight] = useState(48);
  /** גובה התאריכון הנעוץ כשהוא מוצמד (נמדד) */
  const [pinCalHeight, setPinCalHeight] = useState(410);
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
   * הגלילה מסמנת יום בתאריכון: האריח הראשון שמוצג במלואו מתחת לתחתית הפס /
   * התאריכון המוצמד. גם פס השבוע עוקב אחריו.
   */
  function followScroll(y: number) {
    if (Date.now() < autoScrollUntil.current) return;
    const edge = y + stripHeight - listTop.current;
    // היום הראשון שמוצג במלואו (ראשו מתחת לתחתית הפס); אם אין כזה (אריח גבוה
    // מהמסך) — הראשון שנראה בחלקו.
    let top: string | null = null;
    let topY = Infinity;
    let part: string | null = null;
    let partY = Infinity;
    for (const [date, pos] of dayPos.current.map) {
      if (pos.y >= edge - 4 && pos.y < topY) {
        top = date;
        topY = pos.y;
      }
      if (pos.bottom > edge + 4 && pos.y < partY) {
        part = date;
        partY = pos.y;
      }
    }
    top = top ?? part;
    if (!top) return;
    if (top !== scrollDay) setScrollDay(top);
    const ws = weekStartOf(top);
    if (ws !== weekStart) setWeekStart(ws);
    // ברשימה הרציפה — התאריכון עובר לחודש שבראש הרשימה (בתוך החלון, בלי איפוס).
    const mm = monthOfWeek(ws);
    if (!range && mm !== calMonth && mm >= win.from && mm <= win.to) setCalMonth(mm);
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

  /** מיקום כל פריט ברשימה (לפי מזהה) — ממנו נגזר המופע העליון של כל תאריך. */
  const itemPos = useRef<{ key: string; map: Map<string, { date: string; y: number; bottom: number }> }>({
    key: '',
    map: new Map(),
  });
  /** מדידת פריט ברשימה (`id` — ברירת מחדל התאריך); מעדכן את המופע העליון של התאריך. */
  function onDayLayout(date: string, y: number, height: number, id: string = date) {
    if (itemPos.current.key !== dayPos.current.key) itemPos.current = { key: dayPos.current.key, map: new Map() };
    itemPos.current.map.set(id, { date, y, bottom: y + height });
    let top = Infinity;
    let bottom = -Infinity;
    for (const p of itemPos.current.map.values()) {
      if (p.date !== date) continue;
      top = Math.min(top, p.y);
      bottom = Math.max(bottom, p.bottom);
    }
    dayPos.current.map.set(date, { y: top, bottom });
    scheduleResolve();
  }

  /** מחיקת המיקומים של ימים שלפני התאריך (כשהם מקופלים ולא מוצגים). */
  function dropDaysBefore(date: string) {
    for (const d of dayPos.current.map.keys()) if (d < date) dayPos.current.map.delete(d);
    for (const [id, p] of itemPos.current.map) if (p.date < date) itemPos.current.map.delete(id);
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
    setEarlierShown(false);
    setCalMonth(today.slice(0, 7));
    setWeekStart(weekStartOf(today));
  }

  // חזרה ליומן בלי יום מפורש — גלילה ליום שממנו יצאו.
  useEffect(() => {
    if (params.day || params.when || params.from || !recalled?.day) return;
    focusOn(recalled.day);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // שמירת המקום ביומן לחזרה אליו.
  useEffect(() => {
    rememberJournal({ tab, wp: wpFilter, day: scrollDay ?? focusDay });
  }, [tab, wpFilter, scrollDay, focusDay]);

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
      return r.date >= `${win.from}-01` && r.date <= monthEnd(win.to);
    });
  }, [byWorkplace, workplaces, periodMode, range, win]);

  // ── הרחבת החלון: עד היכן יש מה להציג ──
  const today0 = todayISO();
  const thisMonth = today0.slice(0, 7);
  const trackMonth = getTrackingStart()?.slice(0, 7) ?? null;
  const firstReportMonth = byWorkplace.length ? byWorkplace[byWorkplace.length - 1].date.slice(0, 7) : null;
  const firstCourseMonth = courses.length ? courses.map((c) => c.from).sort()[0].slice(0, 7) : null;
  const lastCourseMonth = courses.length ? courses.map((c) => c.to).sort().slice(-1)[0].slice(0, 7) : null;
  const prevMonth = shiftMonth(win.from, -1);
  const nextMonth = shiftMonth(win.to, 1);
  const canEarlier =
    tab === 'plan'
      ? (firstReportMonth != null && firstReportMonth <= prevMonth) ||
        (firstCourseMonth != null && firstCourseMonth <= prevMonth && (trackMonth == null || trackMonth <= prevMonth))
      : (firstReportMonth != null && firstReportMonth <= prevMonth) ||
        (trackMonth != null && trackMonth <= prevMonth && firstCourseMonth != null && firstCourseMonth <= prevMonth);
  const canLater = tab === 'plan' ? lastCourseMonth != null && nextMonth <= lastCourseMonth : nextMonth <= thisMonth;
  /** הוספת חודש בראש הרשימה (בתכנון — הקודם; בדיווחים, שממוינים מהחדש — הבא), וגלילה אליו. */
  function extendTop() {
    if (tab === 'plan') {
      setEarlierShown(true);
      if (!canEarlier) return;
      setWin((w) => ({ ...w, from: prevMonth, epoch: w.epoch + 1 }));
      requestScroll('day', `${prevMonth}-01`);
    } else {
      if (!canLater) return;
      setWin((w) => ({ ...w, to: nextMonth, epoch: w.epoch + 1 }));
      setCalMonth(nextMonth);
    }
  }
  const extendLock = useRef('');
  /** גלילה לסוף הרשימה מוסיפה את החודש הבא בתורו (בתכנון — הבא; בדיווחים — הקודם). */
  function maybeExtend(e: NativeSyntheticEvent<NativeScrollEvent>) {
    if (range || periodMode) return;
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    if (contentSize.height - contentOffset.y - layoutMeasurement.height > 400) return;
    const key = `${tab}|${win.from}|${win.to}`;
    if (extendLock.current === key) return;
    extendLock.current = key;
    extendBottom();
  }
  /** הוספת חודש בסוף הרשימה (גם בקישור — כשהרשימה קצרה מכדי לגלול). */
  function extendBottom() {
    if (tab === 'plan' ? !canLater : !canEarlier) return;
    setWin((w) => (tab === 'plan' ? { ...w, to: nextMonth } : { ...w, from: prevMonth }));
  }

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

  useScreenData(
    () => Promise.all([loadReports(), loadWorkplaces(), loadPayrollStatus(), loadCourses()]),
    [reloadTick],
    ([r, w, st, crs]) => {
      setCourses(crs);
      setStatuses(st);
      setReports([...r].sort(byNewest));
      setWorkplaces(w);
    },
  );

  return {
    router,
    styles,
    colors,
    basis,
    reports,
    setReports,
    workplaces,
    setWorkplaces,
    params,
    tab,
    setTab,
    courses,
    setCourses,
    reloadTick,
    setReloadTick,
    statuses,
    setStatuses,
    wpFilter,
    setWpFilter,
    calMonth,
    setCalMonth,
    range,
    setRange,
    rangeMode,
    setRangeMode,
    focusDay,
    setFocusDay,
    periodMode,
    setPeriodMode,
    calTop,
    setCalTop,
    calHeight,
    setCalHeight,
    pinned,
    setPinned,
    calMode,
    setCalModeState,
    setCalMode,
    calPin,
    toggleCalPin,
    scrollDay,
    setScrollDay,
    weekStripHeight,
    setStripHeight,
    ctrlTop,
    setCtrlTop,
    ctrlPinned,
    setCtrlPinned,
    ctrlBarHeight,
    setCtrlBarHeight,
    pinCalHeight,
    setPinCalHeight,
    stripHeight,
    scrollRef,
    listTop,
    dayPos,
    pending,
    resolveTimer,
    autoScrollUntil,
    weekStart,
    setWeekStart,
    byWorkplace,
    filtered,
    counts,
    statusInput,
    filteredStatus,
    resolveScroll,
    followScroll,
    requestScroll,
    scheduleResolve,
    onDayLayout,
    dropDaysBefore,
    focusOn,
    changeWeek,
    goToday,
    win,
    resetWindow,
    earlierShown,
    setEarlierShown,
    canEarlier,
    canLater,
    prevMonth,
    nextMonth,
    extendTop,
    extendBottom,
    maybeExtend,
  };
}

export type JournalCore = ReturnType<typeof useJournal>;

/** נגזרות אחרי הטעינה — נקרא רק כשהדיווחים נטענו. */
export function journalView(core: JournalCore & { reports: WorkReport[] }) {
  const { colors, basis, reports, workplaces, tab, courses, reloadTick, statuses, wpFilter, calMonth, win, range, rangeMode, focusDay, periodMode, pinned, scrollDay, dayPos, pending, filtered, focusOn } = core;
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

  // חלון התכנון: הטווח שנבחר, או חלון החודשים של הרשימה הרציפה.
  const [cy, cm] = calMonth.split('-').map(Number);
  const planFrom = range ? range.from : `${win.from}-01`;
  const planTo = range ? range.to : monthEnd(win.to);
  /** פסי חודש ברשימה — כשהיא רציפה (לא טווח ולא תקופת שכר) */
  const continuous = !range && !periodMode;
  /**
   * תכנון בחודש הנוכחי: הימים שלפני שלשום מקופלים — חמשת הימים הקרובים (שלשום
   * עד מחרתיים, עם תגית) בראש הרשימה. שלשום בחודש הקודם — הרשימה מתחילה ממנו.
   */
  const todayIso = todayISO();
  const nearFrom = shiftISO(todayIso, -2);
  const collapsible =
    tab === 'plan' && continuous && win.from === todayIso.slice(0, 7) && !(focusDay && focusDay < nearFrom);
  const collapseBefore = collapsible && !core.earlierShown ? nearFrom : null;
  /** הימים הקודמים הורחבו — אפשר לקפל אותם שוב */
  const expandedBefore = collapsible && core.earlierShown ? nearFrom : null;
  /** הרשימה (בתכנון) מתחילה משלשום גם כשהוא בחודש הקודם */
  const listFrom = collapsible && nearFrom < planFrom ? nearFrom : planFrom;
  /** חמשת הימים הקרובים — מוצגים תמיד ברשימה הרציפה, גם בלי מפגשים */
  const nearDays = continuous ? nearDates(todayIso) : [];

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
  // גם מפגשים שלא התקיימו (בוטל / הועבר) — כדי שהתמונה של כל יום תהיה מלאה.
  const due = dueRows.filter(
    (r) =>
      r.status === 'pending' ||
      r.status === 'now' ||
      r.status === 'missing' ||
      r.status === 'canceled' ||
      r.status === 'moved',
  );
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
  const pendingCount = due.filter((r) => r.status === 'pending' || r.status === 'now').length;
  const offCount = due.filter((r) => r.status === 'canceled' || r.status === 'moved').length;

  const isFiltered = wpFilter != null || range != null || periodMode != null;
  const timeLabel = periodMode
    ? periodMode === 'current'
      ? 'חודש נוכחי — לפי יום התשלום של כל מקום'
      : 'חודש קודם — לפי יום התשלום של כל מקום'
    : range
      ? range.from === range.to
        ? longDate(range.from)
        : dateRange(range.from, range.to, true)
      : win.from === win.to
        ? monthName(win.from)
        : `${monthName(win.from)} – ${monthName(win.to)}`;

  // מיקומי הימים שנמדדו שייכים לרשימה מסוימת — בכל שינוי שלה מתחילים מחדש.
  // הוספת חודש בסוף הרשימה לא מזיזה את הימים שכבר נמדדו — לכן המפתח לא כולל את סוף החלון.
  const listKey = `${tab}|${range ? `${range.from}-${range.to}` : win.epoch}|${wpFilter}|${periodMode}|${reloadTick}|${reports.length}`;
  if (dayPos.current.key !== listKey) dayPos.current = { key: listKey, map: new Map() };
  // ימים מקופלים ("N ימים קודמים החודש") לא מוצגים — מוחקים את המיקומים שנמדדו להם
  // כשהיו מוצגים, אחרת יום מקופל (למשל 9.11) "נמצא" מתחת לפס בגלילה והתאריכון קופץ אליו.
  if (collapseBefore) core.dropDaysBefore(collapseBefore);

  /** הסימון בתאריכון: הטווח (במצב טווח) או היום שאליו גוללים */
  const markDay = (pinned ? scrollDay : null) ?? focusDay;
  const shownRange: DateRangeValue = rangeMode ? range : markDay ? { from: markDay, to: markDay } : null;
  const dayPress = rangeMode ? undefined : focusOn;
  /** האריח של היום שמסומן בתאריכון (בגלילה או בלחיצה) — מודגש ברשימה */
  const selectedDay = rangeMode ? null : markDay;

  const showCalendar = !periodMode;

  return {
    reports,
    workplaceOf,
    nameOf,
    payOf,
    filterWorkplaces,
    wpOptions,
    totals,
    firstOfDay,
    travelOf,
    lockOf,
    cy,
    cm,
    planFrom,
    planTo,
    dueWorkplaces,
    today,
    dueRows,
    due,
    items,
    missingCount,
    pendingCount,
    offCount,
    isFiltered,
    timeLabel,
    listKey,
    markDay,
    selectedDay,
    shownRange,
    dayPress,
    showCalendar,
    continuous,
    collapseBefore,
    expandedBefore,
    listFrom,
    nearDays,
  };
}

/** כל מה שרכיבי התצוגה מקבלים: המצב והפעולות, ונגזרות אחרי הטעינה. */
export type Journal = JournalCore & ReturnType<typeof journalView>;
