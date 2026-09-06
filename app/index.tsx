import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { NavCard } from '../components/NavCard';
import { Screen } from '../components/Screen';
import { colors, spacing } from '../theme/colors';

export default function HomeScreen() {
  const router = useRouter();

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
          title="הגדרות ותגיות"
          subtitle="סיכומי החודש, שעות, נסיעות ודקות מצטברות"
          onPress={() => router.push('/settings')}
        />
      </View>

      <Text style={styles.footnote}>
        שלב 2 — דיווח ימי עבודה ורשימת דיווחים פעילים. שעות אקדמיות, שכר,
        נסיעות ותגיות יתווספו בשלבים הבאים.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
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
