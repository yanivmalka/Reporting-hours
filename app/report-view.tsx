/**
 * תצוגת דיווח שנשמר — קריאה בלבד. עריכה דורשת פעולה אקטיבית: כפתור
 * "עריכה" פותח את האשף, ו"חזרה" באשף מחזירה לכאן.
 * דיווח בחודש שהדוח שלו כבר נשלח לשכר — נעול; במקום עריכה יש מעבר לדוח.
 */
import { useCallback, useState } from 'react';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Text } from '../components/Text';
import { Button } from '../components/Button';
import { Pressable } from '../components/Pressable';
import { Screen } from '../components/Screen';
import { useConfirm } from '../components/ConfirmDialog';
import { useSessionCancel } from '../components/SessionCancelDialog';
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
import { radius, spacing, type AppColors } from '../theme/colors';

const WEEKDAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

export default function ReportViewScreen() {
  const router = useRouter();
  const styles = useThemedStyles(makeStyles);
  const { colors } = useTheme();
  const { basis } = usePayBasis();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [data, setData] = useState<{
    report: WorkReport | null;
    workplace?: Workplace;
    lockedStart: string | null;
    /** הדוח שולם — נעול לצמיתות */
    paid: boolean;
    /** הקורס שהדיווח מכסה (אם יש) — לסימון "השיעור לא התקיים" */
    course?: Course;
  } | null>(null);
  const sessionDialog = useSessionCancel();
  const confirm = useConfirm();

  // נטען מחדש בכל חזרה למסך — כדי לשקף עריכה שנשמרה באשף.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      Promise.all([loadReports(), loadWorkplaces(), loadPayrollStatus(), loadCourses()]).then(([reports, wps, st, crs]) => {
        if (!active) return;
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
        setData({ report, workplace, lockedStart, paid, course });
      });
      return () => {
        active = false;
      };
    }, [id]),
  );

  if (!data) {
    return (
      <Screen scroll={false}>
        <View style={styles.center}>
          <ActivityIndicator color={colors.brand} />
        </View>
      </Screen>
    );
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

  const [y, m, d] = report.date.split('-').map(Number);
  const weekday = WEEKDAYS[new Date(y, m - 1, d).getDay()];
  const breaks = totalBreakMinutes(report.breaks);
  const net = netMinutes(report);
  const ac = academicOf(report);
  const pay = workplace ? reportPay(report, workplace, basis) : null;

  // שורות לחיצות — מעבר לרשומות הקשורות (מקום עבודה, קורס, דוח שכר).
  const period = workplace ? currentPayPeriod(workplace.payday, new Date(y, m - 1, d)) : null;
  const links: Partial<Record<string, () => void>> = {};
  if (workplace) links['מקום עבודה'] = () => router.push({ pathname: '/workplace', params: { id: workplace.id } });
  if (course) links['קורס / נושא'] = () => router.push({ pathname: '/course-form', params: { id: course.id, view: '1' } });
  if (workplace && period)
    links['דוח שכר'] = () =>
      router.push({ pathname: '/payroll-report', params: { wp: workplace.id, start: period.start } });

  const rows: [string, string][] = [
    ['מקום עבודה', workplace?.name ?? 'מקום עבודה שנמחק'],
    ['תאריך', `יום ${weekday} · ${formatISODate(report.date)} · ${hebrewDate(report.date, false)}`],
    ...(report.note ? ([['קורס / נושא', report.note]] as [string, string][]) : []),
    ...(report.extraKind ? ([['סוג מפגש', `מפגש נוסף · ${EXTRA_SESSION_LABELS[report.extraKind]}`]] as [string, string][]) : []),
    ['שעות', `⁦${report.start}–${report.end}⁩`],
    ['הפסקות', breaks > 0 ? formatDuration(breaks) : 'ללא'],
    ['זמן עבודה נטו', net == null ? '—' : formatDuration(net)],
    [
      'שעות אקדמיות',
      ac == null
        ? '—'
        : ac.leftoverMinutes
          ? `${ac.wholeHours} ו־${ac.leftoverMinutes} דק׳`
          : String(ac.wholeHours),
    ],
    ...(report.carriedMinutes > 0
      ? ([['למונה המצטבר', `${report.carriedMinutes} דק׳`]] as [string, string][])
      : []),
    ['שכר', typeof pay === 'number' ? formatShekels(pay) : 'משכורת חודשית קבועה'],
    ...(period ? ([['דוח שכר', periodTitle(period)]] as [string, string][]) : []),
  ];

  return (
    <Screen>
      <View style={[styles.card, workplace ? { borderStartWidth: 5, borderStartColor: workplaceColor(colors, workplace) } : null]}>
        {rows.map(([label, value], i) => {
          const onPress = links[label];
          const body = (
            <>
              <Text style={styles.label}>{label}</Text>
              <Text style={[styles.value, onPress && styles.valueLink]}>{value}</Text>
              {onPress ? <Text style={styles.chevron}>‹</Text> : null}
            </>
          );
          const style = [styles.row, i === rows.length - 1 && styles.rowLast];
          return onPress ? (
            <Pressable
              key={label}
              onPress={onPress}
              accessibilityRole="link"
              style={({ pressed }) => [...style, pressed && styles.pressed]}
            >
              {body}
            </Pressable>
          ) : (
            <View key={label} style={style}>
              {body}
            </View>
          );
        })}
      </View>

      {lockedStart && workplace ? (
        <>
          <Text style={styles.muted}>
            🔒 הדוח לשכר של {periodTitle(currentPayPeriod(workplace.payday, new Date(y, m - 1, d)))}{' '}
            {paid
              ? 'כבר שולם — הדיווח נעול לצמיתות.'
              : 'כבר נשלח — כדי לערוך או למחוק, מבטלים קודם את הדוח שנשלח.'}
          </Text>
          <Button
            label="לדוח השכר"
            onPress={() =>
              router.push({ pathname: '/payroll-report', params: { wp: workplace.id, start: lockedStart } })
            }
          />
        </>
      ) : (
        <>
          <Button label="עריכה" onPress={() => router.push({ pathname: '/report', params: { id: report.id } })} />
          {course && !report.extraKind ? (
            <Button
              label="השיעור לא התקיים — סימון כבוטל"
              variant="secondary"
              onPress={() =>
                sessionDialog.open({
                  course,
                  date: report.date,
                  // המפגש בוטל — הדיווח עליו נמחק (וגם הדקות שנצברו ממנו).
                  onDone: async (canceled) => {
                    if (!canceled) return;
                    await deleteReport(report.id);
                    if (report.carriedMinutes > 0) await adjustAccumulated(report.workplaceId, -report.carriedMinutes);
                    router.back();
                  },
                })
              }
            />
          ) : null}
          <Button
            label="מחיקת הדיווח"
            variant="danger"
            onPress={() =>
              confirm({
                title: 'למחוק את הדיווח?',
                message: 'הדיווח יימחק לצמיתות, והדקות שהעביר למונה המצטבר יוחזרו.',
                confirmLabel: 'מחיקה',
                onConfirm: async () => {
                  await deleteReport(report.id);
                  if (report.carriedMinutes > 0) await adjustAccumulated(report.workplaceId, -report.carriedMinutes);
                  router.back();
                },
              })
            }
          />
        </>
      )}
      <Button label="חזרה" variant="secondary" onPress={() => router.back()} />
      {sessionDialog.dialog}
      {confirm.dialog}
    </Screen>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    card: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
    },
    row: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: spacing.md,
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    rowLast: { borderBottomWidth: 0 },
    valueLink: { color: colors.brand },
    chevron: { fontSize: 18, color: colors.textMuted, alignSelf: 'center' },
    pressed: { opacity: 0.6 },
    label: { fontSize: 14, color: colors.textMuted, textAlign: TEXT_RIGHT },
    value: { flex: 1, fontSize: 15, fontWeight: '600', color: colors.text, textAlign: 'left' },
    muted: { fontSize: 14, lineHeight: 20, color: colors.textMuted, textAlign: TEXT_RIGHT },
  });
