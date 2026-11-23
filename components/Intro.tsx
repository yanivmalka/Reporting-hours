/**
 * אנימציית הפתיחה: מסך הפתיחה בצבע שהמשתמש בחר (ערכת הצבעים), ועליו כוונת. הכוונת "מחפשת",
 * טסה אל כפתור "היום" בלו״ז הבית, ננעלת עליו בהבזק — ברק של אור שעובר על הכפתור, טבעת
 * שמתרחבת ונעלמת, וצליל ורטט עדינים (lib/feedback.ts) — והמסך נחשף מתחת.
 *
 * מסך הפתיחה של אנדרואיד (expo-splash-screen) בצבע קבוע (`NATIVE_SPLASH`) עם אותה כוונת; הוא
 * נסגר כשהשכבה הזו מוכנה, והיא עוברת בדהייה לצבע שנבחר — כך אין קפיצה של צבע.
 * פעם אחת בכל פתיחה (מחוץ לעץ שנטען מחדש בסנכרון). כבויה בהגדרה (`lib/intro.ts`), כשהמערכת
 * מבקשת להפחית תנועה, או כשלא נפתח מסך הבית — ואז רק דהייה קצרה.
 */
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform, StyleSheet, View, useWindowDimensions } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { useTheme } from '../theme/ThemeContext';
import { feedback, preloadFeedback } from '../lib/feedback';
import { introSettingsReady, waitIntroTarget, type IntroRect } from '../lib/intro';

/** צבע מסך הפתיחה של אנדרואיד (app.json → expo-splash-screen) — ממנו מתחילה הדהייה. */
export const NATIVE_SPLASH = '#305A58';
const SIZE = 168;

const native = Platform.OS !== 'web';
if (native) void SplashScreen.preventAutoHideAsync().catch(() => {});

export function Intro() {
  const { colors, ready } = useTheme();
  const { width, height } = useWindowDimensions();
  const [done, setDone] = useState(false);
  const [target, setTarget] = useState<IntroRect | null>(null);
  const [interactive, setInteractive] = useState(true);

  const nativeLayer = useRef(new Animated.Value(1)).current; // שכבת הצבע הקבוע מעל צבע הערכה
  const bg = useRef(new Animated.Value(1)).current; // הרקע כולו
  const pulse = useRef(new Animated.Value(0)).current; // "חיפוש": 0..1 בלולאה
  const fly = useRef(new Animated.Value(0)).current; // 0 = מרכז, 1 = על הכפתור
  const lock = useRef(new Animated.Value(0)).current; // נעילה: כיווץ קצר
  const sight = useRef(new Animated.Value(1)).current; // שקיפות הכוונת
  const shine = useRef(new Animated.Value(0)).current; // הברק שעובר על הכפתור
  const ring = useRef(new Animated.Value(0)).current; // טבעת שמתרחבת
  const started = useRef(false);

  useEffect(() => {
    if (!ready || started.current) return;
    started.current = true;
    let cancelled = false;
    const finish = () => !cancelled && setDone(true);
    // רשת ביטחון: השכבה לעולם לא נשארת ומסתירה את האפליקציה
    const safety = setTimeout(() => {
      if (native) void SplashScreen.hideAsync().catch(() => {});
      finish();
    }, 6000);
    void (async () => {
      const [enabled, reduce] = await Promise.all([
        introSettingsReady.catch(() => true),
        AccessibilityInfo.isReduceMotionEnabled().catch(() => false),
      ]);
      if (native) await SplashScreen.hideAsync().catch(() => {});
      preloadFeedback();
      // מצבע מסך הפתיחה לצבע שנבחר
      Animated.timing(nativeLayer, { toValue: 0, duration: 260, useNativeDriver: true }).start();
      if (!enabled || reduce) {
        Animated.timing(bg, { toValue: 0, duration: 260, delay: 120, useNativeDriver: true }).start(finish);
        return;
      }
      const seeking = Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, { toValue: 1, duration: 420, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
          Animated.timing(pulse, { toValue: 0, duration: 420, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        ]),
      );
      seeking.start();
      const [r] = await Promise.all([waitIntroTarget(1600), new Promise((res) => setTimeout(res, 650))]);
      if (cancelled) return;
      seeking.stop();
      if (!r) {
        Animated.parallel([
          Animated.timing(bg, { toValue: 0, duration: 320, useNativeDriver: true }),
          Animated.timing(sight, { toValue: 0, duration: 240, useNativeDriver: true }),
        ]).start(finish);
        return;
      }
      setTarget(r);
      setInteractive(false);
      Animated.sequence([
        Animated.parallel([
          Animated.timing(pulse, { toValue: 0, duration: 160, useNativeDriver: true }),
          Animated.timing(fly, { toValue: 1, duration: 520, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
          Animated.timing(bg, { toValue: 0, duration: 520, easing: Easing.in(Easing.quad), useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.sequence([
            Animated.timing(lock, { toValue: 1, duration: 110, easing: Easing.out(Easing.quad), useNativeDriver: true }),
            Animated.timing(lock, { toValue: 0, duration: 180, easing: Easing.out(Easing.back(2)), useNativeDriver: true }),
          ]),
          Animated.timing(shine, { toValue: 1, duration: 520, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
          Animated.timing(ring, { toValue: 1, duration: 620, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
          Animated.sequence([
            Animated.delay(260),
            Animated.timing(sight, { toValue: 0, duration: 300, useNativeDriver: true }),
          ]),
        ]),
      ]).start(finish);
      // הנעילה — רגע המגע בכפתור
      setTimeout(() => !cancelled && feedback('lock'), 520);
    })().catch(() => {
      if (native) void SplashScreen.hideAsync().catch(() => {});
      finish();
    });
    return () => {
      cancelled = true;
      clearTimeout(safety);
    };
  }, [ready, nativeLayer, bg, pulse, fly, lock, sight, shine, ring]);

  if (done) return null;

  // מהמרכז אל מרכז הכפתור, ובקנה מידה של הכפתור
  const cx = width / 2;
  const cy = height / 2;
  const tx = target ? target.x + target.width / 2 - cx : 0;
  const ty = target ? target.y + target.height / 2 - cy : 0;
  const tScale = target ? (Math.max(target.width, target.height) * 1.15) / SIZE : 1;

  const sightStyle = {
    opacity: sight,
    transform: [
      { translateX: fly.interpolate({ inputRange: [0, 1], outputRange: [0, tx] }) },
      { translateY: fly.interpolate({ inputRange: [0, 1], outputRange: [0, ty] }) },
      { scale: fly.interpolate({ inputRange: [0, 1], outputRange: [1, tScale] }) },
      { scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.07] }) },
      { scale: lock.interpolate({ inputRange: [0, 1], outputRange: [1, 0.82] }) },
      { rotate: fly.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '90deg'] }) },
    ],
  };
  const line = colors.textOnBrand;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={interactive ? 'auto' : 'none'}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: colors.brand, opacity: bg }]} />
      <Animated.View
        style={[StyleSheet.absoluteFill, { backgroundColor: NATIVE_SPLASH, opacity: Animated.multiply(nativeLayer, bg) }]}
      />
      {target ? (
        <View
          pointerEvents="none"
          style={[
            styles.tile,
            { left: target.x, top: target.y, width: target.width, height: target.height, borderRadius: 20 },
          ]}
        >
          {/* ברק: פס אור אלכסוני שחוצה את הכפתור */}
          <Animated.View
            style={[
              styles.streak,
              {
                height: target.height * 2,
                top: -target.height / 2,
                opacity: shine.interpolate({ inputRange: [0, 0.15, 0.85, 1], outputRange: [0, 1, 1, 0] }),
                transform: [
                  { translateX: shine.interpolate({ inputRange: [0, 1], outputRange: [-target.width, target.width * 1.4] }) },
                  { rotate: '20deg' },
                ],
              },
            ]}
          />
          <Animated.View
            style={[
              StyleSheet.absoluteFill,
              { backgroundColor: '#FFFFFF', opacity: shine.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 0.35, 0] }) },
            ]}
          />
        </View>
      ) : null}
      {target ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.ring,
            {
              borderColor: colors.brand,
              left: target.x - 6,
              top: target.y - 6,
              width: target.width + 12,
              height: target.height + 12,
              opacity: ring.interpolate({ inputRange: [0, 0.1, 1], outputRange: [0, 0.9, 0] }),
              transform: [{ scale: ring.interpolate({ inputRange: [0, 1], outputRange: [1, 1.45] }) }],
            },
          ]}
        />
      ) : null}
      <Animated.View pointerEvents="none" style={[styles.sight, { left: cx - SIZE / 2, top: cy - SIZE / 2 }, sightStyle]}>
        {/* קו מתאר כהה מאחור — כך הכוונת נראית גם על רקע בהיר וגם על כפתור "היום" הכהה */}
        <Crosshair color={colors.brandDark} extra={2.5} />
        <View style={StyleSheet.absoluteFill}>
          <Crosshair color={line} />
        </View>
      </Animated.View>
    </View>
  );
}

/** הכוונת — שלוש טבעות וקווי כוונה עם רווח במרכז (כמו בסמל של מסך הפתיחה). */
function Crosshair({ color, extra = 0 }: { color: string; extra?: number }) {
  const ring = (d: number, w: number) => (
    <View
      style={{
        position: 'absolute',
        width: d,
        height: d,
        left: (SIZE - d) / 2,
        top: (SIZE - d) / 2,
        borderRadius: d / 2,
        borderWidth: w + extra,
        borderColor: color,
      }}
    />
  );
  const tick = (horizontal: boolean, start: number, len: number) => (
    <View
      style={{
        position: 'absolute',
        backgroundColor: color,
        ...(horizontal
          ? { height: 2.5 + extra, width: len, left: start, top: SIZE / 2 - (2.5 + extra) / 2 }
          : { width: 2.5 + extra, height: len, top: start, left: SIZE / 2 - (2.5 + extra) / 2 }),
      }}
    />
  );
  return (
    <View style={{ width: SIZE, height: SIZE }}>
      {ring(SIZE, 2.5)}
      {ring(SIZE * 0.72, 2.5)}
      {ring(SIZE * 0.3, 3)}
      {tick(true, -10, SIZE * 0.3)}
      {tick(true, SIZE * 0.8, SIZE * 0.3)}
      {tick(false, -10, SIZE * 0.3)}
      {tick(false, SIZE * 0.8, SIZE * 0.3)}
      <View
        style={{
          position: 'absolute',
          width: 8 + extra,
          height: 8 + extra,
          borderRadius: (8 + extra) / 2,
          backgroundColor: color,
          left: SIZE / 2 - (8 + extra) / 2,
          top: SIZE / 2 - (8 + extra) / 2,
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  sight: { position: 'absolute', width: SIZE, height: SIZE },
  tile: { position: 'absolute', overflow: 'hidden' },
  streak: { position: 'absolute', width: 36, backgroundColor: 'rgba(255,255,255,0.85)', left: 0 },
  ring: { position: 'absolute', borderWidth: 3, borderRadius: 26 },
});
