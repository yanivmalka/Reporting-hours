/**
 * שדה מספר שלם עם גלגלת: הקלדה רגילה, וגם גרירה אנכית (או גלגלת עכבר ב־web)
 * שמשנה בצעד של 1, בתחום [min, max]. משמש לדקות ההפסקה באשף הדיווח.
 */
import { View } from 'react-native';
import { TextField } from './TextField';
import { hideWheelBubbles, useWheel } from './useWheel';
import { WheelBubble } from './WheelBubble';
import { Text } from './Text';
import { useTheme } from '../theme/ThemeContext';

export function WheelNumber({
  value,
  onChange,
  placeholder,
  min = 0,
  max = 999,
  unit = 'דק׳',
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  min?: number;
  max?: number;
  /** יחידה שמוצגת בבועה מעל האצבע */
  unit?: string;
}) {
  const { colors } = useTheme();
  const wheel = useWheel((d) => {
    const n = Math.min(max, Math.max(min, (Number(value) || 0) + d));
    onChange(String(n));
  });
  return (
    <View ref={wheel.ref} {...wheel.panHandlers} style={wheel.drag ? { zIndex: 50, elevation: 8 } : undefined}>
      <TextField
        value={value}
        onChangeText={(t) => onChange(t.replace(/\D/g, ''))}
        onFocus={hideWheelBubbles}
        placeholder={placeholder}
        numeric
      />
      {wheel.drag ? (
        <WheelBubble x={wheel.drag.x} y={wheel.drag.y}>
          <Text style={{ fontSize: 28, fontWeight: '800', color: colors.brand }}>
            {value || '0'} <Text style={{ fontSize: 16, color: colors.textMuted }}>{unit}</Text>
          </Text>
        </WheelBubble>
      ) : null}
    </View>
  );
}
