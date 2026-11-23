/**
 * מסך פתיחה ממותג ("שיעור") — מוצג מיד אחרי מסך הפתיחה של המערכת, בהפעלה קרה בלבד.
 *
 * מסך הפתיחה של אנדרואיד 12+ מציג רק אייקון על צבע אחיד, ולכן הרקע המעוטר
 * (אייקונים קטנים של נושאי המערכת: שעות, הפסקה, שכר, נסיעות, קורסים, דוח שכר,
 * שיתוף והרשאות, מס, תשלום, דקות מצטברות, לוח בקרה, מקום עבודה ושיעור) מוצג כאן,
 * כשכבה מעל האפליקציה שנעלמת בדהייה. הצבעים קבועים (צבעי המותג), לא לפי ערכת הצבעים.
 */
import { useEffect, useRef, useState } from 'react';
import { Animated, Image, ImageBackground, StyleSheet, View } from 'react-native';
import { useI18n } from '../lib/i18n';
import { Text } from './Text';

const BG = '#1B3C3B';
const SHOW_MS = 1200;
const FADE_MS = 350;

/** הפעלה קרה בלבד: טעינה מחדש של עץ המסכים (סנכרון, הדגמה) לא מציגה אותו שוב. */
let shownOnce = false;

export function BrandSplash() {
  const { t } = useI18n();
  const [visible, setVisible] = useState(!shownOnce);
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!visible) return;
    shownOnce = true;
    const timer = setTimeout(() => {
      Animated.timing(opacity, { toValue: 0, duration: FADE_MS, useNativeDriver: true }).start(() =>
        setVisible(false),
      );
    }, SHOW_MS);
    return () => clearTimeout(timer);
  }, [visible, opacity]);

  if (!visible) return null;
  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.root, { opacity }]} pointerEvents="none">
      <ImageBackground
        source={require('../assets/splash-pattern.png')}
        resizeMode="repeat"
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.center}>
        <Image source={require('../assets/icon.png')} style={styles.icon} accessibilityIgnoresInvertColors />
        <Text style={styles.name}>{t('splash.name')}</Text>
        <Text style={styles.tagline}>{t('splash.tagline')}</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: BG, zIndex: 1000, elevation: 1000 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 18, paddingBottom: 96 },
  icon: { width: 168, height: 168, borderRadius: 38 },
  name: { fontSize: 44, fontWeight: '700', color: '#FFFFFF', textAlign: 'center' },
  tagline: { fontSize: 17, color: '#C9E3E2', textAlign: 'center' },
});
