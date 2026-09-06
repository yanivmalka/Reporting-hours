import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Button } from '../components/Button';
import { Screen } from '../components/Screen';
import { WorkplaceCard } from '../components/WorkplaceCard';
import { loadWorkplaces, type Workplace } from '../lib/workplaces';
import { colors, spacing } from '../theme/colors';

export default function WorkplacesScreen() {
  const router = useRouter();
  const [workplaces, setWorkplaces] = useState<Workplace[] | null>(null);

  // נטען מחדש בכל כניסה למסך כדי לשקף שינויים שנעשו בטופס.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      loadWorkplaces().then((list) => {
        if (active) setWorkplaces(list);
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
          לכל מוסד: תעריף, סוג תשלום, יום קבלת השכר ונתוני נסיעה. אפשר לערוך
          ולהוסיף בכל עת.
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
              onPress={() =>
                router.push({
                  pathname: '/workplace-form',
                  params: { id: workplace.id },
                })
              }
            />
          ))}
        </View>
      )}

      <View style={styles.action}>
        <Button
          label="הוספת מקום עבודה"
          onPress={() => router.push('/workplace-form')}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
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
    textAlign: 'right',
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 21,
    color: colors.textMuted,
    textAlign: 'right',
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
  action: {
    marginTop: spacing.sm,
  },
});
