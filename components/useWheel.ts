/**
 * "גלגלת" בתוך תיבת טקסט: גרירה אנכית (מגע או עכבר) וגלגלת עכבר ב־web
 * משנות ערך בצעדים. גרירה למעלה / גלגול למעלה = הגדלה.
 *
 * הקשה רגילה לא נתפסת — היא ממשיכה לתיבה (מיקוד והקלדה). רק תנועה אנכית
 * ברורה הופכת לגרירה, ובזמנה הגלילה של המסך לא לוקחת את המגע.
 *
 * בזמן גרירה `drag` מחזיר את מיקום האצבע (יחסית לתיבה), כדי להציג מעליה
 * בועה עם הערך — האגודל מסתיר את התיבה עצמה. הבועה נעלמת בעזיבה, בגרירה
 * בתיבה אחרת, או במיקוד של תיבה כלשהי (`hideWheelBubbles`) — כדי שלא תישאר.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, Platform, type View } from 'react-native';

/** כמה פיקסלים של גרירה לצעד אחד */
const STEP_PX = 14;

export type WheelDrag = { x: number; y: number } | null;

/** כל הגלגלות הפעילות — כדי שגרירה / מיקוד אחר יסתירו בועה שנשארה. */
const hiders = new Set<() => void>();

/** מסתיר את בועת הגלגלת בכל התיבות (למשל במיקוד של תיבה אחרת). */
export function hideWheelBubbles() {
  for (const h of hiders) h();
}

export function useWheel(onStep: (delta: number) => void) {
  const stepRef = useRef(onStep);
  stepRef.current = onStep;
  const consumed = useRef(0);
  const origin = useRef({ x: 0, y: 0 });
  const viewRef = useRef<View>(null);
  const [drag, setDrag] = useState<WheelDrag>(null);

  useEffect(() => {
    const hide = () => setDrag(null);
    hiders.add(hide);
    return () => {
      hiders.delete(hide);
    };
  }, []);

  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponderCapture: (_, g) => Math.abs(g.dy) > 8 && Math.abs(g.dy) > Math.abs(g.dx) * 1.5,
        onPanResponderGrant: (e, g) => {
          consumed.current = 0;
          hideWheelBubbles();
          // מיקום תחילת המגע בתוך התיבה (לפני התנועה שהפעילה את הגרירה).
          origin.current = { x: e.nativeEvent.locationX - g.dx, y: e.nativeEvent.locationY - g.dy };
          setDrag({ x: origin.current.x + g.dx, y: origin.current.y + g.dy });
        },
        onPanResponderMove: (_, g) => {
          setDrag({ x: origin.current.x + g.dx, y: origin.current.y + g.dy });
          const steps = Math.trunc(-g.dy / STEP_PX);
          if (steps !== consumed.current) {
            stepRef.current(steps - consumed.current);
            consumed.current = steps;
          }
        },
        onPanResponderRelease: () => setDrag(null),
        onPanResponderTerminate: () => setDrag(null),
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

  return { ref: viewRef, panHandlers: pan.panHandlers, drag };
}
