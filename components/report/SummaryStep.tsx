import { View } from 'react-native';
import { Text } from '../Text';
import { Button } from '../Button';
import { FormField } from '../FormField';
import { TextField } from '../TextField';
import { adjustAccumulated } from '../../lib/accumulated';
import { formatHours } from '../../lib/pay';
import { basisFor } from '../../lib/payBasis';
import { deleteReport } from '../../lib/reports';
import { timeRange } from '../../lib/courses';
import { formatShekels, hasTravelCost } from '../../lib/travel';
import { formatDuration } from '../../lib/time';
import type { ReportWizard } from './useReportWizard';
import { sumBreaks } from './shared';

/** שלב 4: סיכום לפני שמירה. */
export function SummaryStep({ w }: { w: ReportWizard }) {
  const { styles, editing, confirm, basis, step, setTouched, setExitReason, workplaceId, note, setNote, start, setStart, end, setEnd, breaks, setBreaks, leftoverChoice, errors, netPreview, academicPreview, leftoverPreview, academicHoursNow, workplace, pay, hoursForPay, travelCounted, travel, workplaceName, wAt } = w;
  return (
    <>
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

          {wAt == null ? null : wAt.paymentType === 'monthly' ? (
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLine}>שכר</Text>
              <Text style={styles.summaryValue}>
                משכורת חודשית קבועה ({formatShekels(wAt.rate)})
              </Text>
            </View>
          ) : (
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLine}>
                שכר · {formatHours(Math.round(hoursForPay * 100) / 100)}{' '}
                {basisFor(workplace, basis) === 'academic' ? 'שע׳ אקד׳' : 'שע׳'} × {formatShekels(wAt.rate)}
              </Text>
              <Text style={styles.summaryValue}>{pay == null ? '—' : formatShekels(pay)}</Text>
            </View>
          )}
          {wAt && hasTravelCost(wAt) ? (
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLine}>
                נסיעות
                {travelCounted
                  ? ' · כבר נספרו ליום זה'
                  : ` · ${wAt.tripsPerDay} × ${formatShekels(wAt.travelCostPerDirection)}`}
              </Text>
              <Text style={styles.summaryValue}>{formatShekels(travel)}</Text>
            </View>
          ) : null}
          {wAt && wAt.paymentType === 'hourly' ? (
            <View style={styles.summaryRow}>
              <Text style={styles.summaryTotalLabel}>סה״כ ליום</Text>
              <Text style={styles.summaryTotal}>
                {pay == null ? '—' : formatShekels(pay + travel)}
              </Text>
            </View>
          ) : null}
        </View>
        {errors.workplace ? <Text style={styles.error}>{errors.workplace}</Text> : null}
        {editing ? (
          <Button
            label="מחיקת הדיווח"
            variant="dangerLink"
            icon="trash-can-outline"
            onPress={() =>
              confirm({
                title: 'למחוק את הדיווח?',
                message: 'הדיווח יימחק לצמיתות, והדקות שהעביר למונה המצטבר יוחזרו.',
                confirmLabel: 'מחיקה',
                onConfirm: async () => {
                  await deleteReport(editing.id);
                  if (editing.carriedMinutes > 0) {
                    await adjustAccumulated(editing.workplaceId, -editing.carriedMinutes);
                  }
                  setTouched(false);
                  setStart('');
                  setEnd('');
                  setBreaks([]);
                  setNote('');
                  setExitReason('cancelled');
                },
              })
            }
          />
        ) : null}
      </>
    ) : null}

    </>
  );
}
