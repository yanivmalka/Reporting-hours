import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Screen } from '../components/Screen';
import {
  TRASH_RETENTION_DAYS,
  deleteWorkplace,
  loadDeletedWorkplaces,
  restoreWorkplace,
  trashDaysLeft,
  type Workplace,
} from '../lib/workplaces';
import { formatISODate } from '../lib/time';
import { useTheme } from '../theme/ThemeContext';
import { useThemedStyles } from '../theme/useThemedStyles';
import { radius, spacing, type AppColors } from '../theme/colors';

function deletedDateISO(deletedAt: number): string {
  const d = new Date(deletedAt);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export default function TrashScreen() {
  const styles = useThemedStyles(makeStyles);
  const { colors } = useTheme();
  const [items, setItems] = useState<Workplace[] | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      loadDeletedWorkplaces().then((list) => {
        if (active) setItems(list);
      });
      return () => {
        active = false;
      };
    }, []),
  );

  async function handleRestore(id: string) {
    const next = await restoreWorkplace(id);
    setItems(next);
    setConfirmingId(null);
  }

  async function handleDeleteForever(id: string) {
    if (confirmingId !== id) {
      setConfirmingId(id);
      return;
    }
    const next = await deleteWorkplace(id);
    setItems(next);
    setConfirmingId(null);
  }

  if (items === null) {
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
        <Text style={styles.title}>אשפה</Text>
        <Text style={styles.subtitle}>
          מקומות עבודה שנמחקו נשמרים כאן {TRASH_RETENTION_DAYS} יום וניתן לשחזר
          אותם. אחרי כן הם נמחקים לצמיתות.
        </Text>
      </View>

      {items.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>האשפה ריקה.</Text>
        </View>
      ) : (
        <View style={styles.list}>
          {items.map((item) => {
            const daysLeft = trashDaysLeft(item);
            return (
              <View key={item.id} style={styles.card}>
                <Text style={styles.name}>{item.name}</Text>
                <Text style={styles.meta}>
                  נמחק ב־{formatISODate(deletedDateISO(item.deletedAt as number))}
                  {' · '}
                  {daysLeft > 0
                    ? `נותרו ${daysLeft} ימים לשחזור`
                    : 'יימחק בקרוב'}
                </Text>
                <View style={styles.actions}>
                  <Pressable
                    onPress={() => handleRestore(item.id)}
                    style={({ pressed }) => [
                      styles.btn,
                      styles.restore,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text style={styles.restoreText}>שחזור</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => handleDeleteForever(item.id)}
                    style={({ pressed }) => [
                      styles.btn,
                      styles.delete,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text style={styles.deleteText}>
                      {confirmingId === item.id
                        ? 'לחצו שוב למחיקה סופית'
                        : 'מחיקה לצמיתות'}
                    </Text>
                  </Pressable>
                </View>
              </View>
            );
          })}
        </View>
      )}
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
    card: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      padding: spacing.md,
      gap: spacing.sm,
    },
    name: {
      fontSize: 17,
      fontWeight: '700',
      color: colors.text,
      textAlign: 'right',
    },
    meta: {
      fontSize: 13,
      color: colors.textMuted,
      textAlign: 'right',
    },
    actions: {
      flexDirection: 'row',
      gap: spacing.sm,
    },
    btn: {
      flex: 1,
      minHeight: 44,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radius.md,
      borderWidth: 1,
      paddingHorizontal: spacing.sm,
    },
    pressed: {
      opacity: 0.85,
    },
    restore: {
      backgroundColor: colors.brand,
      borderColor: colors.brand,
    },
    restoreText: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.textOnBrand,
    },
    delete: {
      backgroundColor: colors.surface,
      borderColor: colors.danger,
    },
    deleteText: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.danger,
      textAlign: 'center',
    },
  });
