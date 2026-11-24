/**
 * ציר מועדי התשלום בלוח הבקרה: מחודש אחורה ועד כשלושה חודשים קדימה.
 * לכל תשלום נקודה בתאריך הצפוי, בצבע מקום העבודה — טבעת: צפוי · מלאה: שולם בזמן ·
 * מלאה עם מסגרת אדומה: שולם באיחור · טבעת אדומה: עבר המועד ולא סומן. מתחת — רשימה
 * לפי תאריך; לחיצה פותחת את דוח השכר. תאריכים מוקדמים מימין (RTL).
 */
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Text } from './Text';
import { Pressable } from './Pressable';
import { EnterChevron } from './Chevrons';
import { isoDate, shortDate } from '../lib/dashboard';
import type { ReactNode } from 'react';
import type { ScheduledPayment } from '../lib/forecast';
import { money } from '../lib/travel';
import { useTheme } from '../theme/ThemeContext';
import { useThemedStyles } from '../theme/useThemedStyles';
import { workplaceColor } from '../theme/workplaceColors';
import { cardShadow, radius, spacing, type AppColors } from '../theme/colors';
import { TEXT_RIGHT } from '../theme/align';

const MONTHS = ['ינו׳', 'פבר׳', 'מרץ', 'אפר׳', 'מאי', 'יוני', 'יולי', 'אוג׳', 'ספט׳', 'אוק׳', 'נוב׳', 'דצמ׳'];
const DAY = 86_400_000;
const t = (iso: string) => new Date(`${iso}T12:00:00`).getTime();

/** חלון הציר: מתחילת החודש הקודם ועד סוף החודש השלישי קדימה. */
export function timelineWindow(today: Date = new Date()): { from: string; to: string } {
  return {
    from: isoDate(new Date(today.getFullYear(), today.getMonth() - 1, 1)),
    to: isoDate(new Date(today.getFullYear(), today.getMonth() + 4, 0)),
  };
}

const DOT = 12;
/** מרווח אנכי בין נקודות באותו טור */
const STEP = 9;
/** עד כמה נקודות בטור; מעבר לזה — "+N" */
const MAX_STACK = 4;
/** כמה שורות ברשימה לפני "הצגת הכול" */
const LIST_LIMIT = 5;
const dm = (iso: string) => `${Number(iso.slice(8))}.${Number(iso.slice(5, 7))}`;

export function PaymentTimeline({
  payments,
  from,
  to,
  today,
}: {
  payments: readonly ScheduledPayment[];
  from: string;
  to: string;
  today: string;
}) {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const span = t(to) - t(from) || DAY;
  const pos = (iso: string) => Math.min(100, Math.max(0, ((t(iso) - t(from)) / span) * 100));

  // טור לכל תאריך (או תאריכים קרובים, פחות מ־3% זה מזה): הנקודות נערמות בו, עד MAX_STACK.
  const columns = useMemo(() => {
    const cols: { x: number; list: ScheduledPayment[] }[] = [];
    for (const p of payments) {
      const x = pos(p.expected);
      const col = cols.find((c) => Math.abs(c.x - x) < 3);
      if (col) col.list.push(p);
      else cols.push({ x, list: [p] });
    }
    // עבר המועד / באיחור — בראש הטור, כדי שיבלטו.
    const rank = { overdue: 0, paidLate: 1, upcoming: 2, paidOnTime: 3 } as const;
    for (const c of cols) c.list.sort((a, b) => rank[a.state] - rank[b.state]);
    return cols;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payments, from, to]);
  const tallest = Math.min(MAX_STACK, Math.max(1, ...columns.map((c) => c.list.length)));
  const trackHeight = DOT + (tallest - 1) * STEP + 14;
  const [all, setAll] = useState(false);
  // ברשימה: קודם מה שדורש תשומת לב ומה שלפניך; מה שכבר התקבל — רק ב"הצגת הכול".
  const pending = payments.filter((p) => p.state === 'overdue' || p.state === 'upcoming');
  const listed = all ? payments : pending.slice(0, LIST_LIMIT);
  const hiddenCount = payments.length - listed.length;

  const ticks: { iso: string; label: string }[] = [];
  for (let d = new Date(t(from)); isoDate(d) <= to; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
    ticks.push({ iso: isoDate(d), label: MONTHS[d.getMonth()] });
  }

  const dotStyle = (p: ScheduledPayment) => {
    const c = workplaceColor(colors, p.workplace);
    switch (p.state) {
      case 'paidOnTime':
        return { backgroundColor: c, borderColor: c };
      case 'paidLate':
        return { backgroundColor: c, borderColor: colors.danger };
      case 'overdue':
        return { backgroundColor: colors.surface, borderColor: colors.danger };
      default:
        return { backgroundColor: colors.surface, borderColor: c };
    }
  };

  const stateText = (p: ScheduledPayment): { text: string; warn?: boolean } => {
    switch (p.state) {
      case 'paidOnTime':
        return { text: `התקבל ${shortDate(p.paidAt as string)} · בזמן` };
      case 'paidLate':
        return { text: `התקבל ${shortDate(p.paidAt as string)} · באיחור ${p.daysLate} ימים`, warn: true };
      case 'overdue':
        return { text: `טרם סומן · ${p.daysLate} ימים אחרי המועד`, warn: true };
      default:
        return { text: p.expected === today ? 'צפוי היום' : p.estimate ? 'צפי' : 'ממתין' };
    }
  };

  return (
    <View style={styles.card}>
      <Text style={styles.title}>מועדי תשלום</Text>
      {/* מיקום אופקי בשורה (spacer ברוחב האחוז) — כך הכיוון זהה לשאר הממשק (RTL) בכל פלטפורמה. */}
      <View style={[styles.track, { height: trackHeight }]}>
        <View style={styles.axis} />
        {ticks.map((k) => (
          <At key={k.iso} x={pos(k.iso)} style={styles.bottom}>
            <View style={styles.tick} />
          </At>
        ))}
        <At x={pos(today)} style={styles.fill}>
          <View style={styles.todayLine} />
        </At>
        {columns.map((c) => (
          <At key={c.x} x={c.x} style={styles.bottom}>
            <View style={styles.column}>
              {c.list.length > MAX_STACK ? (
                <Text style={styles.more}>+{c.list.length - (MAX_STACK - 1)}</Text>
              ) : null}
              {c.list
                .slice(0, c.list.length > MAX_STACK ? MAX_STACK - 1 : MAX_STACK)
                .reverse()
                .map((p, i) => (
                  <View
                    key={`${p.workplace.id}|${p.period.start}`}
                    style={[styles.dot, dotStyle(p), i > 0 && { marginTop: STEP - DOT }]}
                    accessibilityLabel={`${p.workplace.name} ${dm(p.expected)}`}
                  />
                ))}
            </View>
          </At>
        ))}
      </View>
      <View style={styles.labels}>
        {ticks.map((k) => (
          <At key={k.iso} x={pos(k.iso)} style={styles.top}>
            <Text style={styles.tickLabel}>{k.label}</Text>
          </At>
        ))}
      </View>
      <View style={styles.labels}>
        <At x={pos(today)} style={styles.top}>
          <Text style={styles.todayLabel}>היום {dm(today)}</Text>
        </At>
      </View>

      <View style={styles.legend}>
        <Legend style={{ backgroundColor: colors.surface, borderColor: colors.textMuted }} label="צפוי" />
        <Legend style={{ backgroundColor: colors.textMuted, borderColor: colors.textMuted }} label="התקבל" />
        <Legend style={{ backgroundColor: colors.textMuted, borderColor: colors.danger }} label="התקבל באיחור" />
        <Legend style={{ backgroundColor: colors.surface, borderColor: colors.danger }} label="לא סומן" />
      </View>

      {payments.length === 0 ? (
        <Text style={styles.empty}>אין תשלומים צפויים בתקופה הזו.</Text>
      ) : (
        listed.map((p) => {
          const s = stateText(p);
          return (
            <Pressable
              key={`${p.workplace.id}|${p.period.start}`}
              accessibilityRole="button"
              onPress={() =>
                router.push({ pathname: '/payroll-report', params: { wp: p.workplace.id, start: p.period.start } })
              }
              style={({ pressed }) => [styles.row, pressed && styles.pressed]}
            >
              <View style={[styles.rowDot, dotStyle(p)]} />
              <Text style={styles.rowDate}>{dm(p.expected)}</Text>
              <View style={styles.rowTexts}>
                <Text style={styles.rowName} numberOfLines={1}>
                  {p.workplace.name}
                </Text>
                <Text style={[styles.rowState, s.warn && styles.warn]} numberOfLines={1}>
                  {s.text}
                </Text>
              </View>
              <Text style={[styles.rowAmount, p.estimate && styles.estimate]}>{money(p.amount)}</Text>
              <EnterChevron size={16} />
            </Pressable>
          );
        })
      )}
      {hiddenCount > 0 || all ? (
        <Pressable onPress={() => setAll((v) => !v)} accessibilityRole="button" hitSlop={6}>
          <Text style={styles.showAll}>{all ? 'הצגת הקרובים בלבד' : `הצגת הכול (${payments.length})`}</Text>
        </Pressable>
      ) : null}
    </View>
  );

  /** תוכן שממוקם ב־x% מתחילת הציר (מימין ב־RTL). */
  function At({ x, style, children }: { x: number; style: object; children: ReactNode }) {
    return (
      <View style={[styles.at, style]} pointerEvents="none">
        <View style={{ width: `${x}%` }} />
        <View style={styles.anchor}>{children}</View>
      </View>
    );
  }

  function Legend({ style, label }: { style: object; label: string }) {
    return (
      <View style={styles.legendItem}>
        <View style={[styles.legendDot, style]} />
        <Text style={styles.legendText}>{label}</Text>
      </View>
    );
  }
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, gap: spacing.sm, ...cardShadow },
    title: { fontSize: 16, fontWeight: '800', color: colors.text, textAlign: TEXT_RIGHT },
    track: { position: 'relative', marginHorizontal: DOT, marginTop: spacing.xs },
    axis: { position: 'absolute', start: 0, end: 0, bottom: 0, height: 2, backgroundColor: colors.border },
    at: { position: 'absolute', start: 0, end: 0, flexDirection: 'row' },
    bottom: { bottom: 0, alignItems: 'flex-end' },
    top: { top: 0 },
    fill: { top: -4, bottom: 0 },
    // עוגן ברוחב 0: התוכן ממורכז סביב הנקודה
    anchor: { width: 0, alignItems: 'center', overflow: 'visible' },
    tick: { width: 1, height: 8, backgroundColor: colors.textMuted, opacity: 0.5 },
    todayLine: { flex: 1, width: 2, backgroundColor: colors.brandDark },
    column: { alignItems: 'center', marginBottom: 6, width: 30 },
    more: { fontSize: 10, fontWeight: '700', color: colors.textMuted, marginBottom: 1 },
    dot: { width: DOT, height: DOT, borderRadius: DOT / 2, borderWidth: 2.5 },
    labels: { position: 'relative', height: 16, marginHorizontal: DOT },
    tickLabel: { width: 40, textAlign: 'center', fontSize: 11, color: colors.textMuted },
    todayLabel: { width: 70, textAlign: 'center', fontSize: 11, fontWeight: '700', color: colors.brandDark },
    legend: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
    legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    legendDot: { width: 10, height: 10, borderRadius: 5, borderWidth: 2 },
    legendText: { fontSize: 11, color: colors.textMuted },
    empty: { fontSize: 13, color: colors.textMuted, textAlign: TEXT_RIGHT },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      minHeight: 44,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    pressed: { opacity: 0.7 },
    rowDot: { width: 12, height: 12, borderRadius: 6, borderWidth: 2.5 },
    rowDate: { width: 42, fontSize: 13, fontWeight: '700', color: colors.text },
    rowTexts: { flex: 1, minWidth: 0 },
    rowName: { fontSize: 14, fontWeight: '700', color: colors.text, textAlign: TEXT_RIGHT },
    rowState: { fontSize: 12, color: colors.textMuted, textAlign: TEXT_RIGHT },
    warn: { color: colors.dangerText },
    rowAmount: { fontSize: 14, fontWeight: '800', color: colors.brandDark },
    estimate: { color: colors.textMuted, fontWeight: '600' },
    showAll: { fontSize: 13, fontWeight: '700', color: colors.brand, textAlign: TEXT_RIGHT },
  });
