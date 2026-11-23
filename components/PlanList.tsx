/**
 * "תכנון" בדף "יומן": מפגשי הקורסים לפי יום בטווח שנבחר, עם סטטוס — מתוכנן
 * (עתידי, אפור) / ממתין לדיווח (היום) / חסר (עבר ולא דווח) / דווח / בוטל / הועבר — וסיכום
 * פוטנציאל וצפי. מפגש שנמחק מהתכנון לא מוצג.
 * לחיצה: מפגש שדווח → תצוגת הדיווח; שלא דווח → דיווח ישיר; שבוטל → דיאלוג המפגש.
 */
import { Fragment, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Text } from './Text';
import { Pressable } from './Pressable';
import { Icon } from './Icon';
import { EnterChevron } from './Chevrons';
import { useSessionCancel } from './SessionCancelDialog';
import { allCourseSessions, courseReport, sessionTimes, timeRange, type Course } from '../lib/courses';
import { dayTotalsByWorkplace, rangeNetMinutes } from '../lib/daySummary';
import { netMinutes } from '../lib/reports';
import { DaySummary } from './DaySummary';
import { expectedFor, plannedFor } from '../lib/forecast';
import type { PayBasis } from '../lib/payBasis';
import type { WorkReport } from '../lib/reports';
import type { Cancellation } from '../lib/sessions';
import { money } from '../lib/travel';
import { activeWorkplaces, type Workplace } from '../lib/workplaces';
import { useTheme } from '../theme/ThemeContext';
import { useThemedStyles } from '../theme/useThemedStyles';
import { cardShadow, radius, spacing, type AppColors } from '../theme/colors';
import { TEXT_RIGHT } from '../theme/align';
import { mix } from '../theme/shades';
import { workplaceColor } from '../theme/workplaceColors';
import { beforeTracking, getTrackingStart } from '../lib/trackingStart';
import { MonthDivider } from './MonthDivider';
import { useSessionNotes } from './useSessionNotes';
import { FLAG_ICON, noteFor } from '../lib/sessionNotes';
import { parseTime, todayISO } from '../lib/time';
import { nearDay } from '../lib/nearDays';

/**
 * תגית היום ביחס להיום — שלשום · אתמול · היום · מחר · מחרתיים (כמו בלו״ז הבית).
 * "היום" בצבע היום הנבחר בתאריכון ובלו״ז הבית (`brandDark`); השאר — בגוון בהיר.
 */
export function NearDayChip({ date, today }: { date: string; today: string }) {
  const styles = useThemedStyles(makeStyles);
  const near = nearDay(date, today);
  if (!near) return null;
  const isToday = near.key === 'today';
  return (
    <View style={[styles.nearChip, isToday && styles.todayChip]}>
      <Text style={[styles.nearChipText, isToday && styles.todayChipText]}>{near.label}</Text>
    </View>
  );
}

/** planned — עתידי; pending — היום ולא דווח; now — מתקיים כעת; missing — עבר ולא דווח */
export type SessionStatus = 'planned' | 'pending' | 'now' | 'missing' | 'reported' | 'canceled' | 'moved' | 'untracked';
type Status = SessionStatus;

export type SessionRowData = {
  course: Course;
  workplace: Workplace;
  date: string;
  status: Status;
  reportId?: string;
  /** השעות שדווחו בפועל ("HH:MM") — כשהמפגש דווח */
  reported?: { start: string; end: string };
  cancel: Cancellation | null;
  movedFrom?: string;
};

const WEEKDAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
const dayTitle = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return `יום ${WEEKDAYS[new Date(y, m - 1, d).getDay()]} · ${d}.${m}`;
};
const short = (iso: string) => {
  const [, m, d] = iso.split('-').map(Number);
  return `${d}.${m}`;
};

export function PlanList({
  courses,
  workplaces,
  reports,
  from,
  to,
  wpFilter,
  basis,
  onChanged,
  onDayLayout,
  monthDividers,
  before,
  after,
  collapseBefore,
  onShowEarlier,
  expandedBefore,
  onHideEarlier,
  nearDays,
  selectedDay,
}: {
  courses: readonly Course[];
  workplaces: readonly Workplace[];
  reports: readonly WorkReport[];
  from: string;
  to: string;
  wpFilter: string | null;
  basis: PayBasis;
  onChanged: () => void;
  /** מיקום כרטיס היום בתוך הרשימה (y יחסית לראש הרשימה) — לגלילה ליום */
  onDayLayout?: (date: string, y: number, height: number) => void;
  /** פס מפריד עם שם החודש בתחילת כל חודש (ברשימה רציפה של כמה חודשים) */
  monthDividers?: boolean;
  /** תוכן לפני הימים (מתחת לסיכום) ואחריהם — למשל קישור לחודש הקודם / הבא */
  before?: ReactNode;
  after?: ReactNode;
  /** ימים שלפני התאריך (בחודש הנוכחי — היום) מקופלים, כך שאריח היום בראש הרשימה */
  collapseBefore?: string | null;
  onShowEarlier?: () => void;
  /** הימים שלפני התאריך הורחבו — קישור לקיפול חוזר */
  expandedBefore?: string | null;
  onHideEarlier?: () => void;
  /** ימים שמוצגים תמיד (שלשום עד מחרתיים) — גם בלי מפגשים, עם תגית */
  nearDays?: readonly string[];
  /** היום שמסומן בתאריכון — האריח שלו מודגש (רקע ומסגרת) */
  selectedDay?: string | null;
}) {
  const router = useRouter();
  const styles = useThemedStyles(makeStyles);
  const { colors } = useTheme();
  const sessionDialog = useSessionCancel();
  const active = activeWorkplaces(workplaces).filter((w) => !wpFilter || w.id === wpFilter);
  // מפגשים שלפני תחילת המעקב ולא דווחו — לא מוצגים; רק שורת טקסט לפני הפריט הראשון.
  const allRows = buildSessionRows(courses, active, reports, from, to);
  const rows = allRows.filter((r) => r.status !== 'untracked');
  const hiddenBefore = allRows.length - rows.length;
  const trackingStart = getTrackingStart();
  const reportById = new Map(reports.map((r) => [r.id, r]));
  const wpById = new Map(workplaces.map((w) => [w.id, w]));
  const days = new Map<string, SessionRowData[]>();
  for (const r of rows) days.set(r.date, [...(days.get(r.date) ?? []), r]);
  const today = todayISO();
  // חמשת הימים הקרובים מוצגים גם בלי מפגשים (כשיש ברשימה מפגשים בכלל).
  if (rows.length) for (const d of nearDays ?? []) if (d >= from && d <= to && !days.has(d)) days.set(d, []);
  const allDays = [...days].sort(([a], [b]) => a.localeCompare(b));
  const shownDays = collapseBefore ? allDays.filter(([d]) => d >= collapseBefore) : allDays;
  const collapsedDays = allDays.length - shownDays.length;
  const expandedDays = expandedBefore ? allDays.filter(([d]) => d < expandedBefore).length : 0;

  const period = { start: from, end: to };
  const potential = active.reduce((n, w) => n + plannedFor(w, courses, period, basis), 0);
  const expected = active.reduce((n, w) => n + expectedFor(w, courses, period, basis), 0);
  const counts = {
    reported: rows.filter((r) => r.status === 'reported').length,
    pending: rows.filter((r) => r.status === 'pending' || r.status === 'now' || r.status === 'missing').length,
    planned: rows.filter((r) => r.status === 'planned').length,
    canceled: rows.filter((r) => r.status === 'canceled').length,
  };

  const open = (r: SessionRowData) => {
    if (r.reportId || !(r.status === 'canceled' || r.status === 'moved')) openSession(router, r);
    else
      sessionDialog.open({
        course: r.course,
        date: r.date,
        cancel: r.cancel,
        onDone: onChanged,
        onHeld: () => router.push({ pathname: '/report', params: { course: r.course.id, date: r.date } }),
      });
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.summary}>
        <Text style={styles.summaryTitle}>
          {rows.length} מפגשים · {counts.reported} דווחו · {counts.pending} לדיווח
          {counts.planned ? ` · ${counts.planned} מתוכננים` : ''}
          {counts.canceled ? ` · ${counts.canceled} בוטלו` : ''}
        </Text>
        <Text style={styles.summaryLine}>
          פוטנציאל {money(potential)} · צפי {money(expected)}
        </Text>
      </View>
      {before}
      {hiddenBefore > 0 && trackingStart ? (
        <Text style={styles.untrackedNote}>
          {hiddenBefore === 1 ? 'מפגש אחד' : `${hiddenBefore} מפגשים`} לפני תחילת המעקב ({short(trackingStart)}.
          {trackingStart.slice(0, 4)}) {hiddenBefore === 1 ? 'אינו מוצג' : 'אינם מוצגים'}
        </Text>
      ) : null}
      {rows.length === 0 ? (
        <View style={styles.empty}>
          <Icon name="calendar-blank-outline" size={22} color={colors.textMuted} />
          <Text style={styles.emptyText}>אין מפגשים מתוכננים בתקופה הזו.</Text>
        </View>
      ) : (
        <>
        {collapsedDays > 0 ? (
          <Pressable onPress={onShowEarlier} accessibilityRole="button" hitSlop={8} style={styles.earlier}>
            <Icon name="chevron-up" size={18} color={colors.brand} />
            <Text style={styles.earlierText}>
              {collapsedDays === 1 ? 'יום קודם החודש' : `${collapsedDays} ימים קודמים החודש`} · הצגה
            </Text>
          </Pressable>
        ) : expandedDays > 0 && onHideEarlier ? (
          <Pressable onPress={onHideEarlier} accessibilityRole="button" hitSlop={8} style={styles.earlier}>
            <Icon name="chevron-down" size={18} color={colors.brand} />
            <Text style={styles.earlierText}>
              {expandedDays === 1 ? 'יום קודם החודש' : `${expandedDays} ימים קודמים החודש`} · הסתרה
            </Text>
          </Pressable>
        ) : null}
        {shownDays.map(([date, list], i, all) => (
          <Fragment key={date}>
          {monthDividers && (i === 0 || all[i - 1][0].slice(0, 7) !== date.slice(0, 7)) ? (
            <MonthDivider month={date.slice(0, 7)} />
          ) : null}
          <View
            style={[styles.day, date === today && styles.dayToday, date === selectedDay && styles.daySelected]}
            onLayout={
              onDayLayout
                ? (e) => onDayLayout(date, e.nativeEvent.layout.y, e.nativeEvent.layout.height)
                : undefined
            }
          >
            <View style={styles.dayHead}>
              <NearDayChip date={date} today={today} />
              <Text style={[styles.dayTitle, date === today && styles.dayTitleToday]}>{dayTitle(date)}</Text>
            </View>
            {list.length === 0 ? <Text style={styles.noSessions}>אין מפגשים ביום זה.</Text> : null}
            {list.map((r) => (
              <SessionRow key={`${r.course.id}@${r.date}`} row={r} onPress={() => open(r)} />
            ))}
            {(() => {
              // סיכום היום לפי מקום עבודה — כשיש ביום יותר ממפגש אחד שמתקיים (לא בוטל / הועבר).
              const held = list.filter((r) => r.status !== 'canceled' && r.status !== 'moved');
              if (held.length < 2) return null;
              const totals = dayTotalsByWorkplace(
                held.map((r) => {
                  const rep = r.reportId ? reportById.get(r.reportId) : undefined;
                  const t = sessionTimes(r.course, r.date);
                  return {
                    workplaceId: r.workplace.id,
                    netMinutes: rep ? netMinutes(rep) ?? 0 : rangeNetMinutes(t.start, t.end, t.breakMinutes),
                  };
                }),
              );
              return <DaySummary totals={totals} workplaceOf={(id) => wpById.get(id)} basis={basis} />;
            })()}
          </View>
          </Fragment>
        ))}
        </>
      )}
      {after}
      {sessionDialog.dialog}
    </View>
  );
}

/**
 * מפגשי הקורסים בטווח, ממוינים לפי תאריך ושעה, עם הסטטוס של כל אחד.
 * `workplaces` — המקומות שמוצגים (קורס של מקום אחר מדולג).
 */
export function buildSessionRows(
  courses: readonly Course[],
  workplaces: readonly Workplace[],
  reports: readonly WorkReport[],
  from: string,
  to: string,
): SessionRowData[] {
  const byId = new Map(workplaces.map((w) => [w.id, w]));
  const today = todayISO();
  const at = new Date();
  const nowMin = at.getHours() * 60 + at.getMinutes();
  const rows: SessionRowData[] = [];
  for (const course of courses) {
    const workplace = byId.get(course.workplaceId);
    if (!workplace) continue;
    for (const s of allCourseSessions(course, from, to)) {
      if (s.cancel?.kind === 'removed') continue; // נמחק מהתכנון — מוסתר
      const report = courseReport(course, s.date, reports);
      // לפני תחילת המעקב ולא דווח — גם מפגש שבוטל / הועבר אינו מוצג (רק שורת הספירה).
      const status: Status = report
        ? 'reported'
        : beforeTracking(s.date)
          ? 'untracked'
          : s.cancel?.kind === 'moved'
            ? 'moved'
            : s.cancel
              ? 'canceled'
              : s.date > today
                ? 'planned'
                : s.date === today
                  ? sessionLive(course, nowMin)
                    ? 'now'
                    : 'pending'
                  : 'missing';
      rows.push({
        course,
        workplace,
        date: s.date,
        status,
        reportId: report?.id,
        reported: report ? { start: report.start, end: report.end } : undefined,
        cancel: s.cancel,
        movedFrom: s.movedFrom,
      });
    }
  }
  rows.sort((a, b) => a.date.localeCompare(b.date) || a.course.start.localeCompare(b.course.start));
  return rows;
}

/** המפגש מתקיים כעת (בין שעת ההתחלה לסיום) — כמו "עכשיו" בלו״ז הבית. */
function sessionLive(course: Course, nowMin: number): boolean {
  const s = parseTime(course.start);
  const e = parseTime(course.end);
  return s != null && e != null && nowMin >= s && nowMin < e;
}

/** מפגש שדווח → תצוגת הדיווח; אחרת — דיווח ישיר. */
export function openSession(router: ReturnType<typeof useRouter>, r: SessionRowData) {
  if (r.reportId) router.push({ pathname: '/report-view', params: { id: r.reportId } });
  else router.push({ pathname: '/report', params: { course: r.course.id, date: r.date } });
}

/** שורת מפגש: פס צבע המקום, שם הקורס, שעות / סיבה, ותג הסטטוס. */
export function SessionRow({
  row: r,
  onPress,
  showDate,
}: {
  row: SessionRowData;
  onPress: () => void;
  /** להציג גם את התאריך (ברשימה שאינה מקובצת לפי יום) */
  showDate?: boolean;
}) {
  const styles = useThemedStyles(makeStyles);
  const { colors } = useTheme();
  const tone: Record<Status, { label: string; fg: string; bg: string }> = {
    planned: { label: 'מתוכנן', fg: colors.textMuted, bg: colors.background },
    // כמו תג "ממתין לדיווח" בלו״ז דף הבית
    pending: { label: 'ממתין לדיווח', fg: colors.warning, bg: mix(colors.warning, colors.surface, 0.86) },
    now: { label: 'עכשיו', fg: colors.textOnBrand, bg: colors.brand },
    missing: { label: 'חסר', fg: colors.warning, bg: colors.background },
    reported: { label: 'דווח', fg: colors.success, bg: colors.brandLight },
    canceled: { label: 'בוטל', fg: colors.dangerText, bg: colors.dangerSoft },
    moved: { label: 'הועבר', fg: colors.textMuted, bg: colors.background },
    untracked: { label: 'לפני המעקב', fg: colors.textMuted, bg: colors.background },
  };
  const t = tone[r.status];
  const faded = r.status === 'planned';
  const note = noteFor(useSessionNotes(), r.course.id, r.date);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <View
        style={[styles.bar, { backgroundColor: workplaceColor(colors, r.workplace) }, faded && styles.fadedBar]}
      />
      <View style={styles.texts}>
        <Text
          style={[
            styles.name,
            faded && styles.faded,
            (r.status === 'canceled' || r.status === 'moved') && styles.strike,
          ]}
          numberOfLines={1}
        >
          {r.course.name}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {showDate ? `${dayTitle(r.date)} · ` : ''}
          {r.status === 'moved' && r.cancel?.movedTo
            ? `הועבר ל־${short(r.cancel.movedTo)}`
            : r.status === 'canceled' && r.cancel?.reason
              ? r.cancel.reason
              : r.reported
                ? timeRange(r.reported.start, r.reported.end)
                : timeRange(r.course.start, r.course.end)}
          {r.movedFrom ? ` · הועבר מ־${short(r.movedFrom)}` : ''} · {r.workplace.name}
        </Text>
      </View>
      {note?.flag ? (
        <Icon name={FLAG_ICON[note.flag]} size={16} color={colors.warning} />
      ) : null}
      {note && (note.note || note.content || note.arrival) ? (
        <Icon name="note-text-outline" size={16} color={colors.textMuted} />
      ) : null}
      <View style={[styles.chip, { backgroundColor: t.bg }]}>
        <Text style={[styles.chipText, { color: t.fg }]}>{t.label}</Text>
      </View>
      <EnterChevron size={18} />
    </Pressable>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    wrap: { gap: spacing.md },
    summary: { backgroundColor: colors.brandLight, borderRadius: radius.md, padding: spacing.md, gap: 2 },
    summaryTitle: { fontSize: 15, fontWeight: '800', color: colors.brandDark, textAlign: TEXT_RIGHT },
    summaryLine: { fontSize: 13, color: colors.brandDark, textAlign: TEXT_RIGHT },
    empty: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, padding: spacing.lg },
    emptyText: { fontSize: 15, color: colors.textMuted },
    day: {
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      padding: spacing.md,
      gap: spacing.xs,
      // מסגרת שקופה קבועה — סימון האריח לא משנה את גובהו (והגלילה לא קופצת)
      borderWidth: 2,
      borderColor: 'transparent',
      ...cardShadow,
    },
    dayToday: { borderColor: colors.brandDark },
    /** היום שמסומן בתאריכון — כמו היום הנבחר בו: מסגרת כהה ורקע בהיר */
    daySelected: { borderColor: colors.brandDark, backgroundColor: colors.brandLight },
    dayHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    dayTitleToday: { color: colors.brandDark },
    nearChip: { backgroundColor: colors.brandLight, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
    nearChipText: { fontSize: 12, fontWeight: '700', color: colors.brandDark },
    todayChip: { backgroundColor: colors.brandDark },
    todayChipText: { color: colors.textOnBrand },
    noSessions: { fontSize: 13, color: colors.textMuted, textAlign: TEXT_RIGHT },
    earlier: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start' },
    earlierText: { fontSize: 14, fontWeight: '700', color: colors.brand },
    untrackedNote: { fontSize: 12, color: colors.textMuted, textAlign: TEXT_RIGHT },
    dayTitle: { flex: 1, fontSize: 15, fontWeight: '800', color: colors.text, textAlign: TEXT_RIGHT },
    row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 48 },
    pressed: { opacity: 0.7 },
    bar: { width: 4, alignSelf: 'stretch', borderRadius: 2 },
    texts: { flex: 1, minWidth: 0, gap: 2 },
    name: { fontSize: 15, fontWeight: '700', color: colors.text, textAlign: TEXT_RIGHT },
    faded: { color: colors.textMuted, fontWeight: '600' },
    fadedBar: { opacity: 0.4 },
    strike: { textDecorationLine: 'line-through', color: colors.textMuted },
    meta: { fontSize: 12, color: colors.textMuted, textAlign: TEXT_RIGHT },
    chip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
    chipText: { fontSize: 12, fontWeight: '700' },
  });
