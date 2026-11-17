/**
 * גיליון "פרטי המפגש" — לחיצה על מפגש עתידי בדף הבית: הערה, תוכן מתוכנן,
 * מידע על ההגעה, סימון הגשה / הגשת ביניים, תזכורת, וקישור לביטול המפגש
 * (פותח את דיאלוג הביטול הקיים). הנתונים — lib/sessionNotes.ts.
 *
 * שימוש:
 *   const sheet = useSessionSheet();
 *   sheet.open({ course, workplace, date, onDone: reload, onCancelSession: () => … });
 *   …
 *   {sheet.dialog}
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal, ScrollView, StyleSheet, View } from 'react-native';
import { Text, TextInput } from './Text';
import { Button } from './Button';
import { Icon } from './Icon';
import { Pressable } from './Pressable';
import { DateField } from './DatePicker';
import { TimeInput } from './TimeInput';
import { useToast } from './Toast';
import { hebrewDate } from '../lib/hebrewDate';
import { longDayLabel } from '../lib/home';
import { timeRange, type Course } from '../lib/courses';
import { ARRIVAL_MODE_LABELS, type Workplace } from '../lib/workplaces';
import { dateFromIso, isoDate } from '../lib/dates';
import {
  DEFAULT_REMINDER_TIME,
  eveningBefore,
  FLAG_ICON,
  FLAG_LABEL,
  loadSessionNotes,
  noteFor,
  saveSessionNote,
  type SessionFlag,
} from '../lib/sessionNotes';
import { radius, spacing } from '../theme/colors';
import { useTheme } from '../theme/ThemeContext';
import { useStyles, type ColorScheme, type StyleLayout } from '../theme/useStyles';

export type SessionSheetRequest = {
  course: Course;
  workplace: Workplace;
  date: string;
  /** אחרי שמירה */
  onDone?: () => void;
  /** "ביטול המפגש" — הגיליון נסגר ונפתח דיאלוג הביטול */
  onCancelSession?: () => void;
};

export function useSessionSheet() {
  const [request, setRequest] = useState<SessionSheetRequest | null>(null);
  const open = useCallback((r: SessionSheetRequest) => setRequest(r), []);
  const dialog = useMemo(
    () => (request ? <SessionSheet request={request} onClose={() => setRequest(null)} /> : null),
    [request],
  );
  return { open, dialog };
}

type ReminderChoice = 'none' | 'evening' | 'morning' | 'hour' | 'custom';

const MORNING_TIME = '07:00';

function hourBefore(date: string, start: string): string {
  const [h, m] = start.split(':').map(Number);
  const d = dateFromIso(date);
  d.setHours(h - 1, m);
  const p = (x: number) => String(x).padStart(2, '0');
  return `${isoDate(d)}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function dateLabel(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return `${longDayLabel(new Date(y, m - 1, d))} · ${hebrewDate(iso, false)}`;
}

function SessionSheet({ request, onClose }: { request: SessionSheetRequest; onClose: () => void }) {
  const styles = useStyles(makeStyles);
  const { colors } = useTheme();
  const { showToast } = useToast();
  const { course, workplace, date } = request;
  const [loaded, setLoaded] = useState(false);
  const [note, setNote] = useState('');
  const [content, setContent] = useState('');
  const [arrival, setArrival] = useState('');
  const [flag, setFlag] = useState<SessionFlag | null>(null);
  const [rem, setRem] = useState<ReminderChoice>('none');
  const [remTouched, setRemTouched] = useState(false);
  const [customDate, setCustomDate] = useState(() => eveningBefore(date).slice(0, 10));
  const [customTime, setCustomTime] = useState(DEFAULT_REMINDER_TIME);
  const [busy, setBusy] = useState(false);

  const presets: Record<Exclude<ReminderChoice, 'none' | 'custom'>, string> = {
    evening: eveningBefore(date),
    morning: `${date}T${MORNING_TIME}`,
    hour: hourBefore(date, course.start),
  };

  useEffect(() => {
    let active = true;
    void loadSessionNotes().then((list) => {
      if (!active) return;
      const n = noteFor(list, course.id, date);
      if (n) {
        setNote(n.note ?? '');
        setContent(n.content ?? '');
        setArrival(n.arrival ?? '');
        setFlag(n.flag ?? null);
        if (n.remindAt) {
          const preset = (Object.keys(presets) as (keyof typeof presets)[]).find((k) => presets[k] === n.remindAt);
          if (preset) setRem(preset);
          else {
            setRem('custom');
            setCustomDate(n.remindAt.slice(0, 10));
            setCustomTime(n.remindAt.slice(11, 16));
          }
        } else if (n.flag && !n.reminderOff) setRem('evening');
        setRemTouched(true);
      }
      setLoaded(true);
    });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [course.id, date]);

  function chooseFlag(f: SessionFlag | null) {
    setFlag(f);
    // סימון הגשה מוסיף תזכורת בערב שלפני — אם עוד לא נבחרה תזכורת.
    if (f && !remTouched && rem === 'none') setRem('evening');
  }

  function chooseRem(r: ReminderChoice) {
    setRem(r);
    setRemTouched(true);
  }

  async function save() {
    setBusy(true);
    try {
      const remindAt =
        rem === 'none'
          ? undefined
          : rem === 'custom'
            ? /^\d{2}:\d{2}$/.test(customTime)
              ? `${customDate}T${customTime}`
              : undefined
            : presets[rem];
      // הגשה עם תזכורת "ערב לפני" נשמרת כתזכורת האוטומטית (בלי מועד מפורש), כך שהיא זזה עם המפגש.
      const auto = flag != null && rem === 'evening';
      await saveSessionNote({
        courseId: course.id,
        date,
        note,
        content,
        arrival,
        flag: flag ?? undefined,
        remindAt: auto ? undefined : remindAt,
        reminderOff: flag != null && rem === 'none',
      });
      showToast('פרטי המפגש נשמרו');
      request.onDone?.();
    } finally {
      setBusy(false);
      onClose();
    }
  }

  const reminderOptions: { value: ReminderChoice; label: string }[] = [
    { value: 'none', label: 'ללא' },
    { value: 'evening', label: `ערב לפני · ${DEFAULT_REMINDER_TIME}` },
    { value: 'morning', label: `בבוקר · ${MORNING_TIME}` },
    { value: 'hour', label: 'שעה לפני' },
    { value: 'custom', label: 'מועד אחר' },
  ];

  const fixedArrival = [ARRIVAL_MODE_LABELS[workplace.arrivalMode], workplace.address].filter(Boolean).join(' · ');

  return (
    <Modal transparent animationType="fade" visible onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.dialog}>
          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            <Text style={styles.title}>פרטי המפגש</Text>
            <View style={styles.headRow}>
              {flag ? <Icon name={FLAG_ICON[flag]} size={18} color={colors.warning} /> : null}
              <Text style={styles.subject}>{course.name}</Text>
            </View>
            <Text style={styles.message}>{dateLabel(date)}</Text>
            <Text style={styles.message}>
              {timeRange(course.start, course.end)} · {workplace.name}
            </Text>

            {!loaded ? null : (
              <>
                <Text style={styles.label}>סימון</Text>
                <View style={styles.chips}>
                  {([null, 'submission', 'midSubmission'] as const).map((f) => (
                    <Pressable
                      key={f ?? 'none'}
                      onPress={() => chooseFlag(f)}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: flag === f }}
                      style={[styles.chip, flag === f && styles.chipOn]}
                    >
                      {f ? <Icon name={FLAG_ICON[f]} size={14} color={flag === f ? colors.brand : colors.textMuted} /> : null}
                      <Text style={[styles.chipText, flag === f && styles.chipTextOn]}>{f ? FLAG_LABEL[f] : 'ללא'}</Text>
                    </Pressable>
                  ))}
                </View>

                <Text style={styles.label}>הערה</Text>
                <TextInput
                  value={note}
                  onChangeText={setNote}
                  multiline
                  placeholder="למשל: להביא את המבחנים הבדוקים"
                  placeholderTextColor={colors.textMuted}
                  style={styles.input}
                />

                <Text style={styles.label}>תוכן מתוכנן</Text>
                <TextInput
                  value={content}
                  onChangeText={setContent}
                  multiline
                  placeholder="מה מתוכנן לשיעור"
                  placeholderTextColor={colors.textMuted}
                  style={styles.input}
                />

                <Text style={styles.label}>הגעה</Text>
                {fixedArrival ? <Text style={styles.hint}>קבוע: {fixedArrival}</Text> : null}
                <TextInput
                  value={arrival}
                  onChangeText={setArrival}
                  multiline
                  placeholder="למפגש הזה: חדר, חניה, שינוי מיקום"
                  placeholderTextColor={colors.textMuted}
                  style={styles.input}
                />

                <Text style={styles.label}>תזכורת</Text>
                <View style={styles.chips}>
                  {reminderOptions.map((o) => (
                    <Pressable
                      key={o.value}
                      onPress={() => chooseRem(o.value)}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: rem === o.value }}
                      style={[styles.chip, rem === o.value && styles.chipOn]}
                    >
                      <Text style={[styles.chipText, rem === o.value && styles.chipTextOn]}>{o.label}</Text>
                    </Pressable>
                  ))}
                </View>
                {rem === 'custom' ? (
                  <View style={styles.customRow}>
                    <View style={styles.customDate}>
                      <DateField value={customDate} onChange={setCustomDate} />
                    </View>
                    <View style={styles.customTime}>
                      <TimeInput value={customTime} onChange={setCustomTime} label="שעת התזכורת" />
                    </View>
                  </View>
                ) : null}
                {rem !== 'none' ? (
                  <Text style={styles.hint}>התזכורת מופיעה בדף הבית מהמועד שנבחר ועד סוף המפגש.</Text>
                ) : null}
              </>
            )}

            <View style={styles.stack}>
              <Button label="שמירה" loading={busy} disabled={!loaded} onPress={save} />
              <Button label="סגירה" variant="secondary" onPress={onClose} disabled={busy} />
            </View>
            {request.onCancelSession ? (
              <Pressable
                onPress={() => {
                  onClose();
                  request.onCancelSession?.();
                }}
                accessibilityRole="link"
                hitSlop={8}
                style={styles.cancelLink}
              >
                <Text style={styles.cancelText}>ביטול המפגש</Text>
              </Pressable>
            ) : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (c: ColorScheme, layout: StyleLayout) =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.45)',
      alignItems: 'center',
      justifyContent: 'center',
      padding: spacing.lg,
    },
    dialog: {
      width: '100%',
      maxWidth: 440,
      maxHeight: '90%',
      backgroundColor: c.surface,
      borderRadius: radius.md,
    },
    body: { padding: spacing.lg, gap: spacing.sm },
    title: { fontSize: 18, fontWeight: '800', color: c.text, textAlign: layout.textStart },
    headRow: { flexDirection: layout.rowStart, alignItems: 'center', gap: 6 },
    subject: { flexShrink: 1, fontSize: 16, fontWeight: '700', color: c.text, textAlign: layout.textStart },
    message: { fontSize: 14, lineHeight: 21, color: c.textMuted, textAlign: layout.textStart },
    label: { fontSize: 14, fontWeight: '700', color: c.text, textAlign: layout.textStart, marginTop: spacing.xs },
    hint: { fontSize: 12, color: c.textMuted, textAlign: layout.textStart },
    input: {
      minHeight: 48,
      maxHeight: 140,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      fontSize: 15,
      color: c.text,
      backgroundColor: c.surface,
      textAlign: layout.textStart,
      textAlignVertical: 'top',
    },
    chips: { flexDirection: layout.rowStart, flexWrap: 'wrap', gap: 6 },
    chip: {
      flexDirection: layout.rowStart,
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 16,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border,
      backgroundColor: c.background,
    },
    chipOn: { backgroundColor: c.brandLight, borderColor: c.brand },
    chipText: { fontSize: 13, color: c.textMuted },
    chipTextOn: { color: c.brand, fontWeight: '700' },
    customRow: { flexDirection: layout.rowStart, gap: spacing.sm, alignItems: 'center' },
    customDate: { flex: 2 },
    customTime: { flex: 1 },
    stack: { gap: spacing.sm, marginTop: spacing.md },
    cancelLink: { alignSelf: 'center', paddingVertical: spacing.sm },
    cancelText: { fontSize: 14, fontWeight: '700', color: c.danger, textDecorationLine: 'underline' },
  });
