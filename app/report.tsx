import { useCallback, useEffect, useRef, useState } from 'react';
import { Stack, useFocusEffect, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { ActivityIndicator, Animated, Keyboard, Modal, PanResponder, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../components/Text';
import { Pressable } from '../components/Pressable';
import { Button } from '../components/Button';
import { useConfirm } from '../components/ConfirmDialog';
import { useSessionCancel, useSessionMove } from '../components/SessionCancelDialog';
import { DatePicker, longDate } from '../components/DatePicker';
import { FormField } from '../components/FormField';
import { TimeInput, type TimeInputHandle } from '../components/TimeInput';
import { Screen } from '../components/Screen';
import { SegmentedControl } from '../components/SegmentedControl';
import { TextField } from '../components/TextField';
import { useToast } from '../components/Toast';
import { useFade } from '../components/useFlash';
import { nextRelevantDay, unreportedOn } from '../lib/home';
import { toAcademic } from '../lib/academic';
import { addAccumulatedMinutes, adjustAccumulated, entryOf } from '../lib/accumulated';
import { formatHours, payableHours, reportPay } from '../lib/pay';
import { usePayBasis } from '../lib/payBasis';
import {
  addReport,
  deleteReport,
  loadReports,
  makeBreakId,
  updateReport,
  EXTRA_SESSION_LABELS,
  type ExtraSessionKind,
  type WorkReport,
} from '../lib/reports';
import { SelectField } from '../components/SelectField';
import { courseReported, courseScheduleLabel, coursesOn, loadCourses, timeRange, type Course } from '../lib/courses';
import { currentPayPeriod } from '../lib/dashboard';
import { isLocked, loadPayrollStatus, statusKey } from '../lib/payroll';
import { formatShekels, hasTravelCost, travelCostForDay } from '../lib/travel';
import { formatDuration, isValidISODate, parseTime, todayISO } from '../lib/time';
import {
  ARRIVAL_MODE_LABELS,
  activeWorkplaces,
  isArchived,
  loadWorkplaces,
  paymentTermsLabel,
  taxPercentOf,
  workplaceAt,
  type Workplace,
} from '../lib/workplaces';
import { useTheme } from '../theme/ThemeContext';
import { useThemedStyles } from '../theme/useThemedStyles';
import { radius, spacing, type AppColors } from '../theme/colors';
import { TEXT_RIGHT } from '../theme/align';
import { useWorkplaceColor } from '../theme/workplaceColors';

/** שורת הפסקה בטופס — משך בדקות נשמר כמחרוזת לעריכה חופשית. */
type BreakRow = { id: string; minutes: string };

type Step = 'date' | 'course' | 'workplace' | 'times' | 'summary' | 'done';

/** מה לעשות עם הדקות שאינן משלימות שעה אקדמית. */
type LeftoverChoice = 'carry' | 'include';

type Errors = {
  workplace?: string;
  date?: string;
  start?: string;
  end?: string;
  breaks?: string;
};

function parseNum(value: string): number {
  return Number(value.replace(',', '.').trim());
}

/** סך דקות ההפסקות מתוך שורות הטופס, תוך התעלמות משורות ריקות / לא תקינות. */
function sumBreaks(rows: BreakRow[]): number {
  return rows.reduce((total, row) => {
    const n = parseNum(row.minutes);
    return total + (Number.isFinite(n) && n > 0 ? n : 0);
  }, 0);
}

/** כמה שניות אחרי שמירה חוזרים אוטומטית (לבית, או לתצוגת הדיווח בעריכה). */
const AUTO_RETURN_SECONDS = 5;

export default function ReportScreen() {
  const router = useRouter();
  const styles = useThemedStyles(makeStyles);
  const { colors } = useTheme();
  const { showToast } = useToast();
  const navigation = useNavigation();
  /** עריכת דיווח קיים: ?id=<מזהה הדיווח> */
  const {
    id: editId,
    wp: presetWp,
    date: presetDate,
    course: presetCourse,
  } = useLocalSearchParams<{ id?: string; wp?: string; date?: string; course?: string }>();
  // מקום עבודה / תאריך שנבחרו מראש (למשל מ"יומן" המסונן) — פעם אחת.
  const presetApplied = useRef(false);
  /**
   * כניסה ישירה — תאריך וקורס ידועים (מהלו״ז, מדיווח חסר, מהתראה): מסך אחד
   * "דיווח מפגש" בלי פס שלבים, עם "שמירה" ו"ביטול" שחוזר למקום המוצא.
   */
  const [direct, setDirect] = useState(Boolean(presetCourse) && !editId);
  /** באשף המלא: דילגנו על בחירת הקורס (מפגש אחד בלבד ביום) — "חזרה" מהשעות לתאריך */
  const [skippedCourse, setSkippedCourse] = useState(false);
  /** הדיווח המקורי בעריכה (לתיקון המונה ולמחיקה) */
  const [editing, setEditing] = useState<WorkReport | null>(null);
  /** בעריכה: הדוח לשכר של החודש נשלח — הדיווח נעול */
  const [lockedStart, setLockedStart] = useState<string | null>(null);
  const confirm = useConfirm();
  const sessionDialog = useSessionCancel();
  const moveDialog = useSessionMove();
  const colorOf = useWorkplaceColor();
  const { basis } = usePayBasis();
  const [workplaces, setWorkplaces] = useState<Workplace[] | null>(null);
  const [existing, setExisting] = useState<WorkReport[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  /** הקורס שנבחר (כשיש כמה קורסים בטווח השעות) */
  const [courseId, setCourseId] = useState<string | null>(null);
  /** מפגש נוסף לקורס (השלמה, הגשה…) — מחוץ למועד הקבוע; null = דיווח רגיל */
  const [extraKind, setExtraKind] = useState<ExtraSessionKind | null>(null);
  /** שלב באשף: תאריך → קורס (או מקום עבודה) → שעות → סיכום → נשמר */
  const [step, setStep] = useState<Step>('date');
  /** האם הגענו לשעות דרך בחירת קורס (קובע לאן "חזרה") */
  const [viaCourse, setViaCourse] = useState(false);
  /** תקציר הדיווח האחרון שנשמר — למסך הסיום */
  const [lastSaved, setLastSaved] = useState<{ text: string; toast: string | null } | null>(null);
  const [touched, setTouched] = useState(false);
  /** 'saved' / 'cancelled' — יציאה מכוונת, בלי אזהרה */
  const [exitReason, setExitReason] = useState<'saved' | 'cancelled' | null>(null);
  const [pendingLeave, setPendingLeave] = useState<Parameters<typeof navigation.dispatch>[0] | null>(null);
  const endRef = useRef<TimeInputHandle>(null);
  // מעבר בין שלבים: עמעום קצר, בלי החלקה.
  const stepFade = useFade(step);

  // ── החלקה בין שלבים ──
  // בעברית השלב הבא נמצא משמאל: החלקה ימינה (כמו דפדוף בספר) — קדימה,
  // החלקה שמאלה — אחורה. הפונקציות מתעדכנות בכל רינדור דרך ref.
  const swipeRef = useRef<{ next: () => void; back: () => void }>({ next: () => {}, back: () => {} });
  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 24 && Math.abs(g.dx) > Math.abs(g.dy) * 2,
      onPanResponderRelease: (_e, g) => {
        if (Math.abs(g.dx) < 60 || Math.abs(g.dx) < Math.abs(g.dy) * 1.5) return;
        if (g.dx > 0) swipeRef.current.next();
        else swipeRef.current.back();
      },
    }),
  ).current;

  const [workplaceId, setWorkplaceId] = useState<string | null>(null);
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [breaks, setBreaks] = useState<BreakRow[]>([]);
  const [leftoverChoice, setLeftoverChoice] = useState<LeftoverChoice>('carry');
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);
  /** ערכים שמולאו מראש (קורס שנבחר במסך הבית) — לא נחשבים "שינוי שלא נשמר" */
  const [baseline, setBaseline] = useState({ start: '', end: '', note: '', breaks: 0 });

  /**
   * פתיחת האשף על תאריך: שלב התאריך עם התאריך כבר בחור; אם ביום יש מפגש
   * אחד בלבד שטרם דווח — דילוג ישיר לשלב השעות עם הקורס הזה.
   */
  function openOnDate(
    d: string,
    crs: readonly Course[] = courses,
    list: readonly Workplace[] = workplaces ?? [],
    reports: readonly WorkReport[] = existing,
  ) {
    setDate(d);
    setErrors({});
    const open = unreportedOn(crs, list, reports, d);
    if (open.length === 1) {
      const c = open[0];
      const breakMin = c.breakMinutes > 0 ? c.breakMinutes : 0;
      setCourseId(c.id);
      setExtraKind(null);
      setWorkplaceId(c.workplaceId);
      setNote(c.name);
      setStart(c.start);
      setEnd(c.end);
      setBreaks(breakMin ? [{ id: makeBreakId(), minutes: String(breakMin) }] : []);
      setBaseline({ start: c.start, end: c.end, note: c.name, breaks: breakMin ? 1 : 0 });
      setViaCourse(true);
      setSkippedCourse(true);
      setStep('times');
      return;
    }
    setSkippedCourse(false);
    setStep('date');
  }

  // נטען מחדש בכל כניסה למסך כדי לשקף מקומות עבודה שנוספו בינתיים.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      Promise.all([loadWorkplaces(), loadReports(), loadCourses(), loadPayrollStatus()]).then(([list, reports, crs, st]) => {
        if (!active) return;
        setCourses(crs);
        setWorkplaces(list);
        setExisting(reports);
        // מצב עריכה — טעינת הדיווח פעם אחת ומילוי הטופס.
        if (editId && !editing) {
          const r = reports.find((x) => x.id === editId);
          if (r) {
            const w = list.find((x) => x.id === r.workplaceId);
            if (w) {
              const [y, m, d] = r.date.split('-').map(Number);
              const p = currentPayPeriod(w.payday, new Date(y, m - 1, d));
              if (isLocked(st[statusKey(w.id, p.start)])) setLockedStart(p.start);
            }
            setEditing(r);
            setWorkplaceId(r.workplaceId);
            setDate(r.date);
            setStart(r.start);
            setEnd(r.end);
            setBreaks(r.breaks.map((b) => ({ id: b.id, minutes: String(b.minutes) })));
            setNote(r.note ?? '');
            setLeftoverChoice(r.carriedMinutes > 0 ? 'carry' : 'include');
            const c =
              (r.courseId ? crs.find((x) => x.id === r.courseId) : undefined) ??
              crs.find((x) => x.workplaceId === r.workplaceId && x.name === r.note);
            setCourseId(c?.id ?? null);
            setExtraKind(c && r.extraKind ? r.extraKind : null);
            // מפגש נוסף נערך דרך שדה השיוך לקורס, ולא כקורס מהמערכת השבועית.
            setViaCourse(Boolean(c) && !r.extraKind);
            setStep('times');
          }
          return;
        }
        if (!presetApplied.current) {
          presetApplied.current = true;
          // קורס שנבחר מראש (מסך הבית): ממלאים הכול ומדלגים ישר לשעות.
          const pc = presetCourse ? crs.find((c) => c.id === presetCourse) : undefined;
          if (pc && list.some((w) => w.id === pc.workplaceId)) {
            const breakMin = pc.breakMinutes > 0 ? pc.breakMinutes : 0;
            if (presetDate && /^\d{4}-\d{2}-\d{2}$/.test(presetDate)) setDate(presetDate);
            setCourseId(pc.id);
            setWorkplaceId(pc.workplaceId);
            setNote(pc.name);
            setStart(pc.start);
            setEnd(pc.end);
            setBreaks(breakMin ? [{ id: makeBreakId(), minutes: String(breakMin) }] : []);
            setBaseline({ start: pc.start, end: pc.end, note: pc.name, breaks: breakMin ? 1 : 0 });
            setViaCourse(true);
            setStep('times');
            return;
          }
          if (presetWp && list.some((w) => w.id === presetWp)) setWorkplaceId(presetWp);
          if (presetDate && /^\d{4}-\d{2}-\d{2}$/.test(presetDate)) setDate(presetDate);
          if (presetWp && list.some((w) => w.id === presetWp)) return;
          // כניסה מלאה (הכפתור בדף הבית): נפתח על היום הרלוונטי הבא, ואם יש
          // בו מפגש אחד בלבד שטרם דווח — ישר לשלב השעות.
          const target =
            presetDate && /^\d{4}-\d{2}-\d{2}$/.test(presetDate)
              ? presetDate
              : nextRelevantDay(crs, list, reports).date;
          openOnDate(target, crs, list, reports);
          return;
        }
        setWorkplaceId((current) => {
          if (current && list.some((w) => w.id === current)) return current;
          const open = activeWorkplaces(list);
          return open.length === 1 ? open[0].id : null;
        });
      });
      return () => {
        active = false;
      };
    }, [editId, editing, presetCourse, presetDate]),
  );

  // האם הוזן משהו שעדיין לא נשמר.
  const dirty = editing
    ? touched ||
      start !== editing.start ||
      end !== editing.end ||
      note.trim() !== (editing.note ?? '') ||
      breaks.length !== editing.breaks.length
    : touched ||
      start !== baseline.start ||
      end !== baseline.end ||
      note.trim() !== baseline.note ||
      breaks.length !== baseline.breaks;

  // אזהרה לפני יציאה מהמסך (חזרה, תפריט, כפתור אחורה של אנדרואיד) בלי שמירה או ביטול.
  usePreventRemove(dirty && exitReason == null, ({ data }) => setPendingLeave(data.action));

  // יציאה מכוונת (ביטול / מחיקה) — פעם אחת בלבד. בלי השמירה הזו האפקט
  // עלול לרוץ שוב לפני שהמסך נסגר, וה"חזרה" השנייה יוצאת מהאפליקציה.
  const exitedRef = useRef(false);
  useEffect(() => {
    if (exitReason !== 'cancelled' || exitedRef.current) return;
    exitedRef.current = true;
    if (navigation.canGoBack()) navigation.goBack();
    else router.replace('/');
  }, [exitReason, navigation, router]);

  // ── חזרה אוטומטית אחרי שמירה ──
  // דיווח חדש — לדף הבית; עריכה — לתצוגת הדיווח. "להישאר כאן" עוצר.
  const [countdown, setCountdown] = useState<number | null>(null);
  useEffect(() => {
    if (step === 'done') setCountdown(AUTO_RETURN_SECONDS);
    else setCountdown(null);
  }, [step]);
  useEffect(() => {
    if (countdown == null) return;
    if (countdown <= 0) {
      setCountdown(null);
      if (editId) router.back();
      else if (router.canDismiss()) router.dismissAll();
      else router.replace('/');
      return;
    }
    const t = setTimeout(() => setCountdown((n) => (n == null ? null : n - 1)), 1000);
    return () => clearTimeout(t);
  }, [countdown, editId, router]);


  function addBreak() {
    setBreaks((prev) => [...prev, { id: makeBreakId(), minutes: '' }]);
    setErrors((prev) => ({ ...prev, breaks: undefined }));
  }

  function changeDate(next: string) {
    setDate(next);
    setTouched(true);
    setErrors((prev) => ({ ...prev, date: undefined }));
  }

  function updateBreak(id: string, minutes: string) {
    setBreaks((prev) => prev.map((row) => (row.id === id ? { ...row, minutes } : row)));
    setErrors((prev) => ({ ...prev, breaks: undefined }));
  }

  function removeBreak(id: string) {
    setBreaks((prev) => prev.filter((row) => row.id !== id));
    setErrors((prev) => ({ ...prev, breaks: undefined }));
  }

  function validate(): Errors {
    const next: Errors = {};
    if (!workplaceId) next.workplace = 'יש לבחור מקום עבודה';
    if (!isValidISODate(date)) next.date = 'תאריך בפורמט YYYY-MM-DD';

    const startMin = parseTime(start);
    const endMin = parseTime(end);
    if (startMin == null) next.start = 'שעה בפורמט HH:MM';
    if (endMin == null) next.end = 'שעה בפורמט HH:MM';
    if (startMin != null && endMin != null && endMin <= startMin) {
      next.end = 'שעת הסיום חייבת להיות אחרי ההתחלה';
    }

    for (const row of breaks) {
      const n = parseNum(row.minutes);
      if (!Number.isInteger(n) || n < 0) {
        next.breaks = 'כל הפסקה: מספר דקות שלם, 0 ומעלה';
        break;
      }
    }

    if (startMin != null && endMin != null && endMin > startMin) {
      if (sumBreaks(breaks) >= endMin - startMin) {
        next.breaks = 'סך ההפסקות ארוך או שווה לטווח השעות';
      }
    }
    return next;
  }

  async function handleSave() {
    // סגירת המקלדת (משדה ההערה) לפני המעבר למסך הסיום — אחרת סגירתה מזיזה
    // את הכפתורים בזמן הלחיצה, ו"דיווח נוסף" לא תמיד נתפס.
    Keyboard.dismiss();
    const found = validate();
    setErrors(found);
    if (Object.values(found).some(Boolean)) return;

    const net = Math.max(
      0,
      (parseTime(end) as number) - (parseTime(start) as number) - sumBreaks(breaks),
    );
    const leftover = toAcademic(net).leftoverMinutes;
    const carried = leftoverChoice === 'carry' ? leftover : 0;

    setSaving(true);
    const id = workplaceId as string;
    const draftReport = {
      workplaceId: id,
      date: date.trim(),
      start: start.trim(),
      end: end.trim(),
      breaks: breaks
        .map((row) => ({ id: row.id, minutes: parseNum(row.minutes) }))
        .filter((b) => b.minutes > 0),
      carriedMinutes: carried,
      ...(note.trim() ? { note: note.trim() } : {}),
      // הקורס שנבחר — רק אם הדיווח עדיין שייך למקום העבודה שלו.
      ...(selectedCourse && selectedCourse.workplaceId === id ? { courseId: selectedCourse.id } : {}),
      ...(selectedCourse && selectedCourse.workplaceId === id && extraKind ? { extraKind } : {}),
    };
    const saved = editing
      ? await updateReport(editing.id, draftReport)
      : await addReport(draftReport);
    setExisting(saved);

    let toast: string | null = null;
    const name = workplaces?.find((w) => w.id === id)?.name ?? '';
    // בעריכה: הדקות שהדיווח הישן העביר למונה מוחזרות לפני הוספת החדשות.
    if (editing && editing.carriedMinutes > 0) {
      await adjustAccumulated(editing.workplaceId, -editing.carriedMinutes);
    }
    if (carried > 0) {
      const state = await addAccumulatedMinutes(id, carried);
      toast = `${carried} דק׳ נוספו למונה של ${name} · סה״כ ${entryOf(state, id).minutes} דק׳`;
    }
    setLastSaved({
      text: `${name} · ${longDate(date)} · ${timeRange(start, end)}`,
      toast,
    });
    if (editing) setEditing({ ...editing, ...draftReport });
    // ניקוי הטופס (התאריך נשמר — לדיווח נוסף באותו יום).
    setStart('');
    setEnd('');
    setBreaks([]);
    setNote('');
    setCourseId(null);
    setTouched(false);
    setSaving(false);
    // הדיווח נשמר — יציאה מהמסך (לבית, לדיווחים, ללוח הבקרה) בלי אזהרת "לצאת בלי לשמור".
    setExitReason('saved');
    setStep('done');
  }

  if (workplaces === null) {
    return (
      <Screen scroll={false}>
        <View style={styles.center}>
          <ActivityIndicator color={colors.brand} />
        </View>
      </Screen>
    );
  }

  if (editing && lockedStart) {
    return (
      <Screen>
        <View style={styles.intro}>
          <Text style={styles.title}>🔒 הדיווח נעול לעריכה</Text>
          <Text style={styles.subtitle}>
            הדוח לשכר של החודש הזה כבר נשלח או שולם. דוח שנשלח: כדי לערוך או למחוק, מבטלים קודם את
            השליחה (עם סיבה) ואז שולחים מחדש. דוח ששולם — נעול לצמיתות.
          </Text>
        </View>
        <Button
          label="לדוח השכר"
          onPress={() =>
            router.replace({
              pathname: '/payroll-report',
              params: { wp: editing.workplaceId, start: lockedStart },
            })
          }
        />
        <Button label="חזרה" variant="secondary" onPress={() => router.back()} />
      </Screen>
    );
  }

  if (workplaces.length === 0) {
    return (
      <Screen>
        <View style={styles.intro}>
          <Text style={styles.title}>דיווח יום עבודה</Text>
          <Text style={styles.subtitle}>
            כדי לדווח צריך קודם להגדיר לפחות מקום עבודה אחד.
          </Text>
        </View>
        <Button
          label="הוספת מקום עבודה"
          onPress={() => router.push('/workplace-form')}
        />
      </Screen>
    );
  }

  const startMin = parseTime(start);
  const endMin = parseTime(end);
  const rangeMin = startMin != null && endMin != null && endMin > startMin ? endMin - startMin : null;
  const netPreview = rangeMin == null ? null : Math.max(0, rangeMin - sumBreaks(breaks));
  const academicPreview = netPreview == null ? null : toAcademic(netPreview);
  const leftoverPreview = academicPreview?.leftoverMinutes ?? 0;
  const academicHoursNow =
    academicPreview == null
      ? 0
      : leftoverChoice === 'carry'
        ? academicPreview.wholeHours
        : academicPreview.decimalHours;

  // ── חישוב כספי חי ──
  const workplace = workplaces.find((w) => w.id === workplaceId) ?? null;
  const draft = {
    date,
    start,
    end,
    breaks: breaks.map((row) => ({ id: row.id, minutes: Math.max(0, parseNum(row.minutes) || 0) })),
    carriedMinutes: leftoverChoice === 'carry' ? leftoverPreview : 0,
  };
  const pay = workplace && netPreview != null ? reportPay(draft, workplace, basis) : null;
  const hoursForPay = netPreview != null ? payableHours(draft, basis) : 0;
  // נסיעות: רק בתחבורה ציבורית, ורק אם עוד אין דיווח לאותו מקום באותו יום.
  // בעריכה — הדיווח עצמו לא נחשב "דיווח אחר" באותו יום.
  const travelCounted =
    workplace != null &&
    existing.some((r) => r.workplaceId === workplace.id && r.date === date && r.id !== editing?.id);
  const travel = workplace && !travelCounted ? travelCostForDay(workplace, date) : 0;
  const workedDates = existing.map((r) => r.date);
  // קורסים קבועים שמתקיימים בתאריך שנבחר (במקום העבודה שנבחר, או בכולם).
  // נבחר מקום עבודה מראש — רק הקורסים שלו.
  const lockWp = presetWp && workplaces.some((w) => w.id === presetWp) ? presetWp : null;
  // לבחירה: מקומות עבודה פעילים (מקום בארכיון — רק אם הוא כבר נבחר, למשל בעריכה).
  const pickable = workplaces.filter((w) => !isArchived(w) || w.id === workplaceId);
  const activeCourses = coursesOn(courses, date).filter(
    (c) => pickable.some((w) => w.id === c.workplaceId) && (!lockWp || c.workplaceId === lockWp),
  );

  /**
   * בחירת קורס. כשהשעות כבר הוזנו ונבחר קורס מתוך כמה שחופפים לטווח —
   * נקבעים מקום העבודה והנושא, והשעות שהוקלדו נשמרות. אחרת — ממלאים הכול.
   */
  function applyCourse(c: Course, keepTimes = false) {
    setCourseId(c.id);
    setExtraKind(null);
    setWorkplaceId(c.workplaceId);
    setNote(c.name);
    setTouched(true);
    setErrors({});
    if (keepTimes) {
      if (breaks.length === 0 && c.breakMinutes > 0) {
        setBreaks([{ id: makeBreakId(), minutes: String(c.breakMinutes) }]);
      }
      return;
    }
    setStart(c.start);
    setEnd(c.end);
    setBreaks(c.breakMinutes > 0 ? [{ id: makeBreakId(), minutes: String(c.breakMinutes) }] : []);
  }
  // הדיווח החסר הקרוב (מהיום אחורה) — לקישור "הדיווח החסר הבא".
  const nextMissingAll = nextRelevantDay(courses, workplaces, existing);
  const nextMissing = nextMissingAll.kind === 'missing' ? nextMissingAll : null;
  // קורסים שכבר דווחו באותו יום (אותו מקום עבודה ואותו נושא) — מסומנים ✓.
  // קורס "דווח" — יש באותו יום דיווח לאותו מקום שחופף בשעות לקורס (או שנושאו שם הקורס).
  const reportedCourse = (c: Course) => courseReported(c, date, existing, editing?.id);
  const workplaceName = (id: string | null) => workplaces.find((w) => w.id === id)?.name ?? '';
  const selectedCourse = courses.find((c) => c.id === courseId) ?? null;
  // שיוך מפגש נוסף: קורסים של מקום העבודה שהתאריך בתוך תקופתם (לא רק ביום הקבוע).
  const extraCandidates = workplaceId
    ? courses.filter((c) => c.workplaceId === workplaceId && date >= c.from && date <= c.to)
    : [];

  /** שיוך הדיווח לקורס כמפגש נוסף, או ביטול השיוך. */
  function chooseExtraCourse(id: string | null) {
    setTouched(true);
    if (!id) {
      setCourseId(null);
      setExtraKind(null);
      return;
    }
    const c = courses.find((x) => x.id === id);
    if (!c) return;
    setCourseId(c.id);
    setExtraKind((k) => k ?? 'makeup');
    if (!note.trim() || courses.some((x) => x.name === note.trim())) setNote(c.name);
  }

  function goNext() {
    if (step === 'date') {
      if (!isValidISODate(date)) {
        setErrors({ date: 'תאריך לא תקין' });
        return;
      }
      if (activeCourses.length > 0) setStep('course');
      else if (lockWp) {
        // מקום העבודה כבר נבחר ואין לו קורסים ביום זה — ישר לשעות.
        setWorkplaceId(lockWp);
        setCourseId(null);
        setViaCourse(false);
        setStep('times');
      } else setStep('workplace');
      return;
    }
    if (step === 'times') {
      const found = validate();
      const timeErrors = { start: found.start, end: found.end, breaks: found.breaks };
      setErrors(timeErrors);
      if (Object.values(timeErrors).some(Boolean)) return;
      Keyboard.dismiss();
      setStep('summary');
    }
  }

  function goBack() {
    setErrors({});
    // עריכה נפתחת מתצוגת הדיווח ישר בשלב השעות — "חזרה" ממנו מחזירה לתצוגה
    // (ולא לשלבי הבחירה של דיווח חדש). שינויים שלא נשמרו — עם אזהרה.
    if (editId && step === 'times') {
      if (navigation.canGoBack()) navigation.goBack();
      else router.replace({ pathname: '/report-view', params: { id: editId } });
      return;
    }
    if (step !== 'times') setSkippedCourse(false);
    if (step === 'course' || step === 'workplace') {
      if (step === 'workplace' && activeCourses.length > 0) setStep('course');
      else setStep('date');
    } else if (step === 'times')
      setStep(
        viaCourse
          ? skippedCourse
            ? 'date'
            : 'course'
          : lockWp && activeCourses.length === 0
            ? 'date'
            : 'workplace',
      );
    else if (step === 'summary') setStep('times');
  }

  /** "קדימה" בהחלקה — רק כשאפשר להתקדם מהשלב הנוכחי. */
  function swipeNext() {
    if (step === 'date' || step === 'times') goNext();
    else if (step === 'course' && courseId) setStep('times');
    else if (step === 'workplace' && workplaceId) setStep('times');
  }
  swipeRef.current = {
    next: () => {
      if (!direct) swipeNext();
    },
    back: () => {
      if (step !== 'date' && step !== 'done' && !direct && !(editId && step === 'times')) goBack();
    },
  };

  function chooseCourse(c: Course) {
    applyCourse(c);
    setViaCourse(true);
    setStep('times');
  }

  function chooseWorkplace(id: string) {
    setWorkplaceId(id);
    setCourseId(null);
    setExtraKind(null);
    setViaCourse(false);
    setTouched(true);
    setErrors({});
    setStep('times');
  }

  function anotherReport() {
    Keyboard.dismiss();
    setLastSaved(null);
    setErrors({});
    // דיווח חדש — שוב שומרים מפני יציאה בלי שמירה, מול טופס ריק.
    setBaseline({ start: '', end: '', note: '', breaks: 0 });
    setExitReason(null);
    setDirect(false);
    // "דיווח נוסף" — על היום הרלוונטי הבא (היום, או הדיווח החסר הקרוב אחורה).
    openOnDate(nextRelevantDay(courses, workplaces ?? [], existing).date);
  }

  /** יציאה מהאשף למקום המוצא. עם שינויים שלא נשמרו — דיאלוג "לצאת בלי לשמור?". */
  function leave() {
    Keyboard.dismiss();
    if (navigation.canGoBack()) navigation.goBack();
    else router.replace('/');
  }

  /**
   * "השיעור לא התקיים" מתוך האשף, לפני שמירה. מהשעות / מהסיכום — אין מה
   * לדווח, יוצאים מהאשף (בלי אזהרה). מבחירת הקורס — נשארים, והקורס יורד
   * מהרשימה (הקורסים נטענים מחדש עם אינדקס הביטולים).
   */
  function cancelSession(c: Course, leave: boolean) {
    sessionDialog.open({
      course: c,
      date,
      onDone: (canceled) => {
        if (!canceled) return;
        if (leave) {
          setExitReason('cancelled');
          return;
        }
        if (courseId === c.id) setCourseId(null);
        loadCourses().then(setCourses);
      },
    });
  }

  // ── מחוון שלבים ──
  const STEPS: { key: Step[]; label: string }[] = [
    { key: ['date'], label: 'תאריך' },
    { key: ['course', 'workplace'], label: 'קורס' },
    { key: ['times'], label: 'שעות' },
    { key: ['summary', 'done'], label: 'סיכום' },
  ];
  const stepIndex = STEPS.findIndex((x) => x.key.includes(step));

  /** שורת הקשר קבועה בראש השלבים המאוחרים: מה כבר נבחר. */
  // תנאי מקום העבודה שחלו בתאריך הדיווח (היסטוריית תנאים).
  const wAt = workplace ? workplaceAt(workplace, date) : null;
  const context =
    (step === 'times' || step === 'summary') && wAt ? (
      <View style={[styles.context, { borderStartWidth: 5, borderStartColor: colorOf(workplace) }]}>
        <Text style={styles.contextMain}>{wAt.name}</Text>
        {selectedCourse ? (
          <Text style={styles.contextCourse}>
            {selectedCourse.name} · {timeRange(selectedCourse.start, selectedCourse.end)}
          </Text>
        ) : null}
        <Text style={styles.contextSub}>{longDate(date)}</Text>
        <Text style={styles.contextSub}>
          {wAt.paymentType === 'monthly'
            ? `משכורת חודשית ${formatShekels(wAt.rate)}`
            : `${formatShekels(wAt.rate)} לשעה ${basis === 'academic' ? 'אקדמית' : ''}`}
          {' · '}
          {hasTravelCost(wAt)
            ? `נסיעות: תחבורה ציבורית ${formatShekels(wAt.travelCostPerDirection)} × ${wAt.tripsPerDay} ליום`
            : `נסיעות: ${ARRIVAL_MODE_LABELS[wAt.arrivalMode]} — ללא החזר`}
        </Text>
        <Text style={styles.contextSub}>
          {paymentTermsLabel(wAt)}
          {taxPercentOf(wAt) > 0 ? ` · מס ${taxPercentOf(wAt)}%` : ''}
          {wAt.employeeNumber ? ` · מספר עובד ${wAt.employeeNumber}` : ''}
        </Text>
      </View>
    ) : null;

  return (
    <Screen keyboardFooter>
      {direct && step !== 'done' ? <Stack.Screen options={{ title: 'דיווח מפגש' }} /> : null}
      {direct ? null : (
      <View style={styles.stepper}>
        {STEPS.map((x, i) => {
          const isDone = i < stepIndex && step !== 'done';
          const isCurrent = i === stepIndex;
          return (
            <View key={x.label} style={styles.stepItem}>
              <View
                style={[
                  styles.stepDot,
                  (isDone || step === 'done') && styles.stepDotDone,
                  isCurrent && styles.stepDotCurrent,
                ]}
              >
                <Text
                  style={[
                    styles.stepNum,
                    (isDone || isCurrent || step === 'done') && styles.stepNumOn,
                  ]}
                >
                  {isDone || step === 'done' ? '✓' : i + 1}
                </Text>
              </View>
              <Text style={[styles.stepLabel, isCurrent && styles.stepLabelCurrent]}>
                {x.label}
              </Text>
            </View>
          );
        })}
      </View>
      )}

      {context}

      <Animated.View {...pan.panHandlers} style={[styles.swipeArea, stepFade]}>

      {/* ── 1. תאריך ── */}
      {step === 'date' ? (
        <>
          <Text style={styles.stepTitle}>באיזה יום עבדת?</Text>
          <FormField label="תאריך" error={errors.date}>
            <DatePicker
              value={date}
              onChange={changeDate}
              workedDates={workedDates}
              invalid={Boolean(errors.date)}
            />
          </FormField>
          {activeCourses.length > 0 && activeCourses.every(reportedCourse) ? (
            <View style={styles.allDone}>
              <Text style={styles.allDoneText}>✓ כל המפגשים ביום זה דווחו</Text>
              <View style={styles.allDoneLinks}>
                {date !== todayISO() ? (
                  <Pressable onPress={() => openOnDate(todayISO())} accessibilityRole="link" hitSlop={6}>
                    <Text style={styles.linkText}>היום</Text>
                  </Pressable>
                ) : null}
                {nextMissing && nextMissing.date !== date ? (
                  <Pressable onPress={() => openOnDate(nextMissing.date)} accessibilityRole="link" hitSlop={6}>
                    <Text style={styles.linkText}>הדיווח החסר הבא</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          ) : null}
          {activeCourses.length > 0 ? (
            <View style={styles.dayCourses}>
              <Text style={styles.dayCoursesTitle}>
                {activeCourses.length === 1 ? 'קורס אחד' : `${activeCourses.length} קורסים`} ביום זה
                {' · '}
                {activeCourses.filter(reportedCourse).length} דווחו
                {activeCourses.some((c) => !reportedCourse(c))
                  ? ` · ${activeCourses.filter((c) => !reportedCourse(c)).length} נדרש דיווח`
                  : ' — הכול דווח ✓'}
              </Text>
              <ScrollView style={styles.dayCoursesList} nestedScrollEnabled>
                {activeCourses.map((c) => {
                  const done = reportedCourse(c);
                  return (
                    <View
                      key={c.id}
                      style={[
                        styles.dayCourseRow,
                        { borderStartWidth: 3, borderStartColor: colorOf(workplaces.find((w) => w.id === c.workplaceId)), paddingStart: 6 },
                      ]}
                    >
                      <Text style={[styles.dayCourseMark, done ? styles.markDone : styles.markTodo]}>
                        {done ? '✓' : '•'}
                      </Text>
                      <View style={styles.dayCourseTexts}>
                        <Text style={styles.dayCourseName}>
                          {timeRange(c.start, c.end)} · {c.name}
                        </Text>
                        <Text style={styles.dayCourseSub}>
                          {workplaceName(c.workplaceId)} · {done ? 'דווח' : 'נדרש דיווח'}
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </ScrollView>
            </View>
          ) : (
            <Text style={styles.hint}>אין קורסים קבועים ביום זה — בשלב הבא בוחרים מקום עבודה</Text>
          )}
        </>
      ) : null}

      {/* ── 2א. קורס ── */}
      {step === 'course' ? (
        <>
          <Text style={styles.stepTitle}>איזה קורס?</Text>
          <View style={styles.choices}>
            {activeCourses.map((c) => {
              const done = reportedCourse(c);
              return (
                <Pressable
                  key={c.id}
                  onPress={() => chooseCourse(c)}
                  style={({ pressed }) => [
                    styles.courseCard,
                    { borderStartWidth: 5, borderStartColor: colorOf(workplaces.find((w) => w.id === c.workplaceId)) },
                    pressed && styles.pressed,
                  ]}
                  accessibilityRole="button"
                >
                  <View style={styles.courseTop}>
                    <Text style={styles.courseTime}>{timeRange(c.start, c.end)}</Text>
                    {done ? <Text style={styles.reported}>✓ דווח</Text> : null}
                  </View>
                  <Text style={styles.choiceText}>{c.name}</Text>
                  <Text style={styles.choiceSub}>
                    {workplaceName(c.workplaceId)}
                    {c.breakMinutes > 0 ? ` · הפסקה ${c.breakMinutes} דק׳` : ''}
                  </Text>
                  {!done ? (
                    <Pressable
                      onPress={() => cancelSession(c, false)}
                      accessibilityRole="button"
                      accessibilityLabel={`${c.name}: השיעור לא התקיים`}
                      hitSlop={8}
                      style={styles.cardCancel}
                    >
                      <Text style={styles.cardCancelText}>השיעור לא התקיים?</Text>
                    </Pressable>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
          <Pressable onPress={() => setStep('workplace')} style={styles.linkBtn}>
            <Text style={styles.linkText}>דיווח שלא לפי קורס — בחירת מקום עבודה</Text>
          </Pressable>
        </>
      ) : null}

      {/* ── 2ב. מקום עבודה ── */}
      {step === 'workplace' ? (
        <>
          <Text style={styles.stepTitle}>באיזה מקום עבודה?</Text>
          <View style={styles.choices}>
            {pickable.map((w) => {
              const selected = w.id === workplaceId;
              return (
                <Pressable
                  key={w.id}
                  onPress={() => chooseWorkplace(w.id)}
                  style={[
                    styles.choice,
                    selected && styles.choiceSelected,
                    { borderStartWidth: 5, borderStartColor: colorOf(w) },
                  ]}
                  accessibilityRole="button"
                >
                  <View style={styles.choiceBody}>
                    <Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>
                      {w.name}
                    </Text>
                    <Text style={[styles.choiceSub, selected && styles.choiceSubSelected]}>
                      {w.paymentType === 'monthly'
                        ? `משכורת חודשית ${formatShekels(w.rate)}`
                        : `${formatShekels(w.rate)} לשעה`}
                      {' · '}
                      {ARRIVAL_MODE_LABELS[w.arrivalMode]}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </>
      ) : null}

      {/* ── 3. שעות ── */}
      {step === 'times' ? (
        <>
          <Text style={styles.stepTitle}>
            {direct ? 'השעות לפי הקורס — אפשר לעדכן' : selectedCourse ? 'השעות לפי הקורס — אפשר לעדכן' : 'מתי עבדת?'}
          </Text>
          {!viaCourse && extraCandidates.length > 0 ? (
            <FormField label="מפגש נוסף לקורס (רשות)">
              <SelectField<string | null>
                title="שיוך לקורס"
                value={extraKind ? courseId : null}
                options={[
                  { value: null, label: 'לא משויך לקורס' },
                  ...extraCandidates.map((c) => ({
                    value: c.id as string | null,
                    label: c.name,
                    sub: courseScheduleLabel(c),
                  })),
                ]}
                onChange={chooseExtraCourse}
              />
              {extraKind ? (
                <SegmentedControl<ExtraSessionKind>
                  options={(Object.keys(EXTRA_SESSION_LABELS) as ExtraSessionKind[]).map((k) => ({
                    value: k,
                    label: EXTRA_SESSION_LABELS[k],
                  }))}
                  value={extraKind}
                  onChange={setExtraKind}
                />
              ) : null}
            </FormField>
          ) : null}
          <View style={styles.timesRow}>
            <View style={styles.timeCol}>
              <FormField label="שעת התחלה" error={errors.start}>
                <TimeInput
                  value={start}
                  onChange={(v) => {
                    setStart(v);
                    setErrors((prev) => ({ ...prev, start: undefined, end: undefined }));
                  }}
                  onComplete={() => endRef.current?.focus()}
                  onOverflow={(d) => endRef.current?.feed(d)}
                  invalid={Boolean(errors.start)}
                />
              </FormField>
            </View>
            <View style={styles.timeCol}>
              <FormField label="שעת סיום" error={errors.end}>
                <TimeInput
                  ref={endRef}
                  value={end}
                  onChange={(v) => {
                    setEnd(v);
                    setErrors((prev) => ({ ...prev, end: undefined }));
                  }}
                  onComplete={() => Keyboard.dismiss()}
                  invalid={Boolean(errors.end)}
                />
              </FormField>
            </View>
          </View>

          <FormField label="הפסקות (בדקות)" error={errors.breaks}>
            <View style={styles.breaks}>
              {breaks.map((row, index) => (
                <View key={row.id} style={styles.breakRow}>
                  <View style={styles.breakInput}>
                    <TextField
                      value={row.minutes}
                      onChangeText={(t) => updateBreak(row.id, t.replace(/\D/g, ''))}
                      placeholder={`הפסקה ${index + 1}`}
                      numeric
                    />
                  </View>
                  <Pressable
                    onPress={() => removeBreak(row.id)}
                    style={styles.breakRemove}
                    accessibilityLabel={`הסרת הפסקה ${index + 1}`}
                  >
                    <Text style={styles.breakRemoveText}>✕</Text>
                  </Pressable>
                </View>
              ))}
              <Button label="הוספת הפסקה" variant="secondary" onPress={addBreak} />
            </View>
          </FormField>

          {leftoverPreview > 0 ? (
            <FormField
              label="דקות עודפות"
              hint={`${leftoverPreview} דק׳ אינן משלימות שעה אקדמית (45 דק׳)`}
            >
              <SegmentedControl<LeftoverChoice>
                options={[
                  { value: 'carry', label: 'למונה המצטבר' },
                  { value: 'include', label: 'לכלול בדיווח' },
                ]}
                value={leftoverChoice}
                onChange={setLeftoverChoice}
              />
            </FormField>
          ) : null}

          {netPreview != null ? (
            <Text style={styles.hint}>
              נטו {formatDuration(netPreview)} · {formatHours(academicHoursNow)} שע׳ אקדמיות
              {pay != null ? ` · ${formatShekels(pay + travel)}` : ''}
            </Text>
          ) : null}
        </>
      ) : null}

      {/* ── 4. סיכום ── */}
      {step === 'summary' ? (
        <>
          <Text style={styles.stepTitle}>בדיקה ושמירה</Text>
          <FormField label="נושא / הערה" hint="רשות — למשל נושא ההרצאה או ההגשה">
            <TextField value={note} onChangeText={setNote} placeholder="תולדות האדריכלות — שיעור 4" />
          </FormField>

          <View style={styles.summary}>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLine}>שעות</Text>
              <Text style={styles.summaryValue}>
                {timeRange(start, end)}
                {sumBreaks(breaks) > 0 ? ` · הפסקות ${sumBreaks(breaks)} דק׳` : ''}
              </Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLine}>זמן עבודה נטו</Text>
              <Text style={styles.summaryValue}>
                {netPreview == null ? '—' : formatDuration(netPreview)}
              </Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLine}>שעות אקדמיות</Text>
              <Text style={styles.summaryValue}>
                {academicPreview == null ? '—' : formatHours(academicHoursNow)}
              </Text>
            </View>
            {leftoverPreview > 0 ? (
              <Text style={styles.summaryHint}>
                {leftoverChoice === 'carry'
                  ? `${leftoverPreview} דק׳ עודפות ייכנסו למונה של ${workplaceName(workplaceId)}`
                  : `${leftoverPreview} דק׳ עודפות ייכללו בדיווח כשבר שעה`}
              </Text>
            ) : null}

            <View style={styles.divider} />

            {wAt == null ? null : wAt.paymentType === 'monthly' ? (
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLine}>שכר</Text>
                <Text style={styles.summaryValue}>
                  משכורת חודשית קבועה ({formatShekels(wAt.rate)})
                </Text>
              </View>
            ) : (
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLine}>
                  שכר · {formatHours(Math.round(hoursForPay * 100) / 100)}{' '}
                  {basis === 'academic' ? 'שע׳ אקד׳' : 'שע׳'} × {formatShekels(wAt.rate)}
                </Text>
                <Text style={styles.summaryValue}>{pay == null ? '—' : formatShekels(pay)}</Text>
              </View>
            )}
            {wAt && hasTravelCost(wAt) ? (
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLine}>
                  נסיעות
                  {travelCounted
                    ? ' · כבר נספרו ליום זה'
                    : ` · ${wAt.tripsPerDay} × ${formatShekels(wAt.travelCostPerDirection)}`}
                </Text>
                <Text style={styles.summaryValue}>{formatShekels(travel)}</Text>
              </View>
            ) : null}
            {wAt && wAt.paymentType === 'hourly' ? (
              <View style={styles.summaryRow}>
                <Text style={styles.summaryTotalLabel}>סה״כ ליום</Text>
                <Text style={styles.summaryTotal}>
                  {pay == null ? '—' : formatShekels(pay + travel)}
                </Text>
              </View>
            ) : null}
          </View>
          {errors.workplace ? <Text style={styles.error}>{errors.workplace}</Text> : null}
          {editing ? (
            <Button
              label="מחיקת הדיווח"
              variant="dangerLink"
              icon="trash-can-outline"
              onPress={() =>
                confirm({
                  title: 'למחוק את הדיווח?',
                  message: 'הדיווח יימחק לצמיתות, והדקות שהעביר למונה המצטבר יוחזרו.',
                  confirmLabel: 'מחיקה',
                  onConfirm: async () => {
                    await deleteReport(editing.id);
                    if (editing.carriedMinutes > 0) {
                      await adjustAccumulated(editing.workplaceId, -editing.carriedMinutes);
                    }
                    setTouched(false);
                    setStart('');
                    setEnd('');
                    setBreaks([]);
                    setNote('');
                    setExitReason('cancelled');
                  },
                })
              }
            />
          ) : null}
        </>
      ) : null}

      {/* ── נשמר ── */}
      {step === 'done' && lastSaved ? (
        <View style={styles.doneBox}>
          <Text style={styles.doneIcon}>✓</Text>
          <Text style={styles.doneTitle}>{editId ? 'הדיווח עודכן' : 'הדיווח נשמר'}</Text>
          <Text style={styles.doneText}>{lastSaved.text}</Text>
          {lastSaved.toast ? <Text style={styles.doneSub}>{lastSaved.toast}</Text> : null}
          {countdown != null ? (
            <View style={styles.countdown}>
              <Text style={styles.countdownText}>
                {editId ? 'חוזרים לתצוגת הדיווח' : 'חוזרים לדף הבית'} בעוד {countdown} שניות
              </Text>
              <Pressable onPress={() => setCountdown(null)} accessibilityRole="button" hitSlop={8}>
                <Text style={styles.linkText}>להישאר כאן</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      ) : null}

      </Animated.View>

      {/* ── ניווט ── */}
      {step === 'done' ? (
        <View style={styles.nav}>
          {editId ? (
            <Button label="חזרה לדיווח" onPress={() => { setCountdown(null); router.back(); }} />
          ) : (
            <Button label="דיווח נוסף" onPress={anotherReport} />
          )}
          <Button
            label="ללוח הבקרה"
            variant="secondary"
            onPress={() => {
              setCountdown(null);
              router.replace('/dashboard');
            }}
          />
          <Pressable
            onPress={() => {
              setCountdown(null);
              router.replace({ pathname: '/reports', params: { tab: 'reports' } });
            }}
            style={styles.cancel}
          >
            <Text style={styles.cancelText}>ליומן</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.nav}>
          {direct ? (
            <Button label="שמירה" onPress={handleSave} loading={saving} />
          ) : step === 'summary' ? (
            <Button label="שמירת הדיווח" onPress={handleSave} loading={saving} />
          ) : step === 'date' || step === 'times' ? (
            <Button label="המשך" onPress={goNext} />
          ) : null}
          {/* כפתור משני אחד: "ביטול" (כניסה ישירה, או שלב 1) או "חזרה" לשלב הקודם — אף פעם לא שניהם */}
          {direct || step === 'date' ? (
            <Button label="ביטול" variant="secondary" onPress={leave} />
          ) : (
            <Button label="חזרה" variant="secondary" onPress={goBack} />
          )}
          {(step === 'times' || step === 'summary') && selectedCourse && !editId && !extraKind ? (
            <>
              <View style={styles.linkRow}>
                <Text style={styles.linkLead}>השיעור לא התקיים?</Text>
                <Pressable
                  onPress={() => cancelSession(selectedCourse, true)}
                  accessibilityRole="button"
                  hitSlop={8}
                >
                  <Text style={styles.linkText}>סימון כבוטל</Text>
                </Pressable>
              </View>
              <Pressable
                onPress={() =>
                  moveDialog.open({
                    course: selectedCourse,
                    date,
                    onDone: () => setExitReason('cancelled'),
                  })
                }
                accessibilityRole="button"
                style={styles.linkBtn}
              >
                <Text style={styles.linkText}>העברת השיעור לתאריך אחר</Text>
              </Pressable>
            </>
          ) : null}
        </View>
      )}

      <Modal
        transparent
        animationType="fade"
        visible={pendingLeave != null}
        onRequestClose={() => setPendingLeave(null)}
      >
        <View style={styles.backdrop}>
          <View style={styles.dialog}>
            <Text style={styles.dialogTitle}>לצאת בלי לשמור?</Text>
            <Text style={styles.dialogBody}>הנתונים שהוזנו בדיווח הזה יאבדו.</Text>
            <Button label="המשך עריכה" onPress={() => setPendingLeave(null)} />
            <Button
              label="יציאה בלי שמירה"
              variant="danger"
              onPress={() => {
                const action = pendingLeave;
                setPendingLeave(null);
                if (action) navigation.dispatch(action);
              }}
            />
          </View>
        </View>
      </Modal>
      {confirm.dialog}
      {sessionDialog.dialog}
      {moveDialog.dialog}
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
  choices: {
    gap: spacing.sm,
  },
  choice: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
  },
  choiceSelected: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },
  choiceText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
    textAlign: TEXT_RIGHT,
  },
  choiceTextSelected: {
    color: colors.textOnBrand,
  },
  stepper: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  stepItem: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  stepDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  stepDotDone: {
    backgroundColor: colors.brandDark,
    borderColor: colors.brandDark,
  },
  stepDotCurrent: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },
  stepNum: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.textMuted,
  },
  stepNumOn: {
    color: colors.textOnBrand,
  },
  stepLabel: {
    fontSize: 12,
    color: colors.textMuted,
  },
  stepLabelCurrent: {
    color: colors.text,
    fontWeight: '800',
  },
  stepTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.text,
    textAlign: TEXT_RIGHT,
  },
  context: {
    backgroundColor: colors.brandLight,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    gap: 2,
  },
  contextMain: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.brandDark,
    textAlign: TEXT_RIGHT,
  },
  swipeArea: {
    gap: spacing.md,
  },
  contextCourse: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.brandDark,
    textAlign: TEXT_RIGHT,
  },
  dayCourses: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  dayCoursesTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.text,
    textAlign: TEXT_RIGHT,
  },
  dayCoursesList: {
    maxHeight: 220,
  },
  dayCourseRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingVertical: 4,
  },
  dayCourseMark: {
    width: 16,
    fontSize: 15,
    fontWeight: '800',
    textAlign: 'center',
  },
  markDone: {
    color: colors.success,
  },
  markTodo: {
    color: colors.warning,
  },
  dayCourseTexts: {
    flex: 1,
    gap: 1,
  },
  dayCourseName: {
    fontSize: 14,
    color: colors.text,
    textAlign: TEXT_RIGHT,
  },
  dayCourseSub: {
    fontSize: 12,
    color: colors.textMuted,
    textAlign: TEXT_RIGHT,
  },
  contextSub: {
    fontSize: 12,
    color: colors.brandDark,
    textAlign: TEXT_RIGHT,
  },
  hint: {
    fontSize: 13,
    color: colors.textMuted,
    textAlign: TEXT_RIGHT,
  },
  error: {
    fontSize: 13,
    color: colors.danger,
    textAlign: TEXT_RIGHT,
  },
  pressed: {
    opacity: 0.7,
  },
  courseCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 2,
  },
  courseTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  courseTime: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.brand,
    textAlign: TEXT_RIGHT,
  },
  reported: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.success,
  },
  linkBtn: {
    alignSelf: 'center',
    paddingVertical: spacing.sm,
  },
  linkRow: {
    flexDirection: 'row',
    alignSelf: 'center',
    alignItems: 'center',
    gap: 6,
    paddingVertical: spacing.sm,
  },
  linkLead: { fontSize: 14, color: colors.textMuted },
  allDone: {
    gap: 6,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.brandLight,
  },
  allDoneText: { fontSize: 16, fontWeight: '800', color: colors.success, textAlign: TEXT_RIGHT },
  allDoneLinks: { flexDirection: 'row', gap: spacing.lg },
  cardCancel: {
    alignSelf: 'flex-start',
    paddingTop: spacing.xs,
  },
  cardCancelText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.danger,
    textDecorationLine: 'underline',
  },
  countdown: {
    alignSelf: 'center',
    alignItems: 'center',
    gap: 2,
    paddingTop: spacing.sm,
  },
  countdownText: {
    fontSize: 13,
    color: colors.textMuted,
    textAlign: 'center',
  },
  linkText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.brand,
    textDecorationLine: 'underline',
  },
  nav: {
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  doneBox: {
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xl,
  },
  doneIcon: {
    fontSize: 44,
    fontWeight: '800',
    color: colors.success,
  },
  doneTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.text,
  },
  doneText: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
  },
  doneSub: {
    fontSize: 13,
    color: colors.brandDark,
    textAlign: 'center',
  },
  editBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  editBtnSelected: {
    borderColor: colors.textOnBrand,
  },
  editIcon: {
    fontSize: 16,
    color: colors.textMuted,
  },
  courseChip: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.brandLight,
    borderWidth: 1,
    borderColor: colors.brandLight,
    borderRadius: radius.md,
    gap: 2,
  },
  choiceBody: {
    flex: 1,
    gap: 2,
  },
  choiceSub: {
    fontSize: 12,
    color: colors.textMuted,
    textAlign: TEXT_RIGHT,
  },
  choiceSubSelected: {
    color: colors.textOnBrand,
    opacity: 0.85,
  },
  chevron: {
    fontSize: 18,
    fontWeight: '800',
  },
  timesRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  timeCol: {
    flex: 1,
    minWidth: 0,
  },
  breaks: {
    gap: spacing.sm,
  },
  breakRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  breakInput: {
    flex: 1,
  },
  breakRemove: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  breakRemoveText: {
    fontSize: 16,
    color: colors.danger,
    fontWeight: '700',
  },
  summary: {
    backgroundColor: colors.brandLight,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  summaryLine: {
    flex: 1,
    fontSize: 13,
    color: colors.brandDark,
    textAlign: TEXT_RIGHT,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  summaryValue: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.brandDark,
  },
  summaryTotalLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: '800',
    color: colors.brandDark,
    textAlign: TEXT_RIGHT,
  },
  summaryTotal: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.brandDark,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.brandDark,
    opacity: 0.3,
    marginVertical: spacing.xs,
  },
  cancel: {
    alignSelf: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  cancelText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textMuted,
    textDecorationLine: 'underline',
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  dialog: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: spacing.md,
  },
  dialogTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.text,
    textAlign: TEXT_RIGHT,
  },
  dialogBody: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: TEXT_RIGHT,
  },
  summaryNet: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.brandDark,
    textAlign: TEXT_RIGHT,
  },
  summaryHint: {
    fontSize: 12,
    color: colors.brandDark,
    textAlign: TEXT_RIGHT,
  },
});
