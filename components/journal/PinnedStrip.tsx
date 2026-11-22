import { View } from 'react-native';
import type { Journal } from './useJournal';
import { CalendarActions } from './CalendarActions';
import { JournalCalendar } from './JournalCalendar';
import { JournalWeekStrip } from './JournalWeekStrip';
import { JournalControls } from './JournalControls';

/**
 * השכבה המוצמדת בראש המסך בגלילה: שורת הבקרה (תכנון | דיווחים, סינון),
 * ומתחתיה — כשהתאריכון נגלל — התאריכון הנעוץ או פס השבוע. הגובה הכולל נמדד,
 * כדי שהיום שגוללים אליו לא יוסתר מתחת לשכבה.
 */
export function PinnedStrip({ w }: { w: Journal }) {
  const { styles, pinned, calPin, setStripHeight, setPinCalHeight, setCtrlBarHeight, showCalendar } = w;
  const withCal = showCalendar && pinned;
  return (
    <View
      style={[styles.pinnedStrip, !withCal || calPin ? styles.pinnedEdge : null]}
      onLayout={(e) => {
        if (!withCal) return;
        const h = e.nativeEvent.layout.height;
        if (calPin) setPinCalHeight(h);
        else setStripHeight(h);
      }}
    >
      <View style={styles.pinnedControls} onLayout={(e) => setCtrlBarHeight(e.nativeEvent.layout.height)}>
        <JournalControls w={w} />
      </View>
      {withCal && calPin ? (
        <View style={styles.pinnedCal}>
          <JournalCalendar w={w} />
          <CalendarActions w={w} />
        </View>
      ) : withCal ? (
        <JournalWeekStrip w={w} />
      ) : null}
    </View>
  );
}
