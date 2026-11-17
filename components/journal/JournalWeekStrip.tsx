import { SelectField } from '../SelectField';
import { WeekStrip } from '../WeekStrip';
import { todayISO } from '../../lib/time';
import type { Journal } from './useJournal';

/** פס השבוע — במקום התאריכון בגלילה, או נעוץ. */
export function JournalWeekStrip({ w }: { w: Journal }) {
  const { wpFilter, setWpFilter, range, setRange, pinned, calMode, setCalMode, scrollRef, weekStart, counts, filteredStatus, requestScroll, changeWeek, goToday, wpOptions, shownRange, dayPress } = w;
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
          extra={
            <SelectField<string | null>
              compact
              title="סינון לפי מקום עבודה"
              value={wpFilter}
              active={wpFilter != null}
              onChange={setWpFilter}
              options={wpOptions}
            />
          }
        />
  );
  return weekStrip;
}
