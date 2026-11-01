import { useCallback, useEffect, useState } from 'react';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Button } from '../components/Button';
import { courseScheduleLabel, loadCourses, type Course } from '../lib/courses';
import { dateRange } from '../lib/dashboard';
import { FormField } from '../components/FormField';
import { useConfirm } from '../components/ConfirmDialog';
import { Screen } from '../components/Screen';
import { SegmentedControl } from '../components/SegmentedControl';
import { TextField } from '../components/TextField';
import {
  ARRIVAL_MODE_LABELS,
  PAYMENT_TYPE_LABELS,
  emptyDraft,
  paymentTermsOf,
  loadWorkplaces,
  trashWorkplace,
  upsertWorkplace,
  type ArrivalMode,
  type PaymentType,
} from '../lib/workplaces';
import { useTheme } from '../theme/ThemeContext';
import { useThemedStyles } from '../theme/useThemedStyles';
import { radius, spacing, type AppColors } from '../theme/colors';

/** מצב הטופס — שדות מספריים נשמרים כמחרוזת כדי לאפשר עריכה חופשית. */
type FormState = {
  name: string;
  rate: string;
  paymentType: PaymentType;
  payday: string;
  paymentTermsDays: string;
  arrivalMode: ArrivalMode;
  travelCostPerDirection: string;
  tripsPerDay: string;
};

type Errors = Partial<Record<keyof FormState, string>>;

/** אפשרויות "שוטף +" לבחירה (בלי הקלדה חופשית). */
const TERMS_OPTIONS = [0, 15, 30, 45, 60, 90];

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
    paymentTermsDays: String(paymentTermsOf(d)),
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
  const styles = useThemedStyles(makeStyles);
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ id?: string }>();
  const id = typeof params.id === 'string' && params.id ? params.id : undefined;
  const isEdit = Boolean(id);

  const [form, setForm] = useState<FormState | null>(
    isEdit ? null : draftToForm(emptyDraft()),
  );
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);
  const confirm = useConfirm();
  const [courses, setCourses] = useState<Course[]>([]);

  // הקורסים של מקום העבודה — נטען מחדש בחזרה מטופס הקורס.
  useFocusEffect(
    useCallback(() => {
      if (!id) return;
      let active = true;
      loadCourses().then((all) => {
        if (active) setCourses(all.filter((c) => c.workplaceId === id).sort((a, b) => a.weekday - b.weekday || a.start.localeCompare(b.start)));
      });
      return () => {
        active = false;
      };
    }, [id]),
  );

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

    const terms = parseNum(state.paymentTermsDays);
    if (!Number.isInteger(terms) || terms < 0 || terms > 365) {
      next.paymentTermsDays = 'מספר ימים שלם בין 0 ל־365';
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
      paymentTermsDays: parseNum(form.paymentTermsDays),
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

  function handleDelete() {
    if (!id) return;
    confirm({
      title: 'להעביר לאשפה?',
      message: `"${form?.name ?? ''}" יועבר לאשפה. אפשר לשחזר אותו משם תוך 30 יום.`,
      confirmLabel: 'העברה לאשפה',
      onConfirm: async () => {
        setSaving(true);
        await trashWorkplace(id);
        router.back();
      },
    });
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
    <Screen keyboardFooter>
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

      <FormField
        label="תנאי תשלום"
        hint="מספר הימים מסוף החודש ועד שהתשלום מתקבל בפועל (ברירת מחדל: שוטף + 30)"
        error={errors.paymentTermsDays}
      >
        <View style={styles.termsRow}>
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
        </View>
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

      <FormField
        label="קורסים קבועים"
        hint="קורס מחזורי: יום בשבוע ושעות קבועות לתקופה. משמש למילוי מהיר של דיווח ולשעות המתוכננות לחודש."
      >
        {isEdit ? (
          <View style={styles.courses}>
            {courses.map((c) => (
              <Pressable
                key={c.id}
                onPress={() => router.push({ pathname: '/course-form', params: { id: c.id } })}
                style={({ pressed }) => [styles.course, pressed && { opacity: 0.7 }]}
              >
                <Text style={styles.courseName}>{c.name}</Text>
                <Text style={styles.courseMeta}>
                  {courseScheduleLabel(c)} · {dateRange(c.from, c.to, true)}
                </Text>
              </Pressable>
            ))}
            <Button
              label="הוספת קורס"
              variant="secondary"
              onPress={() => router.push({ pathname: '/course-form', params: { workplaceId: id } })}
            />
          </View>
        ) : (
          <Text style={styles.courseMeta}>אפשר להוסיף קורסים אחרי שמירת מקום העבודה.</Text>
        )}
      </FormField>

      <View style={styles.actions}>
        <Button
          label={isEdit ? 'שמירת שינויים' : 'הוספה'}
          onPress={handleSave}
          loading={saving}
        />
        {isEdit ? (
          <Button
            label="העברת מקום העבודה לאשפה"
            variant="danger"
            onPress={handleDelete}
            disabled={saving}
          />
        ) : null}
      </View>
      {confirm.dialog}
    </Screen>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
  courses: {
    gap: spacing.sm,
  },
  course: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 2,
  },
  courseName: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'right',
  },
  courseMeta: {
    fontSize: 12,
    color: colors.textMuted,
    textAlign: 'right',
  },
  termsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    flexWrap: 'wrap',
  },
  termsChip: {
    minWidth: 40,
    height: 36,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  termsChipOn: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },
  termsChipText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  termsChipTextOn: {
    color: colors.textOnBrand,
  },
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
