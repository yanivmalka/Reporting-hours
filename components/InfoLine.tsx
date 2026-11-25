/**
 * שורת מידע מכמה חלקים ("יום אחרון לדיווח … · צפי תשלום … · שוטף + 15").
 * כשאין מקום — השבירה היא **בין החלקים**, כך שכל חלק מתחיל בשורה משלו ולא נשאר
 * קטע שאינו מובן בלי תחילתו בשורה הקודמת. חלק ארוך מרוחב השורה נשבר בתוכו.
 */
import { StyleSheet, View, type StyleProp, type TextStyle } from 'react-native';
import { Text } from './Text';
import { useStyles, type ColorScheme, type StyleLayout } from '../theme/useStyles';

export function InfoLine({ parts, style }: { parts: readonly string[]; style?: StyleProp<TextStyle> }) {
  const styles = useStyles(makeStyles);
  const list = parts.filter(Boolean);
  if (list.length <= 1) return <Text style={[styles.part, style]}>{list[0] ?? ''}</Text>;
  return (
    <View style={styles.row}>
      {list.map((p, i) => (
        <Text key={`${i}-${p}`} style={[styles.part, style]}>
          {i < list.length - 1 ? `${p} ·` : p}
        </Text>
      ))}
    </View>
  );
}

const makeStyles = (_c: ColorScheme, layout: StyleLayout) =>
  StyleSheet.create({
    row: { flexDirection: layout.rowStart, flexWrap: 'wrap', columnGap: 4 },
    part: { flexShrink: 1, textAlign: layout.textStart },
  });
