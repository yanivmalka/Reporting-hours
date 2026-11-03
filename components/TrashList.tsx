import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Text } from './Text';
import { Pressable } from './Pressable';
import { useConfirm } from './ConfirmDialog';
import {
  TRASH_RETENTION_DAYS,
  loadDeletedWorkplaces,
  trashDaysLeft,
  type Workplace,
} from '../lib/workplaces';
import { formatDateWithHebrew } from '../lib/time';
import { deleteWorkplaceForever, deletionSummary, restoreWorkplaceWithData } from '../lib/trash';
import { useTheme } from '../theme/ThemeContext';
import { useThemedStyles } from '../theme/useThemedStyles';
import { radius, spacing, type AppColors } from '../theme/colors';
import { TEXT_RIGHT } from '../theme/align';

function deletedDateISO(deletedAt: number): string {
  const d = new Date(deletedAt);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** רשימת האשפה — מקומות עבודה שנמחקו, עם שחזור ומחיקה לצמיתות (בתוך מסך "ארכיון ואשפה"). */
export function TrashList() {
  const styles = useThemedStyles(makeStyles);
  const { colors } = useTheme();
  const [items, setItems] = useState<Workplace[] | null>(null);
  const confirm = useConfirm();

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

  /** מה נמחק יחד עם המקום ("2 קורסים ו־14 דיווחים") */
  function withData(id: string): string {
    const t = items?.find((w) => w.id === id)?.trashed;
    return t ? deletionSummary({ courses: t.courses.length, reports: t.reports.length, lockedPayrolls: 0, lockedPeriods: [] }) : '';
  }

  async function handleRestore(id: string) {
    const next = await restoreWorkplaceWithData(id);
    setItems(next);
  }

  function handleDeleteForever(id: string) {
    const name = items?.find((w) => w.id === id)?.name ?? '';
    confirm({
      title: 'למחוק לצמיתות?',
      message: `"${name}"${withData(id) ? ` יחד עם ${withData(id)}` : ''} יימחק לצמיתות. לא ניתן יהיה לשחזר.`,
      confirmLabel: 'מחיקה לצמיתות',
      onConfirm: async () => setItems(await deleteWorkplaceForever(id)),
    });
  }


  if (items === null) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.brand} />
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.intro}>
        <Text style={styles.subtitle}>
          מקומות עבודה שנמחקו נשמרים כאן {TRASH_RETENTION_DAYS} יום, יחד עם הקורסים והדיווחים
          שלהם, וניתן לשחזר אותם. אחרי כן הם נמחקים לצמיתות.
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
                  נמחק ב־{formatDateWithHebrew(deletedDateISO(item.deletedAt as number), false)}
                  {' · '}
                  {daysLeft > 0
                    ? `נותרו ${daysLeft} ימים לשחזור`
                    : 'יימחק בקרוב'}
                </Text>
                {withData(item.id) ? <Text style={styles.meta}>כולל {withData(item.id)}</Text> : null}
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
                    <Text style={styles.deleteText}>מחיקה לצמיתות</Text>
                  </Pressable>
                </View>
              </View>
            );
          })}
        </View>
      )}
      {confirm.dialog}
    </View>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    wrap: {
      gap: spacing.md,
    },
    center: {
      paddingVertical: spacing.xl,
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
      textAlign: TEXT_RIGHT,
    },
    meta: {
      fontSize: 13,
      color: colors.textMuted,
      textAlign: TEXT_RIGHT,
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
