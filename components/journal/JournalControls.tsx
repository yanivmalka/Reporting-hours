import { StyleSheet, View } from 'react-native';
import { Text } from '../Text';
import { Pressable } from '../Pressable';
import { SelectField } from '../SelectField';
import { useThemedStyles } from '../../theme/useThemedStyles';
import { spacing, type AppColors } from '../../theme/colors';
import type { Journal } from './useJournal';

const TABS = [
  { value: 'plan', label: 'תכנון' },
  { value: 'reports', label: 'דיווחים' },
] as const;

/**
 * שורת הבקרה של היומן: מתג תכנון | דיווחים (מימין) וצ׳יפ סינון מקום העבודה
 * (משמאל). בראש המסך בזרימה, ובגלילה מוצמדת למעלה (PinnedStrip) — מעל פס
 * השבוע / התאריכון המוצמד, כך ששניהם זמינים תמיד.
 */
export function JournalControls({ w }: { w: Journal }) {
  const styles = useThemedStyles(makeStyles);
  const { tab, setTab, wpFilter, setWpFilter, wpOptions } = w;
  return (
    <View style={styles.row}>
      <View style={styles.tabs} accessibilityRole="tablist">
        {TABS.map((o) => {
          const selected = o.value === tab;
          return (
            <Pressable
              key={o.value}
              onPress={() => setTab(o.value)}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              style={[styles.tab, selected && styles.tabSelected]}
            >
              <Text style={[styles.tabText, selected && styles.tabTextSelected]}>{o.label}</Text>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.spacer} />
      <SelectField<string | null>
        chip
        title="סינון לפי מקום עבודה"
        placeholder="כל המקומות"
        value={wpFilter}
        active={wpFilter != null}
        onChange={setWpFilter}
        onClear={() => setWpFilter(null)}
        options={wpOptions}
      />
    </View>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    tabs: { flexDirection: 'row', backgroundColor: colors.border, borderRadius: 16, padding: 2 },
    tab: { height: 28, paddingHorizontal: 14, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    tabSelected: { backgroundColor: colors.surface },
    tabText: { fontSize: 13, color: colors.textMuted },
    tabTextSelected: { fontWeight: '700', color: colors.text },
    spacer: { flex: 1 },
  });
