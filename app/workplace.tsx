/**
 * פירוט מקום עבודה (צלילה מלוח הבקרה): התשלום הבא, החודש הנוכחי מול
 * התכנון, תנאים כלליים (תעריף, מס, סוג תשלום, שוטף +), קורסים פעילים,
 * ודוחות השכר האחרונים — כל אחד עם שלבי דיווח → שליחה → תשלום ועם רשימת
 * הדיווחים (ומפגשים שעוד לא דווחו).
 */
import { useCallback, useState } from 'react';
import { Redirect, Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Text } from '../components/Text';
import { Button } from '../components/Button';
import { money } from '../components/ForecastChart';
import { Icon } from '../components/Icon';
import { Pressable } from '../components/Pressable';
import { Screen } from '../components/Screen';
import { useToast } from '../components/Toast';
import { academicOf, loadReports, type WorkReport } from '../lib/reports';
import {
  courseReported,
  courseScheduleLabel,
  loadCourses,
  occurrences,
  timeRange,
  type Course,
} from '../lib/courses';
import { dateRange, isoDate, monthName, shortDate } from '../lib/dashboard';
import { plannedFor, recentForecasts, STATUS_LABEL, type PeriodForecast } from '../lib/forecast';
import { reportPay } from '../lib/pay';
import { usePayBasis } from '../lib/payBasis';
import { loadPayrollStatus, type StatusMap } from '../lib/payroll';
import { parseTime } from '../lib/time';
import {
  ARRIVAL_MODE_LABELS,
  deadlineLabel,
  isArchived,
  loadWorkplaces,
  setWorkplaceArchived,
  paymentTermsLabel,
  taxPercentOf,
  type Workplace,
} from '../lib/workplaces';
import { useTheme } from '../theme/ThemeContext';
import { useThemedStyles } from '../theme/useThemedStyles';
import { radius, spacing, type AppColors } from '../theme/colors';
import { TEXT_RIGHT } from '../theme/align';

const WEEKDAY_SHORT = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];

type Loaded = { workplace: Workplace; reports: WorkReport[]; courses: Course[]; statuses: StatusMap };

type StepState = 'done' | 'now' | 'todo';

export default function WorkplaceDetailScreen() {
  const router = useRouter();
  const styles = useThemedStyles(makeStyles);
  const { colors } = useTheme();
  const { basis } = usePayBasis();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [data, setData] = useState<Loaded | null | undefined>(undefined);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [showEnded, setShowEnded] = useState(false);
  const [reloadTick, setReloadTick] = useState(0);
  const { showToast } = useToast();

  useFocusEffect(
    useCallback(() => {
      let active = true;
      Promise.all([loadWorkplaces(), loadReports(), loadCourses(), loadPayrollStatus()]).then(
        ([list, reports, courses, statuses]) => {
          if (!active) return;
          const workplace = list.find((w) => w.id === id);
          setData(
            workplace
              ? {
                  workplace,
                  reports: reports.filter((r) => r.workplaceId === workplace.id),
                  courses: courses.filter((c) => c.workplaceId === workplace.id),
                  statuses,
                }
              : null,
          );
        },
      );
      return () => {
        active = false;
      };
    }, [id, reloadTick]),
  );

  if (data === undefined) {
    return (
      <Screen scroll={false}>
        <View style={styles.center}>
          <ActivityIndicator color={colors.brand} />
        </View>
      </Screen>
    );
  }
  if (data === null) {
    // מקום עבודה שנמחק או הועבר לאשפה — לא משאירים מסך ריק, חוזרים לרשימה.
    return <Redirect href="/workplaces" />;
  }

  const { workplace: w, reports, courses, statuses } = data;
  const now = new Date();
  const today = isoDate(now);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const forecasts = recentForecasts(w, 4, reports, courses, statuses, basis, now).filter(
    (f, i) => i === 0 || f.reported > 0 || f.planned > 0,
  );
  const current = forecasts[0];
  const tax = taxPercentOf(w);
  const netOf = (f: PeriodForecast) => f.reportedPay * (1 - tax / 100) + (f.reported - f.reportedPay);

  // התשלום הבא: הדוח הישן ביותר שנסגר ועוד לא שולם; אחרת — התקופה הנוכחית.
  const unpaid = forecasts
    .filter((f) => (f.status === 'closed' || f.status === 'sent') && f.reported > 0)
    .sort((a, b) => a.period.start.localeCompare(b.period.start));
  const next = unpaid[0] ?? current;
  const lastClosed = forecasts.find((f) => f.status !== 'open' && f.status !== 'planned' && f.reportCount > 0);

  // מפגשים שהתקיימו (עד עכשיו) ולא דווחו — לפי תקופה.
  const missingIn = (f: PeriodForecast) =>
    courses
      .flatMap((c) =>
        occurrences(c, f.period.start, f.period.end < today ? f.period.end : today)
          .filter((d) => d < today || (parseTime(c.end) ?? 0) <= nowMin)
          .filter((d) => !courseReported(c, d, reports))
          .map((date) => ({ course: c, date })),
      )
      .sort((a, b) => b.date.localeCompare(a.date));

  const activeCourses = courses
    .filter((c) => c.to >= today)
    .sort((a, b) => a.weekday - b.weekday || a.start.localeCompare(b.start));
  // ארכיון קורסים: קורסים שתקופתם הסתיימה — מהאחרון שהסתיים.
  const endedCourses = courses.filter((c) => c.to < today).sort((a, b) => b.to.localeCompare(a.to));
  const archived = isArchived(w);

  async function toggleArchive() {
    await setWorkplaceArchived(w.id, !archived);
    showToast(archived ? 'מקום העבודה הוחזר לפעילים' : 'מקום העבודה הועבר לארכיון');
    setReloadTick((n) => n + 1);
  }

  const isOpen = (key: string, i: number) => open[key] ?? i === 0;

  return (
    <Screen>
      <Stack.Screen options={{ title: w.name }} />
      {archived ? (
        <View style={styles.archivedBanner}>
          <Icon name="archive-outline" size={20} color={colors.textMuted} />
          <Text style={styles.archivedText}>
            מקום העבודה בארכיון — לא מוצג בלו״ז, בתזכורות ובבחירה לדיווח חדש. הדיווחים והתשלומים נשמרים.
          </Text>
        </View>
      ) : null}

      <View style={styles.hero}>
        <Text style={styles.heroLabel}>{next === current ? 'התקופה הנוכחית' : 'התשלום הבא'}</Text>
        <View style={styles.heroAmountRow}>
          <Text style={styles.heroAmount}>{money(next.reported)}</Text>
          {tax > 0 ? <Text style={styles.heroSub}>ברוטו · {money(netOf(next))} נטו</Text> : null}
        </View>
        <Text style={styles.heroLine}>
          עבור {monthName(next.period.start.slice(0, 7))} · צפי {shortDate(next.expected)} ({paymentTermsLabel(w)})
        </Text>
        <View style={styles.heroTiles}>
          <View style={styles.heroTile}>
            <Text style={styles.heroTileLabel}>החודש — דווח</Text>
            <Text style={styles.heroTileValue}>{money(current.reported)}</Text>
          </View>
          <View style={styles.heroTile}>
            <Text style={styles.heroTileLabel}>החודש — לפי תכנון</Text>
            <Text style={styles.heroTileValue}>{money(current.planned)}</Text>
          </View>
        </View>
      </View>

      <Text style={styles.section}>כללי</Text>
      <View style={styles.card}>
        <InfoRow
          label="מחיר שעה"
          value={
            w.paymentType === 'monthly'
              ? `${money(w.rate)} לחודש`
              : `${money(w.rate)} לשעה ${basis === 'academic' ? 'אקדמית' : 'רגילה'}`
          }
        />
        <InfoRow label="סוג תשלום" value={w.paymentType === 'monthly' ? 'חודשי' : 'שעתי'} />
        <InfoRow label="אחוז מס" value={`${tax}%`} />
        <InfoRow label="תנאי תשלום" value={paymentTermsLabel(w)} />
        <InfoRow label="יום אחרון לדיווח שכר" value={deadlineLabel(w)} />
        <InfoRow label="תקופת שכר" value={w.payday === 1 ? '1 עד סוף החודש' : `מה־${w.payday} בחודש עד ה־${w.payday - 1} בחודש הבא`} />
        <InfoRow label="אופן הגעה" value={ARRIVAL_MODE_LABELS[w.arrivalMode]} last={!w.address} />
        {w.address ? <InfoRow label="כתובת" value={w.address} last /> : null}
      </View>

      <View style={styles.sectionRow}>
        <Text style={styles.section}>קורסים פעילים</Text>
        <Text style={styles.muted}>{activeCourses.length}</Text>
      </View>
      {activeCourses.length === 0 ? (
        <View style={styles.card}>
          <Text style={styles.muted}>אין קורסים פעילים. מוסיפים קורסים בעריכת מקום העבודה.</Text>
        </View>
      ) : (
        activeCourses.map((c) => {
          const count = occurrences(c, current.period.start, current.period.end).length;
          const amount = plannedFor(w, [c], current.period, basis);
          return (
            <Pressable
              key={c.id}
              onPress={() => router.push({ pathname: '/course-form', params: { id: c.id, view: '1' } })}
              style={({ pressed }) => [styles.card, styles.courseCard, pressed && styles.pressed]}
            >
              <Text style={styles.courseName}>{c.name}</Text>
              <Text style={styles.muted}>
                {courseScheduleLabel(c)} · {dateRange(c.from, c.to, true)}
              </Text>
              <Text style={styles.small}>
                החודש: {count} מפגשים · {money(amount)} לפי תכנון
              </Text>
            </Pressable>
          );
        })
      )}

      {endedCourses.length ? (
        <>
          <Pressable
            onPress={() => setShowEnded((v) => !v)}
            accessibilityRole="button"
            accessibilityState={{ expanded: showEnded }}
            style={({ pressed }) => [styles.sectionRow, pressed && styles.pressed]}
          >
            <Text style={styles.section}>ארכיון קורסים שהסתיימו</Text>
            <View style={styles.archiveCount}>
              <Text style={styles.muted}>{endedCourses.length}</Text>
              <Icon name={showEnded ? 'chevron-up' : 'chevron-down'} size={20} color={colors.textMuted} />
            </View>
          </Pressable>
          {showEnded
            ? endedCourses.map((c) => (
                <Pressable
                  key={c.id}
                  onPress={() => router.push({ pathname: '/course-form', params: { id: c.id, view: '1' } })}
                  style={({ pressed }) => [styles.card, styles.courseCard, styles.endedCard, pressed && styles.pressed]}
                >
                  <Text style={styles.courseName}>{c.name}</Text>
                  <Text style={styles.muted}>
                    {courseScheduleLabel(c)} · {dateRange(c.from, c.to, true)}
                  </Text>
                </Pressable>
              ))
            : null}
        </>
      ) : null}

      <Text style={styles.section}>דוחות שכר ודיווחים אחרונים</Text>
      {forecasts.map((f, i) => {
        const key = f.period.start;
        const missing = missingIn(f);
        const expanded = isOpen(key, i);
        const reportStep: StepState =
          f.status === 'open' || missing.length > 0 ? 'now' : f.status === 'planned' ? 'todo' : 'done';
        const sendStep: StepState = f.sentAt ? 'done' : f.status === 'closed' ? 'now' : 'todo';
        const payStep: StepState = f.paidAt ? 'done' : f.status === 'sent' ? 'now' : 'todo';
        const list = reports
          .filter((r) => r.date >= f.period.start && r.date <= f.period.end)
          .sort((a, b) => b.date.localeCompare(a.date) || b.start.localeCompare(a.start));
        return (
          <View key={key} style={styles.payroll}>
            <Pressable
              onPress={() => setOpen((o) => ({ ...o, [key]: !expanded }))}
              accessibilityRole="button"
              accessibilityState={{ expanded }}
              style={styles.payrollHead}
            >
              <View style={styles.payrollTitleRow}>
                <Text style={styles.payrollTitle}>
                  {monthName(f.period.start.slice(0, 7))} · {STATUS_LABEL[f.status]}
                </Text>
                <Text style={styles.payrollAmount}>
                  {f.status === 'open' && f.planned > 0
                    ? `${money(f.reported)} מתוך ${money(f.planned)}`
                    : money(f.reported)}
                </Text>
                <Icon name={expanded ? 'chevron-up' : 'chevron-down'} size={20} color={colors.textMuted} />
              </View>
              <View style={styles.steps}>
                <Step
                  label="דיווח"
                  detail={`${f.reportCount} דיווחים${missing.length ? ` · ${missing.length} חסרים` : ''}`}
                  state={reportStep}
                />
                <Step
                  label="שליחה"
                  detail={f.sentAt ? `נשלח ${shortDate(isoDate(new Date(f.sentAt)))}` : f.status === 'closed' ? 'ממתין' : `אחרי ${shortDate(f.period.end)}`}
                  state={sendStep}
                />
                <Step
                  label="תשלום"
                  detail={f.paidAt ? `שולם ${shortDate(f.paidAt)}` : `צפי ${shortDate(f.expected)}`}
                  state={payStep}
                />
              </View>
            </Pressable>

            {expanded ? (
              <View style={styles.payrollBody}>
                {missing.map((m) => (
                  <Pressable
                    key={`${m.course.id}@${m.date}`}
                    onPress={() =>
                      router.push({ pathname: '/report', params: { course: m.course.id, date: m.date } })
                    }
                    style={({ pressed }) => [styles.reportRow, pressed && styles.pressed]}
                  >
                    <DayBox date={m.date} />
                    <View style={styles.reportTexts}>
                      <Text style={styles.reportCourse} numberOfLines={1}>
                        {m.course.name}
                      </Text>
                      <Text style={styles.muted}>{timeRange(m.course.start, m.course.end)} · לחיצה לדיווח</Text>
                    </View>
                    <Chip text="חסר" bg={colors.background} fg={colors.warning} />
                  </Pressable>
                ))}
                {list.map((r) => {
                  const ac = academicOf(r);
                  const pay = reportPay(r, w, basis);
                  const status = f.paidAt ? 'שולם' : f.sentAt ? 'נשלח' : 'דווח';
                  return (
                    <Pressable
                      key={r.id}
                      onPress={() => router.push({ pathname: '/report-view', params: { id: r.id } })}
                      style={({ pressed }) => [styles.reportRow, pressed && styles.pressed]}
                    >
                      <DayBox date={r.date} />
                      <View style={styles.reportTexts}>
                        <Text style={styles.reportCourse} numberOfLines={1}>
                          {r.note || 'דיווח'}
                        </Text>
                        <Text style={styles.muted}>
                          {timeRange(r.start, r.end)}
                          {ac ? ` · ${Math.round(ac.decimalHours * 10) / 10} שע׳ אקד׳` : ''}
                          {pay != null ? ` · ${money(pay)}` : ''}
                        </Text>
                      </View>
                      <Chip
                        text={status}
                        bg={colors.brandLight}
                        fg={status === 'שולם' ? colors.brandDark : colors.brand}
                      />
                    </Pressable>
                  );
                })}
                {list.length === 0 && missing.length === 0 ? (
                  <Text style={[styles.muted, { paddingVertical: spacing.sm }]}>אין דיווחים בתקופה.</Text>
                ) : null}
              </View>
            ) : null}
          </View>
        );
      })}

      <View style={styles.actions}>
        {lastClosed ? (
          <Button
            label={`דוח השכר של ${monthName(lastClosed.period.start.slice(0, 7))}`}
            onPress={() =>
              router.push({ pathname: '/payroll-report', params: { wp: w.id, start: lastClosed.period.start } })
            }
          />
        ) : null}
        <Button
          label="עריכת מקום העבודה והקורסים"
          variant="secondary"
          onPress={() => router.push({ pathname: '/workplace-form', params: { id: w.id } })}
        />
        <Button
          label={archived ? 'החזרה ממקומות לא פעילים' : 'העברה לארכיון'}
          variant="secondary"
          onPress={() => void toggleArchive()}
        />
      </View>
    </Screen>
  );

  function InfoRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
    return (
      <View style={[styles.infoRow, last && styles.infoRowLast]}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue}>{value}</Text>
      </View>
    );
  }

  function Step({ label, detail, state }: { label: string; detail: string; state: StepState }) {
    const tone =
      state === 'done'
        ? { bg: colors.brandLight, fg: colors.brandDark, dot: colors.brand }
        : state === 'now'
          ? { bg: colors.background, fg: colors.warning, dot: colors.warning }
          : { bg: colors.background, fg: colors.textMuted, dot: colors.border };
    return (
      <View style={[styles.step, { backgroundColor: tone.bg }]}>
        <View style={[styles.stepDot, { backgroundColor: tone.dot }]} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.stepLabel, { color: tone.fg }]}>{label}</Text>
          <Text style={[styles.stepDetail, { color: tone.fg }]} numberOfLines={2}>
            {detail}
          </Text>
        </View>
      </View>
    );
  }

  function DayBox({ date }: { date: string }) {
    const [y, m, d] = date.split('-').map(Number);
    return (
      <View style={styles.dayBox}>
        <Text style={styles.dayNum}>{d}</Text>
        <Text style={styles.small}>{WEEKDAY_SHORT[new Date(y, m - 1, d).getDay()]}</Text>
      </View>
    );
  }

  function Chip({ text, bg, fg }: { text: string; bg: string; fg: string }) {
    return (
      <View style={[styles.chip, { backgroundColor: bg }]}>
        <Text style={[styles.chipText, { color: fg }]}>{text}</Text>
      </View>
    );
  }
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    archivedBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      padding: spacing.md,
      borderRadius: radius.md,
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    archivedText: { flex: 1, fontSize: 14, color: colors.textMuted, textAlign: TEXT_RIGHT },
    archiveCount: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    endedCard: { opacity: 0.75 },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    pressed: { opacity: 0.8 },
    muted: { fontSize: 13, color: colors.textMuted, textAlign: TEXT_RIGHT },
    small: { fontSize: 12, color: colors.textMuted, textAlign: TEXT_RIGHT },

    hero: { backgroundColor: colors.brand, borderRadius: 18, padding: spacing.md, gap: spacing.sm },
    heroLabel: { fontSize: 13, color: colors.textOnBrand, opacity: 0.9, textAlign: TEXT_RIGHT },
    heroAmountRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm },
    heroAmount: { fontSize: 28, fontWeight: '800', color: colors.textOnBrand },
    heroSub: { fontSize: 14, color: colors.textOnBrand, opacity: 0.9 },
    heroLine: { fontSize: 14, color: colors.textOnBrand, textAlign: TEXT_RIGHT },
    heroTiles: { flexDirection: 'row', gap: spacing.sm },
    heroTile: { flex: 1, backgroundColor: 'rgba(255,255,255,0.14)', borderRadius: radius.md, padding: 10, gap: 2 },
    heroTileLabel: { fontSize: 12, color: colors.textOnBrand, opacity: 0.9, textAlign: TEXT_RIGHT },
    heroTileValue: { fontSize: 18, fontWeight: '800', color: colors.textOnBrand, textAlign: TEXT_RIGHT },

    section: { marginTop: spacing.sm, fontSize: 17, fontWeight: '800', color: colors.text, textAlign: TEXT_RIGHT },
    sectionRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
    card: {
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      borderRadius: 16,
      paddingHorizontal: 14,
      paddingVertical: 4,
    },
    infoRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: spacing.md,
      paddingVertical: 11,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    infoRowLast: { borderBottomWidth: 0 },
    infoLabel: { fontSize: 15, color: colors.textMuted },
    infoValue: { flexShrink: 1, fontSize: 15, fontWeight: '600', color: colors.text, textAlign: TEXT_RIGHT },
    courseCard: { paddingVertical: 12, gap: 3 },
    courseName: { fontSize: 15, fontWeight: '700', color: colors.text, textAlign: TEXT_RIGHT },

    payroll: {
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      borderRadius: 16,
      overflow: 'hidden',
    },
    payrollHead: { padding: 14, gap: 10 },
    payrollTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    payrollTitle: { flex: 1, fontSize: 15, fontWeight: '700', color: colors.text, textAlign: TEXT_RIGHT },
    payrollAmount: { fontSize: 15, fontWeight: '700', color: colors.text },
    steps: { flexDirection: 'row', gap: 6 },
    step: { flex: 1, flexDirection: 'row', gap: 6, padding: 8, borderRadius: 10 },
    stepDot: { width: 8, height: 8, borderRadius: 4, marginTop: 5 },
    stepLabel: { fontSize: 12, fontWeight: '800', textAlign: TEXT_RIGHT },
    stepDetail: { fontSize: 11, textAlign: TEXT_RIGHT },
    payrollBody: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
      paddingHorizontal: 14,
      paddingBottom: 6,
    },
    reportRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
      minHeight: 52,
    },
    dayBox: { width: 40, alignItems: 'center' },
    dayNum: { fontSize: 16, fontWeight: '700', color: colors.text },
    reportTexts: { flex: 1, gap: 2 },
    reportCourse: { fontSize: 14, fontWeight: '600', color: colors.text, textAlign: TEXT_RIGHT },
    chip: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 10 },
    chipText: { fontSize: 12, fontWeight: '700' },
    actions: { gap: spacing.sm, marginTop: spacing.sm },
  });
