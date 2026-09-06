import { StyleSheet, Text, View } from 'react-native';
import { netMinutes, totalBreakMinutes, type WorkReport } from '../lib/reports';
import { formatDuration, formatISODate } from '../lib/time';
import { useThemedStyles } from '../theme/useThemedStyles';
import { radius, spacing, type AppColors } from '../theme/colors';

type ReportCardProps = {
  report: WorkReport;
  /** שם מקום העבודה; "מקום עבודה שנמחק" כשלא נמצא */
  workplaceName: string;
};

/** שורת רשימה לדיווח יום עבודה: מקום, תאריך, טווח שעות, הפסקות וזמן נטו. */
export function ReportCard({ report, workplaceName }: ReportCardProps) {
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
  });
