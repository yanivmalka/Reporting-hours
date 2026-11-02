/**
 * מסך הבית: ברכה לפי שעת היום ושם פרטי, כפתור דיווח גדול (ממולא מראש
 * לפי הקורס של היום), לו״ז היום ומחר מתוך הקורסים הפעילים (החלקה לצדדים),
 * התראות ותזכורות, וקישור ללוח הבקרה.
 */
import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { Linking, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Pressable } from '../components/Pressable';
import { Icon } from '../components/Icon';
import { Screen } from '../components/Screen';
import { useCloudSync } from '../components/CloudSync';
import { loadAccumulated } from '../lib/accumulated';
import { loadCourses } from '../lib/courses';
import { onDataChanged } from '../lib/demo';
import { hebrewDate } from '../lib/hebrewDate';
import {
  agenda,
  firstName,
  greetingFor,
  homeAlerts,
  suggestedSession,
  type AgendaDay,
  type AgendaItem,
  type HomeAlert,
  type SessionStatus,
} from '../lib/home';
import { usePayBasis } from '../lib/payBasis';
import { loadPayrollStatus } from '../lib/payroll';
import { loadProfile } from '../lib/profile';
import { loadReports } from '../lib/reports';
import { readJSON, writeJSON } from '../lib/storage';
import { isTaxi, loadWorkplaces } from '../lib/workplaces';
import { isoDate } from '../lib/dashboard';
import { useTheme } from '../theme/ThemeContext';
import { useThemedStyles } from '../theme/useThemedStyles';
import { radius, spacing, type AppColors } from '../theme/colors';
import { TEXT_RIGHT } from '../theme/align';

/** התראות שנסגרו — לפי המפתח שלהן (שכולל תאריך כשהן תלויות יום). */
const DISMISSED_KEY = 'reporting-hours/home-dismissed/v1';
const DISMISSED_MAX = 80;

type Data = { days: AgendaDay[]; alerts: HomeAlert[]; name: string };

export default function HomeScreen() {
  const router = useRouter();
  const styles = useThemedStyles(makeStyles);
  const { colors } = useTheme();
  const { basis } = usePayBasis();
  const { user } = useCloudSync();
  const { width } = useWindowDimensions();
  // null עד הטעינה בדפדפן: ב־web המסך מרונדר מראש בזמן הבנייה, ושעה שונה
  // בין הבנייה לדפדפן גורמת לאי־התאמה (hydration).
  const [now, setNow] = useState<Date | null>(null);
  const [data, setData] = useState<Data | null>(null);
  const [dismissed, setDismissed] = useState<string[]>([]);

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
        ]).then(([workplaces, reports, courses, accumulated, payroll, profile, gone]) => {
          if (!active) return;
          const at = new Date();
          setNow(at);
          setDismissed(gone);
          setData({
            days: agenda(courses, workplaces, reports, at),
            alerts: homeAlerts({ workplaces, courses, reports, accumulated, payroll, basis, now: at }),
            name: firstName(profile.fullName),
          });
        });
      void load();
      const off = onDataChanged(() => void load());
      return () => {
        active = false;
        off();
      };
    }, [basis]),
  );

  function dismiss(key: string) {
    const next = [...dismissed.filter((k) => k !== key), key].slice(-DISMISSED_MAX);
    setDismissed(next);
    void writeJSON(DISMISSED_KEY, next);
  }

  function runAction(alert: HomeAlert) {
    if (alert.action?.tel) void Linking.openURL(`tel:${alert.action.tel}`);
    else if (alert.action?.href) router.push(alert.action.href);
  }

  const name = data?.name || firstName(user?.name);
  const today = data?.days[0];
  const suggestion = today ? suggestedSession(today) : null;
  const reportHref: Href = suggestion
    ? { pathname: '/report', params: { course: suggestion.course.id, date: suggestion.date } }
    : '/report';
  const visibleAlerts = (data?.alerts ?? []).filter((a) => !dismissed.includes(a.key));
  const todayIso = now ? isoDate(now) : '';

  // כרטיס "מחר" מציץ מהצד: רוחב הכרטיס קצר מהמסך.
  const contentWidth = Math.min(width, 640);
  const cardWidth = Math.max(240, contentWidth - spacing.lg * 2 - 56);
  const todayCount = today?.items.length ?? 0;

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

      <Pressable
        onPress={() => router.push(reportHref)}
        accessibilityRole="button"
        accessibilityLabel="דיווח יום עבודה"
        style={({ pressed }) => [styles.reportBtn, pressed && styles.pressed]}
      >
        <View style={styles.reportIcon}>
          <Icon name="plus" size={32} color={colors.textOnBrand} />
        </View>
        <View style={styles.reportTexts}>
          <Text style={styles.reportTitle}>דיווח יום עבודה</Text>
          <Text style={styles.reportSub} numberOfLines={2}>
            {suggestion
              ? `${suggestion.course.name}\n${suggestion.time} · ממולא מראש`
              : 'בחירת קורס או מקום עבודה, שעות והפסקות'}
          </Text>
        </View>
      </Pressable>

      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>הלו״ז שלי</Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={cardWidth + spacing.sm}
        decelerationRate="fast"
        style={styles.carousel}
        contentContainerStyle={styles.carouselContent}
      >
        {(data?.days ?? []).map((day) => (
          <View key={day.key} style={[styles.dayCard, { width: cardWidth }]}>
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
                <Text style={styles.emptyText}>
                  אין קורסים מתוכננים. קורסים מגדירים במקום העבודה ←
                </Text>
              </Pressable>
            ) : (
              day.items.map((item) => (
                <SessionRow
                  key={item.course.id}
                  item={item}
                  onPress={
                    day.key === 'today' && item.status !== 'reported'
                      ? () =>
                          router.push({
                            pathname: '/report',
                            params: { course: item.course.id, date: item.date },
                          })
                      : undefined
                  }
                />
              ))
            )}
          </View>
        ))}
      </ScrollView>

      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>התראות ותזכורות</Text>
        {visibleAlerts.length ? <Text style={styles.sectionMeta}>{visibleAlerts.length}</Text> : null}
      </View>
      {data && visibleAlerts.length === 0 ? (
        <View style={styles.noAlerts}>
          <Icon name="bell-outline" size={20} color={colors.textMuted} />
          <Text style={styles.noAlertsText}>אין התראות חדשות</Text>
        </View>
      ) : (
        visibleAlerts.map((a) => (
          <AlertCard key={a.key} alert={a} onAction={() => runAction(a)} onDismiss={() => dismiss(a.key)} />
        ))
      )}

      <Pressable
        onPress={() => router.push('/dashboard')}
        accessibilityRole="link"
        style={({ pressed }) => [styles.dashLink, pressed && styles.pressed]}
      >
        <Icon name="view-dashboard-outline" size={24} color={colors.brand} />
        <Text style={styles.dashText}>לוח בקרה</Text>
        <Icon name="chevron-left" size={22} color={colors.textMuted} />
      </Pressable>
    </Screen>
  );
}

const STATUS_LABEL: Record<SessionStatus, string> = {
  reported: 'דווח',
  pending: 'ממתין לדיווח',
  now: 'עכשיו',
  later: 'בהמשך היום',
  tomorrow: '',
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
          : { bg: colors.background, fg: colors.textMuted };
  const taxi = isTaxi(item.workplace.arrivalMode);
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [styles.session, pressed && styles.pressed]}
      accessibilityRole={onPress ? 'button' : undefined}
    >
      <View style={styles.sessionTexts}>
        <Text style={styles.sessionName} numberOfLines={1}>
          {item.course.name}
        </Text>
        <Text style={styles.sessionMeta} numberOfLines={1}>
          {item.time} · {item.workplace.name}
        </Text>
      </View>
      {item.status === 'tomorrow' ? (
        taxi ? <Icon name="taxi" size={20} color={colors.textMuted} /> : null
      ) : (
        <View style={[styles.chip, { backgroundColor: tone.bg }]}>
          {item.status === 'reported' ? <Icon name="check-circle" size={14} color={tone.fg} /> : null}
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

    reportBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      minHeight: 104,
      padding: 20,
      borderRadius: radius.lg,
      backgroundColor: colors.brand,
      elevation: 3,
      shadowColor: '#000',
      shadowOpacity: 0.15,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
    },
    reportIcon: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: 'rgba(255,255,255,0.18)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    reportTexts: { flex: 1, gap: 4 },
    reportTitle: { fontSize: 22, fontWeight: '800', color: colors.textOnBrand, textAlign: TEXT_RIGHT },
    reportSub: { fontSize: 14, color: colors.textOnBrand, opacity: 0.9, textAlign: TEXT_RIGHT },

    sectionHead: {
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      marginTop: spacing.sm,
    },
    sectionTitle: { fontSize: 18, fontWeight: '700', color: colors.text, textAlign: TEXT_RIGHT },
    sectionMeta: { fontSize: 13, color: colors.textMuted },

    carousel: { marginHorizontal: -spacing.lg, flexGrow: 0 },
    carouselContent: { paddingHorizontal: spacing.lg, gap: spacing.sm, paddingBottom: 4 },
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
    dayDate: { fontSize: 14, color: colors.textMuted },
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
    sessionName: { fontSize: 16, fontWeight: '700', color: colors.text, textAlign: TEXT_RIGHT },
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

    dashLink: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      minHeight: 56,
      paddingHorizontal: spacing.md,
      marginTop: spacing.sm,
      borderRadius: radius.md,
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    dashText: { flex: 1, fontSize: 16, fontWeight: '700', color: colors.text, textAlign: TEXT_RIGHT },
  });
