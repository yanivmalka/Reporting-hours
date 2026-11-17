import { ScrollView, View } from 'react-native';
import { Checkbox } from '../Checkbox';
import { formatShekels } from '../../lib/travel';
import { Text } from '../Text';
import { Pressable } from '../Pressable';
import { formatISODate } from '../../lib/time';
import { DateField } from '../DatePicker';
import { FormField } from '../FormField';
import { SegmentedControl } from '../SegmentedControl';
import { TextField } from '../TextField';
import { ARRIVAL_MODE_LABELS } from '../../lib/workplaces';
import type { WorkplaceFormModel } from './useWorkplaceForm';
import { TERMS_OPTIONS, PAYMENT_OPTIONS } from './shared';

/** קבוצת "שכר ותשלום": תעריף, סוג תשלום, בסיס, תנאי תשלום, מס ותאריך תחולה לשינוי תנאים. */
export function PaySection({ w }: { w: WorkplaceFormModel }) {
  const { basis, styles, form, errors, original, effectiveFrom, setEffectiveFrom, set, termsDirty } = w;
  return (
    <>
          <>
          <FormField label="סוג תשלום">
            <SegmentedControl
              options={PAYMENT_OPTIONS}
              value={form.paymentType}
              onChange={(v) => set('paymentType', v)}
            />
          </FormField>

          <FormField
            label={form.paymentType === 'hourly' ? 'תעריף לשעה (₪)' : 'שכר חודשי (₪)'}
            error={errors.rate}
          >
            <TextField
              value={form.rate}
              onChangeText={(t) => set('rate', t)}
              numeric
              invalid={Boolean(errors.rate)}
            />
          </FormField>

          {form.paymentType === 'hourly' ? (
            <Checkbox
              checked={form.academic ?? basis === 'academic'}
              onChange={(v) => set('academic', v)}
              label="תשלום לפי שעה אקדמית (45 דק׳)"
              hint={
                (form.academic ?? basis === 'academic')
                  ? 'התעריף מוכפל בשעות אקדמיות. דקות שאינן משלימות שעה נכנסות למונה הדקות המצטברות של המקום.'
                  : 'התעריף מוכפל בשעות רגילות (60 דק׳). כל זמן העבודה נטו נכנס לחישוב.'
              }
            />
          ) : null}

          <FormField
            label="אחוז מס (ניכוי במקור)"
            hint="לחישוב הסכום נטו במעקב התשלומים"
            error={errors.taxPercent}
          >
            <TextField
              value={form.taxPercent}
              onChangeText={(t) => set('taxPercent', t)}
              numeric
              invalid={Boolean(errors.taxPercent)}
            />
          </FormField>

          <FormField
            label="תנאי תשלום"
            hint="מספר הימים מסוף החודש ועד שהתשלום מתקבל בפועל (ברירת מחדל: שוטף + 30)"
            error={errors.paymentTermsDays}
          >
            <ScrollView
              horizontal
              style={{ flexGrow: 0 }}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.termsRow}
            >
              {TERMS_OPTIONS.map((n) => {
                const on = form.paymentTermsDays === String(n);
                return (
                  <Pressable
                    key={n}
                    onPress={() => set('paymentTermsDays', String(n))}
                    style={[styles.termsChip, on && styles.termsChipOn]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                  >
                    <Text style={[styles.termsChipText, on && styles.termsChipTextOn]}>
                      {n === 0 ? 'שוטף' : `שוטף + ${n}`}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </FormField>

          <FormField
            label="יום אחרון בחודש לדיווח שכר"
            hint="חשוב: עד היום הזה (כולל) צריך לשלוח את דוח השכר — דוח שנשלח אחריו ישולם רק בחודש שאחרי. התקופה החודשית מסתיימת ביום הזה. 31 = סוף החודש."
            error={errors.payday}
          >
            <TextField
              value={form.payday}
              onChangeText={(t) => set('payday', t)}
              numeric
              invalid={Boolean(errors.payday)}
            />
          </FormField>

          <FormField label="מספר עובד" hint="רשות — יופיע בדוחות ובמיילים לשכר">
            <TextField
              value={form.employeeNumber}
              onChangeText={(t) => set('employeeNumber', t)}
              numeric
            />
          </FormField>

          {termsDirty ? (
            <FormField
              label="השינוי בתנאים חל מתאריך"
              hint="דיווחים לפני תאריך זה יחושבו לפי התנאים הקודמים"
            >
              <DateField value={effectiveFrom} onChange={setEffectiveFrom} />
            </FormField>
          ) : null}

          {original?.termsHistory?.length ? (
            <FormField label="היסטוריית תנאים">
              <View style={styles.courses}>
                {[...original.termsHistory].reverse().map((v) => (
                  <Text key={v.until} style={styles.courseMeta}>
                    עד {formatISODate(v.until)}:{' '}
                    {v.paymentType === 'monthly' ? `חודשי ${formatShekels(v.rate)}` : `${formatShekels(v.rate)} לשעה`}
                    {' · '}
                    {ARRIVAL_MODE_LABELS[v.arrivalMode]}
                    {v.arrivalMode === 'public_transport'
                      ? ` ${formatShekels(v.travelCostPerDirection)} × ${v.tripsPerDay}`
                      : ''}
                    {v.taxPercent ? ` · מס ${v.taxPercent}%` : ''}
                  </Text>
                ))}
              </View>
            </FormField>
          ) : null}
          </>
    </>
  );
}
