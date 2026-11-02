/**
 * גרף צפי התשלומים בשלוש רזולוציות:
 *   - חודש (ברירת מחדל) — עמודה עצמאית לכל מקום עבודה;
 *   - סמסטר — לכל חודש קבוצת עמודות, אחת לכל מקום עבודה;
 *   - שנה — עמודה אחת לכל חודש (סכום כל המקומות, בגווני המקומות).
 *
 * הזום נקבע לפי הדיווח בפועל: הערך המקסימלי בתצוגה ועוד שליש גובה.
 * הפוטנציאל (לפי תכנון הקורסים) מוצג כרקע בהיר ללא מסגרת מאחורי הדיווח;
 * כשהוא גבוה מהסקאלה הוא נחתך בראש העמודה.
 * לחיצה על חודש בתצוגת סמסטר / שנה — כניסה לאותו חודש.
 */
import { StyleSheet, Text, View } from 'react-native';
import { Pressable } from './Pressable';
import { Icon } from './Icon';
import { useSwipe } from './useSwipe';
import type { ChartResolution, ForecastMonth } from '../lib/forecast';
import { hebrewMonthNames } from '../lib/hebrewDate';
import { useI18n } from '../lib/i18n';
import { useTheme } from '../theme/ThemeContext';
import { radius, spacing } from '../theme/colors';
import { mix } from '../theme/shades';
import { useStyles, type ColorScheme } from '../theme/useStyles';

const MONTH_SHORT = ['ינו׳', 'פבר׳', 'מרץ', 'אפר׳', 'מאי', 'יוני', 'יולי', 'אוג׳', 'ספט׳', 'אוק׳', 'נוב׳', 'דצמ׳'];
const MONTH_LONG = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
const BAR_H = 150;
/** מרווח מעל הערך המקסימלי בפועל — שליש מגובהו */
const HEADROOM = 4 / 3;

export const money = (n: number) => `${Math.round(n).toLocaleString('en-US')} ₪`;

const RES_OPTIONS: { value: ChartResolution; label: string }[] = [
  { value: 'month', label: 'חודש' },
  { value: 'semester', label: 'סמסטר' },
  { value: 'year', label: 'שנה' },
];

export type ChartSeries = { id: string; color: string; name: string };

type Props = {
  res: ChartResolution;
  onResChange: (res: ChartResolution) => void;
  title: string;
  subtitle: string;
  onPrev: () => void;
  onNext: () => void;
  /** החודשים בתצוגה (1 / סמסטר / 12) */
  months: ForecastMonth[];
  /** מקומות העבודה — סדר העמודות (או הערימה, מלמטה למעלה) וצבע לכל אחד */
  series: ChartSeries[];
  selectedWp: string | null;
  onPickWp: (id: string) => void;
  /** לחיצה על חודש בתצוגת סמסטר / שנה */
  onPickMonth: (m: ForecastMonth) => void;
  /** "YYYY-MM" של החודש הנוכחי — חודשים אחריו מוצגים כעתיד */
  currentKey: string;
};

export function ForecastChart({
  res,
  onResChange,
  title,
  subtitle,
  onPrev,
  onNext,
  months,
  series,
  selectedWp,
  onPickWp,
  onPickMonth,
  currentKey,
}: Props) {
  const styles = useStyles(makeStyles);
  const { colors } = useTheme();
  const { isRTL } = useI18n();
  const swipe = useSwipe(onNext, onPrev);

  const cell = (m: ForecastMonth, id: string) => m.byWorkplace[id] ?? { reported: 0, planned: 0 };
  const faded = (id: string) => selectedWp != null && selectedWp !== id;
  const light = (color: string) => mix(color, colors.surface, 0.72);

  // ── הסקאלה: המקסימום בפועל בתצוגה + שליש ──
  const bars: { reported: number; planned: number }[] =
    res === 'year'
      ? months.map((m) =>
          selectedWp ? cell(m, selectedWp) : { reported: m.reported, planned: m.planned },
        )
      : months.flatMap((m) => series.map((s) => cell(m, s.id)));
  const maxReported = Math.max(0, ...bars.map((b) => b.reported));
  const maxPlanned = Math.max(0, ...bars.map((b) => b.planned));
  const scale = maxReported > 0 ? maxReported * HEADROOM : maxPlanned > 0 ? maxPlanned : 1;
  const h = (v: number) => Math.min(BAR_H, Math.round((Math.max(0, v) / scale) * BAR_H));

  /** עמודה אחת: רקע בהיר לפוטנציאל, ומעליו המילוי של הדיווח. */
  const bar = ({
    key,
    reported,
    planned,
    color,
    dim,
    width,
  }: {
    key?: string;
    reported: number;
    planned: number;
    color: string;
    dim: boolean;
    width: `${number}%`;
  }) => (
    <View key={key} style={[styles.barArea, { width, opacity: dim ? 0.25 : 1 }]}>
      {planned > 0 ? <View style={[styles.potential, { height: h(planned), backgroundColor: light(color) }]} /> : null}
      {reported > 0 ? (
        <View style={[styles.fill, { height: Math.max(2, h(reported)), backgroundColor: color }]} />
      ) : null}
    </View>
  );

  return (
    <View style={styles.wrap} {...swipe}>
      <View style={styles.head}>
        <Pressable onPress={onPrev} style={styles.nav} accessibilityRole="button" accessibilityLabel="הקודם">
          <Icon name={isRTL ? 'chevron-right' : 'chevron-left'} size={24} color={colors.brand} />
        </Pressable>
        <View style={styles.titleBox}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.titleSub} numberOfLines={1}>
            {subtitle}
          </Text>
        </View>
        <Pressable onPress={onNext} style={styles.nav} accessibilityRole="button" accessibilityLabel="הבא">
          <Icon name={isRTL ? 'chevron-left' : 'chevron-right'} size={24} color={colors.brand} />
        </Pressable>
      </View>

      <View style={styles.resRow} accessibilityRole="tablist">
        {RES_OPTIONS.map((o) => {
          const on = o.value === res;
          return (
            <Pressable
              key={o.value}
              onPress={() => onResChange(o.value)}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              style={[styles.resChip, on && styles.resChipOn]}
            >
              <Text style={[styles.resText, on && styles.resTextOn]}>{o.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {res === 'month' ? (
        // ── חודש: עמודה עצמאית לכל מקום עבודה ──
        <View style={styles.columns}>
          {series.map((s) => {
            const c = cell(months[0], s.id);
            const on = selectedWp === s.id;
            return (
              <Pressable
                key={s.id}
                onPress={() => onPickWp(s.id)}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={`${s.name}: דווח ${money(c.reported)}, פוטנציאל ${money(c.planned)}`}
                style={[styles.col, on && styles.colSelected]}
              >
                <Text style={[styles.value, faded(s.id) && styles.dim]} numberOfLines={1}>
                  {money(c.reported)}
                </Text>
                {bar({ reported: c.reported, planned: c.planned, color: s.color, dim: faded(s.id), width: '62%' })}
                <Text style={[styles.wpLabel, on && styles.labelSelected]} numberOfLines={2}>
                  {s.name}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : (
        // ── סמסטר: קבוצת עמודות לכל חודש · שנה: עמודה מסוכמת לכל חודש ──
        <View style={styles.columns}>
          {months.map((m) => {
            const future = m.key > currentKey;
            const isNow = m.key === currentKey;
            const total = selectedWp ? cell(m, selectedWp) : { reported: m.reported, planned: m.planned };
            return (
              <Pressable
                key={m.key}
                onPress={() => onPickMonth(m)}
                accessibilityRole="button"
                accessibilityLabel={`${MONTH_LONG[m.month0]} ${m.year}: דווח ${money(total.reported)}, פוטנציאל ${money(total.planned)}`}
                style={[styles.col, isNow && styles.colNow]}
              >
                {res === 'semester' ? (
                  <View style={styles.group}>
                    {series.map((s) => {
                      const c = cell(m, s.id);
                      return bar({
                        key: s.id,
                        reported: c.reported,
                        planned: c.planned,
                        color: s.color,
                        dim: faded(s.id),
                        width: `${Math.floor(100 / Math.max(1, series.length)) - 4}%`,
                      });
                    })}
                  </View>
                ) : (
                  <View style={[styles.barArea, { width: '78%' }]}>
                    {total.planned > 0 ? (
                      <View
                        style={[styles.potential, { height: h(total.planned), backgroundColor: light(colors.brand) }]}
                      />
                    ) : null}
                    <View style={styles.stack}>
                      {series.map((s) => {
                        const v = cell(m, s.id).reported;
                        if (v <= 0 || faded(s.id)) return null;
                        return <View key={s.id} style={{ height: h(v), backgroundColor: s.color }} />;
                      })}
                    </View>
                  </View>
                )}
                <Text style={[styles.label, future && styles.labelFuture, isNow && styles.labelSelected]}>
                  {MONTH_SHORT[m.month0]}
                </Text>
                <Text style={styles.heb} numberOfLines={1}>
                  {hebrewMonthNames(m.year, m.month0)[0]}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}

      <View style={styles.legend}>
        {series.map((s) => (
          <View key={s.id} style={[styles.legendItem, faded(s.id) && styles.dim]}>
            <View style={[styles.swatch, { backgroundColor: s.color }]} />
            <Text style={styles.legendText} numberOfLines={1}>
              {s.name}
            </Text>
          </View>
        ))}
        <View style={styles.legendItem}>
          <View style={[styles.swatch, { backgroundColor: light(colors.brand) }]} />
          <Text style={styles.legendText}>פוטנציאל לפי תכנון</Text>
        </View>
      </View>
      {res !== 'month' ? <Text style={styles.hint}>לחיצה על חודש — לפירוט החודש</Text> : null}
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
    resRow: {
      flexDirection: 'row',
      alignSelf: 'center',
      padding: 3,
      gap: 2,
      borderRadius: 20,
      backgroundColor: c.background,
    },
    resChip: { minHeight: 34, minWidth: 64, paddingHorizontal: 12, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
    resChipOn: { backgroundColor: c.brand },
    resText: { fontSize: 13, fontWeight: '600', color: c.text },
    resTextOn: { color: c.textOnBrand },
    columns: { flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
    col: {
      flex: 1,
      minWidth: 0,
      alignItems: 'center',
      paddingVertical: 4,
      borderRadius: radius.sm,
      borderWidth: 1.5,
      borderColor: 'transparent',
    },
    colSelected: { backgroundColor: c.brandLight, borderColor: c.brand },
    colNow: { backgroundColor: c.brandLight },
    group: { height: BAR_H, width: '92%', flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 2 },
    barArea: { height: BAR_H, justifyContent: 'flex-end' },
    // הפוטנציאל — רקע בהיר בלי מסגרת, מאחורי הדיווח.
    potential: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      borderTopLeftRadius: 4,
      borderTopRightRadius: 4,
    },
    fill: { borderTopLeftRadius: 4, borderTopRightRadius: 4 },
    stack: { flexDirection: 'column-reverse', overflow: 'hidden', borderTopLeftRadius: 3, borderTopRightRadius: 3 },
    value: { fontSize: 12, fontWeight: '700', color: c.text, marginBottom: 4 },
    dim: { opacity: 0.35 },
    wpLabel: { marginTop: 6, fontSize: 12, fontWeight: '600', color: c.text, textAlign: 'center' },
    label: { marginTop: 4, fontSize: 10, fontWeight: '600', color: c.text },
    labelFuture: { color: c.textMuted },
    labelSelected: { fontWeight: '800', color: c.brand },
    heb: { fontSize: 9, color: c.textMuted },
    legend: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
      columnGap: spacing.md,
      paddingTop: spacing.sm,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.border,
    },
    legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: '48%' },
    swatch: { width: 14, height: 14, borderRadius: 3 },
    legendText: { fontSize: 12, color: c.textMuted, flexShrink: 1 },
    hint: { fontSize: 11, color: c.textMuted, textAlign: 'center' },
  });
