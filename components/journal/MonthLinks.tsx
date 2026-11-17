import { View } from 'react-native';
import { Text } from '../Text';
import { Pressable } from '../Pressable';
import { monthName } from '../../lib/dashboard';
import type { Journal } from './useJournal';

/**
 * קישורי הרחבה של הרשימה הרציפה ביומן. בתכנון (מהישן לחדש): בראש — החודש הקודם,
 * בסוף — הבא. בדיווחים (מהחדש לישן): בראש — הבא, בסוף — הקודם. הסוף נטען גם לבד
 * כשגוללים אליו; הקישור שם לרשימה קצרה מכדי לגלול.
 */
export function MonthLink({ w, at }: { w: Journal; at: 'top' | 'bottom' }) {
  const { styles, tab, continuous, canEarlier, canLater, prevMonth, nextMonth, extendTop, extendBottom } = w;
  if (!continuous) return null;
  const earlier = (tab === 'plan') === (at === 'top');
  if (earlier ? !canEarlier : !canLater) return null;
  const month = earlier ? prevMonth : nextMonth;
  return (
    <View style={styles.monthLinkRow}>
      <Pressable onPress={at === 'top' ? extendTop : extendBottom} accessibilityRole="link" hitSlop={8}>
        <Text style={styles.monthLink}>
          {earlier ? 'הצגת החודש הקודם' : 'הצגת החודש הבא'} — {monthName(month)}
        </Text>
      </Pressable>
    </View>
  );
}
