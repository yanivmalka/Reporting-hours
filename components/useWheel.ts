/**
 * "גלגלת" בתוך תיבת טקסט: גרירה אנכית (מגע או עכבר) וגלגלת עכבר ב־web
 * משנות ערך בצעדים. גרירה למעלה / גלגול למעלה = הגדלה.
 *
 * הקשה רגילה לא נתפסת — היא ממשיכה לתיבה (מיקוד והקלדה). רק תנועה אנכית
 * ברורה הופכת לגרירה, ובזמנה הגלילה של המסך לא לוקחת את המגע.
 *
 * תחילת גרירה (`onStart`) מוסרת את מיקום תחילת המגע בתיבה ואת ראש התיבה
 * בחלון — כדי להציג את שכבת הגלגלת (`components/WheelOverlay.tsx`) מעליה.
 * הסוף (`onEnd`) — בעזיבה, בביטול, ובגלגלת עכבר אחרי רגע בלי תנועה.
 */
import { useEffect, useMemo, useRef } from 'react';
import { PanResponder, Platform, type View } from 'react-native';

/** כמה פיקסלים של גרירה לצעד אחד */
const STEP_PX = 14;
/** גלגלת עכבר: אחרי כמה זמן בלי תנועה השכבה נסגרת */
const WHEEL_IDLE_MS = 700;

export type WheelStart = {
  /** מיקום תחילת המגע בתוך התיבה */
  x: number;
  /** רוחב התיבה */
  width: number;
  /** ראש התיבה בחלון */
  top: number;
};

export type WheelHandlers = {
  onStart?: (s: WheelStart) => void;
  onEnd?: () => void;
};

export function useWheel(onStep: (delta: number) => void, handlers: WheelHandlers = {}) {
  const stepRef = useRef(onStep);
  stepRef.current = onStep;
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;
  const consumed = useRef(0);
  const viewRef = useRef<View>(null);
  const active = useRef(false);

  function start(x: number) {
    active.current = true;
    const node = viewRef.current;
    if (!node) return;
    node.measureInWindow((_, top, width) => {
      if (active.current) handlersRef.current.onStart?.({ x, width, top });
    });
  }
  function end() {
    if (!active.current) return;
    active.current = false;
    handlersRef.current.onEnd?.();
  }

  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponderCapture: (_, g) => Math.abs(g.dy) > 8 && Math.abs(g.dy) > Math.abs(g.dx) * 1.5,
        onPanResponderGrant: (e, g) => {
          consumed.current = 0;
          // מיקום תחילת המגע בתוך התיבה (לפני התנועה שהפעילה את הגרירה).
          start(e.nativeEvent.locationX - g.dx);
        },
        onPanResponderMove: (_, g) => {
          const steps = Math.trunc(-g.dy / STEP_PX);
          if (steps !== consumed.current) {
            stepRef.current(steps - consumed.current);
            consumed.current = steps;
          }
        },
        onPanResponderRelease: end,
        onPanResponderTerminate: end,
        onPanResponderTerminationRequest: () => false,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // ב־web: גלגלת העכבר מעל התיבה (בלי לגלול את הדף).
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const node = viewRef.current as unknown as HTMLElement | null;
    if (!node || typeof node.addEventListener !== 'function') return;
    let acc = 0;
    let idle: ReturnType<typeof setTimeout> | null = null;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (!active.current) start(e.offsetX);
      if (idle) clearTimeout(idle);
      idle = setTimeout(end, WHEEL_IDLE_MS);
      acc += e.deltaY;
      const steps = Math.trunc(-acc / 40);
      if (steps !== 0) {
        acc += steps * 40;
        stepRef.current(steps);
      }
    };
    node.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      node.removeEventListener('wheel', onWheel);
      if (idle) clearTimeout(idle);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // תיבה שיורדת מהמסך באמצע גרירה — לסגור את השכבה.
  useEffect(() => () => end(), []); // eslint-disable-line react-hooks/exhaustive-deps

  return { ref: viewRef, panHandlers: pan.panHandlers };
}
