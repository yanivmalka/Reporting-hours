import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Text } from '../components/Text';
import { Button } from '../components/Button';
import { Icon } from '../components/Icon';
import { Pressable } from '../components/Pressable';
import { Screen } from '../components/Screen';
import { EnterChevron } from '../components/Chevrons';
import { courseStatus, loadCourses, type Course } from '../lib/courses';
import { todayISO } from '../lib/time';
import { isArchived, loadWorkplaces, type Workplace } from '../lib/workplaces';
import { useTheme } from '../theme/ThemeContext';
import { useThemedStyles } from '../theme/useThemedStyles';
import { spacing, type AppColors } from '../theme/colors';
import { TEXT_RIGHT } from '../theme/align';
import { workplaceColor } from '../theme/workplaceColors';

const WEEKDAY_SHORT = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];

export default function WorkplacesScreen() {
  const router = useRouter();
  const styles = useThemedStyles(makeStyles);
  const { colors } = useTheme();
  const [courses, setCourses] = useState<Course[]>([]);
  const [workplaces, setWorkplaces] = useState<Workplace[] | null>(null);
  const [showArchive, setShowArchive] = useState(false);

  // נטען מחדש בכל כניסה למסך כדי לשקף שינויים שנעשו בטופס ובדיווחים.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      Promise.all([loadWorkplaces(), loadCourses()]).then(([list, c]) => {
        if (!active) return;
        setCourses(c);
        setWorkplaces(list);
      });
      return () => {
        active = false;
      };
    }, []),
  );



  if (workplaces === null) {
    return (
      <Screen scroll={false}>
        <View style={styles.center}>
          <ActivityIndicator color={colors.brand} />
        </View>
      </Screen>
    );
  }

  const today = todayISO();
  const active = workplaces.filter((w) => !isArchived(w));
  const byName = (a: Workplace, b: Workplace) => a.name.localeCompare(b.name, 'he');
  /** קבוצת המקום: פעיל — יש לו קורס פעיל; מתוכנן — רק קורסים מתוכננים; אחרת — בלי קורסים */
  const groupOf = (w: Workplace): 'active' | 'planned' | 'none' => {
    const st = courses.filter((c) => c.workplaceId === w.id).map((c) => courseStatus(c, today));
    return st.includes('active') ? 'active' : st.includes('planned') ? 'planned' : 'none';
  };
  const groups = (
    [
      { key: 'active', title: 'פעילים' },
      { key: 'planned', title: 'מתוכננים' },
      { key: 'none', title: 'ללא קורסים פעילים או מתוכננים' },
    ] as const
  )
    .map((g) => ({ ...g, list: active.filter((w) => groupOf(w) === g.key).sort(byName) }))
    .filter((g) => g.list.length > 0);

  /** ריבוע מקום עבודה: מספר הקורסים הפעילים והמתוכננים, והימים שבהם הם מתקיימים. */
  const Tile = ({ workplace }: { workplace: Workplace }) => {
    const mine = courses.filter((c) => c.workplaceId === workplace.id);
    const status = mine.map((c) => ({ c, s: courseStatus(c, today) }));
    const activeN = status.filter((x) => x.s === 'active').length;
    const plannedN = status.filter((x) => x.s === 'planned').length;
    const days = [...new Set(status.filter((x) => x.s !== 'ended').map((x) => x.c.weekday))].sort();
    return (
      <Pressable
        onPress={() => router.push({ pathname: '/workplace', params: { id: workplace.id } })}
        accessibilityRole="button"
        style={({ pressed }) => [
          styles.tile,
          { borderStartWidth: 5, borderStartColor: workplaceColor(colors, workplace) },
          pressed && { opacity: 0.85 },
        ]}
      >
        <Text style={styles.tileName} numberOfLines={3}>
          {workplace.name}
        </Text>
        <Text style={styles.tileLine}>
          <Text style={styles.tileNum}>{activeN}</Text> פעילים
        </Text>
        <Text style={styles.tileLine}>
          <Text style={styles.tileNum}>{plannedN}</Text> מתוכננים
        </Text>
        <View style={styles.tileFoot}>
          <Text style={styles.tileDays} numberOfLines={2}>
            {days.length ? `ימים: ${days.map((d) => WEEKDAY_SHORT[d]).join(' ')}` : 'אין קורסים'}
          </Text>
          <EnterChevron size={18} />
        </View>
      </Pressable>
    );
  };
  const archived = workplaces
    .filter(isArchived)
    .sort((a, b) => (b.archivedAt ?? 0) - (a.archivedAt ?? 0));

  return (
    <Screen>
      <View style={styles.intro}>
        <Text style={styles.title}>מקומות העבודה שלי</Text>
        <Text style={styles.subtitle}>
          לחיצה על מקום עבודה — תנאי שכר, קורסים ודוחות שכר.
        </Text>
      </View>

      {active.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>
            {archived.length ? 'אין מקומות עבודה פעילים.' : 'עדיין לא הוזנו מקומות עבודה.'}
          </Text>
        </View>
      ) : (
        groups.map((g) => (
          <View key={g.key} style={styles.group}>
            <Text style={styles.groupTitle}>
              {g.title} ({g.list.length})
            </Text>
            <View style={styles.grid}>
              {g.list.map((workplace) => (
                <Tile key={workplace.id} workplace={workplace} />
              ))}
            </View>
          </View>
        ))
      )}

      {archived.length ? (
        <>
          <Pressable
            onPress={() => setShowArchive((v) => !v)}
            accessibilityRole="button"
            accessibilityState={{ expanded: showArchive }}
            style={({ pressed }) => [styles.archiveHead, pressed && { opacity: 0.85 }]}
          >
            <Icon name="archive-outline" size={22} color={colors.textMuted} />
            <Text style={styles.archiveTitle}>ארכיון — מקומות עבודה לא פעילים ({archived.length})</Text>
            <Icon name={showArchive ? 'chevron-up' : 'chevron-down'} size={22} color={colors.textMuted} />
          </Pressable>
          {showArchive ? (
            <View style={styles.grid}>
              {archived.map((workplace) => (
                <Tile key={workplace.id} workplace={workplace} />
              ))}
            </View>
          ) : null}
        </>
      ) : null}

      <Text style={styles.hint}>
        העברה לארכיון (מקום שלא עובדים בו כרגע) — מתוך מסך מקום העבודה; הדיווחים וההיסטוריה נשמרים.
        מחיקה — בעריכה, לאשפה; מהאשפה אפשר לשחזר תוך 30 יום.
      </Text>

      <View style={styles.action}>
        <Button
          label="הוספת מקום עבודה"
          onPress={() => router.push('/workplace-form')}
        />
        <Button label="ארכיון ואשפה" variant="secondary" onPress={() => router.push('/archive')} />
      </View>
    </Screen>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    center: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    intro: {
      gap: spacing.sm,
    },
    title: {
      fontSize: 22,
      fontWeight: '800',
      color: colors.text,
      textAlign: TEXT_RIGHT,
    },
    subtitle: {
      fontSize: 14,
      lineHeight: 21,
      color: colors.textMuted,
      textAlign: TEXT_RIGHT,
    },
    group: { gap: spacing.sm },
    groupTitle: { fontSize: 15, fontWeight: '800', color: colors.textMuted, textAlign: TEXT_RIGHT },
    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
    },
    tile: {
      width: '48%',
      minHeight: 120,
      padding: spacing.md,
      gap: 4,
      borderRadius: 14,
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    tileFoot: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 'auto' },
    tileName: { fontSize: 16, fontWeight: '800', color: colors.text, textAlign: TEXT_RIGHT },
    tileLine: { fontSize: 14, color: colors.textMuted, textAlign: TEXT_RIGHT },
    tileNum: { fontSize: 16, fontWeight: '800', color: colors.text },
    tileDays: { flex: 1, fontSize: 13, color: colors.textMuted, textAlign: TEXT_RIGHT, marginTop: 2 },
    archiveHead: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      minHeight: 48,
      paddingHorizontal: spacing.md,
      borderRadius: 12,
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    archiveTitle: { flex: 1, fontSize: 15, fontWeight: '700', color: colors.textMuted, textAlign: TEXT_RIGHT },
    empty: {
      paddingVertical: spacing.xl,
      alignItems: 'center',
    },
    emptyText: {
      fontSize: 15,
      color: colors.textMuted,
    },
    hint: {
      fontSize: 12,
      color: colors.textMuted,
      textAlign: TEXT_RIGHT,
    },
    action: {
      marginTop: spacing.sm,
      gap: spacing.sm,
    },
  });
