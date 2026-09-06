import { StyleSheet, Text, View } from 'react-native';
import { academicOf, netMinutes, totalBreakMinutes, type WorkReport } from '../lib/reports';
import { formatDuration, formatISODate } from '../lib/time';
import { formatShekels } from '../lib/travel';
import { useThemedStyles } from '../theme/useThemedStyles';
import { radius, spacing, type AppColors } from '../theme/colors';

type ReportCardProps = {
  report: WorkReport;
  /** שם מקום העבודה; "מקום עבודה שנמחק" כשלא נמצא */
  workplaceName: string;
  /**
   * שכר מחושב לדיווח (שלב 4): מספר ₪ למקום עבודה שעתי, `null` למקום
   * עבודה בתשלום חודשי (הסכום קבוע לחודש), ו־undefined כשלא ידוע/לא להצגה.
   */
  pay?: number | null;
};

/** תיאור השעות האקדמיות בדיווח, למשל "6 שע׳ אקדמיות ו־30 דק׳". */
function academicText(report: WorkReport): string {
  const academic = academicOf(report);
  if (academic == null) return '—';
  if (academic.wholeHours === 0 && academic.leftoverMinutes === 0) return '0';
  if (academic.wholeHours === 0) return `${academic.leftoverMinutes} דק׳`;
  if (academic.leftoverMinutes === 0) return `${academic.wholeHours} שע׳ אקדמיות`;
  return `${academic.wholeHours} שע׳ אקדמיות ו־${academic.leftoverMinutes} דק׳`;
}

/** שורת רשימה לדיווח יום עבודה: מקום, תאריך, טווח שעות, הפסקות, זמן נטו, שעות אקדמיות ושכר. */
export function ReportCard({ report, workplaceName, pay }: ReportCardProps) {
  const styles = useThemedStyles(makeStyles);
  const breakTotal = totalBreakMinutes(report.breaks);
  const net = netMinutes(report);

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.name}>{workplaceName}</Text>
        <Text style={styles.date}>{formatISODate(report.date)}</Text>
      </View>
      <Text style={styles.line}>
        {report.start}–{report.end}
        {breakTotal > 0 ? ` · הפסקות ${formatDuration(breakTotal)}` : ''}
      </Text>
      <Text style={styles.net}>
        זמן עבודה נטו: {net == null ? '—' : formatDuration(net)}
      </Text>
      <Text style={styles.academic}>שעות אקדמיות: {academicText(report)}</Text>
      {report.carriedMinutes > 0 ? (
        <Text style={styles.carried}>
          {report.carriedMinutes} דק׳ הועברו למונה "דקות עבודה מצטברות"
        </Text>
      ) : null}
      {typeof pay === 'number' ? (
        <Text style={styles.pay}>שכר: {formatShekels(pay)}</Text>
      ) : pay === null ? (
        <Text style={styles.carried}>שכר חודשי קבוע — נספר בסיכום החודשי</Text>
      ) : null}
    </View>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    card: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      padding: spacing.md,
      gap: spacing.xs,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
    },
    name: {
      fontSize: 17,
      fontWeight: '700',
      color: colors.text,
      textAlign: 'right',
      flex: 1,
    },
    date: {
      fontSize: 13,
      color: colors.textMuted,
    },
    line: {
      fontSize: 13,
      color: colors.textMuted,
      textAlign: 'right',
      writingDirection: 'ltr',
    },
    net: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.brandDark,
      textAlign: 'right',
    },
    academic: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.brandDark,
      textAlign: 'right',
    },
    carried: {
      fontSize: 12,
      color: colors.textMuted,
      textAlign: 'right',
    },
    pay: {
      fontSize: 15,
      fontWeight: '800',
      color: colors.brandDark,
      textAlign: 'right',
    },
  });
