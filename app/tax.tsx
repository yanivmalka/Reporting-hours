import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { Text } from '../components/Text';
import { Button } from '../components/Button';
import { DateField } from '../components/DatePicker';
import { Pressable } from '../components/Pressable';
import { Screen } from '../components/Screen';
import { formatDateWithHebrew, todayISO } from '../lib/time';
import { loadWorkplaces, setTaxCoordination, type Workplace } from '../lib/workplaces';
import { TEXT_RIGHT } from '../theme/align';
import { useI18n } from '../lib/i18n';
import { useThemedStyles } from '../theme/useThemedStyles';
import { radius, spacing, type AppColors } from '../theme/colors';

/**
 * תיאום מס לשנה לועזית: לכל מקום עבודה — האם נכלל בתיאום שנשלח השנה, ומתי.
 * מקום עבודה שלא נכלל — מסומן, ומופיעה תזכורת במסך הבית.
 */
export default function TaxScreen() {
  const styles = useThemedStyles(makeStyles);
  const { isRTL } = useI18n();
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [list, setList] = useState<Workplace[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [date, setDate] = useState(todayISO());

  useFocusEffect(
    useCallback(() => {
      void loadWorkplaces().then(setList);
    }, []),
  );

  const done = list.filter((w) => w.taxCoordination?.[year]);
  const missing = list.filter((w) => !w.taxCoordination?.[year]);

  async function mark(id: string, d: string | null) {
    setList(await setTaxCoordination(id, year, d));
    setEditing(null);
  }

  const Row = ({ w }: { w: Workplace }) => {
    const sent = w.taxCoordination?.[year];
    return (
      <View style={[styles.row, !sent && styles.rowMissing]}>
        <Text style={styles.name}>{w.name}</Text>
        <Text style={[styles.meta, sent ? styles.ok : styles.warn]}>
          {sent ? `✓ נכלל בתיאום — נשלח ${formatDateWithHebrew(sent, false)}` : `לא נכלל בתיאום ${year}`}
        </Text>
        {editing === w.id ? (
          <View style={styles.edit}>
            <DateField value={date} onChange={setDate} />
            <Button label="שמירה" onPress={() => mark(w.id, date)} />
            {sent ? <Button label="ביטול הסימון" variant="danger" onPress={() => mark(w.id, null)} /> : null}
            <Button label="סגירה" variant="secondary" onPress={() => setEditing(null)} />
          </View>
        ) : (
          <Button
            label={sent ? 'עריכת התאריך' : 'סימון — נשלח תיאום'}
            variant="secondary"
            onPress={() => {
              setDate(sent ?? todayISO());
              setEditing(w.id);
            }}
          />
        )}
      </View>
    );
  };

  return (
    <Screen>
      <View style={styles.intro}>
        <Text style={styles.title}>תיאום מס</Text>
        <Text style={styles.subtitle}>
          מעקב לפי שנה לועזית: לאילו מקומות עבודה נשלח תיאום מס, ומתי. מקום עבודה שלא נכלל בתיאום
          השנה — תזכורת במסך הבית.
        </Text>
      </View>

      <View style={styles.yearRow}>
        <Pressable onPress={() => setYear(String(Number(year) - 1))} style={styles.nav}>
          <Text style={styles.navText}>{isRTL ? '→' : '←'}</Text>
        </Pressable>
        <Text style={styles.year}>{year}</Text>
        <Pressable onPress={() => setYear(String(Number(year) + 1))} style={styles.nav}>
          <Text style={styles.navText}>{isRTL ? '←' : '→'}</Text>
        </Pressable>
      </View>

      <Text style={styles.section}>
        טרם נכללו ({missing.length})
      </Text>
      {missing.length === 0 ? <Text style={styles.meta}>כל מקומות העבודה נכללו 🎉</Text> : null}
      {missing.map((w) => (
        <Row key={w.id} w={w} />
      ))}

      {done.length > 0 ? <Text style={styles.section}>נכללו ({done.length})</Text> : null}
      {done.map((w) => (
        <Row key={w.id} w={w} />
      ))}
    </Screen>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    intro: { gap: spacing.sm },
    title: { fontSize: 22, fontWeight: '800', color: colors.text, textAlign: TEXT_RIGHT },
    subtitle: { fontSize: 14, lineHeight: 21, color: colors.textMuted, textAlign: TEXT_RIGHT },
    yearRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.lg },
    nav: { width: 44, height: 40, alignItems: 'center', justifyContent: 'center' },
    navText: { fontSize: 22, fontWeight: '700', color: colors.brand },
    year: { fontSize: 22, fontWeight: '800', color: colors.text },
    section: { fontSize: 15, fontWeight: '800', color: colors.text, textAlign: TEXT_RIGHT, marginTop: spacing.sm },
    row: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      padding: spacing.md,
      gap: spacing.xs,
    },
    rowMissing: { borderColor: colors.warning },
    name: { fontSize: 15, fontWeight: '700', color: colors.text, textAlign: TEXT_RIGHT },
    meta: { fontSize: 13, color: colors.textMuted, textAlign: TEXT_RIGHT },
    ok: { color: colors.success, fontWeight: '700' },
    warn: { color: colors.warning, fontWeight: '700' },
    edit: { gap: spacing.sm },
  });
