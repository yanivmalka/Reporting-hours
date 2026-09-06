import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Button } from '../components/Button';
import { FormField } from '../components/FormField';
import { Screen } from '../components/Screen';
import { SegmentedControl } from '../components/SegmentedControl';
import { TextField } from '../components/TextField';
import { useToast } from '../components/Toast';
import { toAcademic } from '../lib/academic';
import { addAccumulatedMinutes } from '../lib/accumulated';
import { formatHours } from '../lib/pay';
import { addReport, makeBreakId } from '../lib/reports';
import { formatDuration, isValidISODate, parseTime, todayISO } from '../lib/time';
import { loadWorkplaces, type Workplace } from '../lib/workplaces';
import { useTheme } from '../theme/ThemeContext';
import { useThemedStyles } from '../theme/useThemedStyles';
import { radius, spacing, type AppColors } from '../theme/colors';

/** שורת הפסקה בטופס — משך בדקות נשמר כמחרוזת לעריכה חופשית. */
type BreakRow = { id: string; minutes: string };

/** מה לעשות עם הדקות שאינן משלימות שעה אקדמית. */
type LeftoverChoice = 'carry' | 'include';

type Errors = {
  workplace?: string;
  date?: string;
  start?: string;
  end?: string;
  breaks?: string;
};

function parseNum(value: string): number {
  return Number(value.replace(',', '.').trim());
}

/** סך דקות ההפסקות מתוך שורות הטופס, תוך התעלמות משורות ריקות / לא תקינות. */
function sumBreaks(rows: BreakRow[]): number {
  return rows.reduce((total, row) => {
    const n = parseNum(row.minutes);
    return total + (Number.isFinite(n) && n > 0 ? n : 0);
  }, 0);
}

export default function ReportScreen() {
  const router = useRouter();
  const styles = useThemedStyles(makeStyles);
  const { colors } = useTheme();
  const { showToast } = useToast();
  const [workplaces, setWorkplaces] = useState<Workplace[] | null>(null);

  const [workplaceId, setWorkplaceId] = useState<string | null>(null);
  const [date, setDate] = useState(todayISO());
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [breaks, setBreaks] = useState<BreakRow[]>([]);
  const [leftoverChoice, setLeftoverChoice] = useState<LeftoverChoice>('carry');
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);

  // נטען מחדש בכל כניסה למסך כדי לשקף מקומות עבודה שנוספו בינתיים.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      loadWorkplaces().then((list) => {
        if (!active) return;
        setWorkplaces(list);
        setWorkplaceId((current) => {
          if (current && list.some((w) => w.id === current)) return current;
          return list.length === 1 ? list[0].id : null;
        });
      });
      return () => {
        active = false;
      };
    }, []),
  );

  function addBreak() {
    setBreaks((prev) => [...prev, { id: makeBreakId(), minutes: '' }]);
    setErrors((prev) => ({ ...prev, breaks: undefined }));
  }

  function updateBreak(id: string, minutes: string) {
    setBreaks((prev) => prev.map((row) => (row.id === id ? { ...row, minutes } : row)));
    setErrors((prev) => ({ ...prev, breaks: undefined }));
  }

  function removeBreak(id: string) {
    setBreaks((prev) => prev.filter((row) => row.id !== id));
    setErrors((prev) => ({ ...prev, breaks: undefined }));
  }

  function validate(): Errors {
    const next: Errors = {};
    if (!workplaceId) next.workplace = 'יש לבחור מקום עבודה';
    if (!isValidISODate(date)) next.date = 'תאריך בפורמט YYYY-MM-DD';

    const startMin = parseTime(start);
    const endMin = parseTime(end);
    if (startMin == null) next.start = 'שעה בפורמט HH:MM';
    if (endMin == null) next.end = 'שעה בפורמט HH:MM';
    if (startMin != null && endMin != null && endMin <= startMin) {
      next.end = 'שעת הסיום חייבת להיות אחרי ההתחלה';
    }

    for (const row of breaks) {
      const n = parseNum(row.minutes);
      if (!Number.isInteger(n) || n < 0) {
        next.breaks = 'כל הפסקה: מספר דקות שלם, 0 ומעלה';
        break;
      }
    }

    if (startMin != null && endMin != null && endMin > startMin) {
      if (sumBreaks(breaks) >= endMin - startMin) {
        next.breaks = 'סך ההפסקות ארוך או שווה לטווח השעות';
      }
    }
    return next;
  }

  async function handleSave() {
    const found = validate();
    setErrors(found);
    if (Object.values(found).some(Boolean)) return;

    const net = Math.max(
      0,
      (parseTime(end) as number) - (parseTime(start) as number) - sumBreaks(breaks),
    );
    const leftover = toAcademic(net).leftoverMinutes;
    const carried = leftoverChoice === 'carry' ? leftover : 0;

    setSaving(true);
    await addReport({
      workplaceId: workplaceId as string,
      date: date.trim(),
      start: start.trim(),
      end: end.trim(),
      breaks: breaks
        .map((row) => ({ id: row.id, minutes: parseNum(row.minutes) }))
        .filter((b) => b.minutes > 0),
      carriedMinutes: carried,
    });

    if (carried > 0) {
      const state = await addAccumulatedMinutes(carried);
      showToast(
        `נוספו ${carried} דק׳ למונה "דקות עבודה מצטברות" · סה״כ ${state.minutes} דק׳`,
      );
    }
    router.replace('/reports');
  }

  if (workplaces === null) {
    return (
      <Screen scroll={false}>
        <View style={styles.center}>
          <ActivityIndicator color={colors.brand} />
        </View>
      </Screen>
    );
  }

  if (workplaces.length === 0) {
    return (
      <Screen>
        <View style={styles.intro}>
          <Text style={styles.title}>דיווח יום עבודה</Text>
          <Text style={styles.subtitle}>
            כדי לדווח צריך קודם להגדיר לפחות מקום עבודה אחד.
          </Text>
        </View>
        <Button
          label="הוספת מקום עבודה"
          onPress={() => router.push('/workplace-form')}
        />
      </Screen>
    );
  }

  const startMin = parseTime(start);
  const endMin = parseTime(end);
  const rangeMin = startMin != null && endMin != null && endMin > startMin ? endMin - startMin : null;
  const netPreview = rangeMin == null ? null : Math.max(0, rangeMin - sumBreaks(breaks));
  const academicPreview = netPreview == null ? null : toAcademic(netPreview);
  const leftoverPreview = academicPreview?.leftoverMinutes ?? 0;
  const academicHoursNow =
    academicPreview == null
      ? 0
      : leftoverChoice === 'carry'
        ? academicPreview.wholeHours
        : academicPreview.decimalHours;

  return (
    <Screen>
      <View style={styles.intro}>
        <Text style={styles.title}>דיווח יום עבודה</Text>
        <Text style={styles.subtitle}>
          בחירת מקום עבודה, טווח שעות והפסקות. זמן העבודה נטו והשעות האקדמיות
          מחושבים אוטומטית.
        </Text>
      </View>

      <FormField label="מקום עבודה" error={errors.workplace}>
        <View style={styles.choices}>
          {workplaces.map((workplace) => {
            const selected = workplace.id === workplaceId;
            return (
              <Pressable
                key={workplace.id}
                onPress={() => {
                  setWorkplaceId(workplace.id);
                  setErrors((prev) => ({ ...prev, workplace: undefined }));
                }}
                style={[styles.choice, selected && styles.choiceSelected]}
              >
                <Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>
                  {workplace.name}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </FormField>

      <FormField label="תאריך" hint="פורמט YYYY-MM-DD" error={errors.date}>
        <TextField value={date} onChangeText={setDate} invalid={Boolean(errors.date)} />
      </FormField>

      <View style={styles.timesRow}>
        <View style={styles.timeCol}>
          <FormField label="שעת התחלה" error={errors.start}>
            <TextField
              value={start}
              onChangeText={setStart}
              placeholder="09:00"
              invalid={Boolean(errors.start)}
            />
          </FormField>
        </View>
        <View style={styles.timeCol}>
          <FormField label="שעת סיום" error={errors.end}>
            <TextField
              value={end}
              onChangeText={setEnd}
              placeholder="14:00"
              invalid={Boolean(errors.end)}
            />
          </FormField>
        </View>
      </View>

      <FormField
        label="הפסקות (בדקות)"
        hint="ניתן להוסיף כמה הפסקות; הן מנוכות מזמן העבודה"
        error={errors.breaks}
      >
        <View style={styles.breaks}>
          {breaks.map((row, index) => (
            <View key={row.id} style={styles.breakRow}>
              <View style={styles.breakInput}>
                <TextField
                  value={row.minutes}
                  onChangeText={(t) => updateBreak(row.id, t)}
                  placeholder={`הפסקה ${index + 1}`}
                  numeric
                />
              </View>
              <Pressable
                onPress={() => removeBreak(row.id)}
                style={styles.breakRemove}
                accessibilityLabel={`הסרת הפסקה ${index + 1}`}
              >
                <Text style={styles.breakRemoveText}>✕</Text>
              </Pressable>
            </View>
          ))}
          <Button label="הוספת הפסקה" variant="secondary" onPress={addBreak} />
        </View>
      </FormField>

      {leftoverPreview > 0 ? (
        <FormField
          label="דקות עודפות"
          hint={`נותרו ${leftoverPreview} דק׳ שאינן משלימות שעה אקדמית (45 דק׳)`}
        >
          <SegmentedControl<LeftoverChoice>
            options={[
              { value: 'carry', label: 'למונה המצטבר' },
              { value: 'include', label: 'לכלול בדיווח' },
            ]}
            value={leftoverChoice}
            onChange={setLeftoverChoice}
          />
        </FormField>
      ) : null}

      <View style={styles.summary}>
        <Text style={styles.summaryLine}>
          טווח שעות: {rangeMin == null ? '—' : formatDuration(rangeMin)}
        </Text>
        <Text style={styles.summaryLine}>
          זמן עבודה נטו: {netPreview == null ? '—' : formatDuration(netPreview)}
        </Text>
        <Text style={styles.summaryNet}>
          שעות אקדמיות: {academicPreview == null ? '—' : formatHours(academicHoursNow)}
        </Text>
        {leftoverPreview > 0 ? (
          <Text style={styles.summaryHint}>
            {leftoverChoice === 'carry'
              ? `${leftoverPreview} דק׳ עודפות ייכנסו למונה "דקות עבודה מצטברות"`
              : `${leftoverPreview} דק׳ עודפות ייכללו בדיווח כשבר שעה`}
          </Text>
        ) : null}
      </View>

      <Button label="שמירת הדיווח" onPress={handleSave} loading={saving} />
    </Screen>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  intro: {
    gap: spacing.sm,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'right',
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 21,
    color: colors.textMuted,
    textAlign: 'right',
  },
  choices: {
    gap: spacing.sm,
  },
  choice: {
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
  },
  choiceSelected: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },
  choiceText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'right',
  },
  choiceTextSelected: {
    color: colors.textOnBrand,
  },
  timesRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  timeCol: {
    flex: 1,
  },
  breaks: {
    gap: spacing.sm,
  },
  breakRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  breakInput: {
    flex: 1,
  },
  breakRemove: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  breakRemoveText: {
    fontSize: 16,
    color: colors.danger,
    fontWeight: '700',
  },
  summary: {
    backgroundColor: colors.brandLight,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  summaryLine: {
    fontSize: 13,
    color: colors.brandDark,
    textAlign: 'right',
  },
  summaryNet: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.brandDark,
    textAlign: 'right',
  },
  summaryHint: {
    fontSize: 12,
    color: colors.brandDark,
    textAlign: 'right',
  },
});
