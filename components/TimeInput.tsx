/**
 * שדה שעה אחד, "HH:MM" כטקסט.
 *
 * - עריכה חופשית (פענוח ב־`lib/timeText.ts`): בכניסה לשדה כל הטקסט מסומן — הקלדה
 *   מחליפה אותו, ונגיעה במקום מסוים מאפשרת למחוק ולתקן ספרה. מפריד ":" "." או ",".
 *   ביציאה השעה משלימה ומסתדרת ("9" → 09:00, "930" → 09:30); טקסט שלא ניתן לפענח
 *   מסומן כשגוי. הערך נשלח כבר בזמן העריכה, כשהשעה שלמה.
 * - הקלדה רציפה של ספרות: הנקודתיים נוספות לבד ("930" → 09:30); ספרת שעה ראשונה
 *   3–9 משלימה "0", וכך גם ספרת דקות ראשונה 6–9; שעה מעל 23 נקבעת ל־23.
 *   השעה הושלמה → `onComplete` (מעבר לשדה הבא); ספרות עודפות → `onOverflow`.
 * - גלגלת: גרירה אנכית על התיבה (וגלגלת עכבר ב־web). בחצי השמאלי — שעות
 *   (צעד של שעה), בחצי הימני — דקות (צעד של דקה; מעבר 59 / 00 מעדכן את השעה). בקצה היממה הגלגלת נעצרת (23:59 / 00:00),
 *   בלי לקפוץ לצד השני. בעזיבה השכבה נשארת רגע ונעלמת בדהייה.
 *   בזמן הגרירה מוצגת שכבת גלגלת כהה מעל התיבה (`WheelOverlay`), עם `label`.
 * - הערך החיצוני הוא "HH:MM" כשהשעה מלאה, אחרת מחרוזת ריקה.
 * - `min` (שעת סיום — שעת ההתחלה): הגלגלת לא יורדת אל `min` ומתחת לו ולא עוברת את חצות,
 *   ושעה מוקלדת שאינה אחרי `min` מסומנת כשגויה.
 */
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { TextInput } from './Text';
import type { TextInput as RNTextInput } from 'react-native';
import { useWheel } from './useWheel';
import { complete, finish, onlyDigits, typed, typedText } from '../lib/timeText';
import { Icon } from './Icon';
import { hideWheelOverlay, showWheelOverlay } from './WheelOverlay';
import { useTheme } from '../theme/ThemeContext';
import { useThemedStyles } from '../theme/useThemedStyles';
import { cardShadow, radius, type AppColors } from '../theme/colors';

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
  /** בכניסה לשדה (למשל גלילה כדי שהמקלדת לא תסתיר אותו) */
  onFocus?: () => void;
  /** השעה חייבת להיות אחרי זו ("HH:MM") — לשעת סיום */
  min?: string;
};

/** פיקסלים של גרירה לשעה / לדקה */
const HOUR_STEP_PX = 40;
const MINUTE_STEP_PX = 18;

const pad2 = (n: number) => String(n).padStart(2, '0');

/** "HH:MM" → דקות מתחילת היום; אחרת null */
function toMinutes(v: string): number | null {
  const r = /^(\d{2}):(\d{2})$/.exec(v);
  return r ? Number(r[1]) * 60 + Number(r[2]) : null;
}

/** ערך "HH:MM" (או ריק) → הטקסט בתיבה */
const fromText = (value: string) => (/^\d{1,2}:\d{2}$/.test(value) ? value.padStart(5, '0') : '');

function fromValue(value: string): [string, string] {
  const r = /^(\d{1,2}):(\d{2})$/.exec(value);
  return r ? [r[1].padStart(2, '0'), r[2]] : ['', ''];
}

export const TimeInput = forwardRef<TimeInputHandle, TimeInputProps>(function TimeInput(
  { value, onChange, label = 'שעה', onComplete, onOverflow, invalid, placeholder = '00:00', onFocus, min },
  ref,
) {
  const styles = useThemedStyles(makeStyles);
  const { colors } = useTheme();
  const inputRef = useRef<RNTextInput>(null);
  /** הטקסט בתיבה כפי שהוא — אפשר לערוך בו כל ספרה */
  const [text, setTextState] = useState(() => fromText(value));
  // העדכני מיד (לא מחכים לרינדור) — להקלדה מהירה ולגלגלת.
  const textRef = useRef(text);
  /** כניסה לשדה: כל הטקסט מסומן (הקלדה מחליפה אותו); אחרי השינוי הראשון — חופשי */
  const [selection, setSelection] = useState<{ start: number; end: number } | undefined>(undefined);
  /** טקסט שלא ניתן לפענח ביציאה מהשדה — מסומן כשגוי */
  const [bad, setBad] = useState(false);

  function setText(t: string) {
    textRef.current = t;
    setTextState(t);
  }

  // סנכרון רק כשהערך הוחלף מבחוץ (ולא כהד של מה שהשדה עצמו שלח).
  const lastEmitted = useRef(value);
  useEffect(() => {
    if (value !== lastEmitted.current) {
      lastEmitted.current = value;
      setText(fromText(value));
      setBad(false);
    }
  }, [value]);

  function send(next: string) {
    if (next === lastEmitted.current) return;
    lastEmitted.current = next;
    onChange(next);
  }

  /** הטקסט השתנה — שומרים אותו כמו שהוא, ושולחים שעה כשהיא שלמה. */
  function update(t: string) {
    setText(t);
    setBad(false);
    send(complete(t) ?? '');
  }

  /** ספרות שנוספו בסוף (הקלדה רציפה / גלישה מהשדה הקודם): נקודתיים לבד, ומעבר לשדה הבא. */
  function feed(d: string) {
    const before = onlyDigits(textRef.current);
    const wasComplete = complete(textRef.current) != null;
    const [h, m, extra] = typed(before + d);
    update(typedText(h, m));
    if (h.length === 2 && m.length === 2) {
      if (extra && onOverflow) onOverflow(extra);
      else if (!wasComplete) onComplete?.();
    }
  }

  const typedParts = (d: string) => typed(d).slice(0, 2) as [string, string];

  function onText(next: string) {
    setSelection(undefined);
    const prev = textRef.current;
    const prevDigits = onlyDigits(prev);
    // ספרות שנוספו בסוף של הקלדה רציפה ("", "9", "09:", "09:3", "09:30") — נקודתיים לבד.
    const added = next.startsWith(prev) ? next.slice(prev.length) : null;
    if (added && /^\d+$/.test(added) && prev === typedText(...typedParts(prevDigits))) {
      feed(added);
      return;
    }
    // עריכה חופשית: ספרות ומפריד אחד בלבד.
    update(next.replace(/[^\d:.,]/g, '').slice(0, 5));
  }

  /** יציאה מהשדה: משלימים ("9" → 09:00) ומסדרים ל־"HH:MM"; לא ניתן לפענח — שגוי. */
  function onBlur() {
    setSelection(undefined);
    const done = finish(textRef.current);
    if (done == null) {
      setBad(true);
      send('');
      return;
    }
    setText(done);
    send(done);
  }

  const minMinutes = toMinutes(min ?? '');
  const minRef = useRef(minMinutes);
  minRef.current = minMinutes;
  const current = toMinutes(complete(text) ?? '');
  /** שעה מלאה שאינה אחרי `min` */
  const beforeMin = minMinutes != null && current != null && current <= minMinutes;

  // ── גלגלת ──
  /** איזה חלק נגרר, ותחתית שכבת הגלגלת (ראש התיבה בחלון) */
  const [drag, setDrag] = useState<{ part: 0 | 1; top: number } | null>(null);
  const partRef = useRef<0 | 1>(0);

  /** צעד גלגלת: delta דקות מהשעה הנוכחית (ריק = הערך הקודם או 00:00), בטווח היממה. */
  function step(delta: number) {
    const base = fromValue(complete(textRef.current) ?? lastEmitted.current);
    const lo = minRef.current;
    // שדה ריק עם `min` — הגלגלת מתחילה משעת ההתחלה.
    const from = base[0] === '' && lo != null ? lo : Number(base[0] || 0) * 60 + Number(base[1] || 0);
    const raw = from + delta;
    // בלי מעבר חצות: בקצה היממה (או אחרי `min`) הגלגלת נעצרת — לא קופצת ל־00.
    // בגרירת שעות הדקות נשמרות: הקצה הוא 23:MM / 00:MM, לא 23:59.
    const m = from % 60;
    const hi = partRef.current === 0 ? 23 * 60 + m : 1439;
    const floor = lo != null ? lo + 1 : partRef.current === 0 ? m : 0;
    const total = Math.min(hi, Math.max(floor, raw));
    update(`${pad2(Math.floor(total / 60))}:${pad2(total % 60)}`);
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
      hideWheelOverlay({ linger: true });
    },
    // שעות — תנועה גדולה יותר לכל שעה, כדי שלא "יברחו" בגרירה ארוכה.
    stepPx: () => (partRef.current === 0 ? HOUR_STEP_PX : MINUTE_STEP_PX),
  });

  useEffect(() => {
    if (!drag) return;
    const [hh, mm] = fromValue(complete(text) ?? '');
    const [h, m] = hh ? [Number(hh), Number(mm)] : [0, 0];
    showWheelOverlay({
      title: label,
      bottom: drag.top,
      separator: ':',
      columns: [
        { values: [h > 0 ? pad2(h - 1) : '', pad2(h), h < 23 ? pad2(h + 1) : ''], active: drag.part === 0 },
        { values: [pad2((m + 59) % 60), pad2(m), pad2((m + 1) % 60)], active: drag.part === 1 },
      ],
    });
  }, [drag, text, label]);

  useImperativeHandle(
    ref,
    () => ({
      focus: () => inputRef.current?.focus(),
      // ספרות שגלשו מהשדה הקודם מחליפות את מה שהיה כאן.
      feed: (d: string) => {
        setText('');
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
        value={text}
        onChangeText={onText}
        selection={selection}
        onFocus={() => {
          hideWheelOverlay();
          onFocus?.();
          // כל הטקסט מסומן: הקלדה מחליפה אותו, ונגיעה במקום מסוים מאפשרת לתקן ספרה.
          setSelection({ start: 0, end: textRef.current.length });
        }}
        onSelectionChange={(e) => {
          // המשתמש הזיז את הסמן / הסימון — משחררים את הסימון הכפוי.
          const sel = e.nativeEvent.selection;
          if (selection && (sel.start !== selection.start || sel.end !== selection.end)) setSelection(undefined);
        }}
        onBlur={onBlur}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        accessibilityLabel={label}
        keyboardType="number-pad"
        inputMode="numeric"
        returnKeyType="next"
        onSubmitEditing={() => onComplete?.()}
        style={[styles.input, drag && styles.dragging, (invalid || beforeMin || bad) && styles.invalid]}
      />
      {/* סימן גלגלת בשני הצדדים: גרירה למעלה / למטה משנה שעות (שמאל) ודקות (ימין) */}
      <View pointerEvents="none" style={[styles.wheelMark, styles.wheelMarkLeft]}>
        <Icon name="unfold-more-horizontal" size={18} color={colors.textMuted} />
      </View>
      <View pointerEvents="none" style={[styles.wheelMark, styles.wheelMarkRight]}>
        <Icon name="unfold-more-horizontal" size={18} color={colors.textMuted} />
      </View>
    </View>
  );
});

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    input: {
      width: '100%',
      minHeight: 76,
      backgroundColor: colors.surface,
      // בלי מסגרת נראית — כרטיס לבן עם צל, כמו בעיצוב; המסגרת מופיעה בגרירה ובשגיאה.
      borderWidth: 1,
      borderColor: colors.surface,
      borderRadius: 22,
      ...cardShadow,
      fontSize: 38,
      letterSpacing: -1,
      fontWeight: '700',
      color: colors.text,
      textAlign: 'center',
      fontVariant: ['tabular-nums'],
      // "09:30" תמיד משמאל לימין.
      writingDirection: 'ltr',
    },
    wheelMark: { position: 'absolute', top: 0, bottom: 0, justifyContent: 'center', opacity: 0.55 },
    // מיקום פיזי (לא start/end): שעות תמיד משמאל, דקות מימין
    wheelMarkLeft: { left: 8 },
    wheelMarkRight: { right: 8 },
    dragging: {
      borderColor: colors.brand,
      borderWidth: 2,
    },
    invalid: {
      borderColor: colors.danger,
    },
  });
