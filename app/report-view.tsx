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
import { Screen } from '../components/Screen';
import { useSessionCancel } from '../components/SessionCancelDialog';
import { adjustAccumulated } from '../lib/accumulated';
import { courseReport, coursesOn, loadCourses, type Course } from '../lib/courses';
import { NO_CANCEL } from '../lib/sessions';
import { currentPayPeriod } from '../lib/dashboard';
import { hebrewDate } from '../lib/hebrewDate';
import { reportPay } from '../lib/pay';
import { usePayBasis } from '../lib/payBasis';
import { isLocked, loadPayrollStatus, periodTitle, statusKey } from '../lib/payroll';
import { academicOf, deleteReport, loadReports, netMinutes, totalBreakMinutes, type WorkReport } from '../lib/reports';
import { formatDuration, formatISODate } from '../lib/time';
import { formatShekels } from '../lib/travel';
import { loadWorkplaces, type Workplace } from '../lib/workplaces';
import { TEXT_RIGHT } from '../theme/align';
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
    /** הקורס שהדיווח מכסה (אם יש) — לסימון "השיעור לא התקיים" */
    course?: Course;
  } | null>(null);
  const sessionDialog = useSessionCancel();

  // נטען מחדש בכל חזרה למסך — כדי לשקף עריכה שנשמרה באשף.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      Promise.all([loadReports(), loadWorkplaces(), loadPayrollStatus(), loadCourses()]).then(([reports, wps, st, crs]) => {
        if (!active) return;
        const report = reports.find((r) => r.id === id) ?? null;
        const workplace = report ? wps.find((w) => w.id === report.workplaceId) : undefined;
        let lockedStart: string | null = null;
        if (report && workplace) {
          const [y, m, d] = report.date.split('-').map(Number);
          const p = currentPayPeriod(workplace.payday, new Date(y, m - 1, d));
          if (isLocked(st[statusKey(workplace.id, p.start)])) lockedStart = p.start;
        }
        const course = report
          ? coursesOn(crs, report.date, report.workplaceId, NO_CANCEL).find((c) =>
              courseReport(c, report.date, [report]),
            )
          : undefined;
        setData({ report, workplace, lockedStart, course });
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

  const { report, workplace, lockedStart, course } = data;
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

  const rows: [string, string][] = [
    ['מקום עבודה', workplace?.name ?? 'מקום עבודה שנמחק'],
    ['תאריך', `יום ${weekday} · ${formatISODate(report.date)} · ${hebrewDate(report.date, false)}`],
    ...(report.note ? ([['קורס / נושא', report.note]] as [string, string][]) : []),
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
  ];

  return (
    <Screen>
      <View style={styles.card}>
        {rows.map(([label, value], i) => (
          <View key={label} style={[styles.row, i === rows.length - 1 && styles.rowLast]}>
            <Text style={styles.label}>{label}</Text>
            <Text style={styles.value}>{value}</Text>
          </View>
        ))}
      </View>

      {lockedStart && workplace ? (
        <>
          <Text style={styles.muted}>
            🔒 הדוח לשכר של {periodTitle(currentPayPeriod(workplace.payday, new Date(y, m - 1, d)))} כבר נשלח —
            כדי לערוך, מבטלים קודם את הדוח שנשלח.
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
          {course ? (
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
        </>
      )}
      <Button label="חזרה" variant="secondary" onPress={() => router.back()} />
      {sessionDialog.dialog}
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
    label: { fontSize: 14, color: colors.textMuted, textAlign: TEXT_RIGHT },
    value: { flex: 1, fontSize: 15, fontWeight: '600', color: colors.text, textAlign: 'left' },
    muted: { fontSize: 14, lineHeight: 20, color: colors.textMuted, textAlign: TEXT_RIGHT },
  });
