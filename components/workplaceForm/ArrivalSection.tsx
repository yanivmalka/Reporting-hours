import { View } from 'react-native';
import { Text } from '../Text';
import { Pressable } from '../Pressable';
import { FormField } from '../FormField';
import { SegmentedControl } from '../SegmentedControl';
import { TextField } from '../TextField';
import { TimeInput } from '../TimeInput';
import { contactsSupported } from '../../lib/contacts';
import { isTaxi } from '../../lib/workplaces';
import type { WorkplaceFormModel } from './useWorkplaceForm';
import { ARRIVAL_OPTIONS, TAXI_REMINDER_OPTIONS } from './shared';
import { FinanceSection } from '../AppLock';
import { Icon } from '../Icon';
import { useTheme } from '../../theme/ThemeContext';

/** קבוצת "הגעה": אופן הגעה, נסיעות ותזכורת מונית. */
export function ArrivalSection({ w }: { w: WorkplaceFormModel }) {
  const { styles, form, errors, set, chooseContact, isPublicTransport } = w;
  const { colors } = useTheme();
  return (
    <>
          <>
          <FormField label="כתובת" hint="מוצגת בתזכורת לנסיעה">
            <TextField
              value={form.address}
              onChangeText={(t) => set('address', t)}
              placeholder="רחוב, מספר, עיר"
            />
          </FormField>

          <FormField label="אופן הגעה">
            <View style={styles.chipWrap}>
              {ARRIVAL_OPTIONS.map((o) => {
                const on = form.arrivalMode === o.value;
                return (
                  <Pressable
                    key={o.value}
                    onPress={() => set('arrivalMode', o.value)}
                    style={[styles.termsChip, on && styles.termsChipOn]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                  >
                    <Text style={[styles.termsChipText, on && styles.termsChipTextOn]}>{o.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </FormField>

          {isTaxi(form.arrivalMode) ? (
            <>
              <FormField
                label="טלפון להזמנת מונית"
                hint={
                  form.taxiContact
                    ? undefined
                    : form.arrivalMode === 'taxi_voucher'
                      ? 'תחנה / רכז ההסעות שמזמינים דרכו את הפתק — או בחירה מאנשי הקשר'
                      : 'תחנת מוניות או נהג קבוע — או בחירה מאנשי הקשר'
                }
                error={errors.taxiPhone}
              >
                {form.taxiContact ? (
                  // איש קשר שנבחר — מוצג כאיש קשר (שם וטלפון); בתזכורת אפשר לחייג אליו.
                  <View style={styles.taxiContactCard}>
                    <Icon name="account-circle-outline" size={28} color={colors.brand} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.contactName} numberOfLines={1}>
                        {form.taxiContact}
                      </Text>
                      <Text style={styles.contactPhone}>{form.taxiPhone}</Text>
                    </View>
                    {contactsSupported ? (
                      <Pressable onPress={chooseContact} accessibilityRole="button" hitSlop={8}>
                        <Text style={styles.contactAction}>החלפה</Text>
                      </Pressable>
                    ) : null}
                    <Pressable
                      onPress={() => set('taxiContact', '')}
                      accessibilityRole="button"
                      accessibilityLabel="הקלדת מספר במקום איש הקשר"
                      hitSlop={8}
                    >
                      <Icon name="pencil-outline" size={20} color={colors.textMuted} />
                    </Pressable>
                  </View>
                ) : (
                  <View style={styles.phoneRow}>
                    <View style={{ flex: 1 }}>
                      <TextField
                        value={form.taxiPhone}
                        onChangeText={(t) => set('taxiPhone', t)}
                        phone
                        placeholder="050-0000000"
                        invalid={Boolean(errors.taxiPhone)}
                      />
                    </View>
                    {contactsSupported ? (
                      <Pressable
                        onPress={chooseContact}
                        style={({ pressed }) => [styles.termsChip, styles.contactBtn, pressed && { opacity: 0.7 }]}
                        accessibilityRole="button"
                      >
                        <Icon name="account-box-outline" size={18} color={colors.text} />
                        <Text style={styles.termsChipText}>מאנשי הקשר</Text>
                      </Pressable>
                    ) : null}
                  </View>
                )}
              </FormField>

              <FormField label="תזכורת להזמנת מונית">
                <SegmentedControl
                  options={TAXI_REMINDER_OPTIONS}
                  value={form.taxiReminderKind}
                  onChange={(v) => set('taxiReminderKind', v)}
                />
              </FormField>

              {form.taxiReminderKind === 'hoursBefore' ? (
                <FormField
                  label="כמה שעות לפני היציאה"
                  hint="שעת היציאה = תחילת הקורס הראשון באותו יום"
                  error={errors.taxiHours}
                >
                  <TextField
                    value={form.taxiHours}
                    onChangeText={(t) => set('taxiHours', t)}
                    numeric
                    invalid={Boolean(errors.taxiHours)}
                  />
                </FormField>
              ) : null}

              {form.taxiReminderKind === 'nightBefore' ? (
                <FormField
                  label="באיזו שעה להזכיר בערב שלפני"
                  error={errors.taxiNightTime}
                >
                  <TimeInput
                    value={form.taxiNightTime}
                    onChange={(v) => set('taxiNightTime', v)}
                    invalid={Boolean(errors.taxiNightTime)}
                  />
                </FormField>
              ) : null}
            </>
          ) : null}

          {isPublicTransport ? (
            <>
              <FinanceSection>
                <FormField
                  label="עלות נסיעה לכיוון (₪)"
                  error={errors.travelCostPerDirection}
                >
                  <TextField
                    value={form.travelCostPerDirection}
                    onChangeText={(t) => set('travelCostPerDirection', t)}
                    numeric
                    invalid={Boolean(errors.travelCostPerDirection)}
                  />
                </FormField>
              </FinanceSection>

              <FormField
                label="מספר נסיעות ליום"
                hint="ברירת מחדל 2 — הלוך ושוב"
                error={errors.tripsPerDay}
              >
                <TextField
                  value={form.tripsPerDay}
                  onChangeText={(t) => set('tripsPerDay', t)}
                  numeric
                  invalid={Boolean(errors.tripsPerDay)}
                />
              </FormField>
            </>
          ) : null}
          </>
    </>
  );
}
