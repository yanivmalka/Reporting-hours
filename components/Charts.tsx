/**
 * רכיבי תצוגה לדשבורד — אריחי מדד, גרף עמודות, פס יחסי ופס התקדמות.
 * בנויים מ־View בלבד (בלי ספריית גרפים), כך שהם עובדים זהה ב־web
 * ובאנדרואיד, מכבדים RTL ומשתמשים בצבעי ערכת הנושא.
 */
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from './Text';
import { Pressable } from './Pressable';
import { radius, spacing } from '../theme/colors';
import { useStyles, type ColorScheme, type StyleLayout } from '../theme/useStyles';

// ───────────────────────── אריח מדד ─────────────────────────

export function StatTile({
  label,
  value,
  sub,
  accent,
  onPress,
}: {
  label: string;
  value: string;
  sub?: string;
  /** אריח מודגש (רקע צבע המותג) */
  accent?: boolean;
  /** לחיצה — מעבר לפירוט */
  onPress?: () => void;
}) {
  const styles = useStyles(makeStyles);
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [styles.tile, accent && styles.tileAccent, pressed && styles.pressed]}
      accessibilityRole={onPress ? 'button' : undefined}
    >
      <Text style={[styles.tileLabel, accent && styles.onAccent]} numberOfLines={1}>
        {label}
      </Text>
      <Text style={[styles.tileValue, accent && styles.onAccent]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      {sub ? (
        <Text style={[styles.tileSub, accent && styles.onAccentMuted]} numberOfLines={2}>
          {sub}
        </Text>
      ) : null}
    </Pressable>
  );
}

/** רשת אריחים בשתי עמודות. */
export function TileGrid({ children }: { children: React.ReactNode }) {
  const styles = useStyles(makeStyles);
  return <View style={styles.grid}>{children}</View>;
}

// ───────────────────────── גרף עמודות ─────────────────────────

export type BarDatum = { key: string; label: string; value: number };

/**
 * גרף עמודות אנכי. לחיצה על עמודה מציגה את ערכה המדויק; כברירת מחדל
 * מודגשת העמודה האחרונה שיש בה ערך.
 */
export function BarChart({
  data,
  format,
  height = 150,
  onOpen,
}: {
  data: BarDatum[];
  format: (value: number) => string;
  height?: number;
  /** קישור "לפירוט" לעמודה הנבחרת */
  onOpen?: (key: string) => void;
}) {
  const styles = useStyles(makeStyles);
  const [selected, setSelected] = useState<string | null>(null);
  const max = Math.max(...data.map((d) => d.value), 0) || 1;
  // ברירת מחדל: העמודה האחרונה שיש בה ערך (החודש הנוכחי עשוי להיות עדיין ריק).
  const lastWithValue = [...data].reverse().find((d) => d.value > 0) ?? data[data.length - 1];
  const active = data.find((d) => d.key === selected) ?? lastWithValue;

  return (
    <View style={styles.chart}>
      {active ? (
        <View style={styles.readoutRow}>
          <Text style={styles.chartReadout}>
            {active.label}: <Text style={styles.chartReadoutValue}>{format(active.value)}</Text>
          </Text>
          {onOpen ? (
            <Pressable onPress={() => onOpen(active.key)} hitSlop={8}>
              <Text style={styles.link}>לפירוט ←</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      <View style={[styles.bars, { height }]}>
        {data.map((d) => {
          const isActive = d.key === active?.key;
          return (
            <Pressable
              key={d.key}
              style={styles.barSlot}
              onPress={() => setSelected(d.key)}
              accessibilityLabel={`${d.label}: ${format(d.value)}`}
            >
              <View
                style={[
                  styles.bar,
                  isActive ? styles.barActive : null,
                  { height: `${Math.max(d.value > 0 ? 3 : 0, (d.value / max) * 100)}%` },
                ]}
              />
            </Pressable>
          );
        })}
      </View>
      <View style={styles.axis}>
        {data.map((d) => (
          <Text key={d.key} style={[styles.axisLabel, d.key === active?.key && styles.axisLabelActive]}>
            {d.label}
          </Text>
        ))}
      </View>
    </View>
  );
}

// ───────────────────────── פס יחסי ─────────────────────────

/** שורה עם תווית, ערך ופס אופקי יחסי (0–1). */
export function ShareRow({
  label,
  value,
  fraction,
  sub,
  onPress,
}: {
  label: string;
  value: string;
  fraction: number;
  sub?: string;
  onPress?: () => void;
}) {
  const styles = useStyles(makeStyles);
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [styles.shareRow, pressed && styles.pressed]}
    >
      <View style={styles.shareHead}>
        <Text style={styles.shareLabel} numberOfLines={1}>
          {label}
        </Text>
        <Text style={styles.shareValue}>{value}</Text>
      </View>
      <ProgressBar fraction={fraction} />
      {sub ? <Text style={styles.shareSub}>{sub}</Text> : null}
    </Pressable>
  );
}

export function ProgressBar({ fraction, thin }: { fraction: number; thin?: boolean }) {
  const styles = useStyles(makeStyles);
  const pct = Math.max(0, Math.min(1, fraction)) * 100;
  return (
    <View style={[styles.track, thin && styles.trackThin]}>
      <View style={[styles.fill, { width: `${pct}%` }]} />
    </View>
  );
}

// ───────────────────────── כרטיס מקטע ─────────────────────────

export function Panel({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  const styles = useStyles(makeStyles);
  return (
    <View style={styles.panel}>
      <View style={styles.panelHead}>
        <Text style={styles.panelTitle}>{title}</Text>
        {subtitle ? <Text style={styles.panelSub}>{subtitle}</Text> : null}
      </View>
      {children}
    </View>
  );
}

const makeStyles = (c: ColorScheme, layout: StyleLayout) =>
  StyleSheet.create({
    grid: {
      flexDirection: layout.rowStart,
      flexWrap: 'wrap',
      gap: spacing.sm,
    },
    tile: {
      flexGrow: 1,
      flexBasis: '46%',
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: radius.md,
      padding: spacing.md,
      gap: 2,
    },
    tileAccent: {
      backgroundColor: c.brand,
      borderColor: c.brand,
    },
    tileLabel: {
      fontSize: 12,
      fontWeight: '600',
      color: c.textMuted,
      textAlign: layout.textStart,
    },
    tileValue: {
      fontSize: 24,
      fontWeight: '800',
      color: c.text,
      textAlign: layout.textStart,
    },
    tileSub: {
      fontSize: 11,
      color: c.textMuted,
      textAlign: layout.textStart,
    },
    onAccent: {
      color: c.textOnBrand,
    },
    onAccentMuted: {
      color: c.textOnBrand,
      opacity: 0.85,
    },
    chart: {
      gap: spacing.sm,
    },
    pressed: {
      opacity: 0.7,
    },
    readoutRow: {
      flexDirection: layout.rowStart,
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
    },
    link: {
      fontSize: 13,
      fontWeight: '700',
      color: c.brand,
    },
    chartReadout: {
      fontSize: 13,
      color: c.textMuted,
      textAlign: layout.textStart,
    },
    chartReadoutValue: {
      fontSize: 15,
      fontWeight: '800',
      color: c.text,
    },
    bars: {
      flexDirection: layout.rowStart,
      alignItems: 'flex-end',
      gap: spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    barSlot: {
      flex: 1,
      height: '100%',
      justifyContent: 'flex-end',
    },
    bar: {
      width: '100%',
      borderTopLeftRadius: 4,
      borderTopRightRadius: 4,
      backgroundColor: c.brandLight,
    },
    barActive: {
      backgroundColor: c.brand,
    },
    axis: {
      flexDirection: layout.rowStart,
      gap: spacing.sm,
    },
    axisLabel: {
      flex: 1,
      fontSize: 11,
      color: c.textMuted,
      textAlign: 'center',
    },
    axisLabelActive: {
      color: c.text,
      fontWeight: '700',
    },
    shareRow: {
      gap: 4,
    },
    shareHead: {
      flexDirection: layout.rowStart,
      justifyContent: 'space-between',
      gap: spacing.sm,
    },
    shareLabel: {
      flex: 1,
      fontSize: 13,
      color: c.text,
      textAlign: layout.textStart,
    },
    shareValue: {
      fontSize: 13,
      fontWeight: '700',
      color: c.text,
    },
    shareSub: {
      fontSize: 11,
      color: c.textMuted,
      textAlign: layout.textStart,
    },
    track: {
      height: 8,
      borderRadius: 4,
      backgroundColor: c.brandLight,
      overflow: 'hidden',
    },
    trackThin: {
      height: 5,
    },
    fill: {
      height: '100%',
      borderRadius: 4,
      backgroundColor: c.brand,
    },
    panel: {
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: radius.md,
      padding: spacing.md,
      gap: spacing.md,
    },
    panelHead: {
      gap: 2,
    },
    panelTitle: {
      fontSize: 16,
      fontWeight: '800',
      color: c.text,
      textAlign: layout.textStart,
    },
    panelSub: {
      fontSize: 12,
      color: c.textMuted,
      textAlign: layout.textStart,
    },
  });
