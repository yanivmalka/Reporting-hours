/**
 * בחירת תאריך לדיווח:
 * - שורת כפתורים מהירים בגלילה אופקית: "היום", "אתמול", ואחריהם עד 7 ימי
 *   עבודה קודמים שכבר דווחו (מהחדש לישן).
 * - כפתור "📅" שפותח תאריכון חודשי (ימים שכבר דווחו מסומנים בנקודה).
 * בלי תלות חיצונית — עובד זהה ב־web ובאנדרואיד.
 */
import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { hebrewDate, hebrewDay, hebrewMonthSpan } from '../lib/hebrewDate';
import { useI18n } from '../lib/i18n';
import { radius, spacing } from '../theme/colors';
import { useStyles, type ColorScheme, type StyleLayout } from '../theme/useStyles';

const MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
const WEEKDAYS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];

function iso(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function parse(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}

/** "יום ד׳ · 28/10/2026" — לועזי בלבד */
export function gregorianLong(value: string): string {
  const d = parse(value);
  if (!d) return value;
  const p = (n: number) => String(n).padStart(2, '0');
  return `יום ${WEEKDAYS[d.getDay()]} · ${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/** "יום ד׳ · 28/10/2026 · י״ז חשון" — לועזי ועברי */
export function longDate(value: string): string {
  if (!parse(value)) return value;
  return `${gregorianLong(value)} · ${hebrewDate(value, false)}`;
}

/** "15/10/2026" — לשדות צרים */
function shortLabel(value: string): string {
  const d = parse(value);
  if (!d) return value;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}

function chipLabel(value: string): string {
  const d = parse(value);
  if (!d) return value;
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1} · ${hebrewDate(value, false)}`;
}

type DatePickerProps = {
  value: string;
  onChange: (value: string) => void;
  /** תאריכים שכבר דווחו (ISO), לכפתורים המהירים ולסימון בתאריכון */
  workedDates: readonly string[];
  invalid?: boolean;
};

export function DatePicker({ value, onChange, workedDates, invalid }: DatePickerProps) {
  const styles = useStyles(makeStyles);
  const [open, setOpen] = useState(false);
  const today = iso(new Date());
  const yesterday = iso(new Date(Date.now() - 864e5));

  const recent = useMemo(
    () =>
      [...new Set(workedDates)]
        .filter((d) => d !== today && d !== yesterday && d <= today)
        .sort((a, b) => b.localeCompare(a))
        .slice(0, 7), // עד 7 ימי עבודה אחורה
    [workedDates, today, yesterday],
  );

  const chips: { key: string; label: string }[] = [
    { key: today, label: 'היום' },
    { key: yesterday, label: 'אתמול' },
    ...recent.map((d) => ({ key: d, label: chipLabel(d) })),
  ];

  return (
    <View style={styles.wrap}>
      <Pressable
        style={[styles.display, invalid && styles.invalid]}
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel="פתיחת תאריכון"
      >
        <View style={styles.displayTexts}>
          <Text style={styles.displayText}>{gregorianLong(value)}</Text>
          {parse(value) ? <Text style={styles.displayHeb}>{hebrewDate(value)}</Text> : null}
        </View>
        <Text style={styles.calendarIcon}>📅</Text>
      </Pressable>

      <ScrollView
        horizontal
        style={{ flexGrow: 0 }}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chips}
        keyboardShouldPersistTaps="handled"
      >
        {chips.map((chip) => {
          const selected = chip.key === value;
          return (
            <Pressable
              key={chip.key}
              onPress={() => onChange(chip.key)}
              style={[styles.chip, selected && styles.chipSelected]}
            >
              <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{chip.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {open ? (
        <CalendarModal
          value={value}
          worked={new Set(workedDates)}
          onPick={(d) => {
            onChange(d);
            setOpen(false);
          }}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </View>
  );
}

/** שדה תאריך פשוט: תצוגת התאריך + תאריכון בלחיצה (בלי כפתורים מהירים). */
export function DateField({
  value,
  onChange,
  invalid,
}: {
  value: string;
  onChange: (value: string) => void;
  invalid?: boolean;
}) {
  const styles = useStyles(makeStyles);
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable
        style={[styles.display, invalid && styles.invalid]}
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel="פתיחת תאריכון"
      >
        <View style={styles.displayTexts}>
          <Text style={styles.displayText} numberOfLines={1}>
            {shortLabel(value)}
          </Text>
          {parse(value) ? (
            <Text style={styles.displayHeb} numberOfLines={1}>
              {hebrewDate(value)}
            </Text>
          ) : null}
        </View>
        <Text style={styles.calendarIcon}>📅</Text>
      </Pressable>
      {open ? (
        <CalendarModal
          value={value}
          worked={new Set()}
          onPick={(d) => {
            onChange(d);
            setOpen(false);
          }}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

function CalendarModal({
  value,
  worked,
  onPick,
  onClose,
}: {
  value: string;
  worked: Set<string>;
  onPick: (value: string) => void;
  onClose: () => void;
}) {
  const styles = useStyles(makeStyles);
  const { isRTL } = useI18n();
  const initial = parse(value) ?? new Date();
  const [cursor, setCursor] = useState(new Date(initial.getFullYear(), initial.getMonth(), 1));
  const today = iso(new Date());

  const cells = useMemo(() => {
    const first = cursor.getDay();
    const days = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
    const list: (string | null)[] = Array.from({ length: first }, () => null);
    for (let d = 1; d <= days; d++) list.push(iso(new Date(cursor.getFullYear(), cursor.getMonth(), d)));
    while (list.length % 7) list.push(null);
    return list;
  }, [cursor]);

  const move = (delta: number) =>
    setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + delta, 1));

  return (
    <Modal transparent animationType="fade" visible onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.monthRow}>
            <Pressable onPress={() => move(-1)} style={styles.navBtn} accessibilityLabel="חודש קודם">
              <Text style={styles.navText}>{isRTL ? '→' : '←'}</Text>
            </Pressable>
            <View style={styles.monthTitleBox}>
              <Text style={styles.monthTitle}>
                {MONTHS[cursor.getMonth()]} {cursor.getFullYear()}
              </Text>
              <Text style={styles.monthHeb}>
                {hebrewMonthSpan(cursor.getFullYear(), cursor.getMonth())}
              </Text>
            </View>
            <Pressable onPress={() => move(1)} style={styles.navBtn} accessibilityLabel="חודש הבא">
              <Text style={styles.navText}>{isRTL ? '←' : '→'}</Text>
            </Pressable>
          </View>

          <View style={styles.week}>
            {WEEKDAYS.map((w) => (
              <Text key={w} style={styles.weekday}>
                {w}
              </Text>
            ))}
          </View>

          <View style={styles.grid}>
            {cells.map((cell, i) => {
              if (!cell) return <View key={`e${i}`} style={styles.cell} />;
              const selected = cell === value;
              const isToday = cell === today;
              return (
                <Pressable
                  key={cell}
                  style={styles.cell}
                  onPress={() => onPick(cell)}
                  accessibilityLabel={longDate(cell)}
                >
                  <View
                    style={[
                      styles.day,
                      isToday && styles.dayToday,
                      selected && styles.daySelected,
                    ]}
                  >
                    <Text style={[styles.dayText, selected && styles.dayTextSelected]}>
                      {Number(cell.slice(8))}
                    </Text>
                    <Text style={[styles.dayHeb, selected && styles.dayTextSelected]}>
                      {hebrewDay(cell)}
                    </Text>
                  </View>
                  <View style={[styles.dot, worked.has(cell) && styles.dotOn]} />
                </Pressable>
              );
            })}
          </View>

          <View style={styles.footer}>
            <Pressable onPress={() => onPick(today)}>
              <Text style={styles.link}>היום</Text>
            </Pressable>
            <Text style={styles.legend}>● יום שכבר דווח</Text>
            <Pressable onPress={onClose}>
              <Text style={styles.link}>סגירה</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const makeStyles = (c: ColorScheme, layout: StyleLayout) =>
  StyleSheet.create({
    wrap: {
      gap: spacing.sm,
    },
    display: {
      minHeight: 48,
      flexDirection: layout.rowStart,
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.md,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: radius.md,
    },
    invalid: {
      borderColor: c.danger,
    },
    displayTexts: {
      flex: 1,
      gap: 1,
    },
    displayHeb: {
      fontSize: 12,
      color: c.textMuted,
      textAlign: layout.textStart,
    },
    monthTitleBox: {
      alignItems: 'center',
    },
    monthHeb: {
      fontSize: 12,
      color: c.textMuted,
    },
    dayHeb: {
      fontSize: 9,
      color: c.textMuted,
      marginTop: -2,
    },
    displayText: {
      fontSize: 16,
      fontWeight: '600',
      color: c.text,
      textAlign: layout.textStart,
    },
    calendarIcon: {
      fontSize: 20,
    },
    chips: {
      gap: spacing.sm,
      paddingVertical: 2,
    },
    chip: {
      paddingHorizontal: spacing.md,
      height: 36,
      justifyContent: 'center',
      borderRadius: 18,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
    },
    chipSelected: {
      backgroundColor: c.brand,
      borderColor: c.brand,
    },
    chipText: {
      fontSize: 14,
      fontWeight: '600',
      color: c.text,
    },
    chipTextSelected: {
      color: c.textOnBrand,
    },
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.45)',
      alignItems: 'center',
      justifyContent: 'center',
      padding: spacing.lg,
    },
    sheet: {
      width: '100%',
      maxWidth: 380,
      backgroundColor: c.surface,
      borderRadius: radius.md,
      padding: spacing.md,
      gap: spacing.sm,
    },
    monthRow: {
      flexDirection: layout.rowStart,
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    navBtn: {
      width: 44,
      height: 44,
      alignItems: 'center',
      justifyContent: 'center',
    },
    navText: {
      fontSize: 28,
      color: c.brand,
      fontWeight: '700',
    },
    monthTitle: {
      fontSize: 17,
      fontWeight: '800',
      color: c.text,
    },
    week: {
      flexDirection: layout.rowStart,
    },
    weekday: {
      width: `${100 / 7}%`,
      textAlign: 'center',
      fontSize: 12,
      fontWeight: '700',
      color: c.textMuted,
    },
    grid: {
      flexDirection: layout.rowStart,
      flexWrap: 'wrap',
    },
    cell: {
      width: `${100 / 7}%`,
      alignItems: 'center',
      paddingVertical: 2,
    },
    day: {
      width: 40,
      height: 42,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    dayToday: {
      borderWidth: 1.5,
      borderColor: c.brand,
    },
    daySelected: {
      backgroundColor: c.brand,
    },
    dayText: {
      fontSize: 15,
      color: c.text,
    },
    dayTextSelected: {
      color: c.textOnBrand,
      fontWeight: '800',
    },
    dot: {
      width: 5,
      height: 5,
      borderRadius: 3,
      marginTop: 1,
    },
    dotOn: {
      backgroundColor: c.brand,
    },
    footer: {
      flexDirection: layout.rowStart,
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingTop: spacing.xs,
    },
    link: {
      fontSize: 15,
      fontWeight: '700',
      color: c.brand,
      padding: spacing.xs,
    },
    legend: {
      fontSize: 12,
      color: c.textMuted,
    },
  });
