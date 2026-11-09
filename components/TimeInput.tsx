/**
 * שדה שעה אחד, "HH:MM" כטקסט.
 *
 * - מקלדת מספרית; ספרות בלבד נקלטות, והנקודתיים נוספות לבד ("930" → 09:30).
 *   ספרת שעה ראשונה 3–9 משלימה "0" (‎"9" → 09), וכך גם ספרת דקות ראשונה 6–9.
 *   שעה מעל 23 נקבעת ל־23.
 * - השעה הושלמה (4 ספרות) → `onComplete` (מעבר לשדה הבא); ספרות עודפות
 *   (הקלדה מהירה) → `onOverflow`, להזנה בשדה הבא.
 * - כניסה לשדה מלא מנקה אותו; הערך הקודם מוצג כרמז אפור ומוחזר אם יוצאים
 *   בלי להקליד.
 * - גלגלת: גרירה אנכית על התיבה (וגלגלת עכבר ב־web). בחצי השמאלי — שעות
 *   (צעד של שעה), בחצי הימני — דקות (צעד של דקה; מעבר 59 / 00 מעדכן את השעה).
 *   בזמן הגרירה מוצגת שכבת גלגלת כהה מעל התיבה (`WheelOverlay`), עם `label`.
 * - הערך החיצוני הוא "HH:MM" כשהשעה מלאה, אחרת מחרוזת ריקה.
 */
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { TextInput } from './Text';
import type { TextInput as RNTextInput } from 'react-native';
import { useWheel } from './useWheel';
import { hideWheelOverlay, showWheelOverlay } from './WheelOverlay';
import { useTheme } from '../theme/ThemeContext';
import { useThemedStyles } from '../theme/useThemedStyles';
import { radius, type AppColors } from '../theme/colors';

export type TimeInputHandle = {
  focus: () => void;
  /** מזין ספרות שנשפכו מהשדה הקודם (הקלדה רציפה), כאילו הוקלדו כאן */
  feed: (digits: string) => void;
};

type TimeInputProps = {
  value: string;
  onChange: (value: string) => void;
  /** כותרת שכבת הגלגלת, למשל "שעת התחלה" */
  label?: string;
  /** נקרא כשהשעה הוקלדה במלואה — למעבר לשדה הבא */
  onComplete?: () => void;
  /** ספרות עודפות אחרי שהשעה הושלמה — להעברה לשדה הבא */
  onOverflow?: (digits: string) => void;
  invalid?: boolean;
  placeholder?: string;
};

const onlyDigits = (text: string) => text.replace(/\D/g, '');
const pad2 = (n: number) => String(n).padStart(2, '0');

/** לוקח חלק (שעות/דקות) מתחילת רצף ספרות; מחזיר [חלק, שארית]. */
function take(d: string, maxFirst: number): [string, string] {
  if (d === '') return ['', ''];
  if (Number(d[0]) > maxFirst) return [`0${d[0]}`, d.slice(1)];
  return [d.slice(0, 2), d.slice(2)];
}

/** ספרות גולמיות → [שעות, דקות, שארית] מנורמלים. */
function parse(d: string): [string, string, string] {
  let [h, rest] = take(d, 2);
  if (h.length === 2 && Number(h) > 23) h = '23';
  if (h.length < 2) return [h, '', ''];
  const [m, extra] = take(rest, 5);
  return [h, m, extra];
}

/** תצוגה: "9" · "09:" · "09:3" · "09:30" */
function display(h: string, m: string): string {
  if (h.length < 2) return h;
  return `${h}:${m}`;
}

function fromValue(value: string): [string, string] {
  const r = /^(\d{1,2}):(\d{2})$/.exec(value);
  return r ? [r[1].padStart(2, '0'), r[2]] : ['', ''];
}

export const TimeInput = forwardRef<TimeInputHandle, TimeInputProps>(function TimeInput(
  { value, onChange, label = 'שעה', onComplete, onOverflow, invalid, placeholder = '00:00' },
  ref,
) {
  const styles = useThemedStyles(makeStyles);
  const { colors } = useTheme();
  const inputRef = useRef<RNTextInput>(null);
  const [[hh, mm], setParts] = useState<[string, string]>(() => fromValue(value));
  // הערכים העדכניים, מתעדכנים מיד (לא מחכים לרינדור) — להקלדה מהירה ולגלגלת.
  const partsRef = useRef<[string, string]>([hh, mm]);
  // ערך קודם של שדה שנוקה בכניסה אליו — מוצג כרמז, ומוחזר אם יצאו בלי להקליד.
  const [saved, setSavedState] = useState('');
  const savedRef = useRef('');
  // מיקוד שהקוד יזם (וכבר ניקה) — אירוע ה־focus שאחריו לא ינקה שוב.
  const programmatic = useRef(false);

  function setSaved(v: string) {
    savedRef.current = v;
    setSavedState(v);
  }

  // סנכרון רק כשהערך הוחלף מבחוץ (ולא כהד של מה שהשדה עצמו שלח).
  const lastEmitted = useRef(value);
  useEffect(() => {
    if (value !== lastEmitted.current) {
      lastEmitted.current = value;
      partsRef.current = fromValue(value);
      setParts(partsRef.current);
    }
  }, [value]);

  function emit(h: string, m: string) {
    partsRef.current = [h, m];
    setParts([h, m]);
    const next = h.length === 2 && m.length === 2 ? `${h}:${m}` : '';
    lastEmitted.current = next;
    onChange(next);
  }

  /** ניקוי שדה מלא לפני הקלדה חדשה (בלי בחירת טקסט — באנדרואיד היא מתחדשת). */
  function clearForTyping() {
    const [h, m] = partsRef.current;
    if (h.length !== 2 || m.length !== 2) return;
    setSaved(`${h}:${m}`);
    emit('', '');
  }

  function restoreIfEmpty() {
    programmatic.current = false;
    const prev = savedRef.current;
    const [h, m] = partsRef.current;
    if (prev && h === '' && m === '') {
      const [ph, pm] = fromValue(prev);
      emit(ph, pm);
    }
    setSaved('');
  }

  /** מזין ספרות (מצטרפות למה שכבר הוקלד). */
  function feed(d: string) {
    const [h0, m0] = partsRef.current;
    const wasComplete = h0.length === 2 && m0.length === 2;
    const [h, m, extra] = parse(h0 + m0 + d);
    emit(h, m);
    if (h.length === 2 && m.length === 2) {
      setSaved('');
      if (extra && onOverflow) onOverflow(extra);
      else if (!wasComplete) onComplete?.();
    }
  }

  function onText(text: string) {
    const [h0, m0] = partsRef.current;
    const prevDigits = h0 + m0;
    let d = onlyDigits(text);
    // נמחקו הנקודתיים בלבד — מוחקים את הספרה שלפניהן.
    if (text.length < display(h0, m0).length && d === prevDigits) d = d.slice(0, -1);
    if (d.length <= prevDigits.length || !d.startsWith(prevDigits)) {
      // מחיקה או החלפה — מחשבים מחדש מהספרות.
      const [h, m] = parse(d);
      emit(h, m);
      return;
    }
    feed(d.slice(prevDigits.length));
  }

  // ── גלגלת ──
  /** איזה חלק נגרר, ותחתית שכבת הגלגלת (ראש התיבה בחלון) */
  const [drag, setDrag] = useState<{ part: 0 | 1; top: number } | null>(null);
  const partRef = useRef<0 | 1>(0);

  /** צעד גלגלת: delta דקות מהשעה הנוכחית (ריק = הערך הקודם או 00:00), בטווח היממה. */
  function step(delta: number) {
    const base = partsRef.current[0].length === 2 && partsRef.current[1].length === 2
      ? partsRef.current
      : fromValue(savedRef.current);
    const total = (((Number(base[0] || 0) * 60 + Number(base[1] || 0) + delta) % 1440) + 1440) % 1440;
    setSaved('');
    emit(pad2(Math.floor(total / 60)), pad2(total % 60));
  }
  const wheel = useWheel((d) => step(partRef.current === 0 ? d * 60 : d), {
    onStart: ({ x, width, top }) => {
      // התיבה משמאל לימין: "HH:MM" — החצי השמאלי שעות, הימני דקות.
      partRef.current = x < width / 2 ? 0 : 1;
      inputRef.current?.blur();
      setDrag({ part: partRef.current, top });
    },
    onEnd: () => {
      setDrag(null);
      hideWheelOverlay();
    },
  });

  useEffect(() => {
    if (!drag) return;
    const [h, m] = hh.length === 2 && mm.length === 2 ? [Number(hh), Number(mm)] : [0, 0];
    showWheelOverlay({
      title: label,
      bottom: drag.top,
      separator: ':',
      columns: [
        { values: [pad2((h + 23) % 24), pad2(h), pad2((h + 1) % 24)], active: drag.part === 0 },
        { values: [pad2((m + 59) % 60), pad2(m), pad2((m + 1) % 60)], active: drag.part === 1 },
      ],
    });
  }, [drag, hh, mm, label]);

  useImperativeHandle(
    ref,
    () => ({
      focus: () => {
        clearForTyping();
        programmatic.current = true;
        inputRef.current?.focus();
      },
      feed: (d: string) => {
        clearForTyping();
        programmatic.current = true;
        inputRef.current?.focus();
        feed(d);
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  return (
    <View ref={wheel.ref} {...wheel.panHandlers}>
      <TextInput
        ref={inputRef}
        value={display(hh, mm)}
        onChangeText={onText}
        onFocus={() => {
          hideWheelOverlay();
          if (programmatic.current) {
            programmatic.current = false;
            return;
          }
          clearForTyping();
        }}
        onBlur={restoreIfEmpty}
        placeholder={saved || placeholder}
        placeholderTextColor={colors.textMuted}
        accessibilityLabel={label}
        keyboardType="number-pad"
        inputMode="numeric"
        returnKeyType="next"
        onSubmitEditing={() => onComplete?.()}
        style={[styles.input, drag && styles.dragging, invalid && styles.invalid]}
      />
    </View>
  );
});

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    input: {
      width: '100%',
      minHeight: 52,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      fontSize: 22,
      fontWeight: '700',
      color: colors.text,
      textAlign: 'center',
      fontVariant: ['tabular-nums'],
      // "09:30" תמיד משמאל לימין.
      writingDirection: 'ltr',
    },
    dragging: {
      borderColor: colors.brand,
      borderWidth: 2,
    },
    invalid: {
      borderColor: colors.danger,
    },
  });
