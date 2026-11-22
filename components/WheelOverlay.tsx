/**
 * שכבת "גלגלת שעון" בזמן גרירת גלגלת (`useWheel`): אזור כהה צף מראש המסך
 * ועד מעל התיבה שנגררת, עם כותרת (למשל "שעת התחלה") ועמודות בגופן גדול —
 * הערך הנוכחי במרכז, הקודם והבא דהויים מעליו ומתחתיו.
 *
 * האזור לא תופס מגע (`pointerEvents="none"`), כך שהגרירה נשארת בתיבה.
 * מצב אחד גלובלי: `showWheelOverlay` / `hideWheelOverlay`, והמארח
 * (`WheelOverlayHost`) מרונדר פעם אחת בשורש האפליקציה (`app/_layout.tsx`).
 *
 * עזיבת הגרירה (`hideWheelOverlay({ linger: true })`): השכבה נשארת רגע עם הערך
 * הסופי ונעלמת בדהייה. גרירה חדשה בזמן הזה מחזירה אותה מיד.
 */
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { Text } from './Text';

export type WheelColumn = {
  /** [קודם, נוכחי, הבא]; ערך ריק = אין (קצה התחום) */
  values: [string, string, string];
  /** העמודה שנגררת עכשיו (בשעה: שעות או דקות) */
  active?: boolean;
};

export type WheelOverlayState = {
  title: string;
  columns: WheelColumn[];
  /** מפריד בין העמודות, למשל ":" */
  separator?: string;
  /** יחידה אחרי העמודה האחרונה, למשל "דק׳" */
  unit?: string;
  /** תחתית האזור (y בחלון) — ראש התיבה שנגררת */
  bottom: number;
};

/** כמה זמן השכבה נשארת אחרי עזיבת הגרירה, לפני הדהייה */
const LINGER_MS = 600;
const FADE_MS = 300;

type Snapshot = { state: WheelOverlayState; leaving: boolean } | null;
let current: Snapshot = null;
const listeners = new Set<() => void>();

function notify() {
  for (const l of listeners) l();
}

export function showWheelOverlay(state: WheelOverlayState) {
  current = { state, leaving: false };
  notify();
}

/**
 * הסתרת השכבה. `linger` — בסוף גרירה: נשארת רגע ונעלמת בדהייה; בלי — מיד
 * (למשל כשנכנסים להקליד בתיבה).
 */
export function hideWheelOverlay(opts?: { linger?: boolean }) {
  if (current == null) return;
  if (opts?.linger === true) {
    if (current.leaving) return;
    current = { ...current, leaving: true };
  } else current = null;
  notify();
}

/** סוף הדהייה — רק אם בינתיים לא התחילה גרירה חדשה. */
function finishLeaving(snap: Snapshot) {
  if (current !== snap) return;
  current = null;
  notify();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

const get = () => current;

/** האם גלגלת נגררת עכשיו (לא כולל ההשתהות והדהייה אחרי העזיבה). */
export function useWheelActive(): boolean {
  return useSyncExternalStore(subscribe, () => current != null && !current.leaving, () => false);
}

/** מרווח מתחת לגלגלת, מעל התיבה */
const GAP = 12;
const TITLE_H = 32;

export function WheelOverlayHost() {
  const snap = useSyncExternalStore(subscribe, get, () => null);
  const opacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!snap) return;
    if (!snap.leaving) {
      opacity.stopAnimation();
      opacity.setValue(1);
      return;
    }
    const anim = Animated.timing(opacity, {
      toValue: 0,
      delay: LINGER_MS,
      duration: FADE_MS,
      useNativeDriver: false,
    });
    anim.start(({ finished }) => {
      if (finished) finishLeaving(snap);
    });
    return () => anim.stop();
  }, [snap, opacity]);
  if (!snap) return null;
  const state = snap.state;
  const height = Math.max(0, state.bottom - GAP);
  // שלוש שורות + כותרת בתוך האזור; גופן גדול ככל שיש מקום.
  const row = Math.max(34, Math.min(84, (height - TITLE_H - 16) / 3));
  const font = Math.round(row * 0.78);
  return (
    <Animated.View pointerEvents="none" style={[styles.host, { height: height + GAP, opacity }]}>
      <View style={styles.inner}>
        <Text style={styles.title} numberOfLines={1}>
          {state.title}
        </Text>
        <View style={styles.wheel}>
          {state.columns.map((c, i) => (
            <View key={i} style={styles.pair}>
              {i > 0 && state.separator ? (
                <Text style={[styles.sep, { fontSize: font, lineHeight: row * 3 }]}>{state.separator}</Text>
              ) : null}
              <View style={styles.column}>
                {c.values.map((v, j) => (
                  <Text
                    key={j}
                    style={[
                      styles.digit,
                      { fontSize: j === 1 ? font : Math.round(font * 0.8), lineHeight: row, height: row },
                      j === 1 ? (c.active !== false ? styles.on : styles.onDim) : styles.off,
                    ]}
                  >
                    {v}
                  </Text>
                ))}
              </View>
            </View>
          ))}
          {state.unit ? (
            <Text style={[styles.unit, { fontSize: Math.round(font * 0.4), lineHeight: row * 3 }]}>{state.unit}</Text>
          ) : null}
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(18, 22, 30, 0.97)',
    justifyContent: 'flex-end',
    zIndex: 1000,
    elevation: 24,
  },
  inner: {
    alignItems: 'center',
    paddingBottom: GAP + 4,
  },
  title: {
    height: TITLE_H,
    fontSize: 17,
    fontWeight: '700',
    color: 'rgba(255, 255, 255, 0.85)',
  },
  wheel: {
    // שעה משמאל, דקות מימין — בכל שפה.
    direction: 'ltr',
    flexDirection: 'row',
    alignItems: 'center',
  },
  pair: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  column: {
    alignItems: 'center',
    minWidth: 72,
    paddingHorizontal: 8,
  },
  digit: {
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  on: {
    color: '#ffffff',
    fontWeight: '800',
  },
  onDim: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontWeight: '700',
  },
  off: {
    color: 'rgba(255, 255, 255, 0.28)',
    fontWeight: '400',
  },
  sep: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontWeight: '700',
    paddingHorizontal: 4,
  },
  unit: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontWeight: '700',
    paddingStart: 8,
  },
});
