import { View } from 'react-native';
import { Button } from '../components/Button';
import { PlanList } from '../components/PlanList';
import { Screen } from '../components/Screen';
import { journalView, useJournal, type Journal } from '../components/journal/useJournal';
import { JournalCalendar } from '../components/journal/JournalCalendar';
import { CalendarActions } from '../components/journal/CalendarActions';
import { JournalWeekStrip } from '../components/journal/JournalWeekStrip';
import { PinnedStrip } from '../components/journal/PinnedStrip';
import { JournalControls } from '../components/journal/JournalControls';
import { ReportsTab } from '../components/journal/ReportsTab';
import { LoadingScreen } from '../components/LoadingScreen';
import { MonthLink } from '../components/journal/MonthLinks';

/**
 * "יומן": תכנון ודיווחים בדף אחד, עם בורר "תכנון · דיווחים". התאריכון, השורה
 * המוצמדת וסינון מקום העבודה משותפים. ?tab=reports פותח על "דיווחים"
 * (ברירת המחדל — "תכנון").
 */
export default function ReportsScreen() {
  const core = useJournal();
  const { reports, styles, colors } = core;

  if (reports === null) {
    return <LoadingScreen />;
  }

  const w: Journal = { ...core, ...journalView({ ...core, reports }) };
  const { router, basis, workplaces, params, tab, courses, setReloadTick, wpFilter, ctrlTop, setCtrlTop, ctrlPinned, setCtrlPinned, ctrlBarHeight, periodMode, calTop, setCalTop, calHeight, setCalHeight, pinned, setPinned, calMode, calPin, setScrollDay, weekStripHeight, scrollRef, listTop, followScroll, maybeExtend, onDayLayout, planFrom, planTo, shownRange, showCalendar, continuous } = w;

  return (
    <Screen
      overlay={ctrlPinned || (showCalendar && pinned) ? <PinnedStrip w={w} /> : undefined}
      scrollRef={scrollRef}
      onScroll={(e) => {
        const y = e.nativeEvent.contentOffset.y;
        // שורת הבקרה מוצמדת מהרגע שהיא מגיעה לראש המסך.
        const ctrl = ctrlTop != null && y > ctrlTop;
        if (ctrl !== ctrlPinned) setCtrlPinned(ctrl);
        // הפס המוצמד מחליף את התאריכון החודשי רק כשהתאריכון כמעט כולו נגלל
        // מתחתיו — כך לא מוצגים שניהם יחד. תאריכון נעוץ — מוצמד כמו שהוא
        // מהרגע שראשו מגיע אל מתחת לשורת הבקרה המוצמדת.
        const next =
          calTop != null &&
          calHeight > 0 &&
          (calMode !== 'auto' ? y > calTop - ctrlBarHeight : y > calTop + calHeight - weekStripHeight);
        if (next !== pinned) {
          setPinned(next);
          if (!next) setScrollDay(null);
        }
        if (next) followScroll(y);
        maybeExtend(e);
      }}
    >
      <View
        onLayout={(e) => setCtrlTop(e.nativeEvent.layout.y)}
        style={ctrlPinned ? styles.calHidden : undefined}
      >
        <JournalControls w={w} />
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
          monthDividers={continuous}
          before={<MonthLink w={w} at="top" />}
          collapseBefore={w.collapseBefore}
          onShowEarlier={() => w.setEarlierShown(true)}
          expandedBefore={w.expandedBefore}
          onHideEarlier={() => w.setEarlierShown(false)}
          after={<MonthLink w={w} at="bottom" />}
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
