/**
 * "מפגשים נוספים" בדף הקורס (תצוגה ועריכה), מתחת לפירוט מפגשי הקורס: רשימת המפגשים
 * הפרטניים שנוספו מעבר ליום הקבוע, וכפתור שפותח דיאלוג להוספה / עריכה — תאריך,
 * "שם המפגש", שעות (ברירת מחדל: שעות הקורס) ותיאור. הנתונים ב־`Course.extraDates`
 * וב־`Course.extraInfo` (lib/courses.ts).
 */
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text, TextInput } from '../Text';
import { Button } from '../Button';
import { Dialog } from '../Dialog';
import { Pressable } from '../Pressable';
import { Icon } from '../Icon';
import { EnterChevron } from '../Chevrons';
import { DateField } from '../DatePicker';
import { TimeInput } from '../TimeInput';
import { occursOn, timeRange, type Course, type ExtraSessionInfo } from '../../lib/courses';
import { formatISODate, parseTime, todayISO } from '../../lib/time';
import { useTheme } from '../../theme/ThemeContext';
import { useThemedStyles } from '../../theme/useThemedStyles';
import { cardShadow, radius, spacing, type AppColors } from '../../theme/colors';
import { TEXT_RIGHT } from '../../theme/align';

export type ExtraSessions = { extraDates: string[]; extraInfo: Record<string, ExtraSessionInfo> };

type Draft = { date: string; name: string; start: string; end: string; description: string };

export function ExtraSessionsCard({
  course,
  value,
  onChange,
  editable,
}: {
  /** הקורס (לשעות ברירת המחדל ולבדיקת תאריך תפוס) */
  course: Course;
  value: ExtraSessions;
  onChange: (next: ExtraSessions) => void;
  editable: boolean;
}) {
  const styles = useThemedStyles(makeStyles);
  const { colors } = useTheme();
  /** null — סגור; original — התאריך הנערך (undefined = חדש) */
  const [edit, setEdit] = useState<{ original?: string; draft: Draft } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const dates = [...value.extraDates].sort();

  function openNew() {
    setError(null);
    setEdit({ draft: { date: todayISO(), name: '', start: course.start, end: course.end, description: '' } });
  }
  function openExisting(date: string) {
    const x = value.extraInfo[date] ?? {};
    setError(null);
    setEdit({
      original: date,
      draft: {
        date,
        name: x.name ?? '',
        start: x.start ?? course.start,
        end: x.end ?? course.end,
        description: x.description ?? '',
      },
    });
  }

  function save() {
    if (!edit) return;
    const d = edit.draft;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date)) return setError('יש לבחור תאריך');
    const others = value.extraDates.filter((x) => x !== edit.original);
    if (others.includes(d.date) || occursOn({ ...course, extraDates: [] }, d.date)) {
      return setError('כבר יש מפגש בתאריך הזה');
    }
    const s = parseTime(d.start);
    const e = parseTime(d.end);
    if (s == null || e == null || e <= s) return setError('שעות לא תקינות');
    const sameHours = d.start === course.start && d.end === course.end;
    const info: ExtraSessionInfo = {
      name: d.name.trim() || undefined,
      description: d.description.trim() || undefined,
      start: sameHours ? undefined : d.start,
      end: sameHours ? undefined : d.end,
    };
    const extraInfo = { ...value.extraInfo };
    if (edit.original) delete extraInfo[edit.original];
    if (info.name || info.description || info.start) extraInfo[d.date] = info;
    onChange({ extraDates: [...others, d.date].sort(), extraInfo });
    setEdit(null);
  }

  function remove() {
    if (!edit?.original) return;
    const extraInfo = { ...value.extraInfo };
    delete extraInfo[edit.original];
    onChange({ extraDates: value.extraDates.filter((x) => x !== edit.original), extraInfo });
    setEdit(null);
  }

  if (!editable && dates.length === 0) return null;

  return (
    <View style={styles.card}>
      <Text style={styles.title}>מפגשים נוספים</Text>
      {dates.length === 0 ? (
        <Text style={styles.muted}>מפגש פרטני מעבר ליום הקבוע — השלמה, סיור, הגשה.</Text>
      ) : (
        dates.map((date) => {
          const x = value.extraInfo[date];
          const hours = timeRange(x?.start ?? course.start, x?.end ?? course.end);
          return (
            <Pressable
              key={date}
              disabled={!editable}
              onPress={() => openExisting(date)}
              accessibilityRole={editable ? 'button' : 'text'}
              style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
            >
              <Icon name="calendar-plus" size={18} color={colors.brand} />
              <View style={styles.rowTexts}>
                <Text style={styles.rowTitle}>
                  {formatISODate(date)} · {x?.name || 'מפגש נוסף'}
                </Text>
                <Text style={styles.muted}>
                  {hours}
                  {x?.description ? ` · ${x.description}` : ''}
                </Text>
              </View>
              {editable ? <EnterChevron size={18} /> : null}
            </Pressable>
          );
        })
      )}
      {editable ? (
        <View style={styles.action}>
          <Button label="הוספת מפגש נוסף" variant="secondary" onPress={openNew} />
        </View>
      ) : null}

      {edit ? (
        <Dialog
          title={edit.original ? 'מפגש נוסף' : 'הוספת מפגש נוסף'}
          compactTitle={edit.draft.name || (edit.original ? 'מפגש נוסף' : 'הוספת מפגש נוסף')}
          onClose={() => setEdit(null)}
          actions={[
            <Button key="save" label="שמירה" onPress={save} />,
            <Button key="close" label="סגירה" variant="secondary" onPress={() => setEdit(null)} />,
          ]}
          below={
            edit.original ? (
              <Pressable onPress={remove} accessibilityRole="button" hitSlop={8} style={styles.removeLink}>
                <Text style={styles.removeText}>הסרת המפגש הנוסף</Text>
              </Pressable>
            ) : null
          }
        >
          <Text style={styles.label}>שם המפגש</Text>
          <TextInput
            value={edit.draft.name}
            onChangeText={(t) => setEdit({ ...edit, draft: { ...edit.draft, name: t } })}
            placeholder="למשל: שיעור השלמה, סיור"
            placeholderTextColor={colors.textMuted}
            style={styles.input}
          />
          <Text style={styles.label}>תאריך</Text>
          <DateField
            value={edit.draft.date}
            onChange={(v) => setEdit({ ...edit, draft: { ...edit.draft, date: v } })}
          />
          <View style={styles.times}>
            <View style={styles.timeCol}>
              <Text style={styles.label}>התחלה</Text>
              <TimeInput
                value={edit.draft.start}
                onChange={(v) => setEdit((e) => (e ? { ...e, draft: { ...e.draft, start: v } } : e))}
                label="שעת התחלה"
              />
            </View>
            <View style={styles.timeCol}>
              <Text style={styles.label}>סיום</Text>
              <TimeInput
                value={edit.draft.end}
                min={edit.draft.start}
                onChange={(v) => setEdit((e) => (e ? { ...e, draft: { ...e.draft, end: v } } : e))}
                label="שעת סיום"
              />
            </View>
          </View>
          <Text style={styles.label}>תיאור</Text>
          <TextInput
            value={edit.draft.description}
            onChangeText={(t) => setEdit({ ...edit, draft: { ...edit.draft, description: t } })}
            multiline
            placeholder="מה במפגש"
            placeholderTextColor={colors.textMuted}
            style={[styles.input, styles.multi]}
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </Dialog>
      ) : null}
    </View>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    card: {
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      gap: spacing.xs,
      ...cardShadow,
    },
    title: { fontSize: 15, fontWeight: '700', color: colors.text, textAlign: TEXT_RIGHT, paddingTop: 4 },
    muted: { fontSize: 12, color: colors.textMuted, textAlign: TEXT_RIGHT },
    row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 44 },
    rowTexts: { flex: 1, minWidth: 0, gap: 1 },
    rowTitle: { fontSize: 14, fontWeight: '700', color: colors.text, textAlign: TEXT_RIGHT },
    action: { paddingVertical: spacing.xs },
    label: { fontSize: 14, fontWeight: '700', color: colors.text, textAlign: TEXT_RIGHT },
    input: {
      minHeight: 48,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      fontSize: 15,
      color: colors.text,
      textAlign: 'right',
    },
    multi: { minHeight: 72, textAlignVertical: 'top' },
    times: { flexDirection: 'row', gap: spacing.md },
    timeCol: { flex: 1, minWidth: 0, gap: 4 },
    error: { fontSize: 13, color: colors.danger, textAlign: TEXT_RIGHT },
    removeLink: { alignSelf: 'center', paddingVertical: spacing.xs },
    removeText: { fontSize: 14, fontWeight: '700', color: colors.dangerText },
  });
