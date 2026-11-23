/**
 * מסך הבית: ברכה לפי שעת היום ושם פרטי; שורה עליונה — כפתור הדיווח (נפתח על
 * "היום הרלוונטי הבא", כולל השלמת דיווח חסר מהעבר) ואריח לוח הבקרה; לו״ז
 * משלשום עד מחרתיים (בחירת יום בשורת ימים או בהחלקה); התראות ותזכורות,
 * עם אפשרות להציג שוב התראות שהוסתרו.
 */
import { useEffect, useRef, useState } from 'react';
import { useRouter, type Href } from 'expo-router';
import { Linking, StyleSheet, View } from 'react-native';
import { Text } from '../components/Text';
import { Pressable } from '../components/Pressable';
import { Icon } from '../components/Icon';
import { EnterChevron } from '../components/Chevrons';
import { Screen } from '../components/Screen';
import { FinanceLockToggle } from '../components/AppLock';
import { useSessionCancel } from '../components/SessionCancelDialog';
import { useSessionSheet } from '../components/SessionSheet';
import { FLAG_ICON, loadSessionNotes, noteFor, type SessionNote } from '../lib/sessionNotes';
import { useSwipe } from '../components/useSwipe';
import { useCloudSync } from '../components/CloudSync';
import { useAccess } from '../components/Access';
import { Dialog } from '../components/Dialog';
import { Button } from '../components/Button';
import { setViewOnly } from '../lib/viewOnly';
import { loadAccumulated } from '../lib/accumulated';
import { loadCourses, timeRange, type Course } from '../lib/courses';
import { hebrewDate } from '../lib/hebrewDate';
import { setIntroTarget } from '../lib/intro';
import { AGENDA_TODAY_INDEX, agenda, firstName, greetingFor, homeAlerts, nextRelevantDay, type NextRelevant, type AgendaDay, type AgendaItem, type HomeAlert, type SessionStatus, nextSessionAfter } from '../lib/home';
import { usePayBasis } from '../lib/payBasis';
import { loadPayrollStatus } from '../lib/payroll';
import { loadProfile } from '../lib/profile';
import { loadReports } from '../lib/reports';
import { loadDismissedRecommendations } from '../lib/recommend';
import { readJSON, writeJSON } from '../lib/storage';
import { isTaxi, loadWorkplaces, type Workplace } from '../lib/workplaces';
import { isoDate } from '../lib/dashboard';
import { useTheme } from '../theme/ThemeContext';
import { useThemedStyles } from '../theme/useThemedStyles';
import { cardShadow, radius, spacing, type AppColors } from '../theme/colors';
import { TEXT_RIGHT } from '../theme/align';
import { useWorkplaceColor } from '../theme/workplaceColors';
import { mix } from '../theme/shades';
import { KEYS } from '../lib/keys';
import { useScreenData } from '../components/useScreenData';

/** התראות שנסגרו — לפי המפתח שלהן (שכולל תאריך כשהן תלויות יום). */
const DISMISSED_KEY = KEYS.homeDismissed;
const DISMISSED_MAX = 80;

/** "יום ג׳ 10.11" */
function nextDateLabel(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return `יום ${WEEKDAY_SHORT[new Date(y, m - 1, d).getDay()]} ${d}.${m}`;
}

type Data = {
  days: AgendaDay[];
  alerts: HomeAlert[];
  name: string;
  next: NextRelevant;
  courses: Course[];
  workplaces: Workplace[];
  /** פרטי מפגשים (הערה, הגשה, תזכורת) — לאייקונים בלו״ז */
  notes: SessionNote[];
};

export default function HomeScreen() {
  const router = useRouter();
  const styles = useThemedStyles(makeStyles);
  const { colors } = useTheme();
  const { basis } = usePayBasis();
  const { user } = useCloudSync();
  const { canReport, viewOnly, level } = useAccess();
  /** כפתור הדיווח נשאר במקומו גם בלי אפשרות לדווח (מצב צפייה / הרשאת צפייה) — מעומעם, ולחיצה מסבירה */
  const [blockedOpen, setBlockedOpen] = useState(false);
  /** מצב צפייה שהמשתמש בחר, והרמה מתירה דיווח — אפשר לעבור לעריכה מכאן */
  const canSwitchToEdit = viewOnly && level !== 'view';
  // null עד הטעינה בדפדפן: ב־web המסך מרונדר מראש בזמן הבנייה, ושעה שונה
  // בין הבנייה לדפדפן גורמת לאי־התאמה (hydration).
  const [now, setNow] = useState<Date | null>(null);
  const [data, setData] = useState<Data | null>(null);
  const [dismissed, setDismissed] = useState<string[]>([]);
  // היום שנבחר בלו״ז (אינדקס ברשימת הימים)
  const [tabIdx, setTabIdx] = useState(AGENDA_TODAY_INDEX);
  const todayTabRef = useRef<View>(null);
  /** גובה מדוד של כל יום בלו״ז — אזור הלו״ז לא קטן מהגבוה שבהם, כדי שמעבר יום לא יזיז את מה שמתחת. */
  const [dayHeights, setDayHeights] = useState<Record<string, number>>({});
  const dayAreaMin = Math.max(0, ...Object.values(dayHeights));
  const sessionDialog = useSessionCancel();
  const sessionSheet = useSessionSheet();
  // התראות מוסתרות שהוצגו שוב ("הצג") — עד שסוגרים שוב
  const [revealed, setRevealed] = useState<string[]>([]);

  // השעה מתעדכנת כל דקה — הברכה וסטטוס המפגשים ("עכשיו" / "ממתין לדיווח").
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const { reload } = useScreenData(
    () =>
      Promise.all([
        loadWorkplaces(),
        loadReports(),
        loadCourses(),
        loadAccumulated(),
        loadPayrollStatus(),
        loadProfile(),
        readJSON<string[]>(DISMISSED_KEY, []),
        loadDismissedRecommendations(),
        loadSessionNotes(),
      ]),
    [basis],
    ([workplaces, reports, courses, accumulated, payroll, profile, gone, recommendDismissed, notes]) => {
      const at = new Date();
      setNow(at);
      setDismissed(gone);
      setData({
        days: agenda(courses, workplaces, reports, at),
        alerts: homeAlerts({ workplaces, courses, reports, accumulated, payroll, basis, recommendDismissed, notes, now: at }),
        name: firstName(profile.fullName),
        next: nextRelevantDay(courses, workplaces, reports, at),
        courses,
        workplaces,
        notes,
      });
    },
  );

  function dismiss(a: HomeAlert) {
    const id = dismissId(a);
    const next = [...dismissed.filter((k) => k !== id && k !== a.key), id].slice(-DISMISSED_MAX);
    setDismissed(next);
    void writeJSON(DISMISSED_KEY, next);
  }

  function runAction(alert: HomeAlert) {
    if (alert.action?.tel) void Linking.openURL(`tel:${alert.action.tel}`);
    else if (alert.action?.href) router.push(alert.action.href);
  }

  const name = data?.name || firstName(user?.name);
  const days = data?.days ?? [];
  const today = days[AGENDA_TODAY_INDEX];
  const next = data?.next ?? null;
  const reportHref: Href = next ? { pathname: '/report', params: { date: next.date } } : '/report';
  const missingMode = next?.kind === 'missing';
  const allAlerts = data?.alerts ?? [];
  const isHidden = (a: HomeAlert) => dismissed.includes(dismissId(a)) || dismissed.includes(a.key);
  const visibleAlerts = allAlerts.filter((a) => !isHidden(a));
  const hiddenAlerts = allAlerts.filter(isHidden);
  const hiddenCount = hiddenAlerts.filter((a) => !revealed.includes(a.key)).length;
  const todayIso = now ? isoDate(now) : '';
  // אין קורס ביום — הקורס הבא אחריו.
  const nextAfterFor = (d: AgendaDay) =>
    data && d.items.length === 0 && data.courses.length
      ? nextSessionAfter(data.courses, data.workplaces, d.date)
      : null;

  function pickDay(i: number) {
    if (i < 0 || i >= days.length || i === tabIdx) return;
    // מעבר מיידי, בלי אפקט.
    setTabIdx(i);
  }
  const swipe = useSwipe(
    () => pickDay(tabIdx + 1),
    () => pickDay(tabIdx - 1),
  );

  function openCancel(item: AgendaItem) {
    sessionDialog.open({
      course: item.course,
      date: item.date,
      cancel: item.cancel,
      onDone: () => reload(),
      // "המפגש התקיים" על מפגש שבוטל — ישר לדיווח המפגש.
      onHeld:
        item.status === 'canceled'
          ? () => router.push({ pathname: '/report', params: { course: item.course.id, date: item.date } })
          : undefined,
    });
  }

  /** מפגש עתידי — גיליון "פרטי המפגש" (הערה, תוכן, הגעה, הגשה, תזכורת), ומשם גם ביטול. */
  function openSheet(item: AgendaItem) {
    sessionSheet.open({
      course: item.course,
      workplace: item.workplace,
      date: item.date,
      onDone: () => reload(),
      onCancelSession: () => openCancel(item),
    });
  }

  const todayCount = today?.items.filter((i) => i.status !== 'canceled').length ?? 0;
  const todayReported = today?.items.filter((i) => i.status === 'reported').length ?? 0;

  return (
    <Screen>
      <View style={styles.greeting}>
        {/* הברכה ברוחב מלא — שבירה לשתי שורות מזיזה את כל המסך מטה (והאריחים כבר לא מול סמל מסך הפתיחה) */}
        <Text style={styles.hello}>
          {now ? greetingFor(now.getHours()) : 'שלום'}
          {name ? `, ${name}` : ''}
        </Text>
        {today && todayIso ? (
          <Text style={styles.date}>
            {today.dayLabel} · {hebrewDate(todayIso, false)}
          </Text>
        ) : null}
        {data ? (
          // מתג הנעילה בשורה הקצרה, משמאל — לא מוסיף גובה ולא דוחק את הברכה
          <View style={styles.contextRow}>
            <Text style={styles.context}>
              {todayCount === 0
                ? 'אין קורסים מתוכננים להיום'
                : todayReported === todayCount
                  ? todayCount === 1
                    ? 'המפגש של היום דווח'
                    : `כל ${todayCount} המפגשים של היום דווחו`
                  : todayCount === 1
                    ? 'מפגש אחד מתוכנן להיום'
                    : todayReported > 0
                      ? `${todayCount} מפגשים היום · ${todayReported} דווחו`
                      : `${todayCount} מפגשים מתוכננים להיום`}
            </Text>
            <FinanceLockToggle />
          </View>
        ) : null}
      </View>

      {/* לוח הבקרה — מעבר בלבד, בלי סכומים: מידע כספי לא נחשף במסך הבית (צנעת הפרט) */}
      <View style={styles.topRow}>
        <Pressable
          onPress={() => (canReport ? router.push(reportHref) : setBlockedOpen(true))}
          accessibilityRole="button"
          accessibilityLabel={
            canReport ? (missingMode ? 'השלמת דיווח חסר' : 'דיווח יום עבודה') : 'דיווח יום עבודה — מצב צפייה'
          }
          style={({ pressed }) => [styles.reportBtn, !canReport && styles.reportBtnViewOnly, pressed && styles.pressed]}
        >
          <View style={styles.reportIcon}>
            <Icon
              name={!canReport ? 'eye-outline' : missingMode ? 'clipboard-plus-outline' : 'plus'}
              size={26}
              color={colors.textOnBrand}
            />
          </View>
          <View style={styles.reportTexts}>
            <Text style={styles.reportTitle} numberOfLines={1}>
              {missingMode ? 'השלמת דיווח חסר' : 'דיווח יום עבודה'}
            </Text>
            {!canReport ? (
              <Text style={styles.reportSub} numberOfLines={2}>
                {canSwitchToEdit ? 'מצב צפייה · לחיצה למעבר לעריכה' : 'צפייה בלבד · אין הרשאת דיווח'}
              </Text>
            ) : next?.course ? (
              <>
                <Text style={styles.reportSub} numberOfLines={1} ellipsizeMode="tail">
                  {next.course.name}
                </Text>
                <Text style={styles.reportSub} numberOfLines={1}>
                  {next.kind === 'today' ? 'היום' : shortWeekday(next.date)} ·{' '}
                  {timeRange(next.course.start, next.course.end)}
                </Text>
              </>
            ) : (
              <Text style={styles.reportSub} numberOfLines={2}>
                בחירת קורס או מקום עבודה, שעות והפסקות
              </Text>
            )}
          </View>
        </Pressable>
        <Pressable
          onPress={() => router.push('/dashboard')}
          accessibilityRole="link"
          accessibilityLabel="לוח בקרה"
          style={({ pressed }) => [styles.dashTile, pressed && styles.pressed]}
        >
          <Icon name="view-dashboard-outline" size={28} color={colors.brand} />
          <Text style={styles.dashTileText}>לוח בקרה</Text>
        </Pressable>
      </View>

      {blockedOpen ? (
        <Dialog
          title={canSwitchToEdit ? 'מצב צפייה בלבד' : 'צפייה בלבד'}
          onClose={() => setBlockedOpen(false)}
          actions={
            canSwitchToEdit
              ? [
                  <Button
                    key="edit"
                    label="מעבר לעריכה ודיווח"
                    onPress={() => {
                      setBlockedOpen(false);
                      void setViewOnly(false).then(() => router.push(reportHref));
                    }}
                  />,
                  <Button key="stay" label="להישאר בצפייה" variant="secondary" onPress={() => setBlockedOpen(false)} />,
                ]
              : [<Button key="close" label="סגירה" variant="secondary" onPress={() => setBlockedOpen(false)} />]
          }
        >
          <Text style={styles.blockedText}>
            {canSwitchToEdit
              ? 'המערכת מוצגת במצב צפייה בלבד, ולכן אי אפשר לדווח. אפשר לעבור עכשיו למצב עריכה ולהמשיך לדיווח.'
              : 'ההרשאה שלך בחשבון הזה היא צפייה בלבד, ולכן אי אפשר לדווח.'}
          </Text>
        </Dialog>
      ) : null}

      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>הלו״ז שלי</Text>
        <Pressable
          onPress={() => router.push('/reports')}
          accessibilityRole="link"
          hitSlop={8}
          style={({ pressed }) => [styles.journalLink, pressed && styles.pressed]}
        >
          <Icon name="calendar-month-outline" size={18} color={colors.brand} />
          <Text style={styles.journalLinkText}>ליומן</Text>
          <EnterChevron size={18} color={colors.brand} />
        </Pressable>
      </View>
      <View style={styles.dayTabs} accessibilityRole="tablist">
        {days.map((d, i) => {
          const active = i === tabIdx;
          const dot = dayDot(d, colors);
          return (
            <Pressable
              key={d.key}
              // כפתור "היום" — יעד הכוונת באנימציית הפתיחה (components/Intro.tsx)
              ref={i === AGENDA_TODAY_INDEX ? todayTabRef : undefined}
              onLayout={
                i === AGENDA_TODAY_INDEX
                  ? () =>
                      setIntroTarget((cb) =>
                        todayTabRef.current?.measureInWindow((x, y, width, height) => cb({ x, y, width, height })),
                      )
                  : undefined
              }
              onPress={() => pickDay(i)}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`${d.label}, ${d.dayLabel}${dot ? `, ${dot.label}` : ''}`}
              style={({ pressed }) => [styles.dayTab, active && styles.dayTabActive, pressed && styles.pressed]}
            >
              <Text style={[styles.dayTabLabel, active && styles.dayTabLabelActive]} numberOfLines={1}>
                {d.label}
              </Text>
              <Text style={[styles.dayTabNum, active && styles.dayTabTextActive]}>{Number(d.date.slice(8))}</Text>
              <View
                style={[
                  styles.dayTabDot,
                  dot && {
                    backgroundColor: dot.fill ?? 'transparent',
                    borderColor: dot.fill ? (active ? colors.textOnBrand : 'transparent') : dot.ring,
                  },
                ]}
              />
            </Pressable>
          );
        })}
      </View>
      {days.length ? (
        // כל הימים מרונדרים זה על גבי זה, וגובה האזור הוא של היום הגבוה —
        // כך מעבר בין ימים לא מזיז את מה שמתחת. מוצג רק היום שנבחר.
        <View style={[styles.dayStack, { minHeight: dayAreaMin }]} {...swipe}>
          {days.map((d, i) => {
            const shown = i === tabIdx;
            const nextAfter = nextAfterFor(d);
            return (
              <View
                key={d.key}
                style={[styles.dayCard, !shown && styles.dayHidden]}
                onLayout={(e) => {
                  const h = Math.ceil(e.nativeEvent.layout.height);
                  setDayHeights((m) => (m[d.key] === h ? m : { ...m, [d.key]: h }));
                }}
                pointerEvents={shown ? 'auto' : 'none'}
                aria-hidden={!shown}
                importantForAccessibility={shown ? 'auto' : 'no-hide-descendants'}
              >
                <View style={styles.dayHead}>
                  <Text style={styles.dayLabel}>{d.label}</Text>
                  <Text style={styles.dayDate}>{d.dayLabel}</Text>
                </View>
                {d.items.length === 0 && nextAfter ? (
                  <View style={styles.emptyDay}>
                    <Icon name="calendar-blank-outline" size={22} color={colors.textMuted} />
                    <Text style={styles.emptyText}>אין קורסים ביום זה.</Text>
                  </View>
                ) : d.items.length === 0 ? (
                  <Pressable
                    onPress={() => router.push('/workplaces')}
                    style={({ pressed }) => [styles.emptyDay, pressed && styles.pressed]}
                    accessibilityRole="button"
                  >
                    <Icon name="calendar-blank-outline" size={22} color={colors.textMuted} />
                    <Text style={styles.emptyText}>אין קורסים מתוכננים. קורסים מגדירים במקום העבודה ←</Text>
                  </Pressable>
                ) : null}
                {d.items.length === 0 && nextAfter ? (
                  <Pressable
                    onPress={() => {
                      // המפגש הבא בתוך ימי הלו״ז — מעבר ליום שלו; אחרת — ליומן, על התאריך.
                      const i = days.findIndex((x) => x.date === nextAfter.date);
                      if (i >= 0) pickDay(i);
                      else router.push({ pathname: '/reports', params: { tab: 'plan', day: nextAfter.date } });
                    }}
                    accessibilityRole="link"
                    style={({ pressed }) => [styles.nextCourse, pressed && styles.pressed]}
                  >
                    <Icon name="calendar-arrow-left" size={20} color={colors.brand} />
                    <Text style={styles.nextCourseText}>
                      הקורס הבא: {nextAfter.course.name} · {nextDateLabel(nextAfter.date)}{' '}
                      <Text style={styles.showLink}>
                        {days.some((x) => x.date === nextAfter.date) ? 'מעבר ליום' : 'ביומן'}
                      </Text>
                    </Text>
                    <EnterChevron size={18} color={colors.brand} />
                  </Pressable>
                ) : null}
                {d.items.length === 0 ? null : (
                  d.items.map((item) => (
                    <SessionRow
                      key={item.course.id}
                      item={item}
                      note={data ? noteFor(data.notes, item.course.id, item.date) : undefined}
                      onPress={
                        item.reportId
                          ? // מפגש שדווח — תצוגת הדיווח (עריכה בכפתור, "חזרה" חוזרת לכאן)
                            () => router.push({ pathname: '/report-view', params: { id: item.reportId } })
                          : item.status === 'canceled'
                            ? // מבוטל — הסיבה והחזרה
                              () => openCancel(item)
                            : item.status === 'upcoming'
                              ? // עתידי — פרטי המפגש (ומשם ביטול)
                                () => openSheet(item)
                              : () =>
                                router.push({
                                  pathname: '/report',
                                  params: { course: item.course.id, date: item.date },
                                })
                      }
                    />
                  ))
                )}
              </View>
            );
          })}
        </View>
      ) : null}
      {sessionDialog.dialog}
      {sessionSheet.dialog}

      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>התראות ותזכורות</Text>
        {visibleAlerts.length ? <Text style={styles.sectionMeta}>{visibleAlerts.length}</Text> : null}
      </View>
      {visibleAlerts.map((a) => (
        <AlertCard key={a.key} alert={a} onAction={() => runAction(a)} onDismiss={() => dismiss(a)} />
      ))}
      {hiddenAlerts
        .filter((a) => revealed.includes(a.key))
        .map((a) => (
          <AlertCard
            key={a.key}
            alert={a}
            onAction={() => runAction(a)}
            onDismiss={() => setRevealed((r) => r.filter((k) => k !== a.key))}
          />
        ))}
      {data && hiddenAlerts.some((a) => !revealed.includes(a.key)) ? (
        <Pressable
          onPress={() => setRevealed(hiddenAlerts.map((a) => a.key))}
          accessibilityRole="button"
          style={({ pressed }) => [styles.noAlerts, pressed && styles.pressed]}
        >
          <Icon name="bell-off-outline" size={20} color={colors.textMuted} />
          <Text style={styles.noAlertsText}>
            {hiddenCount === 1 ? 'התראה אחת מוסתרת' : `${hiddenCount} התראות מוסתרות`} ·{' '}
            <Text style={styles.showLink}>הצג</Text>
          </Text>
        </Pressable>
      ) : data && allAlerts.length === 0 ? (
        <View style={styles.noAlerts}>
          <Icon name="bell-outline" size={20} color={colors.textMuted} />
          <Text style={styles.noAlertsText}>אין התראות חדשות</Text>
        </View>
      ) : null}
    </Screen>
  );
}

const STATUS_LABEL: Record<SessionStatus, string> = {
  reported: 'דווח',
  pending: 'ממתין לדיווח',
  now: 'עכשיו',
  later: 'בהמשך היום',
  canceled: 'בוטל',
  upcoming: '',
};

/**
 * הנקודה מתחת ליום בשורת הימים — מצב הדיווח של אותו יום:
 * כתום — יש מפגש שממתין לדיווח; ירוק — כל המפגשים דווחו;
 * כהה — מפגשים שעוד לפניך (עתידי, עכשיו, בהמשך היום) — כמו בכל התאריכונים;
 * טבעת אפורה — כל המפגשים בוטלו. בלי מפגשים — בלי נקודה.
 */
function dayDot(
  d: AgendaDay,
  colors: AppColors,
): { fill?: string; ring?: string; label: string } | null {
  if (d.items.length === 0) return null;
  const live = d.items.filter((it) => it.status !== 'canceled');
  if (live.length === 0) return { ring: colors.textMuted, label: 'כל המפגשים בוטלו' };
  if (live.some((it) => it.status === 'pending')) return { fill: colors.warning, label: 'יש מפגשים לדיווח' };
  if (live.every((it) => it.status === 'reported')) return { fill: colors.success, label: 'הכול דווח' };
  return { fill: colors.text, label: 'מפגשים מתוכננים' };
}

/**
 * מזהה הסתרה של התראה: המפתח ועוד התוכן. התראה מוסתרת חוזרת לבד כשהתוכן
 * שלה משתנה (מפתח זהה, כותרת או גוף אחרים).
 */
const dismissId = (a: HomeAlert) => `${a.key}#${a.title}|${a.body}${a.detail ? `|${a.detail}` : ""}`;

const WEEKDAY_SHORT = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];

/** "ב׳ 2.11" */
function shortWeekday(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return `${WEEKDAY_SHORT[new Date(y, m - 1, d).getDay()]} ${d}.${m}`;
}


function SessionRow({ item, onPress, note }: { item: AgendaItem; onPress?: () => void; note?: SessionNote }) {
  const styles = useThemedStyles(makeStyles);
  const { colors } = useTheme();
  const tone =
    item.status === 'reported'
      ? { bg: mix(colors.success, colors.surface, 0.88), fg: colors.success }
      : item.status === 'pending'
        ? { bg: mix(colors.warning, colors.surface, 0.86), fg: colors.warning }
        : item.status === 'now'
          ? { bg: colors.brand, fg: colors.textOnBrand }
          : item.status === 'canceled'
            ? { bg: colors.background, fg: colors.danger }
            : { bg: colors.background, fg: colors.textMuted };
  const canceled = item.status === 'canceled';
  const taxi = isTaxi(item.workplace.arrivalMode);
  const wpColor = useWorkplaceColor()(item.workplace);
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [styles.session, pressed && styles.pressed]}
      accessibilityRole={onPress ? 'button' : undefined}
    >
      <View style={[styles.sessionBar, { backgroundColor: wpColor }, canceled && styles.sessionBarCanceled]} />
      <View style={styles.sessionTexts}>
        <Text style={[styles.sessionName, canceled && styles.sessionCanceled]} numberOfLines={1}>
          {item.course.name}
        </Text>
        <Text style={styles.sessionMeta} numberOfLines={1}>
          {canceled && item.cancel?.reason
            ? `${item.cancel.reason} · ${item.workplace.name}`
            : `${item.time} · ${item.workplace.name}`}
        </Text>
      </View>
      {note?.flag ? <Icon name={FLAG_ICON[note.flag]} size={18} color={colors.warning} /> : null}
      {note && (note.note || note.content || note.arrival) ? (
        <Icon name="note-text-outline" size={18} color={colors.textMuted} />
      ) : null}
      {item.status === 'upcoming' ? (
        taxi ? <Icon name="taxi" size={20} color={colors.textMuted} /> : null
      ) : (
        <View style={[styles.chip, { backgroundColor: tone.bg }]}>
          {item.status === 'reported' ? <Icon name="check-circle" size={14} color={tone.fg} /> : null}
          {canceled ? <Icon name="cancel" size={14} color={tone.fg} /> : null}
          <Text style={[styles.chipText, { color: tone.fg }]}>{STATUS_LABEL[item.status]}</Text>
        </View>
      )}
    </Pressable>
  );
}

function AlertCard({
  alert,
  onAction,
  onDismiss,
}: {
  alert: HomeAlert;
  onAction: () => void;
  onDismiss: () => void;
}) {
  const styles = useThemedStyles(makeStyles);
  const { colors } = useTheme();
  const fg = alert.tone === 'danger' ? colors.danger : alert.tone === 'warn' ? colors.warning : colors.brand;
  // כשיש להתראה פעולה — כל האריח לחיץ (לא רק טקסט הפעולה); ✕ נשאר מעליו.
  return (
    <Pressable
      onPress={alert.action ? onAction : undefined}
      disabled={!alert.action}
      accessibilityRole={alert.action ? 'button' : undefined}
      accessibilityLabel={alert.action ? `${alert.title} — ${alert.action.label}` : undefined}
      style={({ pressed }) => [
        styles.alert,
        alert.tone === 'warn' || alert.tone === 'danger' ? { backgroundColor: mix(fg, colors.surface, 0.93) } : null,
        pressed && styles.pressed,
      ]}
    >
      <View style={[styles.alertIcon, { backgroundColor: mix(fg, colors.surface, 0.82) }]}>
        <Icon name={alert.icon} size={20} color={fg} />
      </View>
      <View style={styles.alertTexts}>
        <Text style={styles.alertTitle}>{alert.title}</Text>
        <Text style={styles.alertBody}>{alert.body}</Text>
        {alert.detail ? (
          // שורת פירוט (שמות מוסדות) שמתקצרת, והפעולה צמודה לשמאל באותה שורה
          <View style={styles.alertDetailRow}>
            <Text style={styles.alertDetail} numberOfLines={1} ellipsizeMode="tail">
              {alert.detail}
            </Text>
            {alert.action ? (
              <View style={styles.alertActionInline}>
                {alert.action.tel ? <Icon name="phone" size={16} color={colors.brand} /> : null}
                <Text style={styles.alertActionText}>{alert.action.label}</Text>
              </View>
            ) : null}
          </View>
        ) : null}
        {alert.action && !alert.detail ? (
          <View style={styles.alertAction}>
            {alert.action.tel ? <Icon name="phone" size={16} color={colors.brand} /> : null}
            <Text style={styles.alertActionText}>{alert.action.label}</Text>
          </View>
        ) : null}
      </View>
      <Pressable
        onPress={onDismiss}
        accessibilityRole="button"
        accessibilityLabel="סגירת ההתראה"
        hitSlop={8}
        style={styles.alertClose}
      >
        <Icon name="close" size={18} color={colors.textMuted} />
      </Pressable>
    </Pressable>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    pressed: { opacity: 0.85 },
    greeting: { gap: 2 },
    hello: { fontSize: 34, lineHeight: 40, fontWeight: '800', letterSpacing: -0.5, color: colors.text, textAlign: TEXT_RIGHT },
    date: { fontSize: 15, color: colors.textMuted, textAlign: TEXT_RIGHT },
    contextRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
    context: { flexShrink: 1, fontSize: 14, color: colors.textMuted, textAlign: TEXT_RIGHT },

    // כרטיס הדיווח הבא — כמו בעיצוב: צ׳יפ מצב, שם הקורס בגדול וכפתור לבן.

    topRow: { flexDirection: 'row', alignItems: 'stretch', gap: 12 },
    reportBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      minHeight: 104,
      paddingHorizontal: 18,
      paddingVertical: 14,
      borderRadius: 28,
      backgroundColor: colors.brand,
      elevation: 4,
      shadowColor: colors.brandDark,
      shadowOpacity: 0.25,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 6 },
    },
    reportIcon: {
      width: 48,
      height: 48,
      borderRadius: 16,
      backgroundColor: 'rgba(255,255,255,0.2)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    reportTexts: { flex: 1, minWidth: 0, gap: 2 },
    reportTitle: { fontSize: 20, fontWeight: '800', letterSpacing: -0.2, color: colors.textOnBrand, textAlign: TEXT_RIGHT },
    dashTile: {
      width: 96,
      minHeight: 104,
      borderRadius: 28,
      backgroundColor: colors.surface,
      ...cardShadow,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
    },
    dashTileText: { fontSize: 13, fontWeight: '700', color: colors.text, textAlign: 'center' },
    reportSub: { fontSize: 14, color: colors.textOnBrand, opacity: 0.9, textAlign: TEXT_RIGHT },
    // בלי אפשרות לדווח — אותו כפתור, מעומעם (בצבע המערכת), במקום שהלוח יתפשט
    reportBtnViewOnly: { backgroundColor: mix(colors.brand, colors.surface, 0.45), elevation: 0, shadowOpacity: 0 },
    blockedText: { fontSize: 15, lineHeight: 22, color: colors.text, textAlign: TEXT_RIGHT },

    sectionHead: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: spacing.sm,
    },
    sectionTitle: { fontSize: 18, fontWeight: '700', color: colors.text, textAlign: TEXT_RIGHT },
    sectionMeta: { fontSize: 13, color: colors.textMuted },
    journalLink: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    journalLinkText: { fontSize: 14, fontWeight: '700', color: colors.brand },

    dayTabs: { flexDirection: 'row', gap: 6 },
    dayTab: {
      flex: 1,
      alignItems: 'center',
      gap: 2,
      paddingVertical: 10,
      borderRadius: 18,
      backgroundColor: colors.surface,
      ...cardShadow,
    },
    dayTabActive: { backgroundColor: colors.brandDark },
    dayTabLabel: { fontSize: 12, color: colors.textMuted },
    dayTabLabelActive: { color: colors.border },
    dayTabNum: { fontSize: 20, lineHeight: 24, fontWeight: '700', color: colors.text },
    dayTabTextActive: { color: colors.textOnBrand },
    dayTabDot: {
      width: 9,
      height: 9,
      borderRadius: 4.5,
      marginTop: 2,
      borderWidth: 1.5,
      borderColor: 'transparent',
      backgroundColor: 'transparent',
    },
    dayStack: { position: 'relative' },
    dayCard: { gap: spacing.sm },
    // יום מוסתר: מחוץ לזרימה (לא קובע גובה), אבל נמדד; האזור מחזיק את הגבוה שבהם
    dayHidden: { position: 'absolute', top: 0, left: 0, right: 0, opacity: 0 },
    dayHead: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm, paddingHorizontal: 2 },
    dayLabel: { fontSize: 17, fontWeight: '800', color: colors.text },
    dayDate: { flex: 1, fontSize: 14, color: colors.textMuted, textAlign: TEXT_RIGHT },
    session: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      minHeight: 64,
      backgroundColor: colors.surface,
      borderRadius: 18,
      paddingHorizontal: 14,
      paddingVertical: 10,
      ...cardShadow,
    },
    sessionTexts: { flex: 1, gap: 2 },
    sessionBar: { width: 6, height: 40, borderRadius: 3 },
    sessionBarCanceled: { opacity: 0.35 },
    sessionName: { fontSize: 16, fontWeight: '700', color: colors.text, textAlign: TEXT_RIGHT },
    sessionCanceled: { textDecorationLine: 'line-through', color: colors.textMuted },
    hint: { fontSize: 12, color: colors.textMuted, textAlign: TEXT_RIGHT, paddingTop: 2 },
    sessionMeta: { fontSize: 13, color: colors.textMuted, textAlign: TEXT_RIGHT },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 12,
    },
    chipText: { fontSize: 12, fontWeight: '700' },
    nextCourse: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      minHeight: 52,
      backgroundColor: colors.surface,
      borderRadius: 18,
      paddingHorizontal: 14,
      paddingVertical: 10,
      ...cardShadow,
    },
    nextCourseText: { flex: 1, fontSize: 14, color: colors.text, textAlign: TEXT_RIGHT },
    emptyDay: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      minHeight: 56,
      backgroundColor: colors.surface,
      borderRadius: 18,
      paddingHorizontal: 14,
      paddingVertical: 10,
      ...cardShadow,
    },
    emptyText: { flex: 1, fontSize: 14, color: colors.textMuted, textAlign: TEXT_RIGHT },

    noAlerts: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      padding: spacing.md,
      borderRadius: radius.md,
      backgroundColor: colors.surface,
    },
    noAlertsText: { fontSize: 15, color: colors.textMuted },
    showLink: { color: colors.brand, fontWeight: '700' },
    alert: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.sm,
      padding: 14,
      borderRadius: 20,
      backgroundColor: colors.surface,
      ...cardShadow,
    },
    alertIcon: {
      width: 40,
      height: 40,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    alertTexts: { flex: 1, gap: 3, paddingTop: 1 },
    alertTitle: { fontSize: 15, fontWeight: '700', color: colors.text, textAlign: TEXT_RIGHT },
    alertBody: { fontSize: 14, lineHeight: 20, color: colors.textMuted, textAlign: TEXT_RIGHT },
    alertDetailRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    alertDetail: { flex: 1, minWidth: 0, fontSize: 14, fontWeight: '700', color: colors.text, textAlign: TEXT_RIGHT },
    alertActionInline: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    alertAction: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingTop: 4 },
    alertActionText: { fontSize: 14, fontWeight: '700', color: colors.brand },
    alertClose: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },

  });
