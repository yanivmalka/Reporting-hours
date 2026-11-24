/**
 * "נקודת פתיחה" — הזנת מה שכבר עבדת לפי דוח שכר קודם (ימים, שעות, קורס), לכל
 * מקום עבודה. נספרת בצפי לתשלום כדיווח רגיל ומסומנת שם כ"הוזן ידנית"
 * (lib/openingBalance.ts). נפתח מ"הגדרות" › כללי, ליד "תחילת עבודה עם המערכת".
 *
 * מורשה חשבון: צפייה בכל רמה; הוספה, עריכה ומחיקה — רק `canEdit` (המפתח אינו
 * ב־REPORTER_KEYS, כמו שאר ההגדרות).
 */
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '../components/Text';
import { Pressable } from '../components/Pressable';
import { Button } from '../components/Button';
import { Screen } from '../components/Screen';
import { FormField } from '../components/FormField';
import { TextField } from '../components/TextField';
import { SelectField } from '../components/SelectField';
import { SegmentedControl } from '../components/SegmentedControl';
import { DateField } from '../components/DatePicker';
import { EnterChevron } from '../components/Chevrons';
import { LoadingScreen } from '../components/LoadingScreen';
import { useScreenData } from '../components/useScreenData';
import { useAccess } from '../components/Access';
import { useConfirm } from '../components/ConfirmDialog';
import { useToast } from '../components/Toast';
import { loadCourses, type Course } from '../lib/courses';
import { activeWorkplaces, loadWorkplaces, type Workplace } from '../lib/workplaces';
import { basisFor, usePayBasis, type PayBasis } from '../lib/payBasis';
import {
  addOpening,
  deleteOpening,
  loadOpenings,
  updateOpening,
  type OpeningDraft,
  type OpeningEntry,
} from '../lib/openingBalance';
import { getTrackingStart } from '../lib/trackingStart';
import { shortDate } from '../lib/dashboard';
import { todayISO } from '../lib/time';
import { useThemedStyles } from '../theme/useThemedStyles';
import { workplaceColor } from '../theme/workplaceColors';
import { useTheme } from '../theme/ThemeContext';
import { cardShadow, radius, spacing, type AppColors } from '../theme/colors';
import { TEXT_RIGHT } from '../theme/align';

type Data = { workplaces: Workplace[]; courses: Course[]; entries: OpeningEntry[] };
type Form = { id: string | null; workplaceId: string; courseId: string | null; date: string; days: string; hours: string; basis: PayBasis; note: string };

const BASIS_LABEL: Record<PayBasis, string> = { academic: 'שעות אקדמיות', regular: 'שעות רגילות' };

/** תאריך ברירת המחדל: יום לפני תחילת העבודה עם המערכת, או היום. */
function defaultDate(): string {
  const t = getTrackingStart();
  if (!t) return todayISO();
  const [y, m, d] = t.split('-').map(Number);
  const prev = new Date(y, m - 1, d - 1);
  return `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}-${String(prev.getDate()).padStart(2, '0')}`;
}

const parseNum = (s: string) => {
  const n = Number(s.trim().replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? n : NaN;
};

export default function OpeningScreen() {
  const styles = useThemedStyles(makeStyles);
  const { colors } = useTheme();
  const { canEdit } = useAccess();
  const fallbackBasis = usePayBasis().basis;
  const confirm = useConfirm();
  const { showToast } = useToast();
  const [data, setData] = useState<Data | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [tried, setTried] = useState(false);

  const { reload } = useScreenData(
    () => Promise.all([loadWorkplaces(), loadCourses(), loadOpenings()]),
    [],
    ([workplaces, courses, entries]) => setData({ workplaces, courses, entries: [...entries] }),
  );

  if (!data) return <LoadingScreen />;

  const wpById = new Map(data.workplaces.map((w) => [w.id, w]));
  const courseById = new Map(data.courses.map((c) => [c.id, c]));
  const choices = activeWorkplaces(data.workplaces);

  const startNew = () => {
    const w = choices[0];
    setTried(false);
    setForm({
      id: null,
      workplaceId: w?.id ?? '',
      courseId: null,
      date: defaultDate(),
      days: '',
      hours: '',
      basis: basisFor(w, fallbackBasis),
      note: '',
    });
  };
  const startEdit = (e: OpeningEntry) => {
    setTried(false);
    setForm({
      id: e.id,
      workplaceId: e.workplaceId,
      courseId: e.courseId ?? null,
      date: e.date,
      days: String(e.days),
      hours: String(e.hours),
      basis: e.basis,
      note: e.note ?? '',
    });
  };

  const days = form ? parseNum(form.days || '0') : 0;
  const hours = form ? parseNum(form.hours || '0') : 0;
  const errors = form
    ? {
        workplace: !form.workplaceId ? 'יש לבחור מקום עבודה' : undefined,
        days: Number.isNaN(days) || !Number.isInteger(days) ? 'מספר ימים שלם' : undefined,
        hours: Number.isNaN(hours) ? 'מספר שעות (אפשר עם שבר עשרוני)' : undefined,
        empty: !Number.isNaN(days) && !Number.isNaN(hours) && days === 0 && hours === 0 ? 'יש להזין ימים או שעות' : undefined,
      }
    : {};
  const invalid = Object.values(errors).some(Boolean);

  const save = async () => {
    if (!form) return;
    setTried(true);
    if (invalid) return;
    const draft: OpeningDraft = {
      workplaceId: form.workplaceId,
      ...(form.courseId ? { courseId: form.courseId } : {}),
      date: form.date,
      days,
      hours,
      basis: form.basis,
      ...(form.note.trim() ? { note: form.note.trim() } : {}),
    };
    if (form.id) await updateOpening(form.id, draft);
    else await addOpening(draft);
    setForm(null);
    showToast('נקודת הפתיחה נשמרה');
    reload();
  };

  const remove = (e: OpeningEntry) =>
    confirm({
      title: 'מחיקת נקודת הפתיחה',
      message: 'הימים והשעות שהוזנו יוסרו מהצפי לתשלום.',
      confirmLabel: 'מחיקה',
      destructive: true,
      onConfirm: async () => {
        await deleteOpening(e.id);
        setForm(null);
        reload();
      },
    });

  const sorted = [...data.entries].sort((a, b) => b.date.localeCompare(a.date));
  const formCourses = form
    ? data.courses.filter((c) => c.workplaceId === form.workplaceId)
    : [];

  return (
    <Screen keyboardFooter={form != null}>
      <View style={styles.card}>
        <Text style={styles.title}>נקודת פתיחה מדו״ח שכר קודם</Text>
        <Text style={styles.sub}>
          התחלת לעבוד עם המערכת באמצע תקופת שכר? הזן לפי דוח השכר הקודם כמה ימים ושעות כבר עבדת, בכל
          מקום עבודה ואם רוצים — בכל קורס. הנתונים נספרים בצפי לתשלום כמו דיווח רגיל, בתקופת השכר של
          התאריך שבחרת, ומסומנים שם כ״הוזן ידנית״. הם אינם מופיעים ביומן ובדוח השכר שנשלח.
        </Text>
      </View>

      {form ? (
        <View style={styles.card}>
          <Text style={styles.title}>{form.id ? 'עריכת נקודת פתיחה' : 'נקודת פתיחה חדשה'}</Text>
          <FormField label="מקום עבודה" error={tried ? errors.workplace : undefined}>
            <SelectField<string>
              value={form.workplaceId}
              title="מקום עבודה"
              options={(form.id && !choices.some((w) => w.id === form.workplaceId) && wpById.get(form.workplaceId)
                ? [...choices, wpById.get(form.workplaceId) as Workplace]
                : choices
              ).map((w) => ({ value: w.id, label: w.name, color: workplaceColor(colors, w) }))}
              onChange={(id) =>
                setForm({ ...form, workplaceId: id, courseId: null, basis: basisFor(wpById.get(id), fallbackBasis) })
              }
            />
          </FormField>
          <FormField label="קורס" hint="רשות — בלי קורס, נקודת הפתיחה שייכת לכל מקום העבודה">
            <SelectField<string | null>
              value={form.courseId}
              title="קורס"
              options={[
                { value: null, label: 'בלי קורס' },
                ...formCourses.map((c) => ({ value: c.id, label: c.name })),
              ]}
              onChange={(courseId) => setForm({ ...form, courseId })}
            />
          </FormField>
          <FormField label="תאריך" hint="קובע לאיזו תקופת שכר נכנסים הנתונים — בדרך כלל יום לפני תחילת העבודה עם המערכת">
            <DateField value={form.date} onChange={(date) => setForm({ ...form, date })} />
          </FormField>
          <FormField label="ימי עבודה" hint="להחזר הנסיעות ולספירת הימים" error={tried ? errors.days : undefined}>
            <TextField numeric value={form.days} onChangeText={(t) => setForm({ ...form, days: t })} placeholder="0" invalid={tried && !!errors.days} />
          </FormField>
          <FormField label="שעות" error={tried ? errors.hours ?? errors.empty : undefined}>
            <TextField numeric value={form.hours} onChangeText={(t) => setForm({ ...form, hours: t })} placeholder="0" invalid={tried && !!(errors.hours ?? errors.empty)} />
          </FormField>
          <SegmentedControl<PayBasis>
            options={[
              { value: 'academic', label: BASIS_LABEL.academic },
              { value: 'regular', label: BASIS_LABEL.regular },
            ]}
            value={form.basis}
            onChange={(basis) => setForm({ ...form, basis })}
          />
          <FormField label="הערה">
            <TextField value={form.note} onChangeText={(t) => setForm({ ...form, note: t })} placeholder="למשל: לפי דוח אוקטובר" />
          </FormField>
          <Button label="שמירה" onPress={() => void save()} />
          <Button label="ביטול" variant="secondary" onPress={() => setForm(null)} />
          {form.id ? (
            <Button
              label="מחיקת נקודת הפתיחה"
              variant="dangerLink"
              icon="trash-can-outline"
              onPress={() => {
                const e = data.entries.find((x) => x.id === form.id);
                if (e) remove(e);
              }}
            />
          ) : null}
        </View>
      ) : null}

      {sorted.length === 0 && !form ? (
        <Text style={styles.empty}>עדיין לא הוזנה נקודת פתיחה.</Text>
      ) : null}

      {sorted.map((e) => {
        const w = wpById.get(e.workplaceId);
        const c = e.courseId ? courseById.get(e.courseId) : undefined;
        const unit = e.basis === 'regular' ? 'ש׳' : 'ש״א';
        return (
          <Pressable
            key={e.id}
            disabled={!canEdit}
            onPress={() => startEdit(e)}
            style={({ pressed }) => [
              styles.tile,
              w ? { borderStartWidth: 4, borderStartColor: workplaceColor(colors, w) } : null,
              pressed && styles.pressed,
            ]}
          >
            <View style={styles.tileTexts}>
              <Text style={styles.tileTitle}>
                {w?.name ?? 'מקום עבודה שנמחק'}
                {c ? ` · ${c.name}` : ''}
              </Text>
              <Text style={styles.sub}>
                {shortDate(e.date)} · {e.days === 1 ? 'יום אחד' : `${e.days} ימים`} · {e.hours} {unit}
              </Text>
              {e.note ? <Text style={styles.sub}>{e.note}</Text> : null}
              <Text style={styles.badge}>הוזן ידנית</Text>
            </View>
            {canEdit ? <EnterChevron /> : null}
          </Pressable>
        );
      })}

      {canEdit && !form ? (
        choices.length ? (
          <Button label="הוספת נקודת פתיחה" icon="plus" onPress={startNew} />
        ) : (
          <Text style={styles.empty}>כדי להזין נקודת פתיחה צריך קודם מקום עבודה.</Text>
        )
      ) : null}
      {!canEdit ? <Text style={styles.empty}>צפייה בלבד — אין לך הרשאה לערוך את נקודת הפתיחה.</Text> : null}
      {confirm.dialog}
    </Screen>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      padding: spacing.md,
      gap: spacing.sm,
      ...cardShadow,
    },
    title: { fontSize: 16, fontWeight: '800', color: colors.text, textAlign: TEXT_RIGHT },
    sub: { fontSize: 13, color: colors.textMuted, textAlign: TEXT_RIGHT },
    empty: { fontSize: 14, color: colors.textMuted, textAlign: 'center', paddingVertical: spacing.sm },
    tile: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      padding: spacing.md,
      ...cardShadow,
    },
    tileTexts: { flex: 1, gap: 2 },
    tileTitle: { fontSize: 15, fontWeight: '700', color: colors.text, textAlign: TEXT_RIGHT },
    badge: { fontSize: 12, fontWeight: '700', color: colors.brandDark, textAlign: TEXT_RIGHT },
    pressed: { opacity: 0.7 },
  });
