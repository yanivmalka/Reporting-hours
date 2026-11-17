import { RangeCalendar } from '../RangeCalendar';
import type { Journal } from './useJournal';

/** התאריכון החודשי של היומן, עם נקודות מצב היום. */
export function JournalCalendar({ w }: { w: Journal }) {
  const { calMonth, setCalMonth, range, setRange, setFocusDay, setScrollDay, counts, filteredStatus, shownRange, dayPress } = w;
  const calendar = (
    <RangeCalendar
      month={calMonth}
      onMonthChange={(m) => {
        setCalMonth(m);
        setRange(null);
        setFocusDay(null);
        setScrollDay(null);
      }}
      range={shownRange}
      onRangeChange={setRange}
      onDayPress={dayPress}
      counts={counts}
      statusOf={filteredStatus}
    />
  );
  return calendar;
}
