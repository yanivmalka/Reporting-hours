import { useRef } from 'react';
import { PanResponder } from 'react-native';

/**
 * החלקה אופקית: בעברית "הבא" נמצא משמאל, ולכן החלקה ימינה (כמו דפדוף
 * בספר) = הבא, החלקה שמאלה = הקודם. מחזיר panHandlers לפרוס על View.
 */
export function useSwipe(onNext: () => void, onPrev: () => void) {
  const cb = useRef({ onNext, onPrev });
  cb.current = { onNext, onPrev };
  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 20 && Math.abs(g.dx) > Math.abs(g.dy) * 2,
      onPanResponderRelease: (_e, g) => {
        if (Math.abs(g.dx) < 50 || Math.abs(g.dx) < Math.abs(g.dy) * 1.5) return;
        if (g.dx > 0) cb.current.onNext();
        else cb.current.onPrev();
      },
    }),
  ).current;
  return pan.panHandlers;
}
