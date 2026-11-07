/**
 * שדה מספר שלם עם גלגלת: הקלדה רגילה, וגם גרירה אנכית (או גלגלת עכבר ב־web)
 * שמשנה בצעד של 1, בתחום [min, max]. משמש לדקות ההפסקה באשף הדיווח.
 */
import { View } from 'react-native';
import { TextField } from './TextField';
import { useWheel } from './useWheel';

export function WheelNumber({
  value,
  onChange,
  placeholder,
  min = 0,
  max = 999,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  min?: number;
  max?: number;
}) {
  const wheel = useWheel((d) => {
    const n = Math.min(max, Math.max(min, (Number(value) || 0) + d));
    onChange(String(n));
  });
  return (
    <View ref={wheel.ref} {...wheel.panHandlers}>
      <TextField
        value={value}
        onChangeText={(t) => onChange(t.replace(/\D/g, ''))}
        placeholder={placeholder}
        numeric
      />
    </View>
  );
}
