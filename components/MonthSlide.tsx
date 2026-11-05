/**
 * מעבר החלקה בין חודשים בתאריכון — כמו בפס השבוע (WeekStrip): כשהמפתח
 * (החודש, "YYYY-MM") משתנה, החודש הקודם יוצא לצד אחד והחדש נכנס מהצד השני,
 * כיחידה אחת, 350ms ease-in-out. בעברית "הבא" נמצא משמאל, ולכן מעבר לחודש
 * הבא מזיז את התוכן ימינה (כמו החלקה ימינה בספר).
 * render מקבל את מפתח החודש ומחזיר את התוכן שלו — כך אפשר לצייר את שני
 * החודשים יחד בזמן המעבר.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Easing, Platform, StyleSheet, View } from 'react-native';
import { useI18n } from '../lib/i18n';

type Props = {
  pageKey: string;
  render: (key: string) => ReactNode;
};

/** משך מעבר חודש. */
const SLIDE_MS = 350;

export function MonthSlide({ pageKey, render }: Props) {
  const { isRTL } = useI18n();
  const [width, setWidth] = useState(0);
  const [prev, setPrev] = useState<{ key: string; sign: 1 | -1 } | null>(null);
  const last = useRef(pageKey);
  const anim = useRef(new Animated.Value(1)).current; // 0 = תחילת המעבר · 1 = סופו

  useEffect(() => {
    const from = last.current;
    last.current = pageKey;
    if (from === pageKey || !width) return;
    const forward = pageKey > from;
    // הכיוון שאליו זז התוכן: ב־RTL הבא נכנס משמאל וזז ימינה.
    const sign: 1 | -1 = (forward ? 1 : -1) * (isRTL ? 1 : -1) as 1 | -1;
    anim.stopAnimation();
    anim.setValue(0);
    setPrev({ key: from, sign });
    Animated.timing(anim, {
      toValue: 1,
      duration: SLIDE_MS,
      easing: Easing.inOut(Easing.ease),
      useNativeDriver: Platform.OS !== 'web',
    }).start(({ finished }) => {
      if (finished) setPrev(null);
    });
  }, [pageKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const sign = prev?.sign ?? 1;
  const incoming = anim.interpolate({ inputRange: [0, 1], outputRange: [-sign * width, 0] });
  const outgoing = anim.interpolate({ inputRange: [0, 1], outputRange: [0, sign * width] });

  return (
    <View style={styles.viewport} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {prev ? (
        <Animated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { transform: [{ translateX: outgoing }] }]}
        >
          {render(prev.key)}
        </Animated.View>
      ) : null}
      <Animated.View style={prev ? { transform: [{ translateX: incoming }] } : undefined}>{render(pageKey)}</Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  viewport: { overflow: 'hidden' },
});
