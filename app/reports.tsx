import { ActivityIndicator, View } from 'react-native';
import { SelectField } from '../components/SelectField';
import { Button } from '../components/Button';
import { PlanList } from '../components/PlanList';
import { SegmentedControl } from '../components/SegmentedControl';
import { Screen } from '../components/Screen';
import { journalView, useJournal, type Journal } from '../components/journal/useJournal';
import { JournalCalendar } from '../components/journal/JournalCalendar';
import { CalendarActions } from '../components/journal/CalendarActions';
import { JournalWeekStrip } from '../components/journal/JournalWeekStrip';
import { PinnedStrip } from '../components/journal/PinnedStrip';
import { ReportsTab } from '../components/journal/ReportsTab';

/**
 * "יומן": תכנון ודיווחים בדף אחד, עם בורר "תכנון · דיווחים". התאריכון, השורה
 * המוצמדת וסינון מקום העבודה משותפים. ?tab=reports פותח על "דיווחים"
 * (ברירת המחדל — "תכנון").
 */
export default function ReportsScreen() {
  const core = useJournal();
  const { reports, styles, colors } = core;

  if (reports === null) {
    return (
      <Screen scroll={false}>
        <View style={styles.center}>
          <ActivityIndicator color={colors.brand} />
        </View>
      </Screen>
    );
  }

  const w: Journal = { ...core, ...journalView({ ...core, reports }) };
  const { router, basis, workplaces, params, tab, setTab, courses, setReloadTick, wpFilter, setWpFilter, periodMode, calTop, setCalTop, calHeight, setCalHeight, pinned, setPinned, calMode, calPin, setScrollDay, weekStripHeight, scrollRef, listTop, followScroll, onDayLayout, wpOptions, planFrom, planTo, shownRange, showCalendar } = w;

  return (
    <Screen
      overlay={showCalendar && pinned ? <PinnedStrip w={w} /> : undefined}
      scrollRef={scrollRef}
      onScroll={(e) => {
        const y = e.nativeEvent.contentOffset.y;
        // הפס המוצמד מחליף את התאריכון החודשי רק כשהתאריכון כמעט כולו נגלל
        // מתחתיו — כך לא מוצגים שניהם יחד. תאריכון נעוץ — מוצמד כמו שהוא
        // מהרגע שראשו מגיע לראש המסך.
        const next =
          calTop != null && calHeight > 0 && (calMode !== 'auto' ? y > calTop : y > calTop + calHeight - weekStripHeight);
        if (next !== pinned) {
          setPinned(next);
          if (!next) setScrollDay(null);
        }
        if (next) followScroll(y);
      }}
    >
      <SegmentedControl<'plan' | 'reports'>
        options={[
          { value: 'plan', label: 'תכנון' },
          { value: 'reports', label: 'דיווחים' },
        ]}
        value={tab}
        onChange={setTab}
      />
      <View style={styles.filters}>
        <SelectField<string | null>
          label="מקום עבודה:"
          title="סינון לפי מקום עבודה"
          value={wpFilter}
          active={wpFilter != null}
          onChange={setWpFilter}
          options={wpOptions}
        />
      </View>

      {periodMode ? null : (
        <>
          <View
            onLayout={(e) => {
              setCalTop(e.nativeEvent.layout.y);
              setCalHeight(e.nativeEvent.layout.height);
            }}
            style={pinned ? styles.calHidden : undefined}
          >
          {calMode === 'week' ? <JournalWeekStrip w={w} /> : <JournalCalendar w={w} />}
          </View>
          <View style={pinned && calPin ? styles.calHidden : undefined}><CalendarActions w={w} /></View>
        </>
      )}

      {tab === 'plan' ? (
        <View onLayout={(e) => (listTop.current = e.nativeEvent.layout.y)}>
        <PlanList
          onDayLayout={onDayLayout}
          courses={courses}
          workplaces={workplaces}
          reports={reports}
          from={planFrom}
          to={planTo}
          wpFilter={wpFilter}
          basis={basis}
          onChanged={() => setReloadTick((n) => n + 1)}
        />
        </View>
      ) : (
        <>
      <ReportsTab w={w} />
        </>
      )}

      <View style={styles.action}>
        <Button
          label="דיווח יום עבודה"
          onPress={() =>
            // מסונן למקום עבודה / ליום אחד — האשף נפתח עם אותו מקום ותאריך.
            router.push({
              pathname: '/report',
              params: {
                wp: wpFilter ?? '',
                date: shownRange && shownRange.from === shownRange.to ? shownRange.from : '',
              },
            })
          }
        />
      </View>
    </Screen>
  );
}
