import { View } from 'react-native';
import type { Journal } from './useJournal';
import { CalendarActions } from './CalendarActions';
import { JournalCalendar } from './JournalCalendar';
import { JournalWeekStrip } from './JournalWeekStrip';

/** השכבה המוצמדת בראש המסך בגלילה: התאריכון הנעוץ או פס השבוע. */
export function PinnedStrip({ w }: { w: Journal }) {
  const { styles, pinned, calPin, setStripHeight, setPinCalHeight, showCalendar } = w;
  const strip =
    showCalendar && pinned && calPin ? (
      <View style={styles.pinnedCal} onLayout={(e) => setPinCalHeight(e.nativeEvent.layout.height)}>
        <JournalCalendar w={w} />
        <CalendarActions w={w} />
      </View>
    ) : showCalendar && pinned ? (
      <View style={styles.pinnedStrip} onLayout={(e) => setStripHeight(e.nativeEvent.layout.height)}>
        <JournalWeekStrip w={w} />
      </View>
    ) : null;
  return strip;
}
