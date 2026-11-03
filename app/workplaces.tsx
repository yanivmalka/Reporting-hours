import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Text } from '../components/Text';
import { Button } from '../components/Button';
import { Icon } from '../components/Icon';
import { Pressable } from '../components/Pressable';
import { Screen } from '../components/Screen';
import { WorkplaceCard } from '../components/WorkplaceCard';
import { loadCourses, type Course } from '../lib/courses';
import { workplaceMonthStats } from '../lib/dashboard';
import { loadReports, type WorkReport } from '../lib/reports';
import { isArchived, loadWorkplaces, type Workplace } from '../lib/workplaces';
import { useTheme } from '../theme/ThemeContext';
import { useThemedStyles } from '../theme/useThemedStyles';
import { spacing, type AppColors } from '../theme/colors';
import { TEXT_RIGHT } from '../theme/align';

export default function WorkplacesScreen() {
  const router = useRouter();
  const styles = useThemedStyles(makeStyles);
  const { colors } = useTheme();
  const [courses, setCourses] = useState<Course[]>([]);
  const [workplaces, setWorkplaces] = useState<Workplace[] | null>(null);
  const [reports, setReports] = useState<WorkReport[]>([]);
  const [showArchive, setShowArchive] = useState(false);

  // נטען מחדש בכל כניסה למסך כדי לשקף שינויים שנעשו בטופס ובדיווחים.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      Promise.all([loadWorkplaces(), loadReports(), loadCourses()]).then(([list, r, c]) => {
        if (!active) return;
        setCourses(c);
        setWorkplaces(list);
        setReports(r);
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

  const active = workplaces.filter((w) => !isArchived(w));
  const archived = workplaces
    .filter(isArchived)
    .sort((a, b) => (b.archivedAt ?? 0) - (a.archivedAt ?? 0));

  return (
    <Screen>
      <View style={styles.intro}>
        <Text style={styles.title}>מקומות העבודה שלי</Text>
        <Text style={styles.subtitle}>
          שעות החודש בכל מקום עבודה מול המתוכנן בקורסים הקבועים (או מול הממוצע).
          לחיצה על מקום עבודה — תעריף, תנאי תשלום, נסיעות וקורסים.
        </Text>
      </View>

      {active.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>
            {archived.length ? 'אין מקומות עבודה פעילים.' : 'עדיין לא הוזנו מקומות עבודה.'}
          </Text>
        </View>
      ) : (
        <View style={styles.list}>
          {active.map((workplace) => (
            <WorkplaceCard
              key={workplace.id}
              workplace={workplace}
              stats={workplaceMonthStats(workplace, reports, courses)}
              onPress={() => router.push({ pathname: '/workplace', params: { id: workplace.id } })}
            />
          ))}
        </View>
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
            <View style={styles.list}>
              {archived.map((workplace) => (
                <WorkplaceCard
                  key={workplace.id}
                  workplace={workplace}
                  stats={workplaceMonthStats(workplace, reports, courses)}
                  onPress={() => router.push({ pathname: '/workplace', params: { id: workplace.id } })}
                />
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
        <Button label="אשפה — מקומות עבודה שנמחקו" variant="secondary" onPress={() => router.push('/trash')} />
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
    list: {
      gap: spacing.md,
    },
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
