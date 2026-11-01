import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect, useNavigation, useRouter } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { ActivityIndicator, Keyboard, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Button } from '../components/Button';
import { DatePicker, longDate } from '../components/DatePicker';
import { FormField } from '../components/FormField';
import { TimeInput, type TimeInputHandle } from '../components/TimeInput';
import { Screen } from '../components/Screen';
import { SegmentedControl } from '../components/SegmentedControl';
import { TextField } from '../components/TextField';
import { useToast } from '../components/Toast';
import { toAcademic } from '../lib/academic';
import { addAccumulatedMinutes, entryOf } from '../lib/accumulated';
import { formatHours, payableHours, reportPay } from '../lib/pay';
import { usePayBasis } from '../lib/payBasis';
import { addReport, loadReports, makeBreakId, type WorkReport } from '../lib/reports';
import { coursesOn, loadCourses, timeRange, type Course } from '../lib/courses';
import { formatShekels, hasTravelCost } from '../lib/travel';
import { formatDuration, isValidISODate, parseTime, todayISO } from '../lib/time';
import { ARRIVAL_MODE_LABELS, loadWorkplaces, type Workplace } from '../lib/workplaces';
import { useTheme } from '../theme/ThemeContext';
import { useThemedStyles } from '../theme/useThemedStyles';
import { radius, spacing, type AppColors } from '../theme/colors';
import { TEXT_RIGHT } from '../theme/align';

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

export default function ReportScreen() {
  const router = useRouter();
  const styles = useThemedStyles(makeStyles);
  const { colors } = useTheme();
  const { showToast } = useToast();
  const navigation = useNavigation();
  const { basis } = usePayBasis();
  const [workplaces, setWorkplaces] = useState<Workplace[] | null>(null);
  const [existing, setExisting] = useState<WorkReport[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  /** הקורס שנבחר (כשיש כמה קורסים בטווח השעות) */
  const [courseId, setCourseId] = useState<string | null>(null);
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

  const [workplaceId, setWorkplaceId] = useState<string | null>(null);
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [breaks, setBreaks] = useState<BreakRow[]>([]);
  const [leftoverChoice, setLeftoverChoice] = useState<LeftoverChoice>('carry');
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);

  // נטען מחדש בכל כניסה למסך כדי לשקף מקומות עבודה שנוספו בינתיים.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      Promise.all([loadWorkplaces(), loadReports(), loadCourses()]).then(([list, reports, crs]) => {
        if (!active) return;
        setCourses(crs);
        setWorkplaces(list);
        setExisting(reports);
        setWorkplaceId((current) => {
          if (current && list.some((w) => w.id === current)) return current;
          return list.length === 1 ? list[0].id : null;
        });
      });
      return () => {
        active = false;
      };
    }, []),
  );

  // האם הוזן משהו שעדיין לא נשמר.
  const dirty =
    touched || start !== '' || end !== '' || note.trim() !== '' || breaks.length > 0;

  // אזהרה לפני יציאה מהמסך (חזרה, תפריט, כפתור אחורה של אנדרואיד) בלי שמירה או ביטול.
  usePreventRemove(dirty && exitReason == null, ({ data }) => setPendingLeave(data.action));

  useEffect(() => {
    if (exitReason === 'cancelled') {
      if (router.canGoBack()) router.back();
      else router.replace('/');
    }
  }, [exitReason, router]);

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
    const saved = await addReport({
      workplaceId: id,
      date: date.trim(),
      start: start.trim(),
      end: end.trim(),
      breaks: breaks
        .map((row) => ({ id: row.id, minutes: parseNum(row.minutes) }))
        .filter((b) => b.minutes > 0),
      carriedMinutes: carried,
      ...(note.trim() ? { note: note.trim() } : {}),
    });
    setExisting(saved);

    let toast: string | null = null;
    const name = workplaces?.find((w) => w.id === id)?.name ?? '';
    if (carried > 0) {
      const state = await addAccumulatedMinutes(id, carried);
      toast = `${carried} דק׳ נוספו למונה של ${name} · סה״כ ${entryOf(state, id).minutes} דק׳`;
    }
    setLastSaved({
      text: `${name} · ${longDate(date)} · ${timeRange(start, end)}`,
      toast,
    });
    // ניקוי הטופס (התאריך נשמר — לדיווח נוסף באותו יום).
    setStart('');
    setEnd('');
    setBreaks([]);
    setNote('');
    setCourseId(null);
    setTouched(false);
    setSaving(false);
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
    start,
    end,
    breaks: breaks.map((row) => ({ id: row.id, minutes: Math.max(0, parseNum(row.minutes) || 0) })),
    carriedMinutes: leftoverChoice === 'carry' ? leftoverPreview : 0,
  };
  const pay = workplace && netPreview != null ? reportPay(draft, workplace, basis) : null;
  const hoursForPay = netPreview != null ? payableHours(draft, basis) : 0;
  // נסיעות: רק בתחבורה ציבורית, ורק אם עוד אין דיווח לאותו מקום באותו יום.
  const travelCounted =
    workplace != null &&
    existing.some((r) => r.workplaceId === workplace.id && r.date === date);
  const travel =
    workplace && hasTravelCost(workplace) && !travelCounted
      ? workplace.travelCostPerDirection * workplace.tripsPerDay
      : 0;
  const workedDates = existing.map((r) => r.date);
  // קורסים קבועים שמתקיימים בתאריך שנבחר (במקום העבודה שנבחר, או בכולם).
  const activeCourses = coursesOn(courses, date).filter((c) =>
    workplaces.some((w) => w.id === c.workplaceId),
  );

  /**
   * בחירת קורס. כשהשעות כבר הוזנו ונבחר קורס מתוך כמה שחופפים לטווח —
   * נקבעים מקום העבודה והנושא, והשעות שהוקלדו נשמרות. אחרת — ממלאים הכול.
   */
  function applyCourse(c: Course, keepTimes = false) {
    setCourseId(c.id);
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
  // קורסים שכבר דווחו באותו יום (אותו מקום עבודה ואותו נושא) — מסומנים ✓.
  const reportedCourse = (c: Course) =>
    existing.some((r) => r.date === date && r.workplaceId === c.workplaceId && r.note === c.name);
  const workplaceName = (id: string | null) => workplaces.find((w) => w.id === id)?.name ?? '';
  const selectedCourse = courses.find((c) => c.id === courseId) ?? null;

  function goNext() {
    if (step === 'date') {
      if (!isValidISODate(date)) {
        setErrors({ date: 'תאריך לא תקין' });
        return;
      }
      setStep(activeCourses.length > 0 ? 'course' : 'workplace');
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
    if (step === 'course' || step === 'workplace') {
      if (step === 'workplace' && activeCourses.length > 0) setStep('course');
      else setStep('date');
    } else if (step === 'times') setStep(viaCourse ? 'course' : 'workplace');
    else if (step === 'summary') setStep('times');
  }

  function chooseCourse(c: Course) {
    applyCourse(c);
    setViaCourse(true);
    setStep('times');
  }

  function chooseWorkplace(id: string) {
    setWorkplaceId(id);
    setCourseId(null);
    setViaCourse(false);
    setTouched(true);
    setErrors({});
    setStep('times');
  }

  function anotherReport() {
    Keyboard.dismiss();
    setLastSaved(null);
    setErrors({});
    setStep('date');
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
  const context =
    step === 'times' || step === 'summary' ? (
      <View style={styles.context}>
        <Text style={styles.contextMain}>
          {workplaceName(workplaceId)}
          {selectedCourse ? ` · ${selectedCourse.name}` : ''}
        </Text>
        <Text style={styles.contextSub}>{longDate(date)}</Text>
      </View>
    ) : null;

  return (
    <Screen keyboardFooter>
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

      {context}

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
          <Text style={styles.hint}>
            {activeCourses.length > 0
              ? `ביום זה ${activeCourses.length === 1 ? 'קורס אחד' : `${activeCourses.length} קורסים`} במערכת השבועית`
              : 'אין קורסים קבועים ביום זה — בשלב הבא בוחרים מקום עבודה'}
          </Text>
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
                  style={({ pressed }) => [styles.courseCard, pressed && styles.pressed]}
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
            {workplaces.map((w) => {
              const selected = w.id === workplaceId;
              return (
                <Pressable
                  key={w.id}
                  onPress={() => chooseWorkplace(w.id)}
                  style={[styles.choice, selected && styles.choiceSelected]}
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
                  <Pressable
                    onPress={() => router.push({ pathname: '/workplace-form', params: { id: w.id } })}
                    hitSlop={6}
                    style={({ pressed }) => [
                      styles.editBtn,
                      selected && styles.editBtnSelected,
                      pressed && { opacity: 0.6 },
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={`עריכת ${w.name}`}
                  >
                    <Text style={[styles.editIcon, selected && styles.choiceTextSelected]}>✎</Text>
                  </Pressable>
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
            {selectedCourse ? 'השעות לפי הקורס — אפשר לעדכן' : 'מתי עבדת?'}
          </Text>
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

            {workplace == null ? null : workplace.paymentType === 'monthly' ? (
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLine}>שכר</Text>
                <Text style={styles.summaryValue}>
                  משכורת חודשית קבועה ({formatShekels(workplace.rate)})
                </Text>
              </View>
            ) : (
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLine}>
                  שכר · {formatHours(Math.round(hoursForPay * 100) / 100)}{' '}
                  {basis === 'academic' ? 'שע׳ אקד׳' : 'שע׳'} × {formatShekels(workplace.rate)}
                </Text>
                <Text style={styles.summaryValue}>{pay == null ? '—' : formatShekels(pay)}</Text>
              </View>
            )}
            {workplace && hasTravelCost(workplace) ? (
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLine}>
                  נסיעות
                  {travelCounted
                    ? ' · כבר נספרו ליום זה'
                    : ` · ${workplace.tripsPerDay} × ${formatShekels(workplace.travelCostPerDirection)}`}
                </Text>
                <Text style={styles.summaryValue}>{formatShekels(travel)}</Text>
              </View>
            ) : null}
            {workplace && workplace.paymentType === 'hourly' ? (
              <View style={styles.summaryRow}>
                <Text style={styles.summaryTotalLabel}>סה״כ ליום</Text>
                <Text style={styles.summaryTotal}>
                  {pay == null ? '—' : formatShekels(pay + travel)}
                </Text>
              </View>
            ) : null}
          </View>
          {errors.workplace ? <Text style={styles.error}>{errors.workplace}</Text> : null}
        </>
      ) : null}

      {/* ── נשמר ── */}
      {step === 'done' && lastSaved ? (
        <View style={styles.doneBox}>
          <Text style={styles.doneIcon}>✓</Text>
          <Text style={styles.doneTitle}>הדיווח נשמר</Text>
          <Text style={styles.doneText}>{lastSaved.text}</Text>
          {lastSaved.toast ? <Text style={styles.doneSub}>{lastSaved.toast}</Text> : null}
        </View>
      ) : null}

      {/* ── ניווט ── */}
      {step === 'done' ? (
        <View style={styles.nav}>
          <Button label="דיווח נוסף" onPress={anotherReport} />
          <Button label="ללוח הבקרה" variant="secondary" onPress={() => router.replace('/dashboard')} />
          <Pressable onPress={() => router.replace('/reports')} style={styles.cancel}>
            <Text style={styles.cancelText}>להדיווחים שלי</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.nav}>
          {step === 'summary' ? (
            <Button label="שמירת הדיווח" onPress={handleSave} loading={saving} />
          ) : step === 'date' || step === 'times' ? (
            <Button label="המשך" onPress={goNext} />
          ) : null}
          {step !== 'date' ? <Button label="חזרה" variant="secondary" onPress={goBack} /> : null}
          <Pressable
            onPress={() => setExitReason('cancelled')}
            style={styles.cancel}
            accessibilityRole="link"
          >
            <Text style={styles.cancelText}>ביטול</Text>
          </Pressable>
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
