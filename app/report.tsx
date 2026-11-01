import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect, useNavigation, useRouter } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { ActivityIndicator, Keyboard, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Button } from '../components/Button';
import { DatePicker } from '../components/DatePicker';
import { FormField } from '../components/FormField';
import { TimeInput, type TimeInputHandle } from '../components/TimeInput';
import { Screen } from '../components/Screen';
import { SegmentedControl } from '../components/SegmentedControl';
import { TextField } from '../components/TextField';
import { useToast } from '../components/Toast';
import { toAcademic } from '../lib/academic';
import { addAccumulatedMinutes, entryOf } from '../lib/accumulated';
import { formatHours, payableHours, reportPay } from '../lib/pay';
import { usePayBasis } from '../lib/payBasis';
import { addReport, loadReports, makeBreakId, type WorkReport } from '../lib/reports';
import { formatShekels, hasTravelCost } from '../lib/travel';
import { formatDuration, isValidISODate, parseTime, todayISO } from '../lib/time';
import { ARRIVAL_MODE_LABELS, loadWorkplaces, type Workplace } from '../lib/workplaces';
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
  const navigation = useNavigation();
  const { basis } = usePayBasis();
  const [workplaces, setWorkplaces] = useState<Workplace[] | null>(null);
  const [existing, setExisting] = useState<WorkReport[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [touched, setTouched] = useState(false);
  /** 'saved' / 'cancelled' — יציאה מכוונת, בלי אזהרה */
  const [exitReason, setExitReason] = useState<'saved' | 'cancelled' | null>(null);
  const [pendingLeave, setPendingLeave] = useState<Parameters<typeof navigation.dispatch>[0] | null>(null);
  const endRef = useRef<TimeInputHandle>(null);

  const [workplaceId, setWorkplaceId] = useState<string | null>(null);
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState('');
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
      Promise.all([loadWorkplaces(), loadReports()]).then(([list, reports]) => {
        if (!active) return;
        setWorkplaces(list);
        setExisting(reports);
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

  // האם הוזן משהו שעדיין לא נשמר.
  const dirty =
    touched || start !== '' || end !== '' || note.trim() !== '' || breaks.length > 0;

  // אזהרה לפני יציאה מהמסך (חזרה, תפריט, כפתור אחורה של אנדרואיד) בלי שמירה או ביטול.
  usePreventRemove(dirty && exitReason == null, ({ data }) => setPendingLeave(data.action));

  useEffect(() => {
    if (exitReason === 'saved') router.replace('/reports');
    if (exitReason === 'cancelled') {
      if (router.canGoBack()) router.back();
      else router.replace('/');
    }
  }, [exitReason, router]);

  function addBreak() {
    setBreaks((prev) => [...prev, { id: makeBreakId(), minutes: '' }]);
    setErrors((prev) => ({ ...prev, breaks: undefined }));
  }

  function changeDate(next: string) {
    setDate(next);
    setTouched(true);
    setErrors((prev) => ({ ...prev, date: undefined }));
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
      ...(note.trim() ? { note: note.trim() } : {}),
    });

    if (carried > 0) {
      const id = workplaceId as string;
      const state = await addAccumulatedMinutes(id, carried);
      const name = workplaces?.find((w) => w.id === id)?.name ?? '';
      showToast(
        `נוספו ${carried} דק׳ למונה של ${name} · סה״כ ${entryOf(state, id).minutes} דק׳`,
      );
    }
    setExitReason('saved');
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

  // ── חישוב כספי חי ──
  const workplace = workplaces.find((w) => w.id === workplaceId) ?? null;
  const draft = {
    start,
    end,
    breaks: breaks.map((row) => ({ id: row.id, minutes: Math.max(0, parseNum(row.minutes) || 0) })),
    carriedMinutes: leftoverChoice === 'carry' ? leftoverPreview : 0,
  };
  const pay = workplace && netPreview != null ? reportPay(draft, workplace, basis) : null;
  const hoursForPay = netPreview != null ? payableHours(draft, basis) : 0;
  // נסיעות: רק בתחבורה ציבורית, ורק אם עוד אין דיווח לאותו מקום באותו יום.
  const travelCounted =
    workplace != null &&
    existing.some((r) => r.workplaceId === workplace.id && r.date === date);
  const travel =
    workplace && hasTravelCost(workplace) && !travelCounted
      ? workplace.travelCostPerDirection * workplace.tripsPerDay
      : 0;
  const workedDates = existing.map((r) => r.date);
  const visibleWorkplaces = pickerOpen || !workplace ? workplaces : [workplace];

  return (
    <Screen keyboardFooter>
      <FormField label="מקום עבודה" error={errors.workplace}>
        <View style={styles.choices}>
          {visibleWorkplaces.map((w) => {
            const selected = w.id === workplaceId;
            const collapsed = selected && !pickerOpen;
            return (
              <Pressable
                key={w.id}
                onPress={() => {
                  if (collapsed) {
                    setPickerOpen(true);
                    return;
                  }
                  setWorkplaceId(w.id);
                  setPickerOpen(false);
                  setTouched(true);
                  setErrors((prev) => ({ ...prev, workplace: undefined }));
                }}
                style={[styles.choice, selected && styles.choiceSelected]}
                accessibilityRole="button"
                accessibilityLabel={collapsed ? `${w.name} — החלפת מקום עבודה` : w.name}
              >
                <View style={styles.choiceBody}>
                  <Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>
                    {w.name}
                  </Text>
                  <Text style={[styles.choiceSub, selected && styles.choiceSubSelected]}>
                    {w.paymentType === 'monthly'
                      ? `משכורת חודשית ${formatShekels(w.rate)}`
                      : `${formatShekels(w.rate)} לשעה`}
                    {' · '}
                    {ARRIVAL_MODE_LABELS[w.arrivalMode]}
                  </Text>
                </View>
                {collapsed && workplaces.length > 1 ? (
                  <Text style={[styles.chevron, styles.choiceTextSelected]}>▾</Text>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      </FormField>

      <FormField label="תאריך" error={errors.date}>
        <DatePicker
          value={date}
          onChange={changeDate}
          workedDates={workedDates}
          invalid={Boolean(errors.date)}
        />
      </FormField>

      <View style={styles.timesRow}>
        <View style={styles.timeCol}>
          <FormField label="שעת התחלה" error={errors.start}>
            <TimeInput
              value={start}
              onChange={(v) => {
                setStart(v);
                setErrors((prev) => ({ ...prev, start: undefined, end: undefined }));
              }}
              onComplete={() => endRef.current?.focus()}
              onOverflow={(d) => endRef.current?.feed(d)}
              invalid={Boolean(errors.start)}
            />
          </FormField>
        </View>
        <View style={styles.timeCol}>
          <FormField label="שעת סיום" error={errors.end}>
            <TimeInput
              ref={endRef}
              value={end}
              onChange={(v) => {
                setEnd(v);
                setErrors((prev) => ({ ...prev, end: undefined }));
              }}
              onComplete={() => Keyboard.dismiss()}
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
                  onChangeText={(t) => updateBreak(row.id, t.replace(/\D/g, ''))}
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

      <FormField label="נושא / הערה" hint="רשות — למשל נושא ההרצאה או ההגשה">
        <TextField value={note} onChangeText={setNote} placeholder="תולדות האדריכלות — שיעור 4" />
      </FormField>

      <View style={styles.summary}>
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
              ? `${leftoverPreview} דק׳ עודפות ייכנסו למונה "דקות עבודה מצטברות"`
              : `${leftoverPreview} דק׳ עודפות ייכללו בדיווח כשבר שעה`}
          </Text>
        ) : null}

        <View style={styles.divider} />

        {workplace == null ? (
          <Text style={styles.summaryHint}>בחרו מקום עבודה כדי לראות את החישוב הכספי</Text>
        ) : workplace.paymentType === 'monthly' ? (
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLine}>שכר</Text>
            <Text style={styles.summaryValue}>
              משכורת חודשית קבועה ({formatShekels(workplace.rate)})
            </Text>
          </View>
        ) : (
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLine}>
              שכר · {formatHours(Math.round(hoursForPay * 100) / 100)}{' '}
              {basis === 'academic' ? 'שע׳ אקד׳' : 'שע׳'} × {formatShekels(workplace.rate)}
            </Text>
            <Text style={styles.summaryValue}>{pay == null ? '—' : formatShekels(pay)}</Text>
          </View>
        )}
        {workplace && hasTravelCost(workplace) ? (
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLine}>
              נסיעות{travelCounted ? ' · כבר נספרו ליום זה' : ` · ${workplace.tripsPerDay} × ${formatShekels(workplace.travelCostPerDirection)}`}
            </Text>
            <Text style={styles.summaryValue}>{formatShekels(travel)}</Text>
          </View>
        ) : null}
        {workplace && workplace.paymentType === 'hourly' ? (
          <View style={styles.summaryRow}>
            <Text style={styles.summaryTotalLabel}>סה״כ ליום</Text>
            <Text style={styles.summaryTotal}>
              {pay == null ? '—' : formatShekels(pay + travel)}
            </Text>
          </View>
        ) : null}
      </View>

      <Button label="שמירת הדיווח" onPress={handleSave} loading={saving} />
      <Pressable
        onPress={() => setExitReason('cancelled')}
        style={styles.cancel}
        accessibilityRole="link"
      >
        <Text style={styles.cancelText}>ביטול</Text>
      </Pressable>

      <Modal
        transparent
        animationType="fade"
        visible={pendingLeave != null}
        onRequestClose={() => setPendingLeave(null)}
      >
        <View style={styles.backdrop}>
          <View style={styles.dialog}>
            <Text style={styles.dialogTitle}>לצאת בלי לשמור?</Text>
            <Text style={styles.dialogBody}>הנתונים שהוזנו בדיווח הזה יאבדו.</Text>
            <Button label="המשך עריכה" onPress={() => setPendingLeave(null)} />
            <Button
              label="יציאה בלי שמירה"
              variant="danger"
              onPress={() => {
                const action = pendingLeave;
                setPendingLeave(null);
                if (action) navigation.dispatch(action);
              }}
            />
          </View>
        </View>
      </Modal>
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
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
  choiceBody: {
    flex: 1,
    gap: 2,
  },
  choiceSub: {
    fontSize: 12,
    color: colors.textMuted,
    textAlign: 'right',
  },
  choiceSubSelected: {
    color: colors.textOnBrand,
    opacity: 0.85,
  },
  chevron: {
    fontSize: 18,
    fontWeight: '800',
  },
  timesRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  timeCol: {
    flex: 1,
    minWidth: 0,
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
    flex: 1,
    fontSize: 13,
    color: colors.brandDark,
    textAlign: 'right',
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  summaryValue: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.brandDark,
  },
  summaryTotalLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: '800',
    color: colors.brandDark,
    textAlign: 'right',
  },
  summaryTotal: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.brandDark,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.brandDark,
    opacity: 0.3,
    marginVertical: spacing.xs,
  },
  cancel: {
    alignSelf: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  cancelText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textMuted,
    textDecorationLine: 'underline',
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  dialog: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: spacing.md,
  },
  dialogTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'right',
  },
  dialogBody: {
    fontSize: 14,
    color: colors.textMuted,
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
