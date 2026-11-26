/**
 * תצוגת דיווח שנשמר — קריאה בלבד. עריכה דורשת פעולה אקטיבית: כפתור
 * "עריכה" פותח את האשף, ו"חזרה" באשף מחזירה לכאן.
 * דיווח בחודש שהדוח שלו כבר נשלח לשכר — נעול; במקום עריכה — שורת 🔒 שמובילה לדוח.
 * מבנה קומפקטי לפי חשיבות (26.11.2026): קורס, מקום ושכר → תאריך → שעות → פרטים משניים.
 */
import { useAccess } from '../components/Access';
import { useRef, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { Text } from '../components/Text';
import { Button } from '../components/Button';
import { Pressable } from '../components/Pressable';
import { Screen } from '../components/Screen';
import { sameSessionReports } from '../lib/reportEdit';
import { useConfirm } from '../components/ConfirmDialog';
import { adjustAccumulated } from '../lib/accumulated';
import { courseReport, coursesOn, loadCourses, type Course } from '../lib/courses';
import { NO_CANCEL } from '../lib/sessions';
import { currentPayPeriod } from '../lib/dashboard';
import { hebrewDate } from '../lib/hebrewDate';
import { reportPay } from '../lib/pay';
import { usePayBasis } from '../lib/payBasis';
import { isLocked, isPaid, loadPayrollStatus, periodTitle, statusKey } from '../lib/payroll';
import { academicOf, deleteReport, EXTRA_SESSION_LABELS, loadReports, netMinutes, totalBreakMinutes, type WorkReport } from '../lib/reports';
import { formatDuration, formatISODate } from '../lib/time';
import { formatShekels } from '../lib/travel';
import { loadWorkplaces, type Workplace } from '../lib/workplaces';
import { TEXT_RIGHT } from '../theme/align';
import { workplaceColor } from '../theme/workplaceColors';
import { useTheme } from '../theme/ThemeContext';
import { useThemedStyles } from '../theme/useThemedStyles';
import { cardShadow, radius, spacing, type AppColors } from '../theme/colors';
import { EnterChevron } from '../components/Chevrons';
import { useScreenData } from '../components/useScreenData';
import { LoadingScreen } from '../components/LoadingScreen';
import { ViaEmail } from '../components/ViaEmail';
import { InfoLine } from '../components/InfoLine';
import { useSessionNotes } from '../components/useSessionNotes';
import { FLAG_LABEL, noteFor } from '../lib/sessionNotes';

const WEEKDAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

export default function ReportViewScreen() {
  const router = useRouter();
  const styles = useThemedStyles(makeStyles);
  const { colors } = useTheme();
  const { basis } = usePayBasis();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const sessionNotes = useSessionNotes();
  const [data, setData] = useState<{
    report: WorkReport | null;
    workplace?: Workplace;
    lockedStart: string | null;
    /** הדוח שולם — נעול לצמיתות */
    paid: boolean;
    /** הקורס שהדיווח מכסה (אם יש) — לסימון "השיעור לא התקיים" */
    course?: Course;
    /** דיווחים נוספים על אותו מפגש (כפילות) */
    duplicates: WorkReport[];
  } | null>(null);
  /** הדיווח כבר הוצג — אם נעלם בחזרה מהעריכה, הוא נמחק */
  const hadReport = useRef(false);
  const confirm = useConfirm();
  const { canReport } = useAccess();

  // נטען מחדש בכל חזרה למסך — כדי לשקף עריכה שנשמרה באשף.
  useScreenData(
    () => Promise.all([loadReports(), loadWorkplaces(), loadPayrollStatus(), loadCourses()]),
    [id],
    ([reports, wps, st, crs]) => {
      const report = reports.find((r) => r.id === id) ?? null;
      const workplace = report ? wps.find((w) => w.id === report.workplaceId) : undefined;
      let lockedStart: string | null = null;
      let paid = false;
      if (report && workplace) {
        const [y, m, d] = report.date.split('-').map(Number);
        const p = currentPayPeriod(workplace.payday, new Date(y, m - 1, d));
        const status = st[statusKey(workplace.id, p.start)];
        if (isLocked(status)) lockedStart = p.start;
        paid = isPaid(status);
      }
      // דיווח ששומר `courseId` מזוהה לפי המזהה, גם אם הקורס כבר לא מתקיים
      // בתאריך הזה (נערך, קוצר או הסתיים). דיווח ישן בלי מזהה — לפי הקורסים
      // של אותו יום, בשם או בחפיפת שעות.
      const course = !report
        ? undefined
        : report.courseId
          ? crs.find((c) => c.id === report.courseId)
          : coursesOn(crs, report.date, report.workplaceId, NO_CANCEL).find((c) =>
              courseReport(c, report.date, [report]),
            );
      // הדיווח נמחק בעריכה (מחיקה או "סימון כבוטל") — חוזרים למקום המוצא.
      if (!report && hadReport.current) {
        hadReport.current = false;
        router.back();
        return;
      }
      hadReport.current = Boolean(report);
      const duplicates = report ? sameSessionReports(report, reports) : [];
      setData({ report, workplace, lockedStart, paid, course, duplicates });
    },
  );

  if (!data) {
    return <LoadingScreen />;
  }

  const { report, workplace, lockedStart, paid, course } = data;
  if (!report) {
    return (
      <Screen>
        <Text style={styles.muted}>הדיווח לא נמצא — ייתכן שנמחק.</Text>
        <Button label="חזרה" variant="secondary" onPress={() => router.back()} />
      </Screen>
    );
  }

  // פרטי המפגש (סיכום, סימון) — נשמרים לפי קורס + תאריך (lib/sessionNotes.ts).
  const sessionNote = report.courseId ? noteFor(sessionNotes, report.courseId, report.date) : undefined;
  const [y, m, d] = report.date.split('-').map(Number);
  const weekday = WEEKDAYS[new Date(y, m - 1, d).getDay()];
  const breaks = totalBreakMinutes(report.breaks);
  const net = netMinutes(report);
  const ac = academicOf(report);
  const pay = workplace ? reportPay(report, workplace, basis) : null;

  // מעבר לרשומות הקשורות (מקום עבודה, קורס, דוח שכר) — שורות לחיצות עם ‹.
  const period = workplace ? currentPayPeriod(workplace.payday, new Date(y, m - 1, d)) : null;
  const openWorkplace = workplace
    ? () => router.push({ pathname: '/workplace', params: { id: workplace.id } })
    : undefined;
  const openCourse = course
    ? () => router.push({ pathname: '/course-form', params: { id: course.id, view: '1' } })
    : undefined;
  const openPayroll =
    workplace && period
      ? () => router.push({ pathname: '/payroll-report', params: { wp: workplace.id, start: lockedStart ?? period.start } })
      : undefined;

  // מבנה קומפקטי לפי חשיבות: מה (קורס, מקום) וכמה (שכר) → מתי → השעות →
  // פרטים משניים בשורה קטנה → מי דיווח. הנעילה והמייל — שורות מקופלות בכרטיס נפרד.
  const workplaceName = workplace?.name ?? 'מקום עבודה שנמחק';
  const title = report.note || workplaceName;
  const notes: string[] = [
    ...(report.extraKind ? [`מפגש נוסף · ${EXTRA_SESSION_LABELS[report.extraKind]}`] : []),
    ...(sessionNote?.flag ? [FLAG_LABEL[sessionNote.flag]] : []),
  ];
  const academic =
    ac == null ? null : ac.leftoverMinutes ? `${ac.wholeHours} ו־${ac.leftoverMinutes} דק׳` : String(ac.wholeHours);
  const secondTile: [string, string] = academic
    ? ['שעות אקדמיות', academic]
    : ['זמן עבודה נטו', net == null ? '—' : formatDuration(net)];
  const details = [
    ...(academic && net != null ? [`נטו ${formatDuration(net)}`] : []),
    breaks > 0 ? `הפסקות ${formatDuration(breaks)}` : 'ללא הפסקות',
    ...(report.carriedMinutes > 0 ? [`למונה המצטבר +${report.carriedMinutes} דק׳`] : []),
  ];
  const payrollLabel = period
    ? lockedStart
      ? `דוח ${periodTitle(period)} · ${paid ? 'שולם' : 'נשלח'}`
      : `דוח שכר · ${periodTitle(period)}`
    : null;

  return (
    <Screen>
      <View style={[styles.card, workplace ? { borderStartWidth: 5, borderStartColor: workplaceColor(colors, workplace) } : null]}>
        <View style={styles.head}>
          <View style={styles.headText}>
            <LinkText text={title} onPress={report.note ? openCourse : openWorkplace} style={styles.title} styles={styles} />
            {report.note ? (
              <LinkText text={workplaceName} onPress={openWorkplace} style={styles.subtitle} styles={styles} />
            ) : null}
          </View>
          <Text style={typeof pay === 'number' ? styles.pay : styles.payMonthly}>
            {typeof pay === 'number' ? formatShekels(pay) : 'משכורת חודשית'}
          </Text>
        </View>

        <InfoLine
          parts={[`יום ${weekday}`, formatISODate(report.date), hebrewDate(report.date, false)]}
          style={styles.date}
        />
        {notes.length ? <InfoLine parts={notes} style={styles.note} /> : null}
        {sessionNote?.summary ? <Text style={styles.summary}>{sessionNote.summary}</Text> : null}

        <View style={styles.tiles}>
          <View style={styles.tile}>
            <Text style={styles.tileLabel}>שעות</Text>
            <Text style={styles.tileValue}>{`⁦${report.start}–${report.end}⁩`}</Text>
          </View>
          <View style={styles.tile}>
            <Text style={styles.tileLabel}>{secondTile[0]}</Text>
            <Text style={styles.tileValue}>{secondTile[1]}</Text>
          </View>
        </View>

        <InfoLine parts={details} style={styles.small} />
        {report.by ? <Text style={styles.small}>דווח ע״י {report.by.name || report.by.email}</Text> : null}
      </View>

      {payrollLabel || report.viaEmail ? (
        <View style={styles.linksCard}>
          {payrollLabel ? (
            <Pressable
              onPress={openPayroll}
              accessibilityRole="link"
              accessibilityHint={
                lockedStart && !paid ? 'כדי לערוך או למחוק, מבטלים קודם את הדוח שנשלח' : undefined
              }
              style={({ pressed }) => [styles.linkRow, report.viaEmail && styles.linkRowBorder, pressed && styles.pressed]}
            >
              <Text style={styles.linkRowText}>{lockedStart ? `🔒 ${payrollLabel}` : payrollLabel}</Text>
              <EnterChevron size={18} />
            </Pressable>
          ) : null}
          {report.viaEmail ? <ViaEmail via={report.viaEmail} /> : null}
        </View>
      ) : null}

      {data.duplicates.length ? (
        <View style={styles.dupCard}>
          <Text style={styles.dupTitle}>
            ⚠ {data.duplicates.length === 1 ? 'יש עוד דיווח' : `יש עוד ${data.duplicates.length} דיווחים`} על אותו מפגש
          </Text>
          <Text style={styles.muted}>במסך הבית מוצג רק אחד. כדאי למחוק את מה שמיותר.</Text>
          {data.duplicates.map((r) => (
            <Pressable
              key={r.id}
              onPress={() => router.push({ pathname: '/report-view', params: { id: r.id } })}
              accessibilityRole="link"
              style={({ pressed }) => [styles.dupRow, pressed && styles.pressed]}
            >
              <Text style={styles.valueLink}>
                ⁦{r.start}–{r.end}⁩{r.by ? ` · ${r.by.name || r.by.email}` : ''}
              </Text>
              <EnterChevron />
            </Pressable>
          ))}
        </View>
      ) : null}

      {lockedStart ? null : (
        canReport ? (
        <>
          <Button label="עריכה" onPress={() => router.push({ pathname: '/report', params: { id: report.id } })} />
          {/* "סימון כבוטל" ו"העברת השיעור" — רק במצב עריכה (באשף). */}
          <Button
            label="מחיקת הדיווח"
            variant="dangerLink"
            icon="trash-can-outline"
            onPress={() =>
              confirm({
                title: 'למחוק את הדיווח?',
                message: 'הדיווח יימחק לצמיתות, והדקות שהעביר למונה המצטבר יוחזרו. המפגש יחזור ל"ממתין לדיווח".',
                confirmLabel: 'מחיקת הדיווח',
                onConfirm: async () => {
                  await deleteReport(report.id);
                  if (report.carriedMinutes > 0) await adjustAccumulated(report.workplaceId, -report.carriedMinutes);
                  router.back();
                },
              })
            }
          />
        </>
        ) : null
      )}
      {confirm.dialog}
    </Screen>
  );
}

/** שם רשומה קשורה — לחיץ עם ‹ כשיש לאן לעבור. */
function LinkText({
  text,
  onPress,
  style,
  styles,
}: {
  text: string;
  onPress?: () => void;
  style: object;
  styles: ReturnType<typeof makeStyles>;
}) {
  if (!onPress) return <Text style={style}>{text}</Text>;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="link"
      hitSlop={6}
      style={({ pressed }) => [styles.linkLine, pressed && styles.pressed]}
    >
      <Text style={style}>{text}</Text>
      <EnterChevron size={16} />
    </Pressable>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      padding: spacing.md,
      gap: 6,
      ...cardShadow,
    },
    head: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
    headText: { flex: 1, gap: 2 },
    linkLine: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 2 },
    title: { fontSize: 18, fontWeight: '700', color: colors.text, textAlign: TEXT_RIGHT, flexShrink: 1 },
    subtitle: { fontSize: 14, color: colors.textMuted, textAlign: TEXT_RIGHT, flexShrink: 1 },
    pay: { fontSize: 20, fontWeight: '700', color: colors.brandDark },
    payMonthly: { fontSize: 13, color: colors.textMuted, paddingTop: 4 },
    date: { fontSize: 13, color: colors.textMuted },
    note: { fontSize: 13, fontWeight: '700', color: colors.brandDark },
    summary: { fontSize: 13, lineHeight: 19, color: colors.text, textAlign: TEXT_RIGHT },
    tiles: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
    tile: { flex: 1, backgroundColor: colors.background, borderRadius: radius.sm, paddingVertical: 8, paddingHorizontal: 12 },
    tileLabel: { fontSize: 12, color: colors.textMuted, textAlign: TEXT_RIGHT },
    tileValue: { fontSize: 17, fontWeight: '700', color: colors.text, textAlign: TEXT_RIGHT },
    small: { fontSize: 12, color: colors.textMuted, textAlign: TEXT_RIGHT },
    linksCard: { backgroundColor: colors.surface, borderRadius: radius.md, paddingHorizontal: spacing.md, ...cardShadow },
    linkRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, minHeight: 44 },
    linkRowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
    linkRowText: { flex: 1, fontSize: 14, color: colors.text, textAlign: TEXT_RIGHT },
    pressed: { opacity: 0.6 },
    muted: { fontSize: 14, lineHeight: 20, color: colors.textMuted, textAlign: TEXT_RIGHT },
    valueLink: { color: colors.brand },
    dupCard: { backgroundColor: colors.dangerSoft, borderRadius: radius.md, padding: spacing.md, gap: spacing.xs },
    dupTitle: { fontSize: 15, fontWeight: '700', color: colors.dangerText, textAlign: TEXT_RIGHT },
    dupRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 40 },
  });
