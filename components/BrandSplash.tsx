/**
 * מסך פתיחה ממותג ("שיעור") — מוצג מיד אחרי מסך הפתיחה של המערכת, בהפעלה קרה בלבד.
 *
 * המסך הוא "העולם" של האייקון: אותו רקע של אייקוני הנושאים (שעות, הפסקה, שכר, נסיעות,
 * קורסים, דוח שכר, שיתוף והרשאות, מס, תשלום, דקות מצטברות, לוח בקרה, מקום עבודה, שיעור),
 * באותו סדר, באותה רשת ובאותו מרווח כמו ברקע האייקון, ושעון החול במקומו ברשת.
 * בפתיחה המסך מתחיל בגודל אייקון (שעון החול בגודל ובמקום של מסך הפתיחה של המערכת) ומתרחב במהירות למסך מלא — כאילו נכנסים לתוך האייקון —
 * ואז עולים השם והמשפט. אחרי 3 שניות נעלם בדהייה; לחיצה בכל מקום מדלגת.
 *
 * הרשת מחזורית בריבוע של 1024 יחידות אייקון (assets/splash-world.png נוצר מאותה הגדרה
 * כמו רקע האייקון), ולכן אריח חוזר שמתחיל בכפולה של 1024 שומר על הסדר.
 * הרקע בצבע brandDark של הערכה — כמו מסך הפתיחה של המערכת. את מסך הפתיחה של המערכת
 * מסתיר ThemeContext כשהערכה נטענה (`loaded`), והתנועה מתחילה רק אז.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Image,
  ImageBackground,
  Pressable,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import { useI18n } from '../lib/i18n';
import { brandImages } from '../theme/brandAssets';
import { useTheme } from '../theme/ThemeContext';
import { Text } from './Text';

/** dp ליחידת אייקון (האייקון הוא 512 יחידות). */
const S = 0.79;
const ICON = 512 * S;
const TILE = 1024 * S;
/** העולם מכסה ‎−1024…1536 יחידות סביב האייקון — כפולה של האריח, מספיק לכל מסך. */
const WORLD = 2560 * S;
/**
 * גודל האייקון בתחילת התנועה — כך ששעון החול באותו גודל ובאותו מקום כמו במסך הפתיחה של
 * המערכת (אייקון 288dp, שעון החול באזור הבטוח 0.62 → כ־128dp גובה; 368 מתוך 512 יחידות).
 */
const START = Math.round((512 * 128) / 368);
const ZOOM_MS = 620;
const TEXT_DELAY_MS = 520;
const TEXT_MS = 380;
/** מספיק זמן לקרוא את השם והמשפט; לחיצה בכל מקום מדלגת. */
const SHOW_MS = 3000;
const FADE_MS = 500;

/** הפעלה קרה בלבד: טעינה מחדש של עץ המסכים (סנכרון, הדגמה) לא מציגה אותו שוב. */
let shownOnce = false;

export function BrandSplash() {
  const { t } = useI18n();
  const { colors, loaded, paletteId } = useTheme();
  const { width: W, height: H } = useWindowDimensions();
  const [visible, setVisible] = useState(!shownOnce);
  const opacity = useRef(new Animated.Value(1)).current;
  const zoom = useRef(new Animated.Value(0)).current;
  const text = useRef(new Animated.Value(0)).current;
  const fading = useRef(false);

  const fadeOut = useCallback(() => {
    if (fading.current) return;
    fading.current = true;
    Animated.timing(opacity, { toValue: 0, duration: FADE_MS, useNativeDriver: true }).start(() =>
      setVisible(false),
    );
  }, [opacity]);

  useEffect(() => {
    if (!visible) return;
    shownOnce = true;
    if (!loaded) return;
    // התנועה והספירה מתחילות רק כשמסך הפתיחה של המערכת כבר הוסתר.
    Animated.parallel([
      Animated.timing(zoom, {
        toValue: 1,
        duration: ZOOM_MS,
        easing: Easing.bezier(0.2, 0.8, 0.2, 1),
        useNativeDriver: false,
      }),
      Animated.timing(text, {
        toValue: 1,
        duration: TEXT_MS,
        delay: TEXT_DELAY_MS,
        easing: Easing.out(Easing.quad),
        useNativeDriver: false,
      }),
    ]).start();
    const timer = setTimeout(fadeOut, TEXT_DELAY_MS + TEXT_MS + SHOW_MS);
    return () => clearTimeout(timer);
  }, [visible, loaded, fadeOut, zoom, text]);

  if (!visible) return null;

  const bg = colors.brandDark;
  // מרכז שעון החול על המסך.
  const cx = W / 2;
  const cy = H / 2;
  const lerp = (from: number, to: number) => zoom.interpolate({ inputRange: [0, 1], outputRange: [from, to] });
  // חלון החיתוך: מריבוע מעוגל בגודל אייקון ועד המסך כולו.
  const clip = {
    left: lerp(cx - START / 2, 0),
    top: lerp(cy - START / 2, 0),
    width: lerp(START, W),
    height: lerp(START, H),
    borderRadius: lerp(START * 0.23, 0),
  };
  // העולם ממורכז תמיד על שעון החול (בקואורדינטות חלון החיתוך).
  const world = {
    left: lerp(START / 2 - WORLD / 2, cx - WORLD / 2),
    top: lerp(START / 2 - WORLD / 2, cy - WORLD / 2),
    transform: [{ scale: lerp(START / ICON, 1) }],
  };
  const textShift = text.interpolate({ inputRange: [0, 1], outputRange: [14, 0] });

  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.root, { backgroundColor: bg, opacity }]}>
      <Pressable style={StyleSheet.absoluteFill} onPress={fadeOut} accessibilityLabel={t('splash.name')}>
        <Animated.View style={[styles.clip, { backgroundColor: bg }, clip]}>
          <Animated.View style={[styles.world, world]}>
            <ImageBackground
              source={require('../assets/splash-world.png')}
              resizeMode="repeat"
              style={StyleSheet.absoluteFill}
              imageStyle={{ width: TILE, height: TILE }}
            />
            <Image
              source={brandImages(paletteId).splash}
              style={[styles.hourglass, { left: WORLD / 2 - ICON / 2, top: WORLD / 2 - ICON / 2 }]}
              accessibilityIgnoresInvertColors
            />
          </Animated.View>
        </Animated.View>
        <Animated.View
          style={[styles.texts, { top: cy + ICON * 0.39, opacity: text, transform: [{ translateY: textShift }] }]}
        >
          <Text style={styles.name}>{t('splash.name')}</Text>
          <Text style={styles.tagline}>{t('splash.tagline')}</Text>
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { zIndex: 1000, elevation: 1000 },
  clip: { position: 'absolute', overflow: 'hidden' },
  world: { position: 'absolute', width: WORLD, height: WORLD },
  hourglass: { position: 'absolute', width: ICON, height: ICON },
  texts: { position: 'absolute', left: 0, right: 0, alignItems: 'center', gap: 10 },
  name: { fontSize: 46, fontWeight: '700', color: '#FFFFFF', textAlign: 'center' },
  tagline: { fontSize: 18, color: '#C9E3E2', textAlign: 'center' },
});
