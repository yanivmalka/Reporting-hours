import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Button } from '../components/Button';
import { Screen } from '../components/Screen';
import { WorkplaceCard } from '../components/WorkplaceCard';
import { loadCourses, type Course } from '../lib/courses';
import { workplaceMonthStats } from '../lib/dashboard';
import { loadReports, type WorkReport } from '../lib/reports';
import {
  loadWorkplaces,
  type Workplace,
} from '../lib/workplaces';
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

  return (
    <Screen>
      <View style={styles.intro}>
        <Text style={styles.title}>מקומות העבודה שלי</Text>
        <Text style={styles.subtitle}>
          שעות החודש בכל מקום עבודה מול המתוכנן בקורסים הקבועים (או מול הממוצע).
          לחיצה על מקום עבודה — תעריף, תנאי תשלום, נסיעות וקורסים.
        </Text>
      </View>

      {workplaces.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>עדיין לא הוזנו מקומות עבודה.</Text>
        </View>
      ) : (
        <View style={styles.list}>
          {workplaces.map((workplace) => (
            <WorkplaceCard
              key={workplace.id}
              workplace={workplace}
              stats={workplaceMonthStats(workplace, reports, courses)}
              onPress={() =>
                router.push({ pathname: '/workplace-form', params: { id: workplace.id } })
              }
            />
          ))}
        </View>
      )}

      <Text style={styles.hint}>
        העברה לאשפה — מתוך מסך העריכה. מהאשפה שבתפריט אפשר לשחזר תוך 30 יום.
      </Text>

      <View style={styles.action}>
        <Button
          label="הוספת מקום עבודה"
          onPress={() => router.push('/workplace-form')}
        />
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
    },
  });
