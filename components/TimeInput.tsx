/**
 * שדה שעה מחולק: [שעות] : [דקות].
 *
 * - מקלדת מספרית בלבד, ספרות בלבד נקלטות.
 * - הקלדה רציפה: אחרי 2 ספרות שעה — מעבר אוטומטי לדקות; אחרי 2 ספרות דקות —
 *   `onComplete` (מעבר לשדה הבא). ספרת שעה ראשונה 3–9 משלימה "0" ועוברת מיד
 *   (‎"9" → 09), וכך גם ספרת דקות ראשונה 6–9.
 * - מחיקה (Backspace) בשדה דקות ריק חוזרת לשדה השעות.
 * - הערך החיצוני הוא "HH:MM" כששני החלקים מלאים, אחרת מחרוזת ריקה.
 */
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { useThemedStyles } from '../theme/useThemedStyles';
import { radius, spacing, type AppColors } from '../theme/colors';

export type TimeInputHandle = { focus: () => void };

type TimeInputProps = {
  value: string;
  onChange: (value: string) => void;
  /** נקרא כשהשעה הוקלדה במלואה — למעבר לשדה הבא */
  onComplete?: () => void;
  invalid?: boolean;
  hourPlaceholder?: string;
  minutePlaceholder?: string;
};

const digits = (text: string) => text.replace(/\D/g, '');

function split(value: string): [string, string] {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value);
  return m ? [m[1].padStart(2, '0'), m[2]] : ['', ''];
}

export const TimeInput = forwardRef<TimeInputHandle, TimeInputProps>(function TimeInput(
  { value, onChange, onComplete, invalid, hourPlaceholder = 'שש', minutePlaceholder = 'דד' },
  ref,
) {
  const styles = useThemedStyles(makeStyles);
  const { colors } = useTheme();
  const hourRef = useRef<TextInput>(null);
  const minuteRef = useRef<TextInput>(null);
  const [[hh, mm], setParts] = useState<[string, string]>(() => split(value));

  useImperativeHandle(ref, () => ({ focus: () => hourRef.current?.focus() }), []);

  // סנכרון רק כשהערך הוחלף מבחוץ (ולא כהד של מה שהשדה עצמו שלח),
  // כדי שהקלדה חלקית — שנשלחת כ־'' — לא תימחק.
  const lastEmitted = useRef(value);
  useEffect(() => {
    if (value !== lastEmitted.current) {
      lastEmitted.current = value;
      setParts(split(value));
    }
  }, [value]);

  function emit(nextH: string, nextM: string) {
    setParts([nextH, nextM]);
    const valid = nextH.length === 2 && nextM.length === 2;
    const next = valid ? `${nextH}:${nextM}` : '';
    lastEmitted.current = next;
    onChange(next);
  }

  function onHour(text: string) {
    let h = digits(text).slice(0, 2);
    if (h.length === 1 && Number(h) > 2) h = `0${h}`;
    if (h.length === 2 && Number(h) > 23) h = '23';
    emit(h, mm);
    if (h.length === 2) minuteRef.current?.focus();
  }

  function onMinute(text: string) {
    let m = digits(text).slice(0, 2);
    if (m.length === 1 && Number(m) > 5) m = `0${m}`;
    emit(hh, m);
    if (m.length === 2) onComplete?.();
  }

  const common = {
    keyboardType: 'number-pad' as const,
    inputMode: 'numeric' as const,
    maxLength: 2,
    selectTextOnFocus: true,
    placeholderTextColor: colors.textMuted,
    style: [styles.part, invalid && styles.invalid],
  };

  return (
    <View style={styles.row}>
      <TextInput
        ref={hourRef}
        value={hh}
        onChangeText={onHour}
        placeholder={hourPlaceholder}
        accessibilityLabel="שעות"
        returnKeyType="next"
        onSubmitEditing={() => minuteRef.current?.focus()}
        {...common}
      />
      <Text style={styles.colon}>:</Text>
      <TextInput
        ref={minuteRef}
        value={mm}
        onChangeText={onMinute}
        placeholder={minutePlaceholder}
        accessibilityLabel="דקות"
        returnKeyType="next"
        onSubmitEditing={() => onComplete?.()}
        onKeyPress={(e) => {
          if (e.nativeEvent.key === 'Backspace' && mm === '') hourRef.current?.focus();
        }}
        {...common}
      />
    </View>
  );
});

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    row: {
      // שעה משמאל, דקות מימין — בכל שפה.
      direction: 'ltr',
      width: '100%',
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
    },
    part: {
      // width 0 + flexGrow: בלי זה שדה טקסט ב־web מקבל רוחב פנימי ודוחף את השורה החוצה.
      flexGrow: 1,
      flexBasis: 0,
      width: 0,
      minWidth: 0,
      minHeight: 48,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      fontSize: 20,
      fontWeight: '700',
      color: colors.text,
      textAlign: 'center',
      fontVariant: ['tabular-nums'],
    },
    invalid: {
      borderColor: colors.danger,
    },
    colon: {
      fontSize: 20,
      fontWeight: '800',
      color: colors.textMuted,
    },
  });
