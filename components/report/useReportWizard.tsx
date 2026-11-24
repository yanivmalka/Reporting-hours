import { useEffect, useRef, useState } from 'react';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { Keyboard, PanResponder } from 'react-native';
import { useConfirm } from '../ConfirmDialog';
import { useSessionCancel, useSessionMove } from '../SessionCancelDialog';
import { longDate } from '../DatePicker';
import { type TimeInputHandle } from '../TimeInput';
import { useWheelActive } from '../WheelOverlay';
import { useToast } from '../Toast';
import { useFade } from '../useFlash';
import { nextMissingAfter, nextRelevantDay, unreportedOn } from '../../lib/home';
import { loadLeftoverMode } from '../../lib/leftover';
import { addAccumulatedMinutes, adjustAccumulated, entryOf } from '../../lib/accumulated';
import { usePayBasis } from '../../lib/payBasis';
import { addReport, deleteReport, loadReports, makeBreakId, ReportChangedError, updateReport, type ExtraSessionKind, type WorkReport } from '../../lib/reports';
import { courseReported, canceledOn, coursesOn, loadCourses, sessionTimes, timeRange, type Course } from '../../lib/courses';
import { currentPayPeriod } from '../../lib/dashboard';
import { isLocked, loadPayrollStatus, statusKey } from '../../lib/payroll';
import { isValidISODate, todayISO } from '../../lib/time';
import { activeWorkplaces, isArchived, loadWorkplaces, workplaceAt, type Workplace } from '../../lib/workplaces';
import { useTheme } from '../../theme/ThemeContext';
import { useThemedStyles } from '../../theme/useThemedStyles';
import { useWorkplaceColor } from '../../theme/workplaceColors';
import { buildReportDraft, reportPreview, validateReportForm } from '../../lib/reportForm';
import { changesMessage, editIntegrityError, reportChanges, sameSessionReports } from '../../lib/reportEdit';
import { BreakRow, DEFAULT_BREAK_MINUTES, Step, LeftoverChoice, Errors, AUTO_RETURN_SECONDS } from './shared';
import { makeReportStyles as makeStyles } from './styles';
import { useScreenData } from '../useScreenData';

/**
 * הלוגיקה של אשף הדיווח (app/report.tsx): מצב, טעינה, אפקטים ופעולות.
 *
 * useReportWizard — כל ה־hooks של המסך (state, טעינה בפוקוס, חזרה אוטומטית,
 *   מניעת יציאה בלי שמירה) והפעולות (שמירה, מחיקה, ביטול / העברת מפגש).
 * reportWizardView — נגזרות שמחושבות אחרי שהנתונים נטענו (תצוגה מקדימה של
 *   שעות ושכר, קורסים בתאריך, מחוון השלבים) והפעולות שתלויות בהן.
 * רכיבי השלבים (components/report/*Step.tsx) מקבלים את שניהם יחד כ־`w`.
 */
export function useReportWizard() {
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
  /** בעריכה: הדיווח לא נמצא בנתונים (נמחק / לא סונכרן) — לא נופלים לאשף של דיווח חדש */
  const [editMissing, setEditMissing] = useState(false);
  /**
   * בעריכה: האם המשתמש עצמו שינה באשף את התאריך / מקום העבודה. שינוי שלא דרכו =
   * הטופס התחלף מתחת לידיים — השמירה נחסמת (lib/reportEdit.ts).
   */
  const userChanged = useRef({ date: false, workplace: false });
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
  /** עמודת השעה שנגררת כגלגלת — מורמת מעל השכנה, כדי שהבועה לא תוסתר */
  // בזמן גרירת גלגלת החישובים שמתחת לשעות (דקות עודפות, נטו) לא מתעדכנים —
  // כדי שהתצוגה לא תקפוץ; מתעדכנים בעזיבה.
  const wheelActive = useWheelActive();
  const heldPreview = useRef<{
    leftover: number;
    net: number | null;
    academic: number;
    money: number | null;
  } | null>(null);
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
      const t = sessionTimes(c, d);
      const breakMin = t.breakMinutes > 0 ? t.breakMinutes : 0;
      setCourseId(c.id);
      setExtraKind(null);
      setWorkplaceId(c.workplaceId);
      setNote(c.name);
      setStart(t.start);
      setEnd(t.end);
      setBreaks(breakMin ? [{ id: makeBreakId(), minutes: String(breakMin) }] : []);
      setBaseline({ start: t.start, end: t.end, note: c.name, breaks: breakMin ? 1 : 0 });
      setViaCourse(true);
      setSkippedCourse(true);
      setStep('times');
      return;
    }
    setSkippedCourse(false);
    setStep('date');
  }

  // נטען מחדש בכל כניסה למסך כדי לשקף מקומות עבודה שנוספו בינתיים.
  useScreenData(
    () => Promise.all([loadWorkplaces(), loadReports(), loadCourses(), loadPayrollStatus()]),
    [editId, editing, presetCourse, presetDate],
    ([list, reports, crs, st]) => {
      setCourses(crs);
      setWorkplaces(list);
      setExisting(reports);
      // דיווח חדש — הדקות העודפות לפי ההגדרה הכללית (נטען מחדש גם בחזרה
      // מהמסך שבו משנים אותה). דיווח קיים שומר את מה שנקבע בו.
      if (!editId) loadLeftoverMode().then((m) => setLeftoverChoice(m));
      // מצב עריכה — טעינת הדיווח פעם אחת ומילוי הטופס. טעינה חוזרת (כש־editing
      // נקבע, חזרה למסך, סנכרון) לא נוגעת בטופס — אחרת היא נופלת למסלול של דיווח
      // חדש וממלאת מחדש את שעות הקורס על השעות שנשמרו.
      if (editId) {
        // אותו דיווח כבר בטופס — לא נוגעים. דיווח אחר (המסך נפתח מחדש עם מזהה אחר בזמן
        // שהמופע הקודם עוד חי) — טוענים את החדש, ולא נשארים על הדיווח הקודם.
        if (editing && editing.id === editId) return;
        userChanged.current = { date: false, workplace: false };
        const r = reports.find((x) => x.id === editId);
        setEditMissing(!r);
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
          const validPreset = presetDate && /^\d{4}-\d{2}-\d{2}$/.test(presetDate);
          const t = sessionTimes(pc, validPreset ? presetDate : todayISO());
          const breakMin = t.breakMinutes > 0 ? t.breakMinutes : 0;
          if (validPreset) setDate(presetDate);
          setCourseId(pc.id);
          setWorkplaceId(pc.workplaceId);
          setNote(pc.name);
          setStart(t.start);
          setEnd(t.end);
          setBreaks(breakMin ? [{ id: makeBreakId(), minutes: String(breakMin) }] : []);
          setBaseline({ start: t.start, end: t.end, note: pc.name, breaks: breakMin ? 1 : 0 });
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
    },
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
    setBreaks((prev) => [...prev, { id: makeBreakId(), minutes: String(DEFAULT_BREAK_MINUTES) }]);
    setErrors((prev) => ({ ...prev, breaks: undefined }));
  }

  function changeDate(next: string) {
    userChanged.current.date = true;
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
    return validateReportForm({ workplaceId, date, start, end, breaks });
  }

  /** הקורס שנבחר (אם יש) — לשמירה ולתצוגה. */
  const selectedCourse = courses.find((c) => c.id === courseId) ?? null;

  async function handleSave() {
    // סגירת המקלדת (משדה ההערה) לפני המעבר למסך הסיום — אחרת סגירתה מזיזה
    // את הכפתורים בזמן הלחיצה, ו"דיווח נוסף" לא תמיד נתפס.
    Keyboard.dismiss();
    const found = validate();
    setErrors(found);
    if (Object.values(found).some(Boolean)) return;

    const { draft: draftReport, carried } = buildReportDraft(
      { workplaceId, date, start, end, breaks, note, leftoverChoice },
      { workplaces: workplaces ?? [], basis, course: selectedCourse, extraKind },
    );
    if (!editing) {
      // המפגש כבר דווח — דיווח שני על אותו מפגש הוא כמעט תמיד טעות (כפילות שמוסתרת במסך הבית).
      const dup = sameSessionReports({ id: '', ...draftReport }, await loadReports());
      if (dup.length) {
        confirm({
          title: 'המפגש הזה כבר דווח',
          message: `${dup.map((r) => `${r.start}–${r.end}`).join(', ')}\nלשמור בכל זאת דיווח נוסף על אותו מפגש? לתיקון הדיווח הקיים — פותחים אותו ולוחצים "עריכה".`,
          confirmLabel: 'שמירת דיווח נוסף',
          destructive: true,
          onConfirm: () => commitSave(draftReport, carried),
        });
        return;
      }
      await commitSave(draftReport, carried);
      return;
    }
    // ── עדכון דיווח קיים: בקרה ואישור ──
    // 0. הטופס חייב להחזיק את הדיווח שנפתח לעריכה (?id=…), ולא דיווח קודם.
    if (editId && editing.id !== editId) {
      confirm({
        title: 'הדיווח לא נשמר',
        message: 'הטופס מציג דיווח אחר מזה שנפתח לעריכה. הטופס ייטען מחדש.',
        confirmLabel: 'טעינה מחדש',
        destructive: false,
        onConfirm: () => setEditing(null),
      });
      return;
    }
    // 1. הטופס חייב להיות של הדיווח הזה: תאריך / מקום עבודה שהשתנו בלי שהמשתמש בחר — חסימה.
    const integrity = editIntegrityError(editing, draftReport, {
      dateChanged: userChanged.current.date,
      workplaceChanged: userChanged.current.workplace,
    });
    if (integrity) {
      confirm({
        title: 'הדיווח לא נשמר',
        message: `${integrity}\nהטופס ייטען מחדש מהדיווח השמור, כדי שלא יידרס.`,
        confirmLabel: 'טעינה מחדש',
        destructive: false,
        onConfirm: () => reloadEditing(),
      });
      return;
    }
    // 2. אישור המשתמש — מה משתנה, לפני ← אחרי.
    const changes = reportChanges(editing, draftReport, {
      workplace: (wid) => workplaces?.find((w) => w.id === wid)?.name ?? '',
      course: (cid) => courses.find((c) => c.id === cid)?.name ?? '',
    });
    if (changes.length === 0) {
      showToast('לא בוצעו שינויים בדיווח');
      setExitReason('cancelled');
      return;
    }
    const critical = changes.some((c) => c.critical);
    confirm({
      title: critical ? 'להעביר את הדיווח?' : 'לעדכן את הדיווח?',
      // תמיד: איזה דיווח מתעדכן — יום ותאריך, קורס ומקום — גם כשהתאריך לא משתנה.
      message: `${longDate(editing.date)}\n${[editing.note, workplaces?.find((w) => w.id === editing.workplaceId)?.name].filter(Boolean).join(' · ')}\n\n${changesMessage(changes)}`,
      confirmLabel: 'עדכון הדיווח',
      destructive: critical,
      onConfirm: () => commitSave(draftReport, carried),
    });
  }

  /** טעינה מחדש של הדיווח הנערך מהנתונים השמורים (אחרי שהבקרה חסמה שמירה). */
  async function reloadEditing() {
    if (!editing) return;
    const fresh = (await loadReports()).find((r) => r.id === editing.id);
    userChanged.current = { date: false, workplace: false };
    if (!fresh) {
      setEditMissing(true);
      return;
    }
    setEditing(fresh);
    setWorkplaceId(fresh.workplaceId);
    setDate(fresh.date);
    setStart(fresh.start);
    setEnd(fresh.end);
    setBreaks(fresh.breaks.map((b) => ({ id: b.id, minutes: String(b.minutes) })));
    setNote(fresh.note ?? '');
    setLeftoverChoice(fresh.carriedMinutes > 0 ? 'carry' : 'include');
    setStep('times');
  }

  async function commitSave(draftReport: ReturnType<typeof buildReportDraft>['draft'], carried: number) {
    setSaving(true);
    const id = draftReport.workplaceId;
    let saved: WorkReport[];
    try {
      saved = editing
        ? await updateReport(editing.id, draftReport, editing)
        : await addReport(draftReport);
    } catch (e) {
      setSaving(false);
      if (e instanceof ReportChangedError) {
        confirm({
          title: 'הדיווח השתנה בינתיים',
          message: 'הדיווח השמור כבר לא זהה למה שנפתח לעריכה (שינוי ממכשיר אחר או מהמייל). לא נשמר דבר.',
          confirmLabel: 'טעינה מחדש',
          destructive: false,
          onConfirm: () => reloadEditing(),
        });
        return;
      }
      throw e;
    }
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
    userChanged.current = { date: false, workplace: false };
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

  return {
    router,
    styles,
    colors,
    showToast,
    navigation,
    editId,
    presetWp,
    presetDate,
    presetCourse,
    presetApplied,
    direct,
    setDirect,
    skippedCourse,
    setSkippedCourse,
    editing,
    editMissing,
    userChanged,
    setEditing,
    lockedStart,
    setLockedStart,
    confirm,
    sessionDialog,
    moveDialog,
    colorOf,
    basis,
    workplaces,
    setWorkplaces,
    existing,
    setExisting,
    courses,
    setCourses,
    courseId,
    setCourseId,
    extraKind,
    setExtraKind,
    step,
    setStep,
    viaCourse,
    setViaCourse,
    lastSaved,
    setLastSaved,
    touched,
    setTouched,
    exitReason,
    setExitReason,
    pendingLeave,
    setPendingLeave,
    endRef,
    stepFade,
    swipeRef,
    pan,
    workplaceId,
    setWorkplaceId,
    date,
    setDate,
    note,
    setNote,
    start,
    setStart,
    end,
    setEnd,
    breaks,
    setBreaks,
    wheelActive,
    heldPreview,
    leftoverChoice,
    setLeftoverChoice,
    errors,
    setErrors,
    saving,
    setSaving,
    baseline,
    setBaseline,
    dirty,
    exitedRef,
    countdown,
    setCountdown,
    openOnDate,
    addBreak,
    changeDate,
    updateBreak,
    removeBreak,
    validate,
    selectedCourse,
    handleSave,
  };
}

export type ReportWizardCore = ReturnType<typeof useReportWizard>;

/** נגזרות אחרי הטעינה — נקרא רק כש־workplaces נטען ויש לפחות מקום עבודה. */
export function reportWizardView(core: ReportWizardCore & { workplaces: Workplace[] }) {
  const { router, navigation, editId, presetWp, direct, setDirect, skippedCourse, setSkippedCourse, editing, sessionDialog, basis, workplaces, existing, courses, setCourses, courseId, setCourseId, setExtraKind, step, setStep, viaCourse, setViaCourse, setLastSaved, setTouched, setExitReason, swipeRef, workplaceId, setWorkplaceId, date, note, setNote, start, setStart, end, setEnd, breaks, setBreaks, wheelActive, heldPreview, leftoverChoice, setErrors, setBaseline, openOnDate, validate, userChanged } = core;
  // ── התצוגה המקדימה החיה (lib/reportForm.ts) ──
  const workplace = workplaces.find((w) => w.id === workplaceId) ?? null;
  const {
    startMin,
    endMin,
    rangeMin,
    netPreview,
    academicPreview,
    wBasis,
    leftoverPreview,
    academicHoursNow,
    draft,
    pay,
    hoursForPay,
    travelCounted,
    travel,
  } = reportPreview(
    { workplaceId, date, start, end, breaks, leftoverChoice },
    { workplaces, basis, existing, editingId: editing?.id },
  );
  if (!wheelActive || !heldPreview.current) {
    heldPreview.current = {
      leftover: leftoverPreview,
      net: netPreview,
      academic: academicHoursNow,
      money: pay != null ? pay + travel : null,
    };
  }
  const shown = heldPreview.current;
  const workedDates = existing.map((r) => r.date);
  // קורסים קבועים שמתקיימים בתאריך שנבחר (במקום העבודה שנבחר, או בכולם).
  // נבחר מקום עבודה מראש — רק הקורסים שלו.
  const lockWp = presetWp && workplaces.some((w) => w.id === presetWp) ? presetWp : null;
  // לבחירה: מקומות עבודה פעילים (מקום בארכיון — רק אם הוא כבר נבחר, למשל בעריכה).
  const pickable = workplaces.filter((w) => !isArchived(w) || w.id === workplaceId);
  const activeCourses = coursesOn(courses, date).filter(
    (c) => pickable.some((w) => w.id === c.workplaceId) && (!lockWp || c.workplaceId === lockWp),
  );
  // מפגשים שתוכננו לתאריך ולא מתקיימים (בוטל / הועבר / חג) — מוצגים עם הסיבה, במקום "אין קורסים".
  const canceledCourses = canceledOn(courses, date).filter(
    (x) => pickable.some((w) => w.id === x.course.workplaceId) && (!lockWp || x.course.workplaceId === lockWp),
  );

  /**
   * בחירת קורס. כשהשעות כבר הוזנו ונבחר קורס מתוך כמה שחופפים לטווח —
   * נקבעים מקום העבודה והנושא, והשעות שהוקלדו נשמרות. אחרת — ממלאים הכול.
   */
  function applyCourse(c: Course, keepTimes = false) {
    userChanged.current.workplace = true;
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
    const t = sessionTimes(c, date);
    setStart(t.start);
    setEnd(t.end);
    setBreaks(t.breakMinutes > 0 ? [{ id: makeBreakId(), minutes: String(t.breakMinutes) }] : []);
  }
  // הדיווח החסר הקרוב (מהיום אחורה) — לקישור "הדיווח החסר הבא".
  const nextMissingAll = nextRelevantDay(courses, workplaces, existing);
  const nextMissing = nextMissingAll.kind === 'missing' ? nextMissingAll : null;
  // קורסים שכבר דווחו באותו יום (אותו מקום עבודה ואותו נושא) — מסומנים ✓.
  // קורס "דווח" — יש באותו יום דיווח לאותו מקום שחופף בשעות לקורס (או שנושאו שם הקורס).
  const reportedCourse = (c: Course) => courseReported(c, date, existing, editing?.id);
  const workplaceName = (id: string | null) => workplaces.find((w) => w.id === id)?.name ?? '';
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
        userChanged.current.workplace = true;
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
    userChanged.current.workplace = true;
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
    // "דיווח נוסף" — מתקדמים לדיווח החסר הבא אחרי התאריך שדווח עכשיו (ולא
    // לדיווח החסר הכי חדש); כשאין חסר קדימה — היום הרלוונטי הבא.
    openOnDate(nextMissingAfter(courses, workplaces ?? [], existing, date).date);
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

  /** עריכה: "השיעור לא התקיים" — המפגש מסומן כבוטל והדיווח עליו נמחק. */
  function cancelEditedSession(r: WorkReport, c: Course) {
    sessionDialog.open({
      course: c,
      date: r.date,
      onDone: async (canceled) => {
        if (!canceled) return;
        await deleteReport(r.id);
        if (r.carriedMinutes > 0) await adjustAccumulated(r.workplaceId, -r.carriedMinutes);
        setTouched(false);
        setExitReason('cancelled');
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

  return {
    /** בחירת תאריך בשלב התאריך — פעולת משתמש (נרשמת לבקרת העריכה). */
    openOnDate: (d: string) => {
      userChanged.current.date = true;
      openOnDate(d);
    },
    workplaces,
    startMin,
    endMin,
    rangeMin,
    netPreview,
    academicPreview,
    wBasis,
    leftoverPreview,
    academicHoursNow,
    workplace,
    draft,
    pay,
    hoursForPay,
    travelCounted,
    travel,
    shown,
    workedDates,
    lockWp,
    pickable,
    activeCourses,
    canceledCourses,
    nextMissingAll,
    nextMissing,
    reportedCourse,
    workplaceName,
    extraCandidates,
    STEPS,
    stepIndex,
    wAt,
    applyCourse,
    chooseExtraCourse,
    goNext,
    goBack,
    swipeNext,
    chooseCourse,
    chooseWorkplace,
    anotherReport,
    leave,
    cancelSession,
    cancelEditedSession,
  };
}

/** כל מה שרכיבי התצוגה מקבלים: המצב והפעולות, ונגזרות אחרי הטעינה. */
export type ReportWizard = ReportWizardCore & ReturnType<typeof reportWizardView>;
