/**
 * גרף צפי התשלומים לשנה: 12 עמודות חודש. בכל חודש — "קונטיינר" מקווקו
 * בגובה הצפי לפי תכנון, ובתוכו מילוי הדיווחים בפועל, מוערם לפי מקום עבודה
 * (גוונים מאותה משפחת צבע). מעבר בין שנים בחיצים או בהחלקה.
 * מתחת לכל עמודה — החודש הלועזי והחודש העברי.
 */
import { StyleSheet, Text, View } from 'react-native';
import { Pressable } from './Pressable';
import { Icon } from './Icon';
import { useSwipe } from './useSwipe';
import type { ForecastMonth } from '../lib/forecast';
import { hebrewMonthNames, hebrewYearSpan } from '../lib/hebrewDate';
import { useI18n } from '../lib/i18n';
import { useTheme } from '../theme/ThemeContext';
import { radius, spacing } from '../theme/colors';
import { useStyles, type ColorScheme } from '../theme/useStyles';

const MONTH_SHORT = ['ינו׳', 'פבר׳', 'מרץ', 'אפר׳', 'מאי', 'יוני', 'יולי', 'אוג׳', 'ספט׳', 'אוק׳', 'נוב׳', 'דצמ׳'];
const MONTH_LONG = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
const BAR_H = 150;

export const money = (n: number) => `${Math.round(n).toLocaleString('en-US')} ₪`;

type Props = {
  year: number;
  onYearChange: (year: number) => void;
  months: ForecastMonth[];
  /** סדר מקומות העבודה בערימה (מלמטה למעלה) וצבע לכל אחד */
  series: { id: string; color: string }[];
  selectedMonth: number | null;
  onPickMonth: (month0: number) => void;
  selectedWp: string | null;
  /** "YYYY-MM" של החודש הנוכחי — חודשים אחריו מוצגים כעתיד */
  currentKey: string;
};

export function ForecastChart({
  year,
  onYearChange,
  months,
  series,
  selectedMonth,
  onPickMonth,
  selectedWp,
  currentKey,
}: Props) {
  const styles = useStyles(makeStyles);
  const { colors } = useTheme();
  const { isRTL } = useI18n();
  const swipe = useSwipe(
    () => onYearChange(year + 1),
    () => onYearChange(year - 1),
  );

  // הנבחר — בתחתית הערימה, כדי שיתיישר עם תחתית הקונטיינר שלו.
  const ordered = selectedWp
    ? [...series.filter((s) => s.id === selectedWp), ...series.filter((s) => s.id !== selectedWp)]
    : series;
  const valueOf = (m: ForecastMonth, kind: 'reported' | 'planned') =>
    selectedWp ? (m.byWorkplace[selectedWp]?.[kind] ?? 0) : m[kind];
  const max = Math.max(1, ...months.map((m) => Math.max(m.reported, m.planned)));
  const h = (v: number) => Math.round((v / max) * BAR_H);

  return (
    <View style={styles.wrap} {...swipe}>
      <View style={styles.head}>
        <Pressable
          onPress={() => onYearChange(year - 1)}
          style={styles.nav}
          accessibilityRole="button"
          accessibilityLabel="שנה קודמת"
        >
          <Icon name={isRTL ? 'chevron-right' : 'chevron-left'} size={24} color={colors.brand} />
        </Pressable>
        <View style={styles.titleBox}>
          <Text style={styles.title}>{year}</Text>
          <Text style={styles.titleSub}>{hebrewYearSpan(year)}</Text>
        </View>
        <Pressable
          onPress={() => onYearChange(year + 1)}
          style={styles.nav}
          accessibilityRole="button"
          accessibilityLabel="שנה הבאה"
        >
          <Icon name={isRTL ? 'chevron-left' : 'chevron-right'} size={24} color={colors.brand} />
        </Pressable>
      </View>

      <View style={styles.columns}>
        {months.map((m) => {
          const selected = selectedMonth === m.month0;
          const future = m.key > currentKey;
          const plannedH = h(valueOf(m, 'planned'));
          const heb = hebrewMonthNames(m.year, m.month0)[0];
          return (
            <Pressable
              key={m.key}
              onPress={() => onPickMonth(m.month0)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={`${MONTH_LONG[m.month0]} ${m.year}: דווח ${money(valueOf(m, 'reported'))}, לפי תכנון ${money(valueOf(m, 'planned'))}`}
              style={[styles.col, selected && styles.colSelected]}
            >
              <View style={styles.barArea}>
                {plannedH > 0 ? <View style={[styles.container, { height: plannedH }]} /> : null}
                <View style={styles.stack}>
                  {ordered.map((s) => {
                    const v = m.byWorkplace[s.id]?.reported ?? 0;
                    if (v <= 0) return null;
                    return (
                      <View
                        key={s.id}
                        style={{
                          height: h(v),
                          backgroundColor: s.color,
                          opacity: selectedWp && selectedWp !== s.id ? 0.22 : 1,
                        }}
                      />
                    );
                  })}
                </View>
              </View>
              <Text style={[styles.label, future && styles.labelFuture, selected && styles.labelSelected]}>
                {MONTH_SHORT[m.month0]}
              </Text>
              <Text style={styles.heb} numberOfLines={1}>
                {heb}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.swatch, { backgroundColor: colors.brand }]} />
          <Text style={styles.legendText}>דווח (מילוי)</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.swatch, styles.swatchPlanned]} />
          <Text style={styles.legendText}>לפי תכנון — מהקורסים (מסגרת)</Text>
        </View>
      </View>
    </View>
  );
}

const makeStyles = (c: ColorScheme) =>
  StyleSheet.create({
    wrap: {
      backgroundColor: c.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: c.border,
      borderRadius: 18,
      padding: spacing.sm,
      gap: spacing.sm,
    },
    head: { flexDirection: 'row', alignItems: 'center' },
    nav: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    titleBox: { flex: 1, alignItems: 'center' },
    title: { fontSize: 18, fontWeight: '800', color: c.text },
    titleSub: { fontSize: 12, color: c.textMuted },
    columns: { flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
    col: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 4,
      borderRadius: radius.sm,
      borderWidth: 1.5,
      borderColor: 'transparent',
    },
    colSelected: { backgroundColor: c.brandLight, borderColor: c.brand },
    barArea: { height: BAR_H, width: '78%', justifyContent: 'flex-end' },
    container: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      borderWidth: 1.5,
      borderStyle: 'dashed',
      borderColor: c.brand,
      borderTopLeftRadius: 4,
      borderTopRightRadius: 4,
      backgroundColor: c.brandLight,
    },
    // המילוי יושב בתוך הקונטיינר, עם שוליים קטנים מהמסגרת.
    stack: { marginHorizontal: 3, flexDirection: 'column-reverse', overflow: 'hidden', borderRadius: 2 },
    label: { marginTop: 4, fontSize: 10, fontWeight: '600', color: c.text },
    labelFuture: { color: c.textMuted },
    labelSelected: { fontWeight: '800', color: c.brand },
    heb: { fontSize: 9, color: c.textMuted },
    legend: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.md,
      paddingTop: spacing.sm,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.border,
    },
    legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    swatch: { width: 14, height: 14, borderRadius: 3 },
    swatchPlanned: { borderWidth: 1.5, borderStyle: 'dashed', borderColor: c.brand, backgroundColor: c.brandLight },
    legendText: { fontSize: 12, color: c.textMuted },
  });
