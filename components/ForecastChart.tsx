/**
 * גרף צפי התשלומים בשלוש רזולוציות:
 *   - חודש (ברירת מחדל) — שורה אופקית לכל מקום עבודה: השם המלא והסכום
 *     בשורה אחת, ומתחתם פס. כך אין קיצורי "…" גם כשיש מקומות רבים.
 *   - סמסטר / שנה — עמודה אחת לכל חודש (סכום כל המקומות, בגווני המקומות).
 *
 * הזום נקבע לפי הדיווח בפועל: הערך המקסימלי בתצוגה ועוד שליש.
 * הפוטנציאל (לפי תכנון הקורסים) — רקע בהיר ללא מסגרת מאחורי הדיווח;
 * כשהוא גבוה מהסקאלה הוא נחתך בקצה.
 * מעבר תקופה (חצים / החלקה) — הבהוב קצר של הכותרת. בלי נתונים — הודעה
 * על הגרף עם קישור לחודש עם נתונים.
 */
import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { Pressable } from './Pressable';
import { Icon } from './Icon';
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
  /** מקומות העבודה — סדר הערימה (מלמטה למעלה) וצבע לכל אחד */
  series: ChartSeries[];
  selectedWp: string | null;
  onPickWp: (id: string) => void;
  /** לחיצה על חודש בתצוגת סמסטר / שנה */
  onPickMonth: (m: ForecastMonth) => void;
  /** "YYYY-MM" של החודש הנוכחי */
  currentKey: string;
  /** יש מסנן / תצוגה שאינה החודש הנוכחי — מוצג "נקה" */
  onClear?: () => void;
  /** בלי נתונים בתצוגה: קישור לחודש עם נתונים */
  emptyLink: { label: string; onPress: () => void };
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
  onClear,
  emptyLink,
}: Props) {
  const styles = useStyles(makeStyles);
  const { colors } = useTheme();
  const { isRTL } = useI18n();
  const swipe = useSwipe(onNext, onPrev);

  // הבהוב קצר של הכותרת בכל מעבר תקופה / רזולוציה.
  const flash = useRef(new Animated.Value(1)).current;
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    flash.setValue(0.2);
    Animated.timing(flash, { toValue: 1, duration: 320, useNativeDriver: true }).start();
  }, [title, res, flash]);

  const cell = (m: ForecastMonth, id: string) => m.byWorkplace[id] ?? { reported: 0, planned: 0 };
  const faded = (id: string) => selectedWp != null && selectedWp !== id;
  const light = (color: string) => mix(color, colors.surface, 0.72);

  // ── הנתונים בתצוגה והסקאלה: המקסימום בפועל + שליש ──
  const rows =
    res === 'month'
      ? series
          .map((s) => ({ ...s, ...cell(months[0], s.id) }))
          .filter((r) => r.reported > 0 || r.planned > 0)
          .sort((a, b) => b.reported - a.reported || b.planned - a.planned)
      : [];
  const totals = months.map((m) =>
    selectedWp ? cell(m, selectedWp) : { reported: m.reported, planned: m.planned },
  );
  const bars = res === 'month' ? rows : totals;
  const maxReported = Math.max(0, ...bars.map((b) => b.reported));
  const maxPlanned = Math.max(0, ...bars.map((b) => b.planned));
  const scale = maxReported > 0 ? maxReported * HEADROOM : maxPlanned > 0 ? maxPlanned : 1;
  const frac = (v: number) => Math.min(1, Math.max(0, v) / scale);
  const empty = maxReported === 0 && maxPlanned === 0;
  const legendIds = new Set(
    months.flatMap((m) => series.filter((s) => cell(m, s.id).reported > 0).map((s) => s.id)),
  );

  return (
    <View style={styles.wrap} {...swipe}>
      <View style={styles.head}>
        <Pressable onPress={onPrev} style={styles.nav} accessibilityRole="button" accessibilityLabel="הקודם">
          <Icon name={isRTL ? 'chevron-right' : 'chevron-left'} size={24} color={colors.brand} />
        </Pressable>
        <Animated.View style={[styles.titleBox, { opacity: flash }]}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.titleSub} numberOfLines={1}>
            {subtitle}
          </Text>
        </Animated.View>
        <Pressable onPress={onNext} style={styles.nav} accessibilityRole="button" accessibilityLabel="הבא">
          <Icon name={isRTL ? 'chevron-left' : 'chevron-right'} size={24} color={colors.brand} />
        </Pressable>
      </View>

      <View style={styles.toolbar}>
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
        {onClear ? (
          <Pressable onPress={onClear} accessibilityRole="button" accessibilityLabel="ניקוי — חזרה לחודש הנוכחי" style={styles.clear}>
            <Icon name="close" size={16} color={colors.brand} />
            <Text style={styles.clearText}>נקה</Text>
          </Pressable>
        ) : null}
      </View>

      {empty ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>אין נתונים ל{title}</Text>
          <Pressable onPress={emptyLink.onPress} accessibilityRole="link" hitSlop={8}>
            <Text style={styles.emptyLink}>{emptyLink.label} ←</Text>
          </Pressable>
        </View>
      ) : res === 'month' ? (
        // ── חודש: שורה לכל מקום עבודה — שם מלא, סכום ופס ──
        <View style={styles.rows}>
          {rows.map((r) => {
            const on = selectedWp === r.id;
            return (
              <Pressable
                key={r.id}
                onPress={() => onPickWp(r.id)}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={`${r.name}: דווח ${money(r.reported)}, פוטנציאל ${money(r.planned)}`}
                style={[styles.hRow, faded(r.id) && styles.dim]}
              >
                <View style={styles.hHead}>
                  <View style={[styles.dot, { backgroundColor: r.color }]} />
                  <Text style={[styles.hName, on && styles.hNameOn]}>{r.name}</Text>
                  <Text style={styles.hValue}>{money(r.reported)}</Text>
                </View>
                {/* בלי מיקום מוחלט — כדי שהפס יזרום נכון ב־RTL גם באנדרואיד וגם ב־web */}
                <View style={styles.track}>
                  {r.planned > r.reported ? (
                    <View style={[styles.hPotential, { width: `${frac(r.planned) * 100}%`, backgroundColor: light(r.color) }]}>
                      {r.reported > 0 ? (
                        <View
                          style={[
                            styles.hFill,
                            { width: `${Math.max(2, (r.reported / r.planned) * 100)}%`, backgroundColor: r.color },
                          ]}
                        />
                      ) : null}
                    </View>
                  ) : (
                    <View style={[styles.hFill, { width: `${Math.max(1.5, frac(r.reported) * 100)}%`, backgroundColor: r.color }]} />
                  )}
                </View>
                {r.planned > r.reported ? (
                  <Text style={styles.hSub}>פוטנציאל {money(r.planned)}</Text>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      ) : (
        // ── סמסטר / שנה: עמודה מסוכמת לכל חודש ──
        <View style={styles.columns}>
          {months.map((m, i) => {
            const future = m.key > currentKey;
            const isNow = m.key === currentKey;
            const total = totals[i];
            return (
              <Pressable
                key={m.key}
                onPress={() => onPickMonth(m)}
                accessibilityRole="button"
                accessibilityLabel={`${MONTH_LONG[m.month0]} ${m.year}: דווח ${money(total.reported)}, פוטנציאל ${money(total.planned)}`}
                style={[styles.col, isNow && styles.colNow]}
              >
                <View style={[styles.barArea, { width: res === 'semester' ? '56%' : '78%' }]}>
                  {total.planned > 0 ? (
                    <View
                      style={[
                        styles.potential,
                        { height: Math.round(frac(total.planned) * BAR_H), backgroundColor: light(colors.brand) },
                      ]}
                    />
                  ) : null}
                  <View style={styles.stack}>
                    {series.map((s) => {
                      const v = cell(m, s.id).reported;
                      if (v <= 0 || faded(s.id)) return null;
                      return <View key={s.id} style={{ height: Math.round(frac(v) * BAR_H), backgroundColor: s.color }} />;
                    })}
                  </View>
                </View>
                <Text style={[styles.label, future && styles.labelFuture, isNow && styles.labelNow]}>
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

      {!empty && res !== 'month' ? (
        <View style={styles.legend}>
          {series
            .filter((s) => legendIds.has(s.id))
            .map((s) => (
              <Pressable
                key={s.id}
                onPress={() => onPickWp(s.id)}
                accessibilityRole="button"
                accessibilityState={{ selected: selectedWp === s.id }}
                style={[styles.legendItem, faded(s.id) && styles.dim]}
              >
                <View style={[styles.swatch, { backgroundColor: s.color }]} />
                <Text style={styles.legendText}>{s.name}</Text>
              </Pressable>
            ))}
        </View>
      ) : null}
      {!empty ? (
        <View style={styles.footer}>
          <View style={[styles.swatch, { backgroundColor: light(colors.brand) }]} />
          <Text style={styles.legendText}>
            {res === 'month' ? 'רקע בהיר — פוטנציאל לפי תכנון' : 'רקע בהיר — פוטנציאל · לחיצה על חודש לפירוט'}
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
    toolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
    resRow: { flexDirection: 'row', padding: 3, gap: 2, borderRadius: 20, backgroundColor: c.background },
    resChip: { minHeight: 34, minWidth: 60, paddingHorizontal: 12, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
    resChipOn: { backgroundColor: c.brand },
    resText: { fontSize: 13, fontWeight: '600', color: c.text },
    resTextOn: { color: c.textOnBrand },
    clear: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      minHeight: 34,
      paddingHorizontal: 10,
      borderRadius: 17,
      borderWidth: 1,
      borderColor: c.brand,
    },
    clearText: { fontSize: 13, fontWeight: '700', color: c.brand },
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
    // ── חודש: שורות אופקיות ──
    rows: { gap: spacing.sm, paddingHorizontal: spacing.xs },
    hRow: { gap: 5, paddingVertical: 2 },
    hHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    dot: { width: 10, height: 10, borderRadius: 5 },
    hName: { flex: 1, fontSize: 14, fontWeight: '600', color: c.text, textAlign: layout.textStart },
    hNameOn: { fontWeight: '800', color: c.brand },
    hValue: { fontSize: 14, fontWeight: '800', color: c.text },
    track: { height: 14, borderRadius: 7, overflow: 'hidden', flexDirection: layout.rowStart },
    // הפוטנציאל — רקע בהיר בלי מסגרת, מאחורי הדיווח.
    hPotential: { height: '100%', borderRadius: 7, flexDirection: layout.rowStart },
    hFill: { height: '100%', borderRadius: 7 },
    hSub: { fontSize: 11, color: c.textMuted, textAlign: layout.textStart },
    // ── סמסטר / שנה: עמודות ──
    columns: { flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
    col: { flex: 1, minWidth: 0, alignItems: 'center', paddingVertical: 4, borderRadius: radius.sm },
    colNow: { backgroundColor: c.brandLight },
    barArea: { height: BAR_H, justifyContent: 'flex-end' },
    potential: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      borderTopLeftRadius: 4,
      borderTopRightRadius: 4,
    },
    stack: { flexDirection: 'column-reverse', overflow: 'hidden', borderTopLeftRadius: 3, borderTopRightRadius: 3 },
    label: { marginTop: 4, fontSize: 10, fontWeight: '600', color: c.text },
    labelFuture: { color: c.textMuted },
    labelNow: { fontWeight: '800', color: c.brand },
    heb: { fontSize: 9, color: c.textMuted },
    dim: { opacity: 0.35 },
    legend: { gap: 6, paddingTop: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border },
    legendItem: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 28 },
    swatch: { width: 14, height: 14, borderRadius: 3 },
    legendText: { flex: 1, fontSize: 12, color: c.textMuted, textAlign: layout.textStart },
    footer: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  });
