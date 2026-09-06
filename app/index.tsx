import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { NavCard } from '../components/NavCard';
import { Screen } from '../components/Screen';
import { useThemedStyles } from '../theme/useThemedStyles';
import { spacing, type AppColors } from '../theme/colors';

export default function HomeScreen() {
  const router = useRouter();
  const styles = useThemedStyles(makeStyles);

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.title}>ברוך הבא 👋</Text>
        <Text style={styles.subtitle}>
          דיווח עצמי של שעות עבודה לפי מקום עבודה, כולל שעות אקדמיות, הפסקות,
          נסיעות וסיכומים חודשיים.
        </Text>
      </View>

      <View style={styles.cards}>
        <NavCard
          title="דיווח יום עבודה"
          subtitle="בחירת מקום עבודה, טווח שעות והפסקות"
          onPress={() => router.push('/report')}
        />
        <NavCard
          title="הדיווחים שלי"
          subtitle="רשימת ימי העבודה שדווחו וזמן העבודה נטו"
          onPress={() => router.push('/reports')}
        />
        <NavCard
          title="מקומות עבודה"
          subtitle="הגדרת תעריפים, סוג תשלום ונסיעות"
          onPress={() => router.push('/workplaces')}
        />
        <NavCard
          title="דקות מצטברות"
          subtitle="בסיס חישוב השכר, מונה הדקות המצטברות, וסיכומי החודש"
          onPress={() => router.push('/settings')}
        />
      </View>

      <Text style={styles.footnote}>
        שלב 4 — לכל דיווח ולכל מקום עבודה מוצג השכר המחושב, לפי בסיס חישוב
        (שעות אקדמיות / רגילות) שנקבע בהגדרות. סיכומים חודשיים יתווספו בשלב 6.
      </Text>
    </Screen>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
  header: {
    gap: spacing.sm,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'right',
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.textMuted,
    textAlign: 'right',
  },
  cards: {
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  footnote: {
    marginTop: 'auto',
    fontSize: 12,
    color: colors.textMuted,
    textAlign: 'center',
  },
});
