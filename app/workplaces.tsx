import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Button } from '../components/Button';
import { Screen } from '../components/Screen';
import { WorkplaceCard } from '../components/WorkplaceCard';
import { payBreakdown, type WorkplacePay } from '../lib/pay';
import { PAY_BASIS_LABELS, usePayBasis } from '../lib/payBasis';
import { loadReports, type WorkReport } from '../lib/reports';
import { travelBreakdown, type WorkplaceTravelCost } from '../lib/travel';
import {
  loadWorkplaces,
  trashWorkplace,
  type Workplace,
} from '../lib/workplaces';
import { useTheme } from '../theme/ThemeContext';
import { useThemedStyles } from '../theme/useThemedStyles';
import { spacing, type AppColors } from '../theme/colors';

export default function WorkplacesScreen() {
  const router = useRouter();
  const styles = useThemedStyles(makeStyles);
  const { colors } = useTheme();
  const { basis } = usePayBasis();
  const [workplaces, setWorkplaces] = useState<Workplace[] | null>(null);
  const [reports, setReports] = useState<WorkReport[]>([]);

  // נטען מחדש בכל כניסה למסך כדי לשקף שינויים שנעשו בטופס ובדיווחים.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      Promise.all([loadWorkplaces(), loadReports()]).then(([list, r]) => {
        if (!active) return;
        setWorkplaces(list);
        setReports(r);
      });
      return () => {
        active = false;
      };
    }, []),
  );

  // עלות נסיעות מחושבת לכל מקום עבודה (שלב 5), לפי הימים שדווחו לו.
  const travelByWorkplace = new Map<string, WorkplaceTravelCost>(
    travelBreakdown(workplaces ?? [], reports).perWorkplace.map((row) => [
      row.workplaceId,
      row,
    ]),
  );

  // שכר מחושב מצטבר לכל מקום עבודה (שלב 4), לפי בסיס החישוב הנבחר.
  const payByWorkplace = new Map<string, WorkplacePay>(
    payBreakdown(workplaces ?? [], reports, basis).perWorkplace.map((row) => [
      row.workplaceId,
      row,
    ]),
  );

  async function handleTrash(id: string) {
    const next = await trashWorkplace(id);
    setWorkplaces(next);
  }

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
          לכל מוסד: תעריף, סוג תשלום, יום קבלת השכר ונתוני נסיעה. כשיש
          דיווחים מוצגים גם השכר המחושב ועלות הנסיעות המצטברת. אפשר לערוך
          ולהוסיף בכל עת.
        </Text>
      </View>

      {workplaces.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>עדיין לא הוזנו מקומות עבודה.</Text>
        </View>
      ) : (
        <View style={styles.list}>
          {workplaces.map((workplace) => {
            const travel = travelByWorkplace.get(workplace.id);
            const pay = payByWorkplace.get(workplace.id);
            // מציגים שכר רק כשדווח לפחות יום עבודה אחד למקום הזה.
            const showPay = pay != null && pay.days > 0;
            return (
              <WorkplaceCard
                key={workplace.id}
                workplace={workplace}
                travelCost={travel?.total}
                travelDays={travel?.days}
                pay={showPay ? pay.total : undefined}
                payHours={showPay ? pay.hours : undefined}
                payBasisLabel={PAY_BASIS_LABELS[basis]}
                onPress={() =>
                  router.push({
                    pathname: '/workplace-form',
                    params: { id: workplace.id },
                  })
                }
                onTrash={() => handleTrash(workplace.id)}
              />
            );
          })}
        </View>
      )}

      <Text style={styles.hint}>
        מחיקת אריח מעבירה אותו לאשפה שבתפריט ההמבורגר. משם אפשר לשחזר אותו תוך 30 יום.
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
    hint: {
      fontSize: 12,
      color: colors.textMuted,
      textAlign: 'right',
    },
    action: {
      marginTop: spacing.sm,
    },
  });
