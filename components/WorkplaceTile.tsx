/**
 * אריח מקום עבודה בלוח הבקרה — מאחד את פס הגרף ואת פירוט המקום:
 *   - מצב מצומצם: שם מלא, סכום שדווח, פס (רקע בהיר = פוטנציאל, גוון ביניים =
 *     צפי) ואחוז מימוש. מתחת: "פוטנציאל", ומשמאלו "צפי" — רק כשהצפי שונה.
 *     כשהדיווח עולה על התכנון — הפס מלא, והחלק שמעבר לתכנון מסומן בגוון
 *     כהה יותר אחרי קו הפרדה.
 *     ושורת סטטוס: תגית מצב הדוח וצפי התשלום (או מתי התקבל).
 *   - מצב מורחב (לחיצה על האריח או על החץ): פירוט המפגשים לפי קורס (עיגולים צבעוניים; שם
 *     הקורס — קישור לקורס), מועדים, איחור בדיווח, נטו / ברוטו ואחוז המס, ובסוף — שורת קישור
 *     למקום העבודה ("מקום העבודה  <שם> ‹"), בדפוס הקבוע של קישור לרשומה קשורה.
 */
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from './Text';
import { Pressable } from './Pressable';
import { Icon } from './Icon';
import { EnterChevron } from './Chevrons';
import { InfoLine } from './InfoLine';
import { money, realization } from './ForecastChart';
import { useTheme } from '../theme/ThemeContext';
import { cardShadow, spacing } from '../theme/colors';
import { mix } from '../theme/shades';
import { useStyles, type ColorScheme, type StyleLayout } from '../theme/useStyles';

type Props = {
  name: string;
  color: string;
  reported: number;
  planned: number;
  /** צפי: הפוטנציאל בלי המפגשים שבוטלו */
  forecast: number;
  /** פירוט המפגשים לפי קורס — במצב מורחב */
  sessions?: ReactNode;
  /** סקאלת הפס המשותפת לכל האריחים (מקסימום בפועל + שליש) */
  scale: number;
  expanded: boolean;
  onToggle: () => void;
  /** שורות מידע נוסף למצב מורחב — כל שורה מחלקים, ושבירת שורה רק בין החלקים */
  details: { parts: string[]; tone?: 'warn' | 'muted' }[];
  /** מצב הדוח ומועד התשלום — גם במצב המצומצם */
  status?: { label: string; bg: string; fg: string; payment?: string } | null;
  onOpen: () => void;
};

export function WorkplaceTile({
  name,
  color,
  reported,
  planned,
  forecast,
  sessions,
  scale,
  expanded,
  onToggle,
  details,
  status,
  onOpen,
}: Props) {
  const styles = useStyles(makeStyles);
  const { colors } = useTheme();
  const frac = (v: number) => Math.min(1, Math.max(0, v) / (scale || 1));
  const pct = realization(reported, planned);
  const over = planned > 0 && reported > planned;
  const light = mix(color, colors.surface, 0.72);
  const deeper = mix(color, colors.text, 0.35);
  const mid = mix(color, colors.surface, 0.45);
  const showForecast = planned > 0 && Math.round(forecast) !== Math.round(planned);

  return (
    <View style={styles.card}>
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={`${name}: דווח ${money(reported)}${planned > 0 ? `, פוטנציאל ${money(planned)}${showForecast ? `, צפי ${money(forecast)}` : ''}, מימוש ${pct}%` : ''}`}
        style={styles.main}
      >
        <View style={styles.head}>
          <View style={[styles.dot, { backgroundColor: color }]} />
          <Text style={styles.name}>{name}</Text>
          <View style={styles.valueBox}>
            <Text style={styles.value}>{money(reported)}</Text>
          </View>
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
                {showForecast && forecast > reported ? (
                  <View style={[styles.layer, { width: `${(forecast / planned) * 100}%`, backgroundColor: mid }]} />
                ) : null}
                {reported > 0 ? (
                  <View style={{ width: `${Math.max(2, (reported / planned) * 100)}%`, backgroundColor: color }} />
                ) : null}
                {planned > scale ? (
                  // הפוטנציאל גבוה מהסקאלה — הפס קטוע (קו שבור בקצה).
                  <>
                    <View style={[styles.cut, { end: 14, backgroundColor: colors.surface }]} />
                    <View style={[styles.cut, { end: 22, backgroundColor: colors.surface }]} />
                  </>
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
          <View style={styles.subRow}>
            <Text style={styles.sub}>פוטנציאל {money(planned)}</Text>
            {showForecast ? <Text style={styles.subForecast}>צפי {money(forecast)}</Text> : null}
          </View>
        ) : (
          <Text style={styles.sub}>ללא תכנון קורסים</Text>
        )}
        {status ? (
          <View style={styles.statusRow}>
            <View style={[styles.chip, { backgroundColor: status.bg }]}>
              <Text style={[styles.chipText, { color: status.fg }]}>{status.label}</Text>
            </View>
            {status.payment ? <Text style={styles.payment}>{status.payment}</Text> : null}
          </View>
        ) : null}
      </Pressable>

      {expanded ? (
        <View style={styles.more}>
          {sessions}
          {details.map((d) => (
            <InfoLine key={d.parts.join('|')} parts={d.parts} style={[styles.detail, d.tone === 'warn' && styles.warn]} />
          ))}
          <Pressable
            onPress={onOpen}
            accessibilityRole="link"
            accessibilityLabel={`מקום העבודה ${name}`}
            style={({ pressed }) => [styles.linkRow, pressed && { opacity: 0.6 }]}
          >
            <Text style={styles.linkLabel}>מקום העבודה</Text>
            <Text style={styles.linkValue} numberOfLines={1}>
              {name}
            </Text>
            <EnterChevron color={colors.brand} />
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const makeStyles = (c: ColorScheme, layout: StyleLayout) =>
  StyleSheet.create({
    cut: { position: 'absolute', top: '-30%', bottom: '-30%', width: 3, transform: [{ rotate: '18deg' }] },
    card: {
      borderRadius: 16,
      backgroundColor: c.surface,
      overflow: 'hidden',
      ...cardShadow,
    },
    main: { padding: 14, gap: 6 },
    head: { flexDirection: layout.rowStart, alignItems: 'center', gap: spacing.sm },
    dot: { width: 12, height: 12, borderRadius: 6 },
    name: { flex: 1, fontSize: 15, fontWeight: '700', color: c.text, textAlign: layout.textStart },
    value: { fontSize: 15, fontWeight: '800', color: c.text },
    valueBox: { alignItems: 'flex-end' },
    valueSub: { fontSize: 11, color: c.textMuted },
    gross: { fontSize: 12, color: c.textMuted, textAlign: layout.textEnd },
    barRow: { flexDirection: layout.rowStart, alignItems: 'center', gap: spacing.sm },
    track: { flex: 1, height: 16, borderRadius: 8, overflow: 'hidden', flexDirection: layout.rowStart },
    fillRow: { height: '100%', borderRadius: 8, overflow: 'hidden', flexDirection: layout.rowStart },
    sep: { width: 2 },
    pct: { minWidth: 46, fontSize: 14, fontWeight: '800', color: c.text, textAlign: layout.textEnd },
    pctOver: { color: c.brand },
    sub: { fontSize: 12, color: c.textMuted, textAlign: layout.textStart },
    subRow: { flexDirection: layout.rowStart, justifyContent: 'space-between', gap: spacing.sm },
    subForecast: { fontSize: 12, fontWeight: '700', color: c.brand },
    layer: { position: 'absolute', top: 0, bottom: 0, start: 0 },
    more: {
      gap: 6,
      paddingHorizontal: 14,
      paddingBottom: 14,
      paddingTop: 10,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.border,
    },
    statusRow: { flexDirection: layout.rowStart, flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm, paddingTop: 2 },
    payment: { fontSize: 12, fontWeight: '700', color: c.text, textAlign: layout.textStart },
    chip: { alignSelf: 'flex-start', paddingHorizontal: 9, paddingVertical: 3, borderRadius: 10 },
    chipText: { fontSize: 12, fontWeight: '700' },
    detail: { fontSize: 13, color: c.textMuted, textAlign: layout.textStart },
    warn: { color: c.warning, fontWeight: '700' },
    linkRow: {
      flexDirection: layout.rowStart,
      alignItems: 'center',
      gap: spacing.sm,
      minHeight: 44,
      marginTop: 4,
      paddingTop: 6,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.border,
    },
    linkLabel: { fontSize: 13, color: c.textMuted, textAlign: layout.textStart },
    linkValue: { flex: 1, fontSize: 14, fontWeight: '700', color: c.brand, textAlign: layout.textEnd },
  });
