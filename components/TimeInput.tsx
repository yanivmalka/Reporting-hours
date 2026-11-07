/**
 * שדה שעה מחולק: [שעות] : [דקות].
 *
 * - מקלדת מספרית בלבד, ספרות בלבד נקלטות.
 * - הקלדה רציפה: אחרי 2 ספרות שעה — מעבר אוטומטי לדקות; אחרי 2 ספרות דקות —
 *   מעבר לשדה הבא (`onOverflow` / `onComplete`). ספרת שעה ראשונה 3–9 משלימה
 *   "0" ועוברת מיד (‎"9" → 09), וכך גם ספרת דקות ראשונה 6–9.
 * - עמיד להקלדה מהירה: ספרות שמגיעות לשדה שכבר מלא (כי המעבר עוד לא הושלם)
 *   מועברות הלאה לשדה הבא במקום ללכת לאיבוד.
 * - כניסה לשדה מלא מנקה אותו (בלי בחירת טקסט); הערך הקודם מוצג כרמז אפור
 *   ומוחזר אם יוצאים בלי להקליד.
 * - גלגלת: גרירה אנכית על השעות או הדקות (וגלגלת עכבר ב־web) משנה בצעד של
 *   שעה / דקה. דקות שעוברות את 59 או יורדות מתחת ל־00 מעדכנות את השעה.
 * - הערך החיצוני הוא "HH:MM" כששני החלקים מלאים, אחרת מחרוזת ריקה.
 */
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text, TextInput } from './Text';
import type { TextInput as RNTextInput } from 'react-native';
import { hideWheelBubbles, useWheel } from './useWheel';
import { WheelBubble } from './WheelBubble';
import { useTheme } from '../theme/ThemeContext';
import { useThemedStyles } from '../theme/useThemedStyles';
import { radius, spacing, type AppColors } from '../theme/colors';

export type TimeInputHandle = {
  focus: () => void;
  /** מזין ספרות שנשפכו מהשדה הקודם (הקלדה רציפה), כאילו הוקלדו כאן */
  feed: (digits: string) => void;
};

type TimeInputProps = {
  value: string;
  onChange: (value: string) => void;
  /** נקרא כשהשעה הוקלדה במלואה — למעבר לשדה הבא */
  onComplete?: () => void;
  /** ספרות עודפות אחרי שהשעה הושלמה — להעברה לשדה הבא */
  onOverflow?: (digits: string) => void;
  invalid?: boolean;
  hourPlaceholder?: string;
  minutePlaceholder?: string;
  /** גרירת גלגלת התחילה / הסתיימה — כדי שההורה ירים את השדה מעל שכניו */
  onDragging?: (on: boolean) => void;
};

const onlyDigits = (text: string) => text.replace(/\D/g, '');

function split(value: string): [string, string] {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value);
  return m ? [m[1].padStart(2, '0'), m[2]] : ['', ''];
}

/** לוקח חלק (שעות/דקות) מתחילת רצף ספרות; מחזיר [חלק, שארית]. */
function take(d: string, maxFirst: number): [string, string] {
  if (d === '') return ['', ''];
  if (Number(d[0]) > maxFirst) return [`0${d[0]}`, d.slice(1)];
  return [d.slice(0, 2), d.slice(2)];
}

export const TimeInput = forwardRef<TimeInputHandle, TimeInputProps>(function TimeInput(
  { value, onChange, onComplete, onOverflow, invalid, hourPlaceholder = '00', minutePlaceholder = '00', onDragging },
  ref,
) {
  const styles = useThemedStyles(makeStyles);
  const { colors } = useTheme();
  const hourRef = useRef<RNTextInput>(null);
  const minuteRef = useRef<RNTextInput>(null);
  const [[hh, mm], setParts] = useState<[string, string]>(() => split(value));
  // הערכים העדכניים, מתעדכנים מיד (לא מחכים לרינדור) — בהקלדה מהירה אירוע
  // אחד עלול להגיע לפני שהקודם הגיע ל־state.
  const partsRef = useRef<[string, string]>([hh, mm]);
  // ערך קודם של שדה שנוקה בכניסה אליו — מוצג כרמז, ומוחזר אם יצאו בלי להקליד.
  const [saved, setSaved] = useState<[string, string]>(['', '']);
  const savedRef = useRef<[string, string]>(['', '']);
  // מעבר שדה שהקוד יזם (וכבר ניקה) — אירוע ה־focus שיגיע אחריו לא ינקה שוב,
  // כי ייתכן שבינתיים כבר הוזנו בו ספרות.
  const programmatic = useRef<[boolean, boolean]>([false, false]);

  function onFieldFocus(i: 0 | 1) {
    if (programmatic.current[i]) {
      programmatic.current[i] = false;
      return;
    }
    clearForTyping(i);
  }

  // סנכרון רק כשהערך הוחלף מבחוץ (ולא כהד של מה שהשדה עצמו שלח).
  const lastEmitted = useRef(value);
  useEffect(() => {
    if (value !== lastEmitted.current) {
      lastEmitted.current = value;
      partsRef.current = split(value);
      setParts(partsRef.current);
    }
  }, [value]);

  function emit(nextH: string, nextM: string) {
    partsRef.current = [nextH, nextM];
    setParts([nextH, nextM]);
    const valid = nextH.length === 2 && nextM.length === 2;
    const next = valid ? `${nextH}:${nextM}` : '';
    lastEmitted.current = next;
    onChange(next);
  }

  function setSavedPart(i: 0 | 1, v: string) {
    const next: [string, string] = [...savedRef.current];
    next[i] = v;
    savedRef.current = next;
    setSaved(next);
  }

  /**
   * ניקוי שדה מלא לפני הקלדה חדשה — בלי בחירת טקסט (באנדרואיד בחירה כזו
   * מתחדשת אחרי כל שינוי, והספרה הבאה "מחליפה" את הקודמת: 13 → 3).
   */
  function clearForTyping(i: 0 | 1) {
    const current = partsRef.current[i];
    if (current.length !== 2) return;
    setSavedPart(i, current);
    emit(i === 0 ? '' : partsRef.current[0], i === 1 ? '' : partsRef.current[1]);
  }

  function restoreIfEmpty(i: 0 | 1) {
    programmatic.current[i] = false;
    const prev = savedRef.current[i];
    if (prev && partsRef.current[i] === '') {
      emit(i === 0 ? prev : partsRef.current[0], i === 1 ? prev : partsRef.current[1]);
    }
    setSavedPart(i, '');
  }

  function focusMinutes() {
    clearForTyping(1);
    programmatic.current[1] = true;
    minuteRef.current?.focus();
  }

  /** מזין ספרות לשדה הדקות; שארית — לשדה הבא. */
  function feedMinutes(d: string) {
    const [m, rest] = take(d, 5);
    emit(partsRef.current[0], m);
    if (m.length === 2) {
      setSavedPart(1, '');
      if (rest && onOverflow) onOverflow(rest);
      else onComplete?.();
    }
  }

  /** מזין ספרות לשדה השעות; שארית — לדקות. */
  function feedHours(d: string) {
    let [h, rest] = take(d, 2);
    if (h.length === 2 && Number(h) > 23) h = '23';
    emit(h, partsRef.current[1]);
    if (h.length === 2) {
      setSavedPart(0, '');
      focusMinutes();
      if (rest) feedMinutes(rest);
    }
  }

  function onHour(text: string) {
    const prev = partsRef.current[0];
    const d = onlyDigits(text);
    // שדה מלא שקיבל עוד ספרות (המעבר לדקות עוד לא הושלם) — הספרות לדקות.
    if (prev.length === 2 && d.length > 2 && d.startsWith(prev)) {
      focusMinutes();
      feedMinutes(d.slice(2));
      return;
    }
    feedHours(d);
  }

  function onMinute(text: string) {
    const prev = partsRef.current[1];
    const d = onlyDigits(text);
    if (prev.length === 2 && d.length > 2 && d.startsWith(prev)) {
      if (onOverflow) onOverflow(d.slice(2));
      return;
    }
    feedMinutes(d);
  }

  /** צעד גלגלת: delta דקות מהשעה הנוכחית (חלק ריק נחשב 0), בטווח היממה. */
  function wheel(deltaMinutes: number) {
    const [h, m] = partsRef.current;
    const prev = savedRef.current;
    const hNum = Number(h || prev[0] || 0);
    const mNum = Number(m || prev[1] || 0);
    const total = (((hNum * 60 + mNum + deltaMinutes) % 1440) + 1440) % 1440;
    setSavedPart(0, '');
    setSavedPart(1, '');
    emit(String(Math.floor(total / 60)).padStart(2, '0'), String(total % 60).padStart(2, '0'));
  }
  const hourWheel = useWheel((d) => wheel(d * 60));
  const minuteWheel = useWheel((d) => wheel(d));
  /** מיקום תיבת הדקות בשורה — הבועה של הדקות מחושבת יחסית לה */
  const [minuteX, setMinuteX] = useState(0);
  const dragging = hourWheel.drag ?? minuteWheel.drag;
  const draggingOn = Boolean(dragging);
  const draggingRef = useRef(onDragging);
  draggingRef.current = onDragging;
  useEffect(() => {
    draggingRef.current?.(draggingOn);
  }, [draggingOn]);
  const bubble = hourWheel.drag
    ? { x: hourWheel.drag.x, y: hourWheel.drag.y, part: 0 as const }
    : minuteWheel.drag
      ? { x: minuteX + minuteWheel.drag.x, y: minuteWheel.drag.y, part: 1 as const }
      : null;

  useImperativeHandle(
    ref,
    () => ({
      focus: () => {
        clearForTyping(0);
        programmatic.current[0] = true;
        hourRef.current?.focus();
      },
      feed: (d: string) => {
        clearForTyping(0);
        programmatic.current[0] = true;
        hourRef.current?.focus();
        feedHours(d);
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const common = {
    keyboardType: 'number-pad' as const,
    inputMode: 'numeric' as const,
    maxLength: 4,
    placeholderTextColor: colors.textMuted,
    style: [styles.part, invalid && styles.invalid],
  };

  return (
    <View style={[styles.row, bubble && styles.rowRaised]}>
      <View ref={hourWheel.ref} {...hourWheel.panHandlers} style={styles.cell}>
      <TextInput
        ref={hourRef}
        value={hh}
        onChangeText={onHour}
        onFocus={() => {
          hideWheelBubbles();
          onFieldFocus(0);
        }}
        onBlur={() => restoreIfEmpty(0)}
        placeholder={saved[0] || hourPlaceholder}
        accessibilityLabel="שעות"
        returnKeyType="next"
        onSubmitEditing={focusMinutes}
        {...common}
      />
      </View>
      <Text style={styles.colon}>:</Text>
      <View
        ref={minuteWheel.ref}
        {...minuteWheel.panHandlers}
        style={styles.cell}
        onLayout={(e) => setMinuteX(e.nativeEvent.layout.x)}
      >
      <TextInput
        ref={minuteRef}
        value={mm}
        onChangeText={onMinute}
        onFocus={() => {
          hideWheelBubbles();
          onFieldFocus(1);
        }}
        onBlur={() => restoreIfEmpty(1)}
        placeholder={saved[1] || minutePlaceholder}
        accessibilityLabel="דקות"
        returnKeyType="next"
        onSubmitEditing={() => onComplete?.()}
        {...common}
      />
      </View>
      {bubble ? (
        <WheelBubble x={bubble.x} y={bubble.y}>
          <Text style={styles.bubbleText}>
            <Text style={bubble.part === 0 ? styles.bubbleOn : styles.bubbleOff}>{hh || '00'}</Text>
            <Text style={styles.bubbleOff}>:</Text>
            <Text style={bubble.part === 1 ? styles.bubbleOn : styles.bubbleOff}>{mm || '00'}</Text>
          </Text>
        </WheelBubble>
      ) : null}
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
    cell: {
      // width 0 + flexGrow: בלי זה שדה טקסט ב־web מקבל רוחב פנימי ודוחף את השורה החוצה.
      flexGrow: 1,
      flexBasis: 0,
      width: 0,
      minWidth: 0,
    },
    part: {
      width: '100%',
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
    rowRaised: {
      zIndex: 50,
      elevation: 8,
    },
    bubbleText: {
      fontSize: 30,
      fontVariant: ['tabular-nums'],
      // שעה משמאל, דקות מימין — בכל שפה.
      writingDirection: 'ltr',
    },
    bubbleOn: {
      fontWeight: '800',
      color: colors.brand,
    },
    bubbleOff: {
      fontWeight: '700',
      color: colors.textMuted,
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
