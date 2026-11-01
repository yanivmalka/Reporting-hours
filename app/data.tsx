import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from '../components/Button';
import { useConfirm } from '../components/ConfirmDialog';
import { Screen } from '../components/Screen';
import { useToast } from '../components/Toast';
import { isDemoLoaded, loadDemoData, removeDemoData, resetAllData } from '../lib/demo';
import { useI18n } from '../lib/i18n';
import { DEFAULT_PAY_BASIS, usePayBasis } from '../lib/payBasis';
import { loadReports } from '../lib/reports';
import { loadWorkplaces } from '../lib/workplaces';
import { useTheme } from '../theme/ThemeContext';
import { DEFAULT_PALETTE_ID } from '../theme/palettes';
import { useThemedStyles } from '../theme/useThemedStyles';
import { radius, spacing, type AppColors } from '../theme/colors';

type Action = 'load' | 'removeDemo' | 'resetAll';

type Stats = { reports: number; demoReports: number; workplaces: number; demo: boolean };

/** מסך ניהול נתונים: טעינת נתוני הדגמה, מחיקתם, או איפוס מלא של האפליקציה. */
export default function DataScreen() {
  const styles = useThemedStyles(makeStyles);
  const { showToast } = useToast();
  const { setMode, setPaletteId } = useTheme();
  const { setLang } = useI18n();
  const { setBasis } = usePayBasis();
  const [stats, setStats] = useState<Stats | null>(null);
  const confirm = useConfirm();
  const [busy, setBusy] = useState<Action | null>(null);

  const refresh = useCallback(async () => {
    const [reports, workplaces, demo] = await Promise.all([
      loadReports(),
      loadWorkplaces(),
      isDemoLoaded(),
    ]);
    setStats({
      reports: reports.length,
      demoReports: reports.filter((r) => r.demo).length,
      workplaces: workplaces.length,
      demo,
    });
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  const CONFIRM: Record<Action, { title: string; message: string; confirmLabel: string; destructive: boolean }> = {
    load: {
      title: 'לטעון נתוני הדגמה?',
      message: 'דיווחי הדגמה קודמים יוחלפו בחדשים. נתונים שהזנתם בעצמכם לא ייפגעו.',
      confirmLabel: 'טעינה',
      destructive: false,
    },
    removeDemo: {
      title: 'לאפס את נתוני ההדגמה?',
      message: 'דיווחי ההדגמה והדקות שהוסיפו למונים יימחקו. מקומות העבודה, ההעדפות והדיווחים שלכם נשמרים.',
      confirmLabel: 'איפוס נתוני הדגמה',
      destructive: true,
    },
    resetAll: {
      title: 'למחוק את כל המידע?',
      message: 'כל הדיווחים, מקומות העבודה (כולל האשפה), המונים וההעדפות יימחקו. לא ניתן לשחזר.',
      confirmLabel: 'מחיקת הכול',
      destructive: true,
    },
  };

  function run(action: Action) {
    confirm({ ...CONFIRM[action], onConfirm: () => execute(action) });
  }

  async function execute(action: Action) {
    setBusy(action);
    try {
      if (action === 'load') {
        const n = await loadDemoData();
        showToast(`נטענו ${n} דיווחי הדגמה ב־8 סמינרים`);
      } else if (action === 'removeDemo') {
        const n = await removeDemoData();
        showToast(`נמחקו ${n} דיווחי הדגמה · מקומות העבודה וההעדפות נשמרו`);
      } else {
        await resetAllData();
        setMode('system');
        setPaletteId(DEFAULT_PALETTE_ID);
        setLang('he');
        setBasis(DEFAULT_PAY_BASIS);
        showToast('כל הנתונים נמחקו');
      }
    } finally {
      setBusy(null);
      await refresh();
    }
  }

  const label = (_action: Action, text: string) => text;

  return (
    <Screen>
      <View style={styles.intro}>
        <Text style={styles.title}>ניהול נתונים</Text>
        <Text style={styles.subtitle}>
          כל הנתונים נשמרים במכשיר בלבד. כאן אפשר לטעון נתוני הדגמה, למחוק אותם,
          או להתחיל מאפס.
        </Text>
      </View>

      {stats ? (
        <View style={styles.stats}>
          <Stat label="דיווחים" value={stats.reports} styles={styles} />
          <Stat label="מתוכם הדגמה" value={stats.demoReports} styles={styles} />
          <Stat label="מקומות עבודה" value={stats.workplaces} styles={styles} />
        </View>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>נתוני הדגמה</Text>
        <Text style={styles.cardText}>
          ארבעה חודשים של הרצאות "תולדות האדריכלות" לשנה א׳ וסדנאות תכנון —
          מטבחים, חדרי רחצה ופרויקט גמר (וילה ומבנה ציבור) — בשמונה סמינרים,
          1–3 סמינרים ביום, 5–9 שעות אקדמיות ביום, כולל דקות עודפות במונה.
        </Text>
        <Button
          label={label('load', stats?.demo ? 'טעינה מחדש של נתוני ההדגמה' : 'טעינת נתוני הדגמה')}
          variant="secondary"
          onPress={() => run('load')}
          loading={busy === 'load'}
          disabled={busy != null}
        />
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>איפוס נתוני הדגמה</Text>
        <Text style={styles.cardText}>
          מוחק את דיווחי ההדגמה ואת הדקות שהוסיפו למונה. מקומות העבודה, ההעדפות
          (מראה, שפה, בסיס חישוב השכר) והדיווחים שהזנתם בעצמכם — נשמרים.
        </Text>
        <Button
          label={label('removeDemo', 'איפוס נתוני הדגמה')}
          variant="secondary"
          onPress={() => run('removeDemo')}
          loading={busy === 'removeDemo'}
          disabled={busy != null || !stats?.demoReports}
        />
      </View>

      <View style={[styles.card, styles.dangerCard]}>
        <Text style={styles.cardTitle}>איפוס כל המידע</Text>
        <Text style={styles.cardText}>
          מוחק הכול: דיווחים, מקומות עבודה (כולל האשפה), מונה הדקות המצטברות
          וההעדפות. לא ניתן לשחזר.
        </Text>
        <Button
          label={label('resetAll', 'איפוס כל המידע')}
          variant="danger"
          onPress={() => run('resetAll')}
          loading={busy === 'resetAll'}
          disabled={busy != null}
        />
      </View>
      {confirm.dialog}
    </Screen>
  );
}

function Stat({
  label,
  value,
  styles,
}: {
  label: string;
  value: number;
  styles: ReturnType<typeof makeStyles>;
}) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
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
    stats: {
      flexDirection: 'row',
      gap: spacing.sm,
    },
    stat: {
      flex: 1,
      alignItems: 'center',
      backgroundColor: colors.brandLight,
      borderRadius: radius.md,
      paddingVertical: spacing.md,
    },
    statValue: {
      fontSize: 24,
      fontWeight: '800',
      color: colors.brandDark,
    },
    statLabel: {
      fontSize: 12,
      color: colors.brandDark,
    },
    card: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      padding: spacing.md,
      gap: spacing.sm,
    },
    dangerCard: {
      borderColor: colors.danger,
    },
    cardTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.text,
      textAlign: 'right',
    },
    cardText: {
      fontSize: 13,
      lineHeight: 20,
      color: colors.textMuted,
      textAlign: 'right',
    },
  });
