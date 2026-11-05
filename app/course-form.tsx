import { useEffect, useRef, useState } from 'react';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { ActivityIndicator, Keyboard, StyleSheet, View } from 'react-native';
import { Text } from '../components/Text';
import { Pressable } from '../components/Pressable';
import { Button } from '../components/Button';
import { useConfirm } from '../components/ConfirmDialog';
import { DateField } from '../components/DatePicker';
import { FormField } from '../components/FormField';
import { EnterChevron } from '../components/Chevrons';
import { Screen } from '../components/Screen';
import { TextField } from '../components/TextField';
import { TimeInput, type TimeInputHandle } from '../components/TimeInput';
import { SessionDots, SessionDotsByMonth, SessionDotsLegend, dotDescription, sessionDots, type SessionDot } from '../components/SessionDots';
import { removeCanceledFromPotential, removeFromPlan, returnToPlan } from '../lib/sessions';
import {
  WEEKDAY_NAMES,
  courseScheduleLabel,
  loadCourses,
  occurrences,
  periodPresets,
  sessionAcademicHours,
  upsertCourse,
} from '../lib/courses';
import { dateRange } from '../lib/dashboard';
import { formatHours } from '../lib/pay';
import { formatISODate, parseTime, todayISO } from '../lib/time';
import { loadWorkplaces } from '../lib/workplaces';
import { loadReports } from '../lib/reports';
import { deleteOrEndCourse } from '../lib/trash';
import { courseReport, courseReported, occursOn, reportsOfCourse, type Course, type CourseDraft } from '../lib/courses';
import type { WorkReport } from '../lib/reports';
import { useToast } from '../components/Toast';
import { useTheme } from '../theme/ThemeContext';
import { useThemedStyles } from '../theme/useThemedStyles';
import { radius, spacing, type AppColors } from '../theme/colors';
import { TEXT_RIGHT } from '../theme/align';

type Form = {
  name: string;
  weekday: number;
  start: string;
  end: string;
  breakMinutes: string;
  from: string;
  to: string;
  /** מפגשים פרטניים נוספים */
  extraDates: string[];
};

type Errors = Partial<Record<keyof Form, string>>;

const BREAK_OPTIONS = [0, 10, 15, 20, 30];

const MONTH_NAMES = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];

/** טופס קורס מחזורי: שם, יום בשבוע, שעות קבועות, הפסקה ותקופה. */
export default function CourseFormScreen() {
  const router = useRouter();
  const styles = useThemedStyles(makeStyles);
  const { colors } = useTheme();
  const confirm = useConfirm();
  const { showToast } = useToast();
  /** הקורס כפי שנטען, ומספר הדיווחים שלו — קובעים מחיקה או סיום */
  const [loaded, setLoaded] = useState<Course | null>(null);
  const [reportCount, setReportCount] = useState(0);
  /** הדיווחים של הקורס — לבדיקה בשמירה אם השינוי מנתק חלק מהם */
  const [courseReports, setCourseReports] = useState<WorkReport[]>([]);
  /** כל הדיווחים — לחישוב מפגשי עבר שיישארו בלי דיווח אחרי השינוי */
  const [allReports, setAllReports] = useState<WorkReport[]>([]);
  const params = useLocalSearchParams<{ id?: string; workplaceId?: string; view?: string }>();
  const id = params.id || undefined;
  /** הגיעו ממצב תצוגה (?view=1): מציגים קודם קריאה בלבד; עריכה — בכפתור */
  const fromView = Boolean(id && params.view === '1');
  const [viewing, setViewing] = useState(fromView);
  /** הערכים השמורים — לשחזור בחזרה מעריכה לתצוגה בלי שמירה */
  const savedRef = useRef<Form | null>(null);
  const [workplaceId, setWorkplaceId] = useState(params.workplaceId ?? '');
  const [workplaceName, setWorkplaceName] = useState('');
  const presets = periodPresets();
  const [form, setForm] = useState<Form | null>(
    id
      ? null
      : {
          name: '',
          weekday: new Date().getDay() > 4 ? 0 : new Date().getDay(),
          start: '',
          end: '',
          breakMinutes: '0',
          from: presets[2].from,
          to: presets[2].to,
          extraDates: [],
        },
  );
  /** מפגש שנבחר בעיגולים (תצוגה) — מציג את פרטיו */
  const [picked, setPicked] = useState<SessionDot | null>(null);
  /** תאריך למפגש נוסף (בעריכה) */
  const [extraDate, setExtraDate] = useState(todayISO());
  const [extraError, setExtraError] = useState<string | null>(null);
  /** רענון אחרי שינוי סימוני מפגשים ("עדכן פוטנציאל") */
  const [marksTick, setMarksTick] = useState(0);
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);
  const endRef = useRef<TimeInputHandle>(null);

  useEffect(() => {
    let active = true;
    Promise.all([loadCourses(), loadWorkplaces(), loadReports()]).then(([courses, workplaces, reports]) => {
      if (!active) return;
      const course = id ? courses.find((c) => c.id === id) : undefined;
      setLoaded(course ?? null);
      const mine = course ? reportsOfCourse(course, reports) : [];
      setCourseReports(mine);
      setAllReports(reports);
      setReportCount(mine.length);
      const wpId = course?.workplaceId ?? params.workplaceId ?? '';
      setWorkplaceId(wpId);
      setWorkplaceName(workplaces.find((w) => w.id === wpId)?.name ?? '');
      if (course) {
        savedRef.current = {
          name: course.name,
          weekday: course.weekday,
          start: course.start,
          end: course.end,
          breakMinutes: String(course.breakMinutes),
          from: course.from,
          to: course.to,
          extraDates: course.extraDates ?? [],
        };
        setForm({
          name: course.name,
          weekday: course.weekday,
          start: course.start,
          end: course.end,
          breakMinutes: String(course.breakMinutes),
          from: course.from,
          to: course.to,
          extraDates: course.extraDates ?? [],
        });
      }
    });
    return () => {
      active = false;
    };
  }, [id, params.workplaceId]);

  // עריכה שנפתחה מהתצוגה: "חזרה" (כותרת / אנדרואיד) מחזירה לתצוגה, לא למסך הקודם.
  const [leaving, setLeaving] = useState(false);
  usePreventRemove(fromView && !viewing && !leaving, () => backToView());
  useEffect(() => {
    if (leaving) router.back();
  }, [leaving, router]);

  function backToView() {
    if (savedRef.current) setForm(savedRef.current);
    setErrors({});
    setViewing(true);
  }

  const set = <K extends keyof Form>(key: K, value: Form[K]) => {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  if (!form) {
    return (
      <Screen scroll={false}>
        <View style={styles.center}>
          <ActivityIndicator color={colors.brand} />
        </View>
      </Screen>
    );
  }

  function validate(f: Form): Errors {
    const next: Errors = {};
    if (!f.name.trim()) next.name = 'יש להזין שם לקורס';
    const s = parseTime(f.start);
    const e = parseTime(f.end);
    if (s == null) next.start = 'שעה לא תקינה';
    if (e == null) next.end = 'שעה לא תקינה';
    if (s != null && e != null && e <= s) next.end = 'הסיום חייב להיות אחרי ההתחלה';
    if (s != null && e != null && e > s && Number(f.breakMinutes) >= e - s) {
      next.breakMinutes = 'ההפסקה ארוכה מהמפגש';
    }
    if (f.to < f.from) next.to = 'סוף התקופה לפני ההתחלה';
    return next;
  }

  async function handleSave() {
    if (!form || !workplaceId) return;
    const found = validate(form);
    setErrors(found);
    if (Object.values(found).some(Boolean)) return;
    const draft = {
      workplaceId,
      name: form.name.trim(),
      weekday: form.weekday,
      start: form.start,
      end: form.end,
      breakMinutes: Number(form.breakMinutes) || 0,
      from: form.from,
      to: form.to,
      extraDates: [...new Set(form.extraDates)].sort(),
    };
    // שינוי מועד (יום, שעות, תקופה) בקורס קיים — מתריעים לפני שמירה על שני דברים:
    //  1. דיווחים ישנים בלי `courseId` שמשויכים לפי יום ושעות, ויתנתקו מהקורס.
    //     דיווח עם מזהה נשאר משויך בכל מקרה (ומחוץ למועד — כמפגש נוסף).
    //  2. מפגשי עבר במועד החדש שאין עליהם דיווח — יופיעו כ"דיווחים חסרים".
    if (id && loaded) {
      const next: Course = { ...draft, id };
      const detached = courseReports.filter(
        (r) => !r.courseId && !(occursOn(next, r.date) && courseReport(next, r.date, [r])),
      );
      const today = todayISO();
      const pastMissing = (c: Course) =>
        occurrences(c, c.from, today < c.to ? today : c.to).filter(
          (d) => d < today && !courseReported(c, d, allReports),
        );
      const before = new Set(pastMissing(loaded));
      const newlyMissing = pastMissing(next).filter((d) => !before.has(d));
      if (detached.length > 0 || newlyMissing.length > 0) {
        const list = (dates: string[]) => {
          const shown = [...dates].sort().slice(0, 4).map(formatISODate).join(', ');
          return dates.length > 4 ? `${shown} ועוד ${dates.length - 4}` : shown;
        };
        const parts: string[] = [];
        if (detached.length > 0) {
          parts.push(
            `${detached.length === 1 ? 'דיווח ישן אחד' : `${detached.length} דיווחים ישנים`} (${list(detached.map((r) => r.date))}) משויכים לקורס רק לפי היום והשעות, ויתנתקו ממנו. הדיווחים והשכר שלהם נשמרים.`,
          );
        }
        if (newlyMissing.length > 0) {
          parts.push(
            `${newlyMissing.length === 1 ? 'מפגש שעבר' : `${newlyMissing.length} מפגשים שעברו`} במועד החדש (${list(newlyMissing)}) ${newlyMissing.length === 1 ? 'יופיע' : 'יופיעו'} כחסרי דיווח. אפשר לדווח עליהם או לסמן אותם כבוטלו.`,
          );
        }
        confirm({
          title: 'לשמור את השינוי במועד?',
          message: parts.join('\n\n'),
          confirmLabel: 'שמירה',
          onConfirm: () => save(draft),
        });
        return;
      }
    }
    await save(draft);
  }

  async function save(draft: CourseDraft) {
    setSaving(true);
    await upsertCourse({ id, ...draft });
    setSaving(false);
    if (fromView) {
      savedRef.current = form;
      setViewing(true);
    } else router.back();
  }

  /** בלי דיווחים — מחיקה; עם דיווחים — סיום הקורס (ארכיון), כדי לשמור את ההיסטוריה. */
  function handleDelete() {
    if (!id || !loaded) return;
    const ending = reportCount > 0;
    confirm({
      title: ending ? 'לסיים את הקורס?' : 'למחוק את הקורס?',
      message: ending
        ? `ל"${loaded.name}" יש ${reportCount === 1 ? 'דיווח אחד' : `${reportCount} דיווחים`}, ולכן הוא לא נמחק אלא מסתיים: הוא יוסר מהמערכת השבועית ויעבור לארכיון הקורסים. הדיווחים והתכנון של החודשים שעברו נשמרים.`
        : `"${loaded.name}" יוסר מהמערכת השבועית. אין עליו דיווחים.`,
      confirmLabel: ending ? 'סיום הקורס' : 'מחיקת הקורס',
      destructive: !ending,
      onConfirm: async () => {
        const result = await deleteOrEndCourse(loaded);
        showToast(result === 'ended' ? 'הקורס הסתיים ועבר לארכיון' : 'הקורס נמחק');
        setLeaving(true); // משחרר את חסימת היציאה, והאפקט חוזר אחורה
      },
    });
  }


  const preview = {
    start: form.start,
    end: form.end,
    breakMinutes: Number(form.breakMinutes) || 0,
  };
  const perSession = sessionAcademicHours(preview);
  /** הקורס כפי שבטופס — לחישוב המפגשים והעיגולים */
  const asCourse: Course = {
    ...preview,
    id: id ?? '',
    workplaceId,
    name: form.name,
    weekday: form.weekday,
    from: form.from,
    to: form.to,
    extraDates: form.extraDates,
  };
  const sessions = occurrences(asCourse, form.from, form.to).length;
  // טווח העיגולים: מתחילת הקורס ועד המפגש האחרון (כולל נוספים / מועברים אחרי הסוף).
  const lastExtra = form.extraDates.reduce((m, d) => (d > m ? d : m), form.to);
  const firstExtra = form.extraDates.reduce((m, d) => (d < m ? d : m), form.from);
  const dots = id ? sessionDots(asCourse, firstExtra, `${Number(lastExtra.slice(0, 4)) + 1}${lastExtra.slice(4)}`, allReports) : [];
  void marksTick;
  const canceledDots = dots.filter((d) => d.state === 'canceled');
  const counts = {
    reported: dots.filter((d) => d.state === 'reported').length,
    canceled: canceledDots.length,
    auto: dots.filter((d) => d.state === 'auto').length,
    extra: dots.filter((d) => d.kind === 'extra').length,
  };
  const sessionsCard =
    dots.length > 0 ? (
      <View style={styles.viewCard}>
        <Text style={styles.cardTitle}>מפגשי הקורס</Text>
        <Text style={styles.dateLabel}>
          {[
            counts.reported === 1 ? 'דווח 1' : `${counts.reported} דווחו`,
            counts.canceled ? (counts.canceled === 1 ? 'בוטל 1' : `${counts.canceled} בוטלו`) : null,
            counts.auto ? (counts.auto === 1 ? 'בוטל 1 אוטומטית' : `${counts.auto} בוטלו אוטומטית`) : null,
            counts.extra ? (counts.extra === 1 ? 'מפגש נוסף 1' : `${counts.extra} מפגשים נוספים`) : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </Text>
        <SessionDotsByMonth dots={dots} selected={picked?.date} onPress={(d) => setPicked(d)} />
        {picked ? (
          <Pressable
            disabled={!picked.reportId}
            onPress={() => picked.reportId && router.push({ pathname: '/report-view', params: { id: picked.reportId } })}
            accessibilityRole={picked.reportId ? 'link' : 'text'}
            style={styles.pickedRow}
          >
            <Text style={styles.pickedText}>{dotDescription(picked)}</Text>
            {picked.reportId ? (
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={styles.pickedLink}>לדיווח</Text>
                <EnterChevron size={18} color={colors.brand} />
              </View>
            ) : null}
          </Pressable>
        ) : (
          <Text style={styles.dateLabel}>לחיצה על עיגול מציגה את פרטי המפגש</Text>
        )}
        {picked && id && picked.state === 'removed' ? (
          <Button label="החזרה לתכנון" variant="secondary" onPress={() => planAction(picked, false)} />
        ) : picked && id && !picked.reportId && (picked.state === 'open' || picked.state === 'canceled') ? (
          <Pressable
            onPress={() => planAction(picked, true)}
            accessibilityRole="button"
            style={({ pressed }) => [styles.removeLink, pressed && { opacity: 0.6 }]}
          >
            <Text style={styles.removeLinkText}>מחיקת המפגש מהתכנון</Text>
            <Text style={styles.dateLabel}>המפגש לא ייספר בפוטנציאל ובצפי</Text>
          </Pressable>
        ) : null}
        <View style={styles.legend}>
          <SessionDotsLegend />
        </View>
      </View>
    ) : null;

  function addExtra() {
    if (!form) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(extraDate)) {
      setExtraError('בחר תאריך');
      return;
    }
    if (form.extraDates.includes(extraDate) || occursOn({ ...asCourse, extraDates: [] }, extraDate)) {
      setExtraError('כבר יש מפגש בתאריך הזה');
      return;
    }
    setExtraError(null);
    set('extraDates', [...form.extraDates, extraDate].sort());
  }

  /** מחיקת מפגש מהתכנון / החזרה לתכנון — מהעיגול שנבחר. */
  function planAction(dot: SessionDot, remove: boolean) {
    if (!id) return;
    const reason = dot.cancel?.reason;
    const done = (msg: string) => {
      setMarksTick((t) => t + 1);
      setPicked(null);
      showToast(msg);
    };
    if (!remove) {
      void returnToPlan(id, dot.date, reason).then(() => done('המפגש הוחזר לתכנון'));
      return;
    }
    confirm({
      title: 'למחוק את המפגש מהתכנון?',
      message: 'המפגש לא ייספר בפוטנציאל ובצפי, ולא יופיע בלו״ז. אפשר להחזיר אותו מכאן.',
      confirmLabel: 'מחיקת המפגש מהתכנון',
      onConfirm: async () => {
        await removeFromPlan(id, dot.date, reason);
        done('המפגש נמחק מהתכנון');
      },
    });
  }

  function updatePotential() {
    if (!id) return;
    confirm({
      title: 'לעדכן את הפוטנציאל?',
      message: `${canceledDots.length === 1 ? 'המפגש שבוטל יוסר' : `${canceledDots.length} המפגשים שבוטלו יוסרו`} גם מהפוטנציאל, כאילו לא תוכננו. אפשר להחזיר מפגש בודד מדף הדיווח שלו ("המפגש התקיים").`,
      confirmLabel: 'עדכון פוטנציאל',
      onConfirm: async () => {
        const n = await removeCanceledFromPotential([id]);
        setMarksTick((t) => t + 1);
        setPicked(null);
        showToast(n === 1 ? 'מפגש אחד הוסר מהפוטנציאל' : `${n} מפגשים הוסרו מהפוטנציאל`);
      },
    });
  }

  if (viewing) {
    const rows: [string, string][] = [
      ['מקום עבודה', workplaceName || '—'],
      ['מועד', courseScheduleLabel(form)],
      ['הפסקה', Number(form.breakMinutes) > 0 ? `${form.breakMinutes} דק׳` : 'ללא'],
      ['תקופה', dateRange(form.from, form.to, true)],
      [
        'שעות אקדמיות',
        `${formatHours(Math.round(perSession * 100) / 100)} למפגש · ${sessions} מפגשים`,
      ],
    ];
    return (
      <Screen>
        <Stack.Screen options={{ title: 'קורס' }} />
        <Text style={styles.viewTitle}>{form.name}</Text>
        <View style={styles.viewCard}>
          {rows.map(([label, value], i) => (
            <View key={label} style={[styles.viewRow, i === rows.length - 1 && styles.viewRowLast]}>
              <Text style={styles.dateLabel}>{label}</Text>
              <Text style={styles.viewValue}>{value}</Text>
            </View>
          ))}
        </View>
        {sessionsCard}
        <Button label="עריכה" onPress={() => setViewing(false)} />
        <Button label="חזרה" variant="secondary" onPress={() => router.back()} />
      </Screen>
    );
  }

  return (
    <Screen keyboardFooter>
      <Stack.Screen options={{ title: id ? 'עריכת קורס' : 'קורס חדש' }} />
      {workplaceName ? <Text style={styles.workplace}>{workplaceName}</Text> : null}

      <FormField label="שם הקורס" error={errors.name}>
        <TextField
          value={form.name}
          onChangeText={(t) => set('name', t)}
          placeholder="תולדות האדריכלות — שנה א׳"
          invalid={Boolean(errors.name)}
        />
      </FormField>

      <FormField label="יום בשבוע">
        <View style={styles.chips}>
          {WEEKDAY_NAMES.slice(0, 6).map((name, day) => {
            const on = form.weekday === day;
            return (
              <Pressable
                key={day}
                onPress={() => set('weekday', day)}
                style={[styles.chip, on && styles.chipOn]}
              >
                <Text style={[styles.chipText, on && styles.chipTextOn]}>{name}</Text>
              </Pressable>
            );
          })}
        </View>
      </FormField>

      <View style={styles.timesRow}>
        <View style={styles.timeCol}>
          <FormField label="שעת התחלה" error={errors.start}>
            <TimeInput
              value={form.start}
              onChange={(v) => set('start', v)}
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
              value={form.end}
              onChange={(v) => set('end', v)}
              onComplete={() => Keyboard.dismiss()}
              invalid={Boolean(errors.end)}
            />
          </FormField>
        </View>
      </View>

      <FormField label="הפסקה קבועה" error={errors.breakMinutes}>
        <View style={styles.chips}>
          {BREAK_OPTIONS.map((n) => {
            const on = form.breakMinutes === String(n);
            return (
              <Pressable
                key={n}
                onPress={() => set('breakMinutes', String(n))}
                style={[styles.chip, on && styles.chipOn]}
              >
                <Text style={[styles.chipText, on && styles.chipTextOn]}>
                  {n === 0 ? 'בלי' : `${n} דק׳`}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </FormField>

      <FormField label="תקופה" hint="חודש־חודש, או לפי סמסטר" error={errors.to}>
        <View style={styles.chips}>
          {presets.map((p) => {
            const on = form.from === p.from && form.to === p.to;
            return (
              <Pressable
                key={p.key}
                onPress={() => {
                  set('from', p.from);
                  set('to', p.to);
                }}
                style={[styles.chip, on && styles.chipOn]}
              >
                <Text style={[styles.chipText, on && styles.chipTextOn]}>{p.label}</Text>
              </Pressable>
            );
          })}
        </View>
        <View style={styles.dates}>
          <View style={styles.dateCol}>
            <Text style={styles.dateLabel}>מתאריך</Text>
            <DateField value={form.from} onChange={(v) => set('from', v)} />
          </View>
          <View style={styles.dateCol}>
            <Text style={styles.dateLabel}>עד תאריך</Text>
            <DateField value={form.to} onChange={(v) => set('to', v)} invalid={Boolean(errors.to)} />
          </View>
        </View>
      </FormField>

      {perSession > 0 ? (
        <View style={styles.summary}>
          <Text style={styles.summaryText}>
            {formatHours(Math.round(perSession * 100) / 100)} שע׳ אקדמיות למפגש · {sessions} מפגשים
            בתקופה · סה״כ {formatHours(Math.round(perSession * sessions * 10) / 10)} שע׳ אקדמיות
          </Text>
        </View>
      ) : null}

      <FormField label="מפגשים נוספים" hint="מפגש פרטני מעבר ליום הקבוע, בשעות הקורס">
        {form.extraDates.length > 0 ? (
          <View style={styles.chips}>
            {form.extraDates.map((d) => (
              <Pressable
                key={d}
                onPress={() => set('extraDates', form.extraDates.filter((x) => x !== d))}
                accessibilityRole="button"
                accessibilityLabel={`הסרת המפגש הנוסף ב־${formatISODate(d)}`}
                style={styles.chip}
              >
                <Text style={styles.chipText}>{formatISODate(d)} ✕</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
        <View style={styles.dates}>
          <View style={styles.dateCol}>
            <DateField
              value={extraDate}
              onChange={(v) => {
                setExtraDate(v);
                setExtraError(null);
              }}
              invalid={Boolean(extraError)}
            />
          </View>
          <Button label="הוספת מפגש" variant="secondary" onPress={addExtra} />
        </View>
        {extraError ? <Text style={styles.error}>{extraError}</Text> : null}
      </FormField>

      {sessionsCard}

      {id && canceledDots.length > 0 ? (
        <View style={styles.viewCard}>
          <Text style={styles.cardTitle}>מפגשים שבוטלו ונשארו בפוטנציאל</Text>
          <SessionDots dots={canceledDots} />
          <Text style={styles.dateLabel}>
            הם יורדים מהצפי בלבד. "עדכון פוטנציאל" מסיר אותם גם מהפוטנציאל.
          </Text>
          <View style={styles.legend}>
            <Button label="עדכון פוטנציאל" variant="secondary" onPress={updatePotential} />
          </View>
        </View>
      ) : null}

      <Button label={id ? 'שמירת שינויים' : 'הוספת הקורס'} onPress={handleSave} loading={saving} />
      {fromView ? <Button label="חזרה" variant="secondary" onPress={backToView} /> : null}
      {id && loaded ? (
        reportCount > 0 ? (
          loaded.to >= todayISO() ? (
            <Button label="סיום הקורס (מעבר לארכיון)" variant="secondary" onPress={handleDelete} />
          ) : null
        ) : (
          <Button label="מחיקת הקורס" variant="danger" onPress={handleDelete} />
        )
      ) : null}
      {confirm.dialog}
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
    workplace: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.textMuted,
      textAlign: TEXT_RIGHT,
    },
    chips: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
    },
    chip: {
      height: 38,
      paddingHorizontal: spacing.md,
      justifyContent: 'center',
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    chipOn: {
      backgroundColor: colors.brand,
      borderColor: colors.brand,
    },
    chipText: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text,
    },
    chipTextOn: {
      color: colors.textOnBrand,
    },
    timesRow: {
      flexDirection: 'row',
      gap: spacing.md,
    },
    timeCol: {
      flex: 1,
      minWidth: 0,
    },
    dates: {
      flexDirection: 'row',
      gap: spacing.sm,
      marginTop: spacing.sm,
    },
    dateCol: {
      flex: 1,
      minWidth: 0,
      gap: 4,
    },
    dateLabel: {
      fontSize: 12,
      color: colors.textMuted,
      textAlign: TEXT_RIGHT,
    },
    summary: {
      backgroundColor: colors.brandLight,
      borderRadius: radius.md,
      padding: spacing.md,
    },
    viewTitle: { fontSize: 20, fontWeight: '800', color: colors.text, textAlign: TEXT_RIGHT },
    viewCard: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
    },
    viewRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: spacing.md,
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    viewRowLast: { borderBottomWidth: 0 },
    viewValue: { flex: 1, fontSize: 15, fontWeight: '600', color: colors.text, textAlign: 'left' },
    cardTitle: { fontSize: 15, fontWeight: '700', color: colors.text, textAlign: TEXT_RIGHT, paddingTop: 12 },
    monthRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, paddingTop: spacing.sm },
    monthName: { width: 56, fontSize: 12, color: colors.textMuted, textAlign: TEXT_RIGHT, paddingTop: 7 },
    monthDots: { flex: 1, minWidth: 0 },
    pickedRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: spacing.sm,
      marginTop: spacing.sm,
      padding: spacing.sm,
      borderRadius: radius.md,
      backgroundColor: colors.background,
    },
    pickedText: { flex: 1, fontSize: 13, color: colors.text, textAlign: TEXT_RIGHT },
    removeLink: { gap: 2, paddingVertical: 4 },
    removeLinkText: { fontSize: 14, fontWeight: '700', color: colors.dangerText, textAlign: TEXT_RIGHT },
    pickedLink: { fontSize: 13, fontWeight: '700', color: colors.brand },
    legend: { paddingVertical: spacing.sm },
    error: { fontSize: 13, color: colors.danger, textAlign: TEXT_RIGHT },
    summaryText: {
      fontSize: 13,
      color: colors.brandDark,
      textAlign: TEXT_RIGHT,
    },
  });
