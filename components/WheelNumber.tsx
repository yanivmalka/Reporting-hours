/**
 * שדה מספר שלם עם גלגלת: הקלדה רגילה, וגם גרירה אנכית (או גלגלת עכבר ב־web)
 * שמשנה בצעד של 1, בתחום [min, max]. בזמן הגרירה מוצגת שכבת גלגלת כהה
 * מעל התיבה (`WheelOverlay`) עם `label` ו־`unit`. משמש לדקות ההפסקה באשף.
 */
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Icon } from './Icon';
import { useTheme } from '../theme/ThemeContext';
import { TextField } from './TextField';
import { useWheel } from './useWheel';
import { hideWheelOverlay, showWheelOverlay } from './WheelOverlay';

export function WheelNumber({
  value,
  onChange,
  placeholder,
  label,
  min = 0,
  max = 999,
  unit = 'דק׳',
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** כותרת שכבת הגלגלת (ברירת מחדל: placeholder) */
  label?: string;
  min?: number;
  max?: number;
  /** יחידה שמוצגת בשכבת הגלגלת */
  unit?: string;
}) {
  const { colors } = useTheme();
  const [top, setTop] = useState<number | null>(null);
  const wheel = useWheel(
    (d) => {
      const n = Math.min(max, Math.max(min, (Number(value) || 0) + d));
      onChange(String(n));
    },
    {
      onStart: (s) => setTop(s.top),
      onEnd: () => {
        setTop(null);
        hideWheelOverlay({ linger: true });
      },
    },
  );

  useEffect(() => {
    if (top == null) return;
    const n = Number(value) || 0;
    showWheelOverlay({
      title: label ?? placeholder ?? '',
      bottom: top,
      unit,
      columns: [{ values: [n > min ? String(n - 1) : '', String(n), n < max ? String(n + 1) : ''] }],
    });
  }, [top, value, label, placeholder, unit, min, max]);

  return (
    <View ref={wheel.ref} {...wheel.panHandlers}>
      <TextField
        value={value}
        onChangeText={(t) => onChange(t.replace(/\D/g, ''))}
        onFocus={() => hideWheelOverlay()}
        placeholder={placeholder}
        numeric
      />
      {/* סימן גלגלת: גרירה למעלה / למטה משנה את הערך */}
      <View pointerEvents="none" style={styles.mark}>
        <Icon name="unfold-more-horizontal" size={18} color={colors.textMuted} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // בסוף השורה (בעברית — שמאל), לא על הטקסט המיושר לימין. `end` ולא `left`: באנדרואיד ב־RTL
  // left מוחלף ל־right, והסימן ישב על המספר.
  mark: { position: 'absolute', top: 0, bottom: 0, end: 10, justifyContent: 'center', opacity: 0.55 },
});
