/**
 * גרף צפי התשלומים בשלוש רזולוציות:
 *   - חודש — פס אופקי אחד: הדיווח בפועל מחולק לפי מקום עבודה, על רקע
 *     בהיר של הפוטנציאל, ואחוז המימוש בקצה. הפירוט לכל מקום — באריחים
 *     שמתחת (WorkplaceTile).
 *   - סמסטר / שנה — עמודה לכל חודש (סכום המקומות בגווני המקומות). לחיצה
 *     על חודש מסננת את האריחים שמתחת לאותו חודש (בלי לצלול אליו).
 *
 * הזום נקבע לפי הדיווח בפועל: הערך המקסימלי בתצוגה ועוד שליש. הפוטנציאל —
 * רקע בהיר ללא מסגרת; מעבר לסקאלה הוא נחתך בקצה.
 * דפדוף (חצים / החלקה) אינו "סינון": "נקה סינון" מופיע רק כשיש מקום עבודה
 * או חודש מסוננים; לחזרה לחודש הנוכחי יש קישור נפרד.
 */
import { Animated, StyleSheet, View } from 'react-native';
import { Text } from './Text';
import { Pressable } from './Pressable';
import { Icon } from './Icon';
import { useFlash } from './useFlash';
import { useSwipe } from './useSwipe';
import type { ChartResolution, ForecastMonth } from '../lib/forecast';
import { hebrewMonthNames } from '../lib/hebrewDate';
import { useI18n } from '../lib/i18n';
import { useTheme } from '../theme/ThemeContext';
import { radius, spacing } from '../theme/colors';
import { mix } from '../theme/shades';
import { useStyles, type ColorScheme, type StyleLayout } from '../theme/useStyles';

const MONTH_SHORT = ['ינו׳', 'פבר׳', 'מרץ', 'אפר׳', 'מאי', 'יוני', 'יולי', 'אוג׳', 'ספט׳', 'אוק׳', 'נוב׳', 'דצמ׳'];
const MONTH_LONG = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
const BAR_H = 140;
/** מרווח מעל הערך המקסימלי בפועל — שליש מגובהו */
export const HEADROOM = 4 / 3;

export const money = (n: number) => `${Math.round(n).toLocaleString('en-US')} ₪`;

/** אחוז מימוש הפוטנציאל, או null כשאין תכנון. */
/** סכום מקוצר מעל עמודה צרה: "42.2K", "950". */
function compact(v: number, narrow = false): string {
  if (v < 1000) return String(Math.round(v));
  return narrow ? `${Math.round(v / 1000)}K` : `${Math.round(v / 100) / 10}K`;
}

export function realization(reported: number, planned: number): number | null {
  return planned > 0 ? Math.round((reported / planned) * 100) : null;
}

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
  /** כיוון המעבר האחרון — לאנימציה */
  dir: 1 | -1;
  /** החודשים בתצוגה (1 / סמסטר / 12) */
  months: ForecastMonth[];
  /** מקומות העבודה המוצגים (כשיש סינון — רק המסונן) */
  series: ChartSeries[];
  /** החודש המסונן ("YYYY-MM") בסמסטר / שנה */
  selectedMonth: string | null;
  onPickMonth: (m: ForecastMonth) => void;
  /** "YYYY-MM" של החודש הנוכחי */
  currentKey: string;
  /** יש סינון פעיל — מוצג "נקה סינון" */
  onClearFilter?: () => void;
  /** התצוגה אינה על החודש הנוכחי — קישור חזרה */
  onToday?: () => void;
  /** בלי נתונים בתצוגה: קישור לחודש עם נתונים */
  /** קישור כשאין נתונים; direction קובע את כיוון החץ (אחורה בזמן / קדימה) */
  emptyLink: { label: string; onPress: () => void; direction: 'back' | 'forward' };
};

export function ForecastChart({
  res,
  onResChange,
  title,
  subtitle,
  onPrev,
  onNext,
  dir,
  months,
  series,
  selectedMonth,
  onPickMonth,
  currentKey,
  onClearFilter,
  onToday,
  emptyLink,
}: Props) {
  const styles = useStyles(makeStyles);
  const { colors } = useTheme();
  const { isRTL } = useI18n();
  const swipe = useSwipe(onNext, onPrev);
  const flash = useFlash(`${res}|${title}`, dir);
  const bodyFlash = useFlash(`${res}|${title}|${series.length}`, dir);

  const cell = (m: ForecastMonth, id: string) => m.byWorkplace[id] ?? { reported: 0, planned: 0 };
  const light = (color: string) => mix(color, colors.surface, 0.72);
  const sumOf = (m: ForecastMonth) =>
    series.reduce(
      (a, s) => ({ reported: a.reported + cell(m, s.id).reported, planned: a.planned + cell(m, s.id).planned }),
      { reported: 0, planned: 0 },
    );
  const totals = months.map(sumOf);
  const all = totals.reduce((a, t) => ({ reported: a.reported + t.reported, planned: a.planned + t.planned }), {
    reported: 0,
    planned: 0,
  });
  const maxReported = Math.max(0, ...totals.map((t) => t.reported));
  const maxPlanned = Math.max(0, ...totals.map((t) => t.planned));
  const scale = maxReported > 0 ? maxReported * HEADROOM : maxPlanned > 0 ? maxPlanned : 1;
  const frac = (v: number) => Math.min(1, Math.max(0, v) / scale);
  const empty = maxReported === 0 && maxPlanned === 0;
  const pctAll = realization(all.reported, all.planned);

  return (
    <View style={styles.wrap} {...swipe}>
      <View style={styles.head}>
        <Pressable onPress={onPrev} style={styles.nav} accessibilityRole="button" accessibilityLabel="הקודם">
          <Icon name={isRTL ? 'chevron-right' : 'chevron-left'} size={24} color={colors.brand} />
        </Pressable>
        <Animated.View style={[styles.titleBox, flash]}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.titleSub} numberOfLines={1}>
            {subtitle}
          </Text>
        </Animated.View>
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

      {onClearFilter || onToday ? (
        <View style={styles.toolbar}>
          {onClearFilter ? (
            <Pressable onPress={onClearFilter} accessibilityRole="button" style={styles.clear}>
              <Icon name="filter-remove-outline" size={16} color={colors.textOnBrand} />
              <Text style={styles.clearText}>נקה סינון</Text>
            </Pressable>
          ) : null}
          {onToday ? (
            <Pressable onPress={onToday} accessibilityRole="link" hitSlop={8} style={styles.today}>
              <Icon name="calendar-today" size={16} color={colors.brand} />
              <Text style={styles.todayText}>לחודש הנוכחי</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <Animated.View style={bodyFlash}>
        {empty ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>אין נתונים ל{title}</Text>
            <Pressable onPress={emptyLink.onPress} accessibilityRole="link" hitSlop={8}>
              <Text style={styles.emptyLink}>
                {/* ב־RTL "אחורה" (חודש קודם) הוא ימינה. */}
                {(emptyLink.direction === 'back') === isRTL ? `→ ${emptyLink.label}` : `${emptyLink.label} ←`}
              </Text>
            </Pressable>
          </View>
        ) : res === 'month' ? (
          // ── חודש: פס אחד — דיווח לפי מקום, על רקע הפוטנציאל, ואחוז המימוש ──
          <View style={styles.monthBox}>
            <View style={styles.barRow}>
              <View style={styles.track}>
                <View
                  style={[
                    styles.hPotential,
                    { width: `${frac(Math.max(all.planned, all.reported)) * 100}%`, backgroundColor: light(colors.brand) },
                  ]}
                >
                  {series.map((s) => {
                    const v = cell(months[0], s.id).reported;
                    if (v <= 0) return null;
                    const base = Math.max(all.planned, all.reported);
                    return <View key={s.id} style={{ width: `${(v / base) * 100}%`, backgroundColor: s.color }} />;
                  })}
                </View>
              </View>
              <Text style={[styles.pct, pctAll != null && pctAll > 100 && styles.pctOver]}>
                {pctAll == null ? '—' : `${pctAll}%`}
              </Text>
            </View>
            <Text style={styles.caption}>
              {pctAll == null
                ? 'אין תכנון קורסים לחודש — מוצג הדיווח בלבד'
                : pctAll > 100
                  ? `מעל התכנון: דווח ${money(all.reported)} מול פוטנציאל ${money(all.planned)}`
                  : `מימוש ${pctAll}% מהפוטנציאל · ${money(all.reported)} מתוך ${money(all.planned)}`}
            </Text>
          </View>
        ) : (
          // ── סמסטר / שנה: עמודה מסוכמת לכל חודש ──
          <View style={styles.columns}>
            {months.map((m, i) => {
              const future = m.key > currentKey;
              const isNow = m.key === currentKey;
              const sel = selectedMonth === m.key;
              const t = totals[i];
              const pct = realization(t.reported, t.planned);
              // פוטנציאל גבוה מהזום (שנקבע לפי הדיווח) — העמודה קטועה: קו שבור והסכום המלא מעליה.
              const clipped = t.planned > scale;
              return (
                <Pressable
                  key={m.key}
                  onPress={() => onPickMonth(m)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: sel }}
                  accessibilityLabel={`${MONTH_LONG[m.month0]} ${m.year}: דווח ${money(t.reported)}, פוטנציאל ${money(t.planned)}${pct != null ? `, מימוש ${pct}%` : ''}`}
                  style={[styles.col, isNow && styles.colNow, sel && styles.colSel, selectedMonth != null && !sel && styles.dim]}
                >
                  {clipped ? (
                    <Text style={styles.colFull} numberOfLines={1}>
                      {compact(t.planned, res === 'year')}
                    </Text>
                  ) : null}
                  <Text style={[styles.colPct, pct != null && pct > 100 && styles.pctOver]} numberOfLines={1}>
                    {pct == null || t.reported === 0 ? ' ' : res === 'year' ? String(pct) : `${pct}%`}
                  </Text>
                  <View style={[styles.barArea, { width: res === 'semester' ? '56%' : '78%' }]}>
                    {t.planned > 0 ? (
                      <View
                        style={[
                          styles.potential,
                          { height: Math.round(frac(t.planned) * BAR_H), backgroundColor: light(colors.brand) },
                        ]}
                      >
                        {clipped ? (
                          <>
                            <View style={[styles.cut, { top: 12, backgroundColor: isNow ? colors.brandLight : colors.surface }]} />
                            <View style={[styles.cut, { top: 21, backgroundColor: isNow ? colors.brandLight : colors.surface }]} />
                          </>
                        ) : null}
                      </View>
                    ) : null}
                    <View style={styles.stack}>
                      {series.map((s) => {
                        const v = cell(m, s.id).reported;
                        if (v <= 0) return null;
                        return <View key={s.id} style={{ height: Math.round(frac(v) * BAR_H), backgroundColor: s.color }} />;
                      })}
                    </View>
                  </View>
                  <Text
                    style={[styles.label, future && styles.labelFuture, (isNow || sel) && styles.labelNow]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.75}
                  >
                    {res === 'semester' ? MONTH_LONG[m.month0] : MONTH_SHORT[m.month0]}
                  </Text>
                  <Text style={styles.heb} numberOfLines={1}>
                    {hebrewMonthNames(m.year, m.month0)[0]}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}
      </Animated.View>

      {!empty ? (
        <View style={styles.footer}>
          <View style={[styles.swatch, { backgroundColor: light(colors.brand) }]} />
          <Text style={styles.footerText}>
            {res === 'month'
              ? 'רקע בהיר — פוטנציאל לפי תכנון · % — מימוש'
              : `רקע בהיר — פוטנציאל · המספר מעל העמודה — % מימוש${
                  totals.some((t) => t.planned > scale) ? ' · קו שבור — פוטנציאל גבוה מהגרף, הסכום המלא מעליו' : ''
                } · לחיצה על חודש מסננת את הרשימה`}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const makeStyles = (c: ColorScheme, layout: StyleLayout) =>
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
    resRow: { flexDirection: 'row', alignSelf: 'center', padding: 3, gap: 2, borderRadius: 20, backgroundColor: c.background },
    resChip: { minHeight: 34, minWidth: 64, paddingHorizontal: 12, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
    resChipOn: { backgroundColor: c.brand },
    resText: { fontSize: 13, fontWeight: '600', color: c.text },
    resTextOn: { color: c.textOnBrand },
    toolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.md, flexWrap: 'wrap' },
    clear: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      minHeight: 34,
      paddingHorizontal: 12,
      borderRadius: 17,
      backgroundColor: c.brand,
    },
    clearText: { fontSize: 13, fontWeight: '700', color: c.textOnBrand },
    today: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 34 },
    todayText: { fontSize: 13, fontWeight: '700', color: c.brand },
    empty: {
      height: BAR_H,
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      borderRadius: radius.sm,
      backgroundColor: c.background,
    },
    emptyText: { fontSize: 14, color: c.textMuted },
    emptyLink: { fontSize: 14, fontWeight: '700', color: c.brand },
    // ── חודש ──
    monthBox: { gap: 6, paddingHorizontal: spacing.xs, paddingVertical: spacing.xs },
    barRow: { flexDirection: layout.rowStart, alignItems: 'center', gap: spacing.sm },
    track: { flex: 1, height: 26, borderRadius: 8, overflow: 'hidden', flexDirection: layout.rowStart },
    hPotential: { height: '100%', borderRadius: 8, overflow: 'hidden', flexDirection: layout.rowStart },
    pct: { minWidth: 48, fontSize: 16, fontWeight: '800', color: c.text, textAlign: layout.textEnd },
    pctOver: { color: c.brand },
    caption: { fontSize: 12, color: c.textMuted, textAlign: layout.textStart },
    // ── סמסטר / שנה ──
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
    colNow: { backgroundColor: c.brandLight },
    colSel: { borderColor: c.brand },
    colPct: { fontSize: 10, fontWeight: '700', color: c.textMuted, marginBottom: 2 },
    barArea: { height: BAR_H, justifyContent: 'flex-end' },
    potential: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      borderTopLeftRadius: 4,
      borderTopRightRadius: 4,
      overflow: 'hidden',
    },
    cut: { position: 'absolute', left: '-20%', right: '-20%', height: 4, transform: [{ rotate: '-14deg' }] },
    colFull: { fontSize: 9, fontWeight: '700', color: c.textMuted },
    stack: { flexDirection: 'column-reverse', overflow: 'hidden', borderTopLeftRadius: 3, borderTopRightRadius: 3 },
    label: { marginTop: 4, fontSize: 10, fontWeight: '600', color: c.text },
    labelFuture: { color: c.textMuted },
    labelNow: { fontWeight: '800', color: c.brand },
    heb: { fontSize: 9, color: c.textMuted },
    dim: { opacity: 0.45 },
    swatch: { width: 14, height: 14, borderRadius: 3 },
    footer: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    footerText: { flex: 1, fontSize: 11, color: c.textMuted, textAlign: layout.textStart },
  });
