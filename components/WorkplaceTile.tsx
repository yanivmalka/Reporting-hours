/**
 * אריח מקום עבודה בלוח הבקרה — מאחד את פס הגרף ואת פירוט המקום:
 *   - מצב מצומצם: שם מלא, סכום שדווח, פס (רקע בהיר = פוטנציאל) ואחוז מימוש.
 *     כשהדיווח עולה על התכנון — הפס מלא, והחלק שמעבר לתכנון מסומן בגוון
 *     כהה יותר אחרי קו הפרדה.
 *   - מצב מורחב (לחיצה על האריח או על החץ): סטטוס, צפי תשלום, איחור בדיווח,
 *     סינון למקום הזה ומעבר לפירוט המלא.
 */
import { StyleSheet, View } from 'react-native';
import { Text } from './Text';
import { Pressable } from './Pressable';
import { Icon } from './Icon';
import { money, realization } from './ForecastChart';
import { useTheme } from '../theme/ThemeContext';
import { radius, spacing } from '../theme/colors';
import { mix } from '../theme/shades';
import { useStyles, type ColorScheme, type StyleLayout } from '../theme/useStyles';

type Props = {
  name: string;
  color: string;
  reported: number;
  planned: number;
  /** סקאלת הפס המשותפת לכל האריחים (מקסימום בפועל + שליש) */
  scale: number;
  expanded: boolean;
  onToggle: () => void;
  /** שורות מידע נוסף למצב מורחב */
  details: { text: string; tone?: 'warn' | 'muted' }[];
  status?: { label: string; bg: string; fg: string } | null;
  filtered: boolean;
  onFilter: () => void;
  onOpen: () => void;
};

export function WorkplaceTile({
  name,
  color,
  reported,
  planned,
  scale,
  expanded,
  onToggle,
  details,
  status,
  filtered,
  onFilter,
  onOpen,
}: Props) {
  const styles = useStyles(makeStyles);
  const { colors } = useTheme();
  const frac = (v: number) => Math.min(1, Math.max(0, v) / (scale || 1));
  const pct = realization(reported, planned);
  const over = planned > 0 && reported > planned;
  const light = mix(color, colors.surface, 0.72);
  const deeper = mix(color, colors.text, 0.35);

  return (
    <View style={[styles.card, filtered && { borderColor: color, borderWidth: 2 }]}>
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={`${name}: דווח ${money(reported)}${planned > 0 ? `, פוטנציאל ${money(planned)}, מימוש ${pct}%` : ''}`}
        style={styles.main}
      >
        <View style={styles.head}>
          <View style={[styles.dot, { backgroundColor: color }]} />
          <Text style={styles.name}>{name}</Text>
          <Text style={styles.value}>{money(reported)}</Text>
          <Icon name={expanded ? 'chevron-up' : 'chevron-down'} size={22} color={colors.textMuted} />
        </View>
        <View style={styles.barRow}>
          <View style={styles.track}>
            {over ? (
              // מעל התכנון: עד התכנון — הצבע, קו הפרדה, ומעבר לו — גוון כהה יותר.
              <View style={[styles.fillRow, { width: `${frac(reported) * 100}%` }]}>
                <View style={{ width: `${(planned / reported) * 100}%`, backgroundColor: color }} />
                <View style={[styles.sep, { backgroundColor: colors.surface }]} />
                <View style={{ flex: 1, backgroundColor: deeper }} />
              </View>
            ) : planned > 0 ? (
              <View style={[styles.fillRow, { width: `${frac(planned) * 100}%`, backgroundColor: light }]}>
                {reported > 0 ? (
                  <View style={{ width: `${Math.max(2, (reported / planned) * 100)}%`, backgroundColor: color }} />
                ) : null}
              </View>
            ) : reported > 0 ? (
              <View style={[styles.fillRow, { width: `${frac(reported) * 100}%`, backgroundColor: color }]} />
            ) : null}
          </View>
          <Text style={[styles.pct, over && styles.pctOver]}>{pct == null ? '—' : `${pct}%`}</Text>
        </View>
        {over ? (
          <Text style={styles.sub}>מעל התכנון · פוטנציאל {money(planned)}</Text>
        ) : planned > 0 ? (
          <Text style={styles.sub}>פוטנציאל {money(planned)}</Text>
        ) : (
          <Text style={styles.sub}>ללא תכנון קורסים</Text>
        )}
      </Pressable>

      {expanded ? (
        <View style={styles.more}>
          {status ? (
            <View style={[styles.chip, { backgroundColor: status.bg }]}>
              <Text style={[styles.chipText, { color: status.fg }]}>{status.label}</Text>
            </View>
          ) : null}
          {details.map((d) => (
            <Text key={d.text} style={[styles.detail, d.tone === 'warn' && styles.warn]}>
              {d.text}
            </Text>
          ))}
          <View style={styles.actions}>
            <Pressable onPress={onFilter} accessibilityRole="button" style={[styles.action, filtered && styles.actionOn]}>
              <Icon name={filtered ? 'filter-remove-outline' : 'filter-outline'} size={18} color={filtered ? colors.textOnBrand : colors.brand} />
              <Text style={[styles.actionText, filtered && styles.actionTextOn]}>
                {filtered ? 'נקה סינון' : 'הצג רק מקום זה'}
              </Text>
            </Pressable>
            <Pressable onPress={onOpen} accessibilityRole="button" style={styles.action}>
              <Text style={styles.actionText}>פירוט מקום העבודה</Text>
              <Icon name="chevron-left" size={18} color={colors.brand} />
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const makeStyles = (c: ColorScheme, layout: StyleLayout) =>
  StyleSheet.create({
    card: {
      borderRadius: 16,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      overflow: 'hidden',
    },
    main: { padding: 14, gap: 6 },
    head: { flexDirection: layout.rowStart, alignItems: 'center', gap: spacing.sm },
    dot: { width: 12, height: 12, borderRadius: 6 },
    name: { flex: 1, fontSize: 15, fontWeight: '700', color: c.text, textAlign: layout.textStart },
    value: { fontSize: 15, fontWeight: '800', color: c.text },
    barRow: { flexDirection: layout.rowStart, alignItems: 'center', gap: spacing.sm },
    track: { flex: 1, height: 16, borderRadius: 8, overflow: 'hidden', flexDirection: layout.rowStart },
    fillRow: { height: '100%', borderRadius: 8, overflow: 'hidden', flexDirection: layout.rowStart },
    sep: { width: 2 },
    pct: { minWidth: 46, fontSize: 14, fontWeight: '800', color: c.text, textAlign: layout.textEnd },
    pctOver: { color: c.brand },
    sub: { fontSize: 12, color: c.textMuted, textAlign: layout.textStart },
    more: {
      gap: 6,
      paddingHorizontal: 14,
      paddingBottom: 14,
      paddingTop: 10,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.border,
    },
    chip: { alignSelf: 'flex-start', paddingHorizontal: 9, paddingVertical: 3, borderRadius: 10 },
    chipText: { fontSize: 12, fontWeight: '700' },
    detail: { fontSize: 13, color: c.textMuted, textAlign: layout.textStart },
    warn: { color: c.warning, fontWeight: '700' },
    actions: { flexDirection: layout.rowStart, flexWrap: 'wrap', gap: spacing.sm, paddingTop: 4 },
    action: {
      flexDirection: layout.rowStart,
      alignItems: 'center',
      gap: 4,
      minHeight: 40,
      paddingHorizontal: 12,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: c.brand,
    },
    actionOn: { backgroundColor: c.brand },
    actionText: { fontSize: 13, fontWeight: '700', color: c.brand },
    actionTextOn: { color: c.textOnBrand },
  });
