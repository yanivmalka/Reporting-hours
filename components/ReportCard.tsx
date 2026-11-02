import { StyleSheet, Text, View } from 'react-native';
import { Pressable } from './Pressable';
import { academicOf, netMinutes, totalBreakMinutes, type WorkReport } from '../lib/reports';
import { hebrewDate } from '../lib/hebrewDate';
import { formatDuration, formatISODate } from '../lib/time';
import { formatShekels } from '../lib/travel';
import { useThemedStyles } from '../theme/useThemedStyles';
import { radius, spacing, type AppColors } from '../theme/colors';
import { TEXT_RIGHT } from '../theme/align';

type ReportCardProps = {
  report: WorkReport;
  /** שם מקום העבודה; "מקום עבודה שנמחק" כשלא נמצא */
  workplaceName: string;
  /**
   * שכר מחושב לדיווח (שלב 4): מספר ₪ למקום עבודה שעתי, `null` למקום
   * עבודה בתשלום חודשי (הסכום קבוע לחודש), ו־undefined כשלא ידוע/לא להצגה.
   */
  pay?: number | null;
  /** עלות הנסיעות של היום (מוצגת בדיווח הראשון של המקום באותו יום); null = נספרה בדיווח אחר */
  travel?: number | null;
  /** הדוח לשכר של החודש נשלח — הדיווח נעול לעריכה */
  locked?: boolean;
  /** לחיצה על האריח — מעבר לתצוגת הדיווח (העריכה משם, בכפתור "עריכה") */
  onPress?: () => void;
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
export function ReportCard({ report, workplaceName, pay, travel, locked, onPress }: ReportCardProps) {
  const styles = useThemedStyles(makeStyles);
  const breakTotal = totalBreakMinutes(report.breaks);
  const net = netMinutes(report);

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={`${workplaceName} · ${formatISODate(report.date)}${locked ? ' · נעול' : ''}`}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.headerRow}>
        <Text style={styles.name}>{workplaceName}</Text>
        <View style={styles.dateBox}>
          <Text style={styles.date}>{formatISODate(report.date)}</Text>
          <Text style={styles.dateHeb}>{hebrewDate(report.date, false)}</Text>
        </View>
      </View>
      {report.note ? <Text style={styles.note}>{report.note}</Text> : null}
      <Text style={styles.line}>
        {`\u2066${report.start}–${report.end}\u2069`}
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
      {/* שורת שכר ונסיעות, ומשמאלה סימון נעילה כשהדוח לשכר נשלח */}
      <View style={styles.bottomRow}>
        <View style={styles.bottomTexts}>
          {typeof pay === 'number' ? (
            <Text style={styles.pay}>שכר: {formatShekels(pay)}</Text>
          ) : pay === null ? (
            <Text style={styles.carried}>שכר חודשי קבוע — נספר בסיכום החודשי</Text>
          ) : null}
          {typeof travel === 'number' && travel > 0 ? (
            <Text style={styles.travel}>נסיעות: {formatShekels(travel)}</Text>
          ) : travel === null ? (
            <Text style={styles.carried}>נסיעות היום נספרו בדיווח אחר</Text>
          ) : null}
        </View>
        {locked ? (
          <View style={styles.lockChip}>
            <Text style={styles.lockText}>🔒 נשלח לשכר</Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    travel: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.brandDark,
      textAlign: TEXT_RIGHT,
    },
    bottomRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    bottomTexts: {
      flex: 1,
      gap: spacing.xs,
    },
    pressed: { opacity: 0.85 },
    lockChip: {
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 12,
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: colors.border,
    },
    lockText: { fontSize: 12, fontWeight: '600', color: colors.textMuted },
    actions: {
      flexDirection: 'row',
      marginTop: spacing.xs,
    },
    actionBtn: {
      flex: 1,
      minHeight: 40,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.brand,
    },
    actionText: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.brand,
    },
    lockedBtn: {
      borderColor: colors.border,
      backgroundColor: colors.background,
    },
    lockedText: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.textMuted,
    },
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
      textAlign: TEXT_RIGHT,
      flex: 1,
    },
    dateBox: {
      alignItems: 'center',
    },
    dateHeb: {
      fontSize: 11,
      color: colors.textMuted,
    },
    date: {
      fontSize: 13,
      color: colors.textMuted,
    },
    note: {
      fontSize: 14,
      color: colors.text,
      textAlign: TEXT_RIGHT,
    },
    line: {
      fontSize: 13,
      color: colors.textMuted,
      textAlign: TEXT_RIGHT,
      writingDirection: 'ltr',
    },
    net: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.brandDark,
      textAlign: TEXT_RIGHT,
    },
    academic: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.brandDark,
      textAlign: TEXT_RIGHT,
    },
    carried: {
      fontSize: 12,
      color: colors.textMuted,
      textAlign: TEXT_RIGHT,
    },
    pay: {
      fontSize: 15,
      fontWeight: '800',
      color: colors.brandDark,
      textAlign: TEXT_RIGHT,
    },
  });
