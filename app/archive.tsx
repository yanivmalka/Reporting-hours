/**
 * ארכיון ואשפה — מסך אחד עם בורר בראשו (כמו בלוח הבקרה):
 *   - ארכיון: הצעות לסידור פריטים לא פעילים (lib/recommend.ts), מקומות עבודה
 *     בארכיון (עם החזרה לפעילים) וקורסים שתקופתם הסתיימה.
 *   - אשפה: מקומות עבודה שנמחקו, עם שחזור ומחיקה לצמיתות (components/TrashList).
 */
import { useCallback, useState } from 'react';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Text } from '../components/Text';
import { Pressable } from '../components/Pressable';
import { Icon } from '../components/Icon';
import { Screen } from '../components/Screen';
import { TrashList } from '../components/TrashList';
import { useConfirm } from '../components/ConfirmDialog';
import { useToast } from '../components/Toast';
import { courseScheduleLabel, loadCourses, reportsOfCourse, type Course } from '../lib/courses';
import { dateRange, shortDate } from '../lib/dashboard';
import { loadPayrollStatus, type StatusMap } from '../lib/payroll';
import {
  IDLE_DAYS,
  dismissRecommendation,
  loadDismissedRecommendations,
  recommendations,
  type Recommendation,
} from '../lib/recommend';
import { loadReports, type WorkReport } from '../lib/reports';
import { todayISO } from '../lib/time';
import { deleteOrEndCourse, trashWorkplaceWithData } from '../lib/trash';
import { isArchived, loadWorkplaces, setWorkplaceArchived, type Workplace } from '../lib/workplaces';
import { useTheme } from '../theme/ThemeContext';
import { useThemedStyles } from '../theme/useThemedStyles';
import { radius, spacing, type AppColors } from '../theme/colors';
import { TEXT_RIGHT } from '../theme/align';

type Tab = 'archive' | 'trash';

type Loaded = {
  workplaces: Workplace[];
  courses: Course[];
  reports: WorkReport[];
  statuses: StatusMap;
  dismissed: string[];
};

export default function ArchiveScreen() {
  const router = useRouter();
  const styles = useThemedStyles(makeStyles);
  const { colors } = useTheme();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const params = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<Tab>(params.tab === 'trash' ? 'trash' : 'archive');
  const [data, setData] = useState<Loaded | null>(null);

  const load = useCallback(async () => {
    const [workplaces, courses, reports, statuses, dismissed] = await Promise.all([
      loadWorkplaces(),
      loadCourses(),
      loadReports(),
      loadPayrollStatus(),
      loadDismissedRecommendations(),
    ]);
    setData({ workplaces, courses, reports, statuses, dismissed });
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const today = todayISO();
  const recs = data
    ? recommendations(data.workplaces, data.courses, data.reports, data.statuses, data.dismissed)
    : [];
  const archivedWps = (data?.workplaces ?? [])
    .filter(isArchived)
    .sort((a, b) => (b.archivedAt ?? 0) - (a.archivedAt ?? 0));
  const nameOf = (id: string) => data?.workplaces.find((w) => w.id === id)?.name ?? '';
  const endedCourses = (data?.courses ?? [])
    .filter((c) => c.to < today && data?.workplaces.some((w) => w.id === c.workplaceId))
    .sort((a, b) => b.to.localeCompare(a.to));

  async function later(r: Recommendation) {
    await dismissRecommendation(r.key);
    await load();
  }

  function apply(r: Recommendation) {
    if (r.kind === 'archive-workplace') {
      void (async () => {
        await setWorkplaceArchived(r.workplace.id, true);
        showToast(`"${r.workplace.name}" הועבר לארכיון`);
        await load();
      })();
      return;
    }
    if (r.kind === 'trash-workplace') {
      confirm({
        title: 'להעביר לאשפה?',
        message: `"${r.workplace.name}" יועבר לאשפה יחד עם הקורסים שלו. אפשר לשחזר תוך 30 יום.`,
        confirmLabel: 'העברה לאשפה',
        onConfirm: async () => {
          const ok = await trashWorkplaceWithData(r.workplace.id);
          if (!ok) await setWorkplaceArchived(r.workplace.id, true);
          showToast(ok ? `"${r.workplace.name}" הועבר לאשפה` : `"${r.workplace.name}" הועבר לארכיון`);
          await load();
        },
      });
      return;
    }
    confirm({
      title: 'למחוק את הקורס?',
      message: `"${r.course.name}" הסתיים ולא דווח עליו אף פעם. הוא יימחק.`,
      confirmLabel: 'מחיקת הקורס',
      onConfirm: async () => {
        await deleteOrEndCourse(r.course);
        showToast('הקורס נמחק');
        await load();
      },
    });
  }

  async function unarchive(w: Workplace) {
    await setWorkplaceArchived(w.id, false);
    showToast(`"${w.name}" הוחזר לפעילים`);
    await load();
  }

  return (
    <Screen>
      <View style={styles.pager} accessibilityRole="tablist">
        {(
          [
            ['archive', 'ארכיון'],
            ['trash', 'אשפה'],
          ] as [Tab, string][]
        ).map(([value, label]) => (
          <Pressable
            key={value}
            onPress={() => setTab(value)}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === value }}
            style={[styles.pageTab, tab === value && styles.pageTabOn]}
          >
            <Text style={[styles.pageTabText, tab === value && styles.pageTabTextOn]}>{label}</Text>
          </Pressable>
        ))}
      </View>

      {tab === 'trash' ? (
        <TrashList />
      ) : !data ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.brand} />
        </View>
      ) : (
        <>
          {recs.length ? (
            <>
              <Text style={styles.section}>הצעות לסידור</Text>
              <Text style={styles.muted}>
                פריטים שלא בשימוש. "לא עכשיו" מסתיר את ההצעה לאותו פריט.
              </Text>
              {recs.map((r) => (
                <RecommendationCard key={r.key} r={r} onApply={() => apply(r)} onLater={() => void later(r)} />
              ))}
            </>
          ) : null}

          <Text style={styles.section}>מקומות עבודה בארכיון</Text>
          {archivedWps.length === 0 ? (
            <Text style={styles.muted}>אין מקומות עבודה בארכיון.</Text>
          ) : (
            archivedWps.map((w) => (
              <View key={w.id} style={styles.card}>
                <Pressable
                  onPress={() => router.push({ pathname: '/workplace', params: { id: w.id } })}
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.cardMain, pressed && styles.pressed]}
                >
                  <Icon name="briefcase-outline" size={22} color={colors.textMuted} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={styles.name}>{w.name}</Text>
                    <Text style={styles.muted}>
                      {data.reports.filter((r) => r.workplaceId === w.id).length} דיווחים · הדיווחים והתשלומים נשמרים
                    </Text>
                  </View>
                  <Icon name="chevron-left" size={22} color={colors.textMuted} />
                </Pressable>
                <Pressable
                  onPress={() => void unarchive(w)}
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.smallBtn, pressed && styles.pressed]}
                >
                  <Text style={styles.smallBtnText}>החזרה לפעילים</Text>
                </Pressable>
              </View>
            ))
          )}

          <Text style={styles.section}>קורסים שהסתיימו</Text>
          {endedCourses.length === 0 ? (
            <Text style={styles.muted}>אין קורסים שהסתיימו.</Text>
          ) : (
            endedCourses.map((c) => (
              <Pressable
                key={c.id}
                onPress={() => router.push({ pathname: '/course-form', params: { id: c.id, view: '1' } })}
                accessibilityRole="button"
                style={({ pressed }) => [styles.card, styles.cardMain, pressed && styles.pressed]}
              >
                <Icon name="school-outline" size={22} color={colors.textMuted} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={styles.name}>{c.name}</Text>
                  <Text style={styles.muted}>
                    {nameOf(c.workplaceId)} · {courseScheduleLabel(c)}
                  </Text>
                  <Text style={styles.muted}>
                    {dateRange(c.from, c.to, true)} · {reportsOfCourse(c, data.reports).length} דיווחים
                  </Text>
                </View>
                <Icon name="chevron-left" size={22} color={colors.textMuted} />
              </Pressable>
            ))
          )}
        </>
      )}
      {confirm.dialog}
    </Screen>
  );

  function RecommendationCard({ r, onApply, onLater }: { r: Recommendation; onApply: () => void; onLater: () => void }) {
    const text =
      r.kind === 'archive-workplace'
        ? {
            icon: 'archive-arrow-down-outline',
            title: r.workplace.name,
            body: r.lastReport
              ? `אין קורס פעיל, והדיווח האחרון היה ב־${shortDate(r.lastReport)} (מעל ${IDLE_DAYS} יום). הדיווחים והתשלומים נשמרים.`
              : 'אין קורס פעיל ואין דיווחים, אבל נשלחו דוחות שכר — לכן רק ארכיון.',
            action: 'העברה לארכיון',
          }
        : r.kind === 'trash-workplace'
          ? {
              icon: 'delete-outline',
              title: r.workplace.name,
              body: 'אין קורס פעיל ולא דווח כאן אף פעם.',
              action: 'העברה לאשפה',
            }
          : {
              icon: 'delete-outline',
              title: r.course.name,
              body: `${r.workplace?.name ? `${r.workplace.name} · ` : ''}הסתיים ב־${shortDate(r.course.to)} ולא דווח עליו אף פעם.`,
              action: 'מחיקת הקורס',
            };
    return (
      <View style={styles.recCard}>
        <View style={styles.cardMain}>
          <Icon name={text.icon} size={22} color={colors.brand} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={styles.name}>{text.title}</Text>
            <Text style={styles.muted}>{text.body}</Text>
          </View>
        </View>
        <View style={styles.recActions}>
          <Pressable
            onPress={onApply}
            accessibilityRole="button"
            style={({ pressed }) => [styles.smallBtn, styles.smallBtnOn, pressed && styles.pressed]}
          >
            <Text style={[styles.smallBtnText, styles.smallBtnTextOn]}>{text.action}</Text>
          </Pressable>
          <Pressable
            onPress={onLater}
            accessibilityRole="button"
            style={({ pressed }) => [styles.smallBtn, pressed && styles.pressed]}
          >
            <Text style={styles.smallBtnText}>לא עכשיו</Text>
          </Pressable>
        </View>
      </View>
    );
  }
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    center: { paddingVertical: spacing.xl, alignItems: 'center' },
    pressed: { opacity: 0.85 },
    pager: {
      flexDirection: 'row',
      padding: 3,
      gap: 2,
      borderRadius: 22,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    pageTab: { flex: 1, minHeight: 40, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
    pageTabOn: { backgroundColor: colors.brand },
    pageTabText: { fontSize: 14, fontWeight: '700', color: colors.text },
    pageTabTextOn: { color: colors.textOnBrand },
    section: { marginTop: spacing.sm, fontSize: 17, fontWeight: '800', color: colors.text, textAlign: TEXT_RIGHT },
    muted: { fontSize: 13, color: colors.textMuted, textAlign: TEXT_RIGHT },
    name: { fontSize: 16, fontWeight: '700', color: colors.text, textAlign: TEXT_RIGHT },
    card: {
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      borderRadius: 16,
      padding: 14,
      gap: spacing.sm,
    },
    cardMain: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    recCard: {
      backgroundColor: colors.brandLight,
      borderRadius: 16,
      padding: 14,
      gap: spacing.sm,
    },
    recActions: { flexDirection: 'row', gap: spacing.sm },
    smallBtn: {
      minHeight: 40,
      paddingHorizontal: spacing.md,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
      alignSelf: 'flex-start',
    },
    smallBtnOn: { backgroundColor: colors.brand, borderColor: colors.brand },
    smallBtnText: { fontSize: 14, fontWeight: '700', color: colors.text },
    smallBtnTextOn: { color: colors.textOnBrand },
  });
