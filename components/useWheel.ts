/**
 * "גלגלת" בתוך תיבת טקסט: גרירה אנכית (מגע או עכבר) וגלגלת עכבר ב־web
 * משנות ערך בצעדים. גרירה למעלה / גלגול למעלה = הגדלה.
 *
 * הקשה רגילה לא נתפסת — היא ממשיכה לתיבה (מיקוד והקלדה). רק תנועה אנכית
 * ברורה הופכת לגרירה, ובזמנה הגלילה של המסך לא לוקחת את המגע.
 */
import { useEffect, useMemo, useRef } from 'react';
import { PanResponder, Platform, type View } from 'react-native';

/** כמה פיקסלים של גרירה לצעד אחד */
const STEP_PX = 14;

export function useWheel(onStep: (delta: number) => void) {
  const stepRef = useRef(onStep);
  stepRef.current = onStep;
  const consumed = useRef(0);
  const viewRef = useRef<View>(null);

  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponderCapture: (_, g) => Math.abs(g.dy) > 8 && Math.abs(g.dy) > Math.abs(g.dx) * 1.5,
        onPanResponderGrant: () => {
          consumed.current = 0;
        },
        onPanResponderMove: (_, g) => {
          const steps = Math.trunc(-g.dy / STEP_PX);
          if (steps !== consumed.current) {
            stepRef.current(steps - consumed.current);
            consumed.current = steps;
          }
        },
        onPanResponderTerminationRequest: () => false,
      }),
    [],
  );

  // ב־web: גלגלת העכבר מעל התיבה (בלי לגלול את הדף).
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const node = viewRef.current as unknown as HTMLElement | null;
    if (!node || typeof node.addEventListener !== 'function') return;
    let acc = 0;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      acc += e.deltaY;
      const steps = Math.trunc(-acc / 40);
      if (steps !== 0) {
        acc += steps * 40;
        stepRef.current(steps);
      }
    };
    node.addEventListener('wheel', onWheel, { passive: false });
    return () => node.removeEventListener('wheel', onWheel);
  }, []);

  return { ref: viewRef, panHandlers: pan.panHandlers };
}
