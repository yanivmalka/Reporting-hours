import { View } from 'react-native';
import { Icon } from '../Icon';
import { Text } from '../Text';
import { Pressable } from '../Pressable';
import { todayISO } from '../../lib/time';
import type { Journal } from './useJournal';

/** השורה מתחת לתאריכון: בחירת טווח, "היום" ונעיצה. */
export function CalendarActions({ w }: { w: Journal }) {
  const { styles, colors, range, setRange, rangeMode, setRangeMode, setFocusDay, calPin, toggleCalPin, requestScroll, goToday, today } = w;
  const calActions = (
    <View style={styles.calActions}>
      <Pressable
        onPress={() => {
          setRangeMode((on) => !on);
          setRange(null);
          setFocusDay(null);
        }}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: rangeMode }}
        hitSlop={6}
        style={styles.checkRow}
      >
        <Icon
          name={rangeMode ? 'checkbox-marked' : 'checkbox-blank-outline'}
          size={22}
          color={rangeMode ? colors.brand : colors.textMuted}
        />
        <Text style={styles.checkText}>בחירת טווח</Text>
      </Pressable>
      <View style={{ flex: 1 }} />
      {range ? (
        <Pressable onPress={() => setRange(null)} hitSlop={8}>
          <Text style={styles.clear}>ניקוי — כל החודש</Text>
        </Pressable>
      ) : null}
      <Pressable
        onPress={() => {
          goToday();
          requestScroll('day', todayISO());
        }}
        accessibilityRole="link"
        hitSlop={8}
        style={styles.todayLink}
      >
        <Icon name="calendar-today" size={16} color={colors.brandDark} />
        <Text style={styles.todayText}>היום</Text>
      </Pressable>
      <Pressable
        onPress={toggleCalPin}
        accessibilityRole="switch"
        accessibilityState={{ checked: calPin }}
        accessibilityLabel={calPin ? 'ביטול נעיצת התאריכון' : 'נעיצת התאריכון המלא'}
        hitSlop={8}
        style={[styles.pinBtn, calPin && styles.pinBtnOn]}
      >
        <Icon name={calPin ? 'pin' : 'pin-outline'} size={18} color={calPin ? colors.textOnBrand : colors.textMuted} />
        <Text style={[styles.pinText, calPin && styles.pinTextOn]}>{calPin ? 'נעוץ' : 'נעץ'}</Text>
      </Pressable>
    </View>
  );
  return calActions;
}
