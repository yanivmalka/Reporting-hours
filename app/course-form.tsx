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
import { Screen } from '../components/Screen';
import { TextField } from '../components/TextField';
import { TimeInput, type TimeInputHandle } from '../components/TimeInput';
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
import { courseReport, occursOn, reportsOfCourse, type Course, type CourseDraft } from '../lib/courses';
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
};

type Errors = Partial<Record<keyof Form, string>>;

const BREAK_OPTIONS = [0, 10, 15, 20, 30];

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
        },
  );
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
        };
        setForm({
          name: course.name,
          weekday: course.weekday,
          start: course.start,
          end: course.end,
          breakMinutes: String(course.breakMinutes),
          from: course.from,
          to: course.to,
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
    };
    // דיווחים קיימים שלא יתאימו למועד החדש (יום, שעות, תקופה) — מתריעים לפני שמירה.
    const next: Course = { ...draft, id: id ?? '' };
    const detached = id
      ? courseReports.filter((r) => !(occursOn(next, r.date) && courseReport(next, r.date, [r])))
      : [];
    if (detached.length > 0) {
      const dates = detached
        .map((r) => r.date)
        .sort()
        .slice(0, 5)
        .map(formatISODate)
        .join(', ');
      const more = detached.length > 5 ? ` ועוד ${detached.length - 5}` : '';
      confirm({
        title: 'השינוי ינתק דיווחים מהקורס',
        message: `${detached.length === 1 ? 'דיווח אחד' : `${detached.length} דיווחים`} של הקורס (${dates}${more}) כבר לא יתאימו למועד החדש. הדיווחים והשכר שלהם נשמרים, אבל הם לא ייספרו במפגשי הקורס ובמימוש התכנון. כדי לשמור עליהם, אפשר לסיים את הקורס הזה ולפתוח קורס חדש עם המועד החדש.`,
        confirmLabel: 'שמירה בכל זאת',
        onConfirm: () => save(draft),
      });
      return;
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
  const sessions = occurrences(
    { ...preview, id: '', workplaceId, name: '', weekday: form.weekday, from: form.from, to: form.to },
    form.from,
    form.to,
  ).length;

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
    summaryText: {
      fontSize: 13,
      color: colors.brandDark,
      textAlign: TEXT_RIGHT,
    },
  });
