import { Fragment } from 'react';
import { View } from 'react-native';
import { Text } from '../Text';
import { Pressable } from '../Pressable';
import { ACADEMIC_HOUR_MINUTES } from '../../lib/academic';
import { ReportCard } from '../ReportCard';
import { NearDayChip, SessionRow, openSession } from '../PlanList';
import { nearDay } from '../../lib/nearDays';
import { formatShekels } from '../../lib/travel';
import { workplaceColor } from '../../theme/workplaceColors';
import { MonthDivider } from '../MonthDivider';
import { MonthLink } from './MonthLinks';
import type { Journal } from './useJournal';
import { GroupedSummary } from './GroupedSummary';
import { DaySummary } from '../DaySummary';
import { dayTotalsByWorkplace, reportEntry } from '../../lib/daySummary';

/** לשונית "דיווחים": סיכום התקופה ורשימת הדיווחים, כולל מפגשים של היום ושעברו שלא דווחו. */
export function ReportsTab({ w }: { w: Journal }) {
  const { router, styles, colors, basis, reports, params, setWpFilter, setRange, setPeriodMode, listTop, filtered, onDayLayout, selectedDay, workplaceOf, nameOf, payOf, totals, travelOf, lockOf, items, missingCount, pendingCount, isFiltered, timeLabel, continuous, today } = w;
  return (
    <>
    <View style={styles.summary}>
      <Text style={styles.summaryLine}>{timeLabel}</Text>
      <Text style={styles.summaryTitle}>
        {filtered.length} דיווחים · {totals.days} ימי עבודה
        {missingCount ? ` · ${missingCount} חסרים` : ''}
        {pendingCount ? ` · ${pendingCount} ממתינים` : ''}
      </Text>
      <Text style={styles.summaryLine}>
        {Math.round((totals.netMinutes / ACADEMIC_HOUR_MINUTES) * 10) / 10} שע׳ אקדמיות · שכר{' '}
        {formatShekels(Math.round(totals.pay))}
        {totals.carriedMinutes > 0 ? ` · ${totals.carriedMinutes} דק׳ הועברו למצטברות` : ''}
        {totals.travel > 0 ? ` · נסיעות ${formatShekels(totals.travel)}` : ''}
      </Text>
      {isFiltered ? (
        <Pressable
          onPress={() => {
            setWpFilter(null);
            setRange(null);
            setPeriodMode(null);
          }}
        >
          <Text style={styles.clear}>ניקוי סינון</Text>
        </Pressable>
      ) : null}
    </View>

    <GroupedSummary w={w} />

    <MonthLink w={w} at="top" />
    {items.length === 0 && reports.length === 0 ? (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>עדיין לא נשמרו דיווחים.</Text>
      </View>
    ) : items.length === 0 ? (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>אין דיווחים שמתאימים לסינון.</Text>
      </View>
    ) : (
      <View style={styles.list} onLayout={(e) => (listTop.current = e.nativeEvent.layout.y)}>
        {items.map((item, i) => {
          const date = item.kind === 'session' ? item.row.date : item.report.date;
          const prev = i > 0 ? items[i - 1] : null;
          const prevDate = prev ? (prev.kind === 'session' ? prev.row.date : prev.report.date) : null;
          const divider =
            continuous && (prevDate == null || prevDate.slice(0, 7) !== date.slice(0, 7)) ? (
              <MonthDivider month={date.slice(0, 7)} />
            ) : null;
          // שלשום עד מחרתיים: תגית לפני הפריט הראשון של היום; היום — גם מסגרת.
          const isToday = date === today;
          const frame = [styles.itemFrame, isToday && styles.todayFrame, date === selectedDay && styles.selectedFrame];
          const todayHead =
            prevDate !== date && nearDay(date, today) ? (
              <View style={styles.todayHead}>
                <NearDayChip date={date} today={today} />
              </View>
            ) : null;
          return (
          <Fragment key={item.kind === 'session' ? `s:${item.row.course.id}@${item.row.date}` : item.report.id}>
          {divider}
          {todayHead}
          {item.kind === 'session' ? (
            <View
              key={`s:${item.row.course.id}@${item.row.date}`}
              style={[styles.dueCard, ...frame]}
              onLayout={(e) => onDayLayout(item.row.date, e.nativeEvent.layout.y, e.nativeEvent.layout.height, `s:${item.row.course.id}@${item.row.date}`)}
            >
              <SessionRow row={item.row} showDate onPress={() => openSession(router, item.row)} />
            </View>
          ) : (
            <View
              key={item.report.id}
              style={frame}
              onLayout={(e) =>
                onDayLayout(item.report.date, e.nativeEvent.layout.y, e.nativeEvent.layout.height, item.report.id)
              }
            >
              <ReportCard
                report={item.report}
                workplaceName={nameOf(item.report.workplaceId)}
                color={
                  workplaceOf(item.report.workplaceId)
                    ? workplaceColor(colors, workplaceOf(item.report.workplaceId))
                    : undefined
                }
                pay={payOf(item.report)}
                travel={travelOf(item.report)}
                locked={lockOf(item.report) != null}
                highlight={date === selectedDay}
                onPress={() => router.push({ pathname: '/report-view', params: { id: item.report.id } })}
              />
            </View>
          )}
          {(() => {
            // אחרי הפריט האחרון של היום: סיכום לפי מקום עבודה, כשיש ביום יותר מדיווח אחד.
            const next = items[i + 1];
            const nextDate = next ? (next.kind === 'session' ? next.row.date : next.report.date) : null;
            if (nextDate === date) return null;
            const dayReports = [];
            for (let k = i; k >= 0; k--) {
              const it = items[k];
              const d = it.kind === 'session' ? it.row.date : it.report.date;
              if (d !== date) break;
              if (it.kind === 'report') dayReports.push(it.report);
            }
            if (dayReports.length < 2) return null;
            const totals = dayTotalsByWorkplace(
              dayReports.reverse().map(reportEntry),
            );
            return (
              <View style={styles.daySummary}>
                <DaySummary totals={totals} workplaceOf={workplaceOf} basis={basis} separated={false} />
              </View>
            );
          })()}
          </Fragment>
          );
        })}
      </View>
    )}
    <MonthLink w={w} at="bottom" />

    </>
  );
}
