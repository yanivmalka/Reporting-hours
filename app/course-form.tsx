import { RequireAccess, useAccess } from '../components/Access';
import { useEffect, useRef, useState } from 'react';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { Keyboard, Platform, StyleSheet, View } from 'react-native';
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
import { VacationsCard } from '../components/Vacations';
import { SessionDots, SessionDotsByMonth, SessionDotsLegend, dotDescription, sessionDots, type SessionDot } from '../components/SessionDots';
import { removeCanceledFromPotential, removeFromPlan, returnToPlan } from '../lib/sessions';
import { WEEKDAY_NAMES, WEEKDAY_SHORT, courseScheduleLabel, courseSiblings, loadCourses, occurrences, periodPresets, saveCourseGroup, sessionAcademicHours, upsertCourse, type ExtraSessionInfo } from '../lib/courses';
import { hebrewRange } from '../lib/hebrewDate';
import { Icon } from '../components/Icon';
import { BreakField } from '../components/course/BreakField';
import { EndTimeCalculatorButton } from '../components/course/EndTimeCalculator';
import { ExtraSessionsCard, type ExtraSessions } from '../components/course/ExtraSessionsCard';
import { formatHours } from '../lib/pay';
import { endNotAfterStart, formatISODate, parseTime, todayISO } from '../lib/time';
import { loadWorkplaces } from '../lib/workplaces';
import { loadReports } from '../lib/reports';
import { deleteOrEndCourse } from '../lib/trash';
import { courseReport, courseReported, occursOn, reportsOfCourse, type Course, type CourseDraft } from '../lib/courses';
import type { WorkReport } from '../lib/reports';
import { useToast } from '../components/Toast';
import { useTheme } from '../theme/ThemeContext';
import { useThemedStyles } from '../theme/useThemedStyles';
import { cardShadow, radius, spacing, type AppColors } from '../theme/colors';
import { TEXT_RIGHT } from '../theme/align';
import { beforeTracking } from '../lib/trackingStart';
import { LoadingScreen } from '../components/LoadingScreen';

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
  /** פרטי המפגשים הנוספים (שם, תיאור, שעות) */
  extraInfo: Record<string, ExtraSessionInfo>;
  /** ימים נוספים בשבוע שיישמרו כקורסים אחים (עם שעות משלהם) */
  moreDays: { key: string; weekday: number; start: string; end: string }[];
};

type Errors = Partial<Record<keyof Form, string>>;

const MONTH_NAMES = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
void MONTH_NAMES;
let dayKey = 0;

/** טופס קורס מחזורי: שם, יום בשבוע, שעות קבועות, הפסקה ותקופה. */
function CourseFormScreenInner() {
  const { canEdit } = useAccess();
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
          from: presets[1].from,
          to: presets[1].to,
          extraDates: [],
          extraInfo: {},
          moreDays: [],
        },
  );
  /** הקורס בימים נוספים בשבוע (אותה קבוצה) */
  const [siblings, setSiblings] = useState<Course[]>([]);
  /** מפגש שנבחר בעיגולים (תצוגה) — מציג את פרטיו */
  const [picked, setPicked] = useState<SessionDot | null>(null);
  /** רענון אחרי שינוי סימוני מפגשים ("עדכן פוטנציאל") */
  const [marksTick, setMarksTick] = useState(0);
  // ב־web הדף מרונדר מראש בלי פרמטרים (תמיד "קורס חדש"). הרינדור הראשון
  // בדפדפן הוא מצב טעינה, כמו בשרת, ורק אחריו הקורס — אחרת פתיחה ישירה של
  // ?id= גורמת לאי־התאמה (#418). כמו ב־app/workplace-form.tsx.
  const [hydrated, setHydrated] = useState(Platform.OS !== 'web');
  useEffect(() => setHydrated(true), []);
  // חופשה שנוספה / שהתעלמו ממנה משנה את העיגולים — רענון אחרי בניית האינדקס מחדש.
  const refreshMarks = () => setMarksTick((t) => t + 1);
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);
  const endRef = useRef<TimeInputHandle>(null);

  useEffect(() => {
    let active = true;
    Promise.all([loadCourses(), loadWorkplaces(), loadReports()]).then(([courses, workplaces, reports]) => {
      if (!active) return;
      const course = id ? courses.find((c) => c.id === id) : undefined;
      setLoaded(course ?? null);
      setSiblings(course ? courseSiblings(course, courses) : []);
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
          extraInfo: course.extraInfo ?? {},
          moreDays: [],
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
          extraInfo: course.extraInfo ?? {},
          moreDays: [],
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

  if (!form || !hydrated) {
    return <LoadingScreen />;
  }

  function setMoreDay(key: string, patch: Partial<Form['moreDays'][number]>) {
    set(
      'moreDays',
      (form?.moreDays ?? []).map((d) => (d.key === key ? { ...d, ...patch } : d)),
    );
  }
  function addMoreDay() {
    if (!form) return;
    const used = new Set([form.weekday, ...siblings.map((c) => c.weekday), ...form.moreDays.map((d) => d.weekday)]);
    const weekday = [1, 2, 3, 4, 5, 6, 0].map((i) => (form.weekday + i) % 7).find((d) => !used.has(d)) ?? form.weekday;
    set('moreDays', [...form.moreDays, { key: `d${++dayKey}`, weekday, start: form.start, end: form.end }]);
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
    for (const d of f.moreDays) {
      const ds = parseTime(d.start);
      const de = parseTime(d.end);
      if (ds == null || de == null || de <= ds) next.moreDays = 'שעות לא תקינות ביום נוסף';
    }
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
      extraInfo: Object.keys(form.extraInfo).length ? form.extraInfo : undefined,
      groupId: loaded?.groupId,
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
          (d) => d < today && !beforeTracking(d) && !courseReported(c, d, allReports),
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
    if (!form) return;
    setSaving(true);
    // ימים נוספים בשבוע — קורסים אחים באותה קבוצה; שם, הפסקה ותקופה מתעדכנים בכולם.
    const all = await saveCourseGroup(
      { id, ...draft },
      form.moreDays.map(({ weekday, start, end }) => ({ weekday, start, end })),
    );
    const self = all.find((c) => c.id === id);
    if (self) setSiblings(courseSiblings(self, all));
    setForm((f) => (f ? { ...f, moreDays: [] } : f));
    setSaving(false);
    if (fromView) {
      savedRef.current = { ...form, moreDays: [] };
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
    extraInfo: form.extraInfo,
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
    vacation: dots.filter((d) => d.state === 'vacation').length,
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
            counts.vacation ? (counts.vacation === 1 ? 'מפגש 1 בחופשה' : `${counts.vacation} בחופשה`) : null,
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
          <SessionDotsLegend groups={[dots]} />
        </View>
      </View>
    ) : null;

  /** מחיקת מפגש מהתכנון / החזרה לתכנון — מהעיגול שנבחר. */
  function planAction(dot: SessionDot, remove: boolean) {
    if (!id) return;
    const reason = dot.cancel?.reason;
    const reasonId = dot.cancel?.reasonId;
    const done = (msg: string) => {
      setMarksTick((t) => t + 1);
      setPicked(null);
      showToast(msg);
    };
    if (!remove) {
      void returnToPlan(id, dot.date, reason, reasonId).then(() => done('המפגש הוחזר לתכנון'));
      return;
    }
    confirm({
      title: 'למחוק את המפגש מהתכנון?',
      message: 'המפגש לא ייספר בפוטנציאל ובצפי, ולא יופיע בלו״ז. אפשר להחזיר אותו מכאן.',
      confirmLabel: 'מחיקת המפגש מהתכנון',
      onConfirm: async () => {
        await removeFromPlan(id, dot.date, reason, reasonId);
        done('המפגש נמחק מהתכנון');
      },
    });
  }

  /** מפגשים נוספים: בעריכה — בטופס; בתצוגה — נשמרים מיד בקורס. */
  function changeExtras(next: ExtraSessions) {
    setForm((f) => (f ? { ...f, ...next } : f));
    if (viewing && loaded) {
      const updated = { ...loaded, extraDates: next.extraDates, extraInfo: next.extraInfo };
      void upsertCourse(updated).then(() => {
        setLoaded(updated);
        if (savedRef.current) savedRef.current = { ...savedRef.current, ...next };
        setMarksTick((t) => t + 1);
        showToast('המפגשים הנוספים נשמרו');
      });
    }
  }
  const extrasCard = (
    <ExtraSessionsCard
      course={asCourse}
      value={{ extraDates: form.extraDates, extraInfo: form.extraInfo }}
      onChange={changeExtras}
      editable={canEdit}
    />
  );

  /** הקורס בימים נוספים — שורות מעבר לכל אחד */
  const siblingRows = siblings.map((c) => (
    <Pressable
      key={c.id}
      onPress={() => router.push({ pathname: '/course-form', params: { id: c.id, view: '1' } })}
      accessibilityRole="link"
      style={({ pressed }) => [styles.viewRow, pressed && { opacity: 0.7 }]}
    >
      <Text style={styles.dateLabel}>גם ב</Text>
      <View style={styles.viewLinkValue}>
        <Text style={styles.viewValueLink}>{courseScheduleLabel(c)}</Text>
        <EnterChevron />
      </View>
    </Pressable>
  ));

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
      ['תקופה', `\u2066${formatISODate(form.from)}–${formatISODate(form.to)}\u2069\n${hebrewRange(form.from, form.to)}`],
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
          {rows.map(([label, value], i) =>
            i === 0 && workplaceId ? (
              <Pressable
                key={label}
                onPress={() => router.push({ pathname: '/workplace', params: { id: workplaceId } })}
                accessibilityRole="button"
                style={({ pressed }) => [styles.viewRow, pressed && { opacity: 0.7 }]}
              >
                <Text style={styles.dateLabel}>{label}</Text>
                <View style={styles.viewLinkValue}>
                  <Text style={styles.viewValueLink}>{value}</Text>
                  <EnterChevron />
                </View>
              </Pressable>
            ) : (
              <View key={label} style={[styles.viewRow, i === rows.length - 1 && styles.viewRowLast]}>
                <Text style={styles.dateLabel}>{label}</Text>
                <Text style={styles.viewValue}>{value}</Text>
              </View>
            ),
          )}
          {siblingRows}
        </View>
        {sessionsCard}
        {extrasCard}
        {id && workplaceId ? <VacationsCard target={{ kind: 'course', id, workplaceId }} onChanged={refreshMarks} /> : null}
        {canEdit ? <Button label="עריכה" onPress={() => setViewing(false)} /> : null}
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
          {WEEKDAY_NAMES.map((name, day) => {
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
          <FormField
            label="שעת סיום"
            error={errors.end ?? (endNotAfterStart(form.start, form.end) ? 'הסיום חייב להיות אחרי ההתחלה' : undefined)}
          >
            <TimeInput
              ref={endRef}
              min={form.start}
              value={form.end}
              onChange={(v) => set('end', v)}
              onComplete={() => Keyboard.dismiss()}
              invalid={Boolean(errors.end)}
            />
          </FormField>
          <EndTimeCalculatorButton
            start={form.start}
            breakMinutes={Number(form.breakMinutes) || 0}
            onApply={(v) => set('end', v)}
          />
        </View>
      </View>

      <FormField
        label="ימים נוספים בשבוע"
        hint="קורס שמתקיים בכמה ימים — לכל יום שעות משלו. נשמר כקורס לכל יום, עם שם, הפסקה ותקופה משותפים."
        error={errors.moreDays}
      >
        {siblings.length ? <View style={styles.viewCard}>{siblingRows}</View> : null}
        {form.moreDays.map((d) => (
          <View key={d.key} style={styles.moreDay}>
            <View style={styles.moreDayHead}>
              <View style={[styles.chips, { flex: 1 }]}>
                {WEEKDAY_SHORT.map((n, day) => {
                  const on = d.weekday === day;
                  return (
                    <Pressable
                      key={day}
                      onPress={() => setMoreDay(d.key, { weekday: day })}
                      style={[styles.dayChip, on && styles.chipOn]}
                    >
                      <Text style={[styles.chipText, on && styles.chipTextOn]}>{n}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <Pressable
                onPress={() => set('moreDays', form.moreDays.filter((x) => x.key !== d.key))}
                accessibilityRole="button"
                accessibilityLabel="הסרת היום הנוסף"
                hitSlop={8}
              >
                <Icon name="close" size={20} color={colors.textMuted} />
              </Pressable>
            </View>
            <View style={styles.timesRow}>
              <View style={styles.timeCol}>
                <TimeInput value={d.start} onChange={(v) => setMoreDay(d.key, { start: v })} label="שעת התחלה" />
              </View>
              <View style={styles.timeCol}>
                <TimeInput value={d.end} min={d.start} onChange={(v) => setMoreDay(d.key, { end: v })} label="שעת סיום" />
              </View>
            </View>
          </View>
        ))}
        <Pressable onPress={addMoreDay} accessibilityRole="button" hitSlop={8} style={styles.addDay}>
          <Icon name="plus" size={18} color={colors.brand} />
          <Text style={styles.addDayText}>יום נוסף בשבוע</Text>
        </Pressable>
      </FormField>

      <FormField label="הפסקה קבועה" hint="זמן ההפסקה אינו בתשלום" error={errors.breakMinutes}>
        <BreakField value={form.breakMinutes} onChange={(v) => set('breakMinutes', v)} />
      </FormField>

      <FormField label="תאריכי הקורס" error={errors.to}>
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

      {sessionsCard}
      {extrasCard}

      {id && workplaceId ? (
        <VacationsCard target={{ kind: 'course', id, workplaceId }} editable onChanged={refreshMarks} />
      ) : null}

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
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      ...cardShadow,
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
    // שורה לחיצה: הערך (שם מקום העבודה / מועד) ממלא את הרוחב, וה־‹ בקצה השורה (בעברית — שמאל),
    // כמו בתצוגת דיווח ובדוח שכר.
    viewLinkValue: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4 },
    viewValueLink: { flex: 1, fontSize: 15, fontWeight: '600', color: colors.text, textAlign: 'left' },
    moreDay: {
      gap: spacing.sm,
      padding: spacing.sm,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: spacing.sm,
    },
    moreDayHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
    dayChip: {
      minWidth: 34,
      height: 34,
      paddingHorizontal: 8,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    addDay: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingVertical: 4 },
    addDayText: { fontSize: 14, fontWeight: '700', color: colors.brand },
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

export default function CourseFormScreen() {
  // תצוגת קורס פתוחה לכולם; עריכה ויצירה — רק בהרשאה מלאה (docs/sharing-spec.md).
  const { view } = useLocalSearchParams<{ view?: string }>();
  if (view === '1') return <CourseFormScreenInner />;
  return (
    <RequireAccess need="edit">
      <CourseFormScreenInner />
    </RequireAccess>
  );
}
