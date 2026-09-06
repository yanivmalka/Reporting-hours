import { useCallback, useEffect, useState } from 'react';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Button } from '../components/Button';
import { FormField } from '../components/FormField';
import { Screen } from '../components/Screen';
import { SegmentedControl } from '../components/SegmentedControl';
import { TextField } from '../components/TextField';
import {
  ARRIVAL_MODE_LABELS,
  PAYMENT_TYPE_LABELS,
  deleteWorkplace,
  emptyDraft,
  loadWorkplaces,
  upsertWorkplace,
  type ArrivalMode,
  type PaymentType,
} from '../lib/workplaces';
import { colors, spacing } from '../theme/colors';

/** מצב הטופס — שדות מספריים נשמרים כמחרוזת כדי לאפשר עריכה חופשית. */
type FormState = {
  name: string;
  rate: string;
  paymentType: PaymentType;
  payday: string;
  arrivalMode: ArrivalMode;
  travelCostPerDirection: string;
  tripsPerDay: string;
};

type Errors = Partial<Record<keyof FormState, string>>;

const PAYMENT_OPTIONS = (Object.keys(PAYMENT_TYPE_LABELS) as PaymentType[]).map(
  (value) => ({ value, label: PAYMENT_TYPE_LABELS[value] }),
);
const ARRIVAL_OPTIONS = (Object.keys(ARRIVAL_MODE_LABELS) as ArrivalMode[]).map(
  (value) => ({ value, label: ARRIVAL_MODE_LABELS[value] }),
);

function draftToForm(d: ReturnType<typeof emptyDraft>): FormState {
  return {
    name: d.name,
    rate: String(d.rate),
    paymentType: d.paymentType,
    payday: String(d.payday),
    arrivalMode: d.arrivalMode,
    travelCostPerDirection: String(d.travelCostPerDirection),
    tripsPerDay: String(d.tripsPerDay),
  };
}

function parseNum(value: string): number {
  return Number(value.replace(',', '.').trim());
}

export default function WorkplaceFormScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const id = typeof params.id === 'string' && params.id ? params.id : undefined;
  const isEdit = Boolean(id);

  const [form, setForm] = useState<FormState | null>(
    isEdit ? null : draftToForm(emptyDraft()),
  );
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  useEffect(() => {
    if (!id) return;
    let active = true;
    loadWorkplaces().then((list) => {
      if (!active) return;
      const found = list.find((w) => w.id === id);
      setForm(found ? draftToForm(found) : draftToForm(emptyDraft()));
    });
    return () => {
      active = false;
    };
  }, [id]);

  const set = useCallback(
    <K extends keyof FormState>(key: K, value: FormState[K]) => {
      setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
      setErrors((prev) => ({ ...prev, [key]: undefined }));
    },
    [],
  );

  function validate(state: FormState): Errors {
    const next: Errors = {};
    if (!state.name.trim()) next.name = 'יש להזין שם';

    const rate = parseNum(state.rate);
    if (!Number.isFinite(rate) || rate < 0) next.rate = 'יש להזין סכום תקין';

    const payday = parseNum(state.payday);
    if (!Number.isInteger(payday) || payday < 1 || payday > 31) {
      next.payday = 'יום בחודש בין 1 ל־31';
    }

    if (state.arrivalMode === 'public_transport') {
      const cost = parseNum(state.travelCostPerDirection);
      if (!Number.isFinite(cost) || cost < 0) {
        next.travelCostPerDirection = 'יש להזין עלות תקינה';
      }
      const trips = parseNum(state.tripsPerDay);
      if (!Number.isInteger(trips) || trips < 0) {
        next.tripsPerDay = 'מספר שלם, 0 ומעלה';
      }
    }
    return next;
  }

  async function handleSave() {
    if (!form) return;
    const found = validate(form);
    setErrors(found);
    if (Object.values(found).some(Boolean)) return;

    setSaving(true);
    await upsertWorkplace({
      id,
      name: form.name.trim(),
      rate: parseNum(form.rate),
      paymentType: form.paymentType,
      payday: parseNum(form.payday),
      arrivalMode: form.arrivalMode,
      travelCostPerDirection:
        form.arrivalMode === 'public_transport'
          ? parseNum(form.travelCostPerDirection)
          : 0,
      tripsPerDay:
        form.arrivalMode === 'public_transport'
          ? parseNum(form.tripsPerDay)
          : 0,
    });
    router.back();
  }

  async function handleDelete() {
    if (!id) return;
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }
    setSaving(true);
    await deleteWorkplace(id);
    router.back();
  }

  const title = isEdit ? 'עריכת מקום עבודה' : 'מקום עבודה חדש';

  if (!form) {
    return (
      <Screen scroll={false}>
        <Stack.Screen options={{ title }} />
        <View style={styles.center}>
          <ActivityIndicator color={colors.brand} />
        </View>
      </Screen>
    );
  }

  const isPublicTransport = form.arrivalMode === 'public_transport';

  return (
    <Screen>
      <Stack.Screen options={{ title }} />

      <FormField label="שם מקום העבודה" error={errors.name}>
        <TextField
          value={form.name}
          onChangeText={(t) => set('name', t)}
          placeholder="מכללה / אוניברסיטה"
          invalid={Boolean(errors.name)}
        />
      </FormField>

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

      <FormField
        label="יום קבלת השכר בחודש"
        hint="מגדיר את גבולות ה״חודש״ של מקום העבודה לצורך הסיכומים"
        error={errors.payday}
      >
        <TextField
          value={form.payday}
          onChangeText={(t) => set('payday', t)}
          numeric
          invalid={Boolean(errors.payday)}
        />
      </FormField>

      <FormField label="אופן הגעה">
        <SegmentedControl
          options={ARRIVAL_OPTIONS}
          value={form.arrivalMode}
          onChange={(v) => set('arrivalMode', v)}
        />
      </FormField>

      {isPublicTransport ? (
        <>
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

      <View style={styles.actions}>
        <Button
          label={isEdit ? 'שמירת שינויים' : 'הוספה'}
          onPress={handleSave}
          loading={saving}
        />
        {isEdit ? (
          <Button
            label={confirmingDelete ? 'לחצו שוב לאישור המחיקה' : 'מחיקת מקום העבודה'}
            variant="danger"
            onPress={handleDelete}
            disabled={saving}
          />
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actions: {
    marginTop: spacing.md,
    gap: spacing.sm,
  },
});
