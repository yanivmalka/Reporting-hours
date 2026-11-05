/**
 * מסך הבית: ברכה לפי שעת היום ושם פרטי; שורה עליונה — כפתור הדיווח (נפתח על
 * "היום הרלוונטי הבא", כולל השלמת דיווח חסר מהעבר) ואריח לוח הבקרה; לו״ז
 * משלשום עד מחרתיים (בחירת יום בשורת ימים או בהחלקה); התראות ותזכורות,
 * עם אפשרות להציג שוב התראות שהוסתרו.
 */
import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { Animated, Linking, StyleSheet, View } from 'react-native';
import { Text } from '../components/Text';
import { Pressable } from '../components/Pressable';
import { Icon } from '../components/Icon';
import { EnterChevron } from '../components/Chevrons';
import { Screen } from '../components/Screen';
import { useFade } from '../components/useFlash';
import { useSessionCancel } from '../components/SessionCancelDialog';
import { useSwipe } from '../components/useSwipe';
import { useCloudSync } from '../components/CloudSync';
import { loadAccumulated } from '../lib/accumulated';
import { loadCourses, timeRange } from '../lib/courses';
import { onDataChanged } from '../lib/demo';
import { hebrewDate } from '../lib/hebrewDate';
import {
  AGENDA_TODAY_INDEX,
  agenda,
  firstName,
  greetingFor,
  homeAlerts,
  nextRelevantDay,
  type NextRelevant,
  type AgendaDay,
  type AgendaItem,
  type HomeAlert,
  type SessionStatus,
} from '../lib/home';
import { usePayBasis } from '../lib/payBasis';
import { loadPayrollStatus } from '../lib/payroll';
import { loadProfile } from '../lib/profile';
import { loadReports } from '../lib/reports';
import { loadDismissedRecommendations } from '../lib/recommend';
import { readJSON, writeJSON } from '../lib/storage';
import { isTaxi, loadWorkplaces } from '../lib/workplaces';
import { isoDate } from '../lib/dashboard';
import { useTheme } from '../theme/ThemeContext';
import { useThemedStyles } from '../theme/useThemedStyles';
import { radius, spacing, type AppColors } from '../theme/colors';
import { TEXT_RIGHT } from '../theme/align';
import { useWorkplaceColor } from '../theme/workplaceColors';

/** התראות שנסגרו — לפי המפתח שלהן (שכולל תאריך כשהן תלויות יום). */
const DISMISSED_KEY = 'reporting-hours/home-dismissed/v1';
const DISMISSED_MAX = 80;

type Data = { days: AgendaDay[]; alerts: HomeAlert[]; name: string; next: NextRelevant };

export default function HomeScreen() {
  const router = useRouter();
  const styles = useThemedStyles(makeStyles);
  const { colors } = useTheme();
  const { basis } = usePayBasis();
  const { user } = useCloudSync();
  // null עד הטעינה בדפדפן: ב־web המסך מרונדר מראש בזמן הבנייה, ושעה שונה
  // בין הבנייה לדפדפן גורמת לאי־התאמה (hydration).
  const [now, setNow] = useState<Date | null>(null);
  const [data, setData] = useState<Data | null>(null);
  const [dismissed, setDismissed] = useState<string[]>([]);
  // היום שנבחר בלו״ז (אינדקס ברשימת הימים) ושל כיוון המעבר האחרון
  const [dayIdx, setDayIdx] = useState(AGENDA_TODAY_INDEX);
  // טעינה מחדש אחרי ביטול / החזרה של מפגש
  const [reloadTick, setReloadTick] = useState(0);
  const sessionDialog = useSessionCancel();
  // התראות מוסתרות שהוצגו שוב ("הצג") — עד שסוגרים שוב
  const [revealed, setRevealed] = useState<string[]>([]);

  // השעה מתעדכנת כל דקה — הברכה וסטטוס המפגשים ("עכשיו" / "ממתין לדיווח").
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      const load = () =>
        Promise.all([
          loadWorkplaces(),
          loadReports(),
          loadCourses(),
          loadAccumulated(),
          loadPayrollStatus(),
          loadProfile(),
          readJSON<string[]>(DISMISSED_KEY, []),
          loadDismissedRecommendations(),
        ]).then(([workplaces, reports, courses, accumulated, payroll, profile, gone, recommendDismissed]) => {
          if (!active) return;
          const at = new Date();
          setNow(at);
          setDismissed(gone);
          setData({
            days: agenda(courses, workplaces, reports, at),
            alerts: homeAlerts({ workplaces, courses, reports, accumulated, payroll, basis, recommendDismissed, now: at }),
            name: firstName(profile.fullName),
            next: nextRelevantDay(courses, workplaces, reports, at),
          });
        });
      void load();
      const off = onDataChanged(() => void load());
      return () => {
        active = false;
        off();
      };
    }, [basis, reloadTick]),
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
  const day = days[dayIdx];
  const next = data?.next ?? null;
  const reportHref: Href = next ? { pathname: '/report', params: { date: next.date } } : '/report';
  const missingMode = next?.kind === 'missing';
  const allAlerts = data?.alerts ?? [];
  const isHidden = (a: HomeAlert) => dismissed.includes(dismissId(a)) || dismissed.includes(a.key);
  const visibleAlerts = allAlerts.filter((a) => !isHidden(a));
  const hiddenAlerts = allAlerts.filter(isHidden);
  const hiddenCount = hiddenAlerts.filter((a) => !revealed.includes(a.key)).length;
  const todayIso = now ? isoDate(now) : '';

  function pickDay(i: number) {
    if (i < 0 || i >= days.length || i === dayIdx) return;
    setDayIdx(i);
  }
  const swipe = useSwipe(
    () => pickDay(dayIdx + 1),
    () => pickDay(dayIdx - 1),
  );
  const flash = useFade(dayIdx);

  function openCancel(item: AgendaItem) {
    sessionDialog.open({
      course: item.course,
      date: item.date,
      cancel: item.cancel,
      onDone: () => setReloadTick((n) => n + 1),
      // "המפגש התקיים" על מפגש שבוטל — ישר לדיווח המפגש.
      onHeld:
        item.status === 'canceled'
          ? () => router.push({ pathname: '/report', params: { course: item.course.id, date: item.date } })
          : undefined,
    });
  }

  const todayCount = today?.items.filter((i) => i.status !== 'canceled').length ?? 0;

  return (
    <Screen>
      <View style={styles.greeting}>
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
          <Text style={styles.context}>
            {todayCount === 0
              ? 'אין קורסים מתוכננים להיום'
              : todayCount === 1
                ? 'מפגש אחד מתוכנן להיום'
                : `${todayCount} מפגשים מתוכננים להיום`}
          </Text>
        ) : null}
      </View>

      <View style={styles.topRow}>
        <Pressable
          onPress={() => router.push(reportHref)}
          accessibilityRole="button"
          accessibilityLabel={missingMode ? 'השלמת דיווח חסר' : 'דיווח יום עבודה'}
          style={({ pressed }) => [styles.reportBtn, pressed && styles.pressed]}
        >
          <View style={styles.reportIcon}>
            <Icon name={missingMode ? 'clipboard-plus-outline' : 'plus'} size={26} color={colors.textOnBrand} />
          </View>
          <View style={styles.reportTexts}>
            <Text style={styles.reportTitle} numberOfLines={1}>
              {missingMode ? 'השלמת דיווח חסר' : 'דיווח יום עבודה'}
            </Text>
            {next?.course ? (
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
          const active = i === dayIdx;
          const dot = dayDot(d, colors);
          return (
            <Pressable
              key={d.key}
              onPress={() => pickDay(i)}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`${d.label}, ${d.dayLabel}${dot ? `, ${dot.label}` : ''}`}
              style={({ pressed }) => [styles.dayTab, active && styles.dayTabActive, pressed && styles.pressed]}
            >
              <Text style={[styles.dayTabLabel, active && styles.dayTabTextActive]} numberOfLines={1}>
                {d.label}
              </Text>
              <Text style={[styles.dayTabDate, active && styles.dayTabTextActive]}>{shortDay(d.date)}</Text>
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
      {day ? (
        <Animated.View style={[styles.dayCard, flash]} {...swipe}>
          <View style={styles.dayHead}>
            <Text style={styles.dayLabel}>{day.label}</Text>
            <Text style={styles.dayDate}>{day.dayLabel}</Text>
          </View>
          {day.items.length === 0 ? (
            <Pressable
              onPress={() => router.push('/workplaces')}
              style={({ pressed }) => [styles.emptyDay, pressed && styles.pressed]}
              accessibilityRole="button"
            >
              <Icon name="calendar-blank-outline" size={22} color={colors.textMuted} />
              <Text style={styles.emptyText}>אין קורסים מתוכננים. קורסים מגדירים במקום העבודה ←</Text>
            </Pressable>
          ) : (
            day.items.map((item) => (
              <SessionRow
                key={item.course.id}
                item={item}
                onPress={
                  item.reportId
                    ? // מפגש שדווח — תצוגת הדיווח (עריכה בכפתור, "חזרה" חוזרת לכאן)
                      () => router.push({ pathname: '/report-view', params: { id: item.reportId } })
                    : item.status === 'canceled' || item.status === 'upcoming'
                      ? // מבוטל — הסיבה והחזרה; עתידי — ביטול מראש
                        () => openCancel(item)
                      : () =>
                          router.push({
                            pathname: '/report',
                            params: { course: item.course.id, date: item.date },
                          })
                }
              />
            ))
          )}
        </Animated.View>
      ) : null}
      {sessionDialog.dialog}

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
const dismissId = (a: HomeAlert) => `${a.key}#${a.title}|${a.body}`;

const WEEKDAY_SHORT = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];

/** "ב׳ 2.11" */
function shortWeekday(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return `${WEEKDAY_SHORT[new Date(y, m - 1, d).getDay()]} ${d}.${m}`;
}

/** "3.11" */
const shortDay = (iso: string) => {
  const [, m, d] = iso.split('-').map(Number);
  return `${d}.${m}`;
};

function SessionRow({ item, onPress }: { item: AgendaItem; onPress?: () => void }) {
  const styles = useThemedStyles(makeStyles);
  const { colors } = useTheme();
  const tone =
    item.status === 'reported'
      ? { bg: colors.brandLight, fg: colors.success }
      : item.status === 'pending'
        ? { bg: colors.background, fg: colors.warning }
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
      style={({ pressed }) => [styles.alert, pressed && styles.pressed]}
    >
      <View style={[styles.alertIcon, { borderColor: fg }]}>
        <Icon name={alert.icon} size={20} color={fg} />
      </View>
      <View style={styles.alertTexts}>
        <Text style={styles.alertTitle}>{alert.title}</Text>
        <Text style={styles.alertBody}>{alert.body}</Text>
        {alert.action ? (
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
    hello: { fontSize: 28, fontWeight: '800', color: colors.text, textAlign: TEXT_RIGHT },
    date: { fontSize: 15, color: colors.textMuted, textAlign: TEXT_RIGHT },
    context: { fontSize: 14, color: colors.textMuted, textAlign: TEXT_RIGHT },

    topRow: { flexDirection: 'row', alignItems: 'stretch', gap: 12 },
    reportBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      minHeight: 96,
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderRadius: radius.lg,
      backgroundColor: colors.brand,
      elevation: 3,
      shadowColor: '#000',
      shadowOpacity: 0.15,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
    },
    reportIcon: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: 'rgba(255,255,255,0.18)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    reportTexts: { flex: 1, minWidth: 0, gap: 2 },
    reportTitle: { fontSize: 19, fontWeight: '800', color: colors.textOnBrand, textAlign: TEXT_RIGHT },
    dashTile: {
      width: 96,
      minHeight: 96,
      borderRadius: radius.lg,
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
    },
    dashTileText: { fontSize: 13, fontWeight: '700', color: colors.text, textAlign: 'center' },
    reportSub: { fontSize: 14, color: colors.textOnBrand, opacity: 0.9, textAlign: TEXT_RIGHT },

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
      paddingVertical: 8,
      borderRadius: 14,
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    dayTabActive: { backgroundColor: colors.brand, borderColor: colors.brand },
    dayTabLabel: { fontSize: 13, fontWeight: '700', color: colors.text },
    dayTabDate: { fontSize: 12, color: colors.textMuted },
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
    dayCard: {
      backgroundColor: colors.surface,
      borderRadius: 18,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      padding: spacing.md,
      gap: spacing.sm,
    },
    dayHead: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm },
    dayLabel: { fontSize: 17, fontWeight: '800', color: colors.text },
    dayDate: { flex: 1, fontSize: 14, color: colors.textMuted, textAlign: TEXT_RIGHT },
    session: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingTop: 10,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
      minHeight: 52,
    },
    sessionTexts: { flex: 1, gap: 2 },
    sessionBar: { width: 4, alignSelf: 'stretch', borderRadius: 2, marginBottom: 2 },
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
    emptyDay: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingTop: 10,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
      minHeight: 52,
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
      borderRadius: 16,
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    alertIcon: {
      width: 40,
      height: 40,
      borderRadius: 20,
      borderWidth: 1.5,
      alignItems: 'center',
      justifyContent: 'center',
    },
    alertTexts: { flex: 1, gap: 3, paddingTop: 1 },
    alertTitle: { fontSize: 15, fontWeight: '700', color: colors.text, textAlign: TEXT_RIGHT },
    alertBody: { fontSize: 14, lineHeight: 20, color: colors.textMuted, textAlign: TEXT_RIGHT },
    alertAction: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingTop: 4 },
    alertActionText: { fontSize: 14, fontWeight: '700', color: colors.brand },
    alertClose: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },

  });
