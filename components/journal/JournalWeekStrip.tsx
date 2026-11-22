import { WeekStrip } from '../WeekStrip';
import { todayISO } from '../../lib/time';
import type { Journal } from './useJournal';

/** פס השבוע — במקום התאריכון בגלילה, או נעוץ. הסינון — בשורת הבקרה (JournalControls). */
export function JournalWeekStrip({ w }: { w: Journal }) {
  const { range, setRange, pinned, calMode, setCalMode, scrollRef, weekStart, counts, filteredStatus, requestScroll, changeWeek, goToday, shownRange, dayPress } = w;
  const weekStrip = (
        <WeekStrip
          weekStart={weekStart}
          onWeekChange={changeWeek}
          onToday={() => {
            goToday();
            requestScroll('day', todayISO());
          }}
          range={shownRange}
          onRangeChange={setRange}
          onDayPress={dayPress}
          counts={counts}
          onTitlePress={() => {
            if (calMode === 'week') setCalMode('auto');
            scrollRef.current?.scrollTo({ y: 0, animated: true });
          }}
          onExpand={() => {
            if (calMode === 'week') setCalMode('auto');
            scrollRef.current?.scrollTo({ y: 0, animated: true });
          }}
          pinned={calMode === 'week'}
          onPin={() => setCalMode(calMode === 'week' ? 'auto' : 'week')}
          statusOf={filteredStatus}
        />
  );
  return weekStrip;
}
