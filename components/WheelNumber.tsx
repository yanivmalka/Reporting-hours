/**
 * שדה מספר שלם עם גלגלת: הקלדה רגילה, וגם גרירה אנכית (או גלגלת עכבר ב־web)
 * שמשנה בצעד של 1, בתחום [min, max]. בזמן הגרירה מוצגת שכבת גלגלת כהה
 * מעל התיבה (`WheelOverlay`) עם `label` ו־`unit`. משמש לדקות ההפסקה באשף.
 */
import { useEffect, useState } from 'react';
import { View } from 'react-native';
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
        hideWheelOverlay();
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
        onFocus={hideWheelOverlay}
        placeholder={placeholder}
        numeric
      />
    </View>
  );
}
