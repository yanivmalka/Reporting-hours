/**
 * פרטי המפגש בדף דיווח המפגש (שלבי השעות והסיכום, כשנבחר קורס):
 *  - "סיכום ופרטי המפגש" — פותח את גיליון "פרטי המפגש" (components/SessionSheet.tsx)
 *    עם מקטע "סיכום קצר" (וגם סימון, הערה, תוכן, הגעה).
 *  - "הערה למפגש הבא" — אותו גיליון על המפגש הבא של הקורס, בלי לעבור לשם.
 *  - "במפגש הקודם" — מה שנשמר במפגש האחרון (סיכום / תוכן / הערה), חשוף; "עוד" פותח
 *    רשימה נגללת של פרטי המפגשים הקודמים.
 * הנתונים — lib/sessionNotes.ts.
 */
import { useState } from 'react';
import { Modal, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../Text';
import { Pressable } from '../Pressable';
import { Icon } from '../Icon';
import { Button } from '../Button';
import { EnterChevron } from '../Chevrons';
import { useSessionSheet } from '../SessionSheet';
import { useSessionNotes } from '../useSessionNotes';
import { occurrences, type Course } from '../../lib/courses';
import { dateFromIso, isoDate } from '../../lib/dates';
import { FLAG_ICON, FLAG_LABEL, noteFor, previousNotes, type SessionNote } from '../../lib/sessionNotes';
import type { Workplace } from '../../lib/workplaces';
import { useTheme } from '../../theme/ThemeContext';
import { useThemedStyles } from '../../theme/useThemedStyles';
import { cardShadow, radius, spacing, type AppColors } from '../../theme/colors';
import { TEXT_RIGHT } from '../../theme/align';
import type { ReportWizard } from './useReportWizard';

const WEEKDAY_SHORT = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];
/** "ג׳ 25.11" */
function dayLabel(iso: string): string {
  const d = dateFromIso(iso);
  return `${WEEKDAY_SHORT[d.getDay()]} ${d.getDate()}.${d.getMonth() + 1}`;
}

/** המפגש הבא של הקורס אחרי התאריך (שמתקיים), או null. */
function nextSessionDate(course: Course, date: string): string | null {
  const d = dateFromIso(date);
  d.setDate(d.getDate() + 1);
  return occurrences(course, isoDate(d), '9999-12-31')[0] ?? null;
}

/** הטקסט העיקרי של פרטי מפגש: הסיכום, אחרת התוכן, אחרת ההערה. */
function mainText(n: SessionNote): string {
  return n.summary || n.content || n.note || '';
}

export function SessionDetailsCard({ w }: { w: ReportWizard }) {
  const { step, date, workplace, selectedCourse } = w;
  if ((step !== 'times' && step !== 'summary') || !selectedCourse || !workplace) return null;
  return <Card course={selectedCourse} workplace={workplace} date={date} />;
}

function Card({ course, workplace, date }: { course: Course; workplace: Workplace; date: string }) {
  const styles = useThemedStyles(makeStyles);
  const { colors } = useTheme();
  const notes = useSessionNotes();
  const sheet = useSessionSheet();
  const [history, setHistory] = useState(false);
  const mine = noteFor(notes, course.id, date);
  const next = nextSessionDate(course, date);
  const nextNote = next ? noteFor(notes, course.id, next) : undefined;
  const prev = previousNotes(notes, course.id, date);
  const last = prev[0];

  const minePreview = mine
    ? [mine.flag && FLAG_LABEL[mine.flag], mine.summary || mine.note || mine.content].filter(Boolean).join(' · ')
    : '';

  return (
    <View style={styles.card}>
      {last ? (
        <View style={styles.last}>
          <View style={styles.lastHead}>
            <Icon name="history" size={18} color={colors.textMuted} />
            <Text style={styles.lastTitle}>במפגש הקודם · {dayLabel(last.date)}</Text>
            <Pressable
              onPress={() => setHistory(true)}
              accessibilityRole="button"
              accessibilityLabel="פרטי המפגשים הקודמים"
              hitSlop={8}
              style={styles.moreBtn}
            >
              <Icon name="history" size={16} color={colors.brand} />
              <Text style={styles.moreText}>עוד</Text>
            </Pressable>
          </View>
          <Text style={styles.lastText} numberOfLines={4}>
            {mainText(last)}
          </Text>
        </View>
      ) : null}

      <Pressable
        onPress={() => sheet.open({ course, workplace, date, open: ['summary'] })}
        accessibilityRole="button"
        style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      >
        <Icon
          name={mine?.flag ? FLAG_ICON[mine.flag] : 'text-box-check-outline'}
          size={20}
          color={mine?.flag ? colors.warning : colors.brand}
        />
        <View style={styles.rowTexts}>
          <Text style={styles.rowTitle}>סיכום ופרטי המפגש</Text>
          <Text style={styles.rowSub} numberOfLines={2}>
            {minePreview || 'סיכום קצר, הערה או סימון (הגשה, מבחן)'}
          </Text>
        </View>
        <EnterChevron size={18} />
      </Pressable>

      {next ? (
        <Pressable
          onPress={() =>
            sheet.open({ course, workplace, date: next, open: ['note'], title: 'הערה למפגש הבא' })
          }
          accessibilityRole="button"
          style={({ pressed }) => [styles.row, pressed && styles.pressed]}
        >
          <Icon name="note-plus-outline" size={20} color={colors.brand} />
          <View style={styles.rowTexts}>
            <Text style={styles.rowTitle}>הערה למפגש הבא · {dayLabel(next)}</Text>
            <Text style={styles.rowSub} numberOfLines={2}>
              {nextNote?.note || 'תופיע במפגש הבא — בלו״ז, ביומן ובדיווח שלו'}
            </Text>
          </View>
          <EnterChevron size={18} />
        </Pressable>
      ) : null}

      {sheet.dialog}

      {history ? (
        <Modal transparent animationType="fade" visible onRequestClose={() => setHistory(false)}>
          <View style={styles.backdrop}>
            <View style={styles.dialog}>
              <Text style={styles.dialogTitle}>המפגשים הקודמים · {course.name}</Text>
              <ScrollView style={styles.list} contentContainerStyle={styles.listBody}>
                {prev.map((n) => (
                  <View key={n.date} style={styles.item}>
                    <View style={styles.itemHead}>
                      {n.flag ? <Icon name={FLAG_ICON[n.flag]} size={16} color={colors.warning} /> : null}
                      <Text style={styles.itemDate}>
                        {dayLabel(n.date)}
                        {n.flag ? ` · ${FLAG_LABEL[n.flag]}` : ''}
                      </Text>
                    </View>
                    {n.summary ? <Text style={styles.itemText}>{n.summary}</Text> : null}
                    {n.content ? <Text style={styles.itemSub}>תוכן: {n.content}</Text> : null}
                    {n.note ? <Text style={styles.itemSub}>הערה: {n.note}</Text> : null}
                  </View>
                ))}
              </ScrollView>
              <Button label="סגירה" variant="secondary" onPress={() => setHistory(false)} />
            </View>
          </View>
        </Modal>
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
    pressed: { opacity: 0.7 },
    last: {
      gap: 2,
      paddingBottom: spacing.xs,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    lastHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    lastTitle: { flex: 1, fontSize: 13, fontWeight: '700', color: colors.textMuted, textAlign: TEXT_RIGHT },
    lastText: { fontSize: 14, lineHeight: 20, color: colors.text, textAlign: TEXT_RIGHT },
    moreBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 14,
      backgroundColor: colors.brandLight,
    },
    moreText: { fontSize: 13, fontWeight: '700', color: colors.brand },
    row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 48 },
    rowTexts: { flex: 1, minWidth: 0, gap: 1 },
    rowTitle: { fontSize: 14, fontWeight: '700', color: colors.text, textAlign: TEXT_RIGHT },
    rowSub: { fontSize: 12, color: colors.textMuted, textAlign: TEXT_RIGHT },
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
      maxHeight: '85%',
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      padding: spacing.lg,
      gap: spacing.sm,
    },
    dialogTitle: { fontSize: 17, fontWeight: '800', color: colors.text, textAlign: TEXT_RIGHT },
    list: { flexGrow: 0 },
    listBody: { gap: spacing.sm },
    item: {
      gap: 2,
      paddingBottom: spacing.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    itemHead: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    itemDate: { fontSize: 13, fontWeight: '700', color: colors.textMuted, textAlign: TEXT_RIGHT },
    itemText: { fontSize: 14, lineHeight: 20, color: colors.text, textAlign: TEXT_RIGHT },
    itemSub: { fontSize: 13, lineHeight: 19, color: colors.textMuted, textAlign: TEXT_RIGHT },
  });
