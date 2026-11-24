/**
 * יומן פעולות (lib/activityLog.ts): כל שינוי בדיווחים — מי, מתי, מאיזה מכשיר, ומה השתנה.
 * לחיצה על רשומה פותחת את הפרטים (לפני ← אחרי), ומשם: שחזור דיווח שנמחק, החזרת גרסה קודמת
 * או ביטול יצירה (lib/activityUndo.ts) — אחרי אישור. רשומה שבוטלה מציינת זאת.
 */
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { Text } from '../components/Text';
import { Pressable } from '../components/Pressable';
import { Icon } from '../components/Icon';
import { Screen } from '../components/Screen';
import { Button } from '../components/Button';
import { LoadingScreen } from '../components/LoadingScreen';
import { useConfirm } from '../components/ConfirmDialog';
import { useToast } from '../components/Toast';
import { useAccess } from '../components/Access';
import { useScreenData } from '../components/useScreenData';
import { ACTION_LABELS, loadLog, type LogAction, type LogEntry } from '../lib/activityLog';
import { applyUndo, planUndo, undoLabel } from '../lib/activityUndo';
import { reportChanges } from '../lib/reportEdit';
import { loadReports, totalBreakMinutes, type WorkReport } from '../lib/reports';
import { loadWorkplaces, type Workplace } from '../lib/workplaces';
import { loadCourses, type Course } from '../lib/courses';
import { formatISODate, formatTime } from '../lib/time';
import { isoDate } from '../lib/dates';
import { useThemedStyles } from '../theme/useThemedStyles';
import { useTheme } from '../theme/ThemeContext';
import { cardShadow, radius, spacing, type AppColors } from '../theme/colors';
import { TEXT_RIGHT } from '../theme/align';

type Loaded = { log: LogEntry[]; reports: WorkReport[]; workplaces: Workplace[]; courses: Course[] };

const ICONS: Record<LogAction, string> = {
  create: 'plus-circle-outline',
  update: 'pencil-outline',
  delete: 'delete-outline',
  restore: 'restore',
  undo: 'undo-variant',
  mail: 'email-outline',
  'sync-dropped': 'sync-alert',
};

const clock = (at: number) => {
  const d = new Date(at);
  return formatTime(d.getHours() * 60 + d.getMinutes());
};

export default function ActivityScreen() {
  const styles = useThemedStyles(makeStyles);
  const { colors } = useTheme();
  const router = useRouter();
  const confirm = useConfirm();
  const { showToast } = useToast();
  const { canReport } = useAccess();
  const [open, setOpen] = useState<string | null>(null);
  const { data, reload } = useScreenData<Loaded>(
    async () => {
      const [log, reports, workplaces, courses] = await Promise.all([loadLog(), loadReports(), loadWorkplaces(), loadCourses()]);
      return { log, reports, workplaces, courses };
    },
    [],
  );
  if (!data) return <LoadingScreen />;

  const wpName = (id: string) => data.workplaces.find((w) => w.id === id)?.name ?? '';
  const courseName = (id: string | undefined) => (id ? data.courses.find((c) => c.id === id)?.name ?? '' : '');
  const names = { workplace: wpName, course: courseName };
  const summary = (r: WorkReport) =>
    [r.note || courseName(r.courseId) || wpName(r.workplaceId), formatISODate(r.date), `\u2066${r.start}–${r.end}\u2069`]
      .filter(Boolean)
      .join(' · ');
  const undoneBy = (e: LogEntry) => data.log.find((x) => x.undoOf === e.id);
  const tone = (a: LogAction) =>
    a === 'delete' || a === 'sync-dropped' ? colors.danger : a === 'create' || a === 'mail' || a === 'restore' ? colors.success : colors.brand;

  function askUndo(e: LogEntry) {
    const plan = planUndo(e, data!.reports, data!.log);
    if (!plan.ok) {
      showToast(plan.reason);
      return;
    }
    const target = plan.kind === 'remove' ? e.after : e.before;
    confirm({
      title: `${plan.label}?`,
      message: target ? summary(target) : undefined,
      confirmLabel: plan.label,
      destructive: plan.kind === 'remove',
      onConfirm: async () => {
        const err = await applyUndo(e, data!.log);
        if (err) showToast(err);
        else showToast('בוצע · נרשם ביומן');
        reload();
      },
    });
  }

  // קיבוץ לפי יום
  const days: { day: string; items: LogEntry[] }[] = [];
  for (const e of data.log) {
    const day = isoDate(new Date(e.at));
    const last = days[days.length - 1];
    if (last?.day === day) last.items.push(e);
    else days.push({ day, items: [e] });
  }

  return (
    <Screen>
      <Text style={styles.intro}>
        כל שינוי בדיווחים — מי, מתי ומאיזה מכשיר. לחיצה על רשומה מציגה מה השתנה, ומשם אפשר לשחזר דיווח שנמחק או
        להחזיר גרסה קודמת. נשמר 90 יום.
      </Text>
      {days.length === 0 ? <Text style={styles.empty}>עוד אין פעולות ביומן.</Text> : null}
      {days.map(({ day, items }) => (
        <View key={day} style={styles.group}>
          <Text style={styles.dayTitle}>{formatISODate(day)}</Text>
          {items.map((e) => {
            const r = e.after ?? e.before;
            const isOpen = open === e.id;
            const undone = undoneBy(e);
            const label = canReport && !undone ? undoLabel(e) : null;
            const exists = data.reports.some((x) => x.id === e.entityId);
            const changes = e.before && e.after ? reportChanges(e.before, e.after, names) : [];
            return (
              <Pressable
                key={e.id}
                onPress={() => setOpen(isOpen ? null : e.id)}
                accessibilityRole="button"
                style={({ pressed }) => [styles.card, pressed && styles.pressed]}
              >
                <View style={styles.row}>
                  <Icon name={ICONS[e.action]} size={20} color={tone(e.action)} />
                  <Text style={[styles.action, { color: tone(e.action) }]}>{ACTION_LABELS[e.action]}</Text>
                  <Text style={styles.time}>{clock(e.at)}</Text>
                </View>
                {r ? <Text style={styles.summary}>{summary(r)}</Text> : null}
                <Text style={styles.meta}>
                  {[e.who?.name || e.who?.email || (e.device === 'server' ? 'השרת (מייל)' : 'לא ידוע'), e.device !== 'server' ? e.device : null]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
                {undone ? <Text style={styles.undone}>בוטל / שוחזר ב־{formatISODate(isoDate(new Date(undone.at)))} {clock(undone.at)}</Text> : null}
                {isOpen ? (
                  <View style={styles.details}>
                    {changes.map((c) => (
                      <Text key={c.field} style={[styles.change, c.critical && { color: colors.danger }]}>
                        {c.critical ? '⚠ ' : ''}
                        {c.label}: {c.from} ← {c.to}
                      </Text>
                    ))}
                    {!changes.length && r ? (
                      <Text style={styles.change}>
                        {wpName(r.workplaceId)} · הפסקות {totalBreakMinutes(r.breaks) || 'ללא'}
                        {r.viaEmail ? ' · התקבל במייל' : ''}
                      </Text>
                    ) : null}
                    {e.action === 'sync-dropped' ? (
                      <Text style={styles.change}>
                        הדיווח נמחק במכשיר אחד ושונה במקביל באחר. המחיקה גברה, וזו הגרסה ששונתה.
                      </Text>
                    ) : null}
                    {exists ? (
                      <Pressable
                        onPress={() => router.push({ pathname: '/report-view', params: { id: e.entityId } })}
                        accessibilityRole="link"
                        style={styles.linkRow}
                      >
                        <Text style={styles.link}>לתצוגת הדיווח ‹</Text>
                      </Pressable>
                    ) : null}
                    {label ? <Button label={label} variant="secondary" onPress={() => askUndo(e)} /> : null}
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      ))}
      {confirm.dialog}
    </Screen>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    intro: { fontSize: 14, lineHeight: 21, color: colors.textMuted, textAlign: TEXT_RIGHT },
    empty: { fontSize: 15, color: colors.textMuted, textAlign: TEXT_RIGHT, paddingVertical: spacing.lg },
    group: { gap: spacing.sm },
    dayTitle: { fontSize: 15, fontWeight: '800', color: colors.text, textAlign: TEXT_RIGHT, marginTop: spacing.sm },
    card: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, gap: 4, ...cardShadow },
    pressed: { opacity: 0.85 },
    row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    action: { flex: 1, fontSize: 15, fontWeight: '700', textAlign: TEXT_RIGHT },
    time: { fontSize: 13, color: colors.textMuted },
    summary: { fontSize: 14, color: colors.text, textAlign: TEXT_RIGHT },
    meta: { fontSize: 12, color: colors.textMuted, textAlign: TEXT_RIGHT },
    undone: { fontSize: 12, color: colors.warning, fontWeight: '700', textAlign: TEXT_RIGHT },
    details: { gap: spacing.xs, marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
    change: { fontSize: 14, color: colors.text, textAlign: TEXT_RIGHT },
    linkRow: { paddingVertical: spacing.xs },
    link: { fontSize: 14, color: colors.brand, fontWeight: '700', textAlign: TEXT_RIGHT },
  });
