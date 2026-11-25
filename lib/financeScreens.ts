/**
 * אילו מסכים מציגים מידע כספי — כדי להציג בשורת הכותרת שלהם מנעול לנעילה / פתיחה
 * (components/HeaderTitle.tsx, `HeaderFinanceLock`).
 *
 * מסך נחשב כספי כשמוצג בו `FinanceGate`, `FinanceSection` או `Text` עם סכום ב־₪
 * (components/AppLock.tsx, components/Text.tsx). כל אחד מהם רושם את מפתח המסך (route.key)
 * כל עוד הוא מוצג (`useMarkFinanceScreen`, components/useMarkFinanceScreen.ts). כך מסך חדש שמציג סכומים מקבל את המנעול בלי טיפול נוסף.
 */
import { useSyncExternalStore } from 'react';

const counts = new Map<string, number>();
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

/** רישום ידני (טהור, לבדיקות): מחזיר פונקציית ביטול. */
export function markFinanceScreen(key: string): () => void {
  const before = counts.get(key) ?? 0;
  counts.set(key, before + 1);
  if (before === 0) emit();
  return () => {
    const n = (counts.get(key) ?? 1) - 1;
    if (n > 0) counts.set(key, n);
    else {
      counts.delete(key);
      emit();
    }
  };
}

export function screenHasFinance(key: string | undefined): boolean {
  return key != null && (counts.get(key) ?? 0) > 0;
}

/** האם במסך עם המפתח הזה מוצג כרגע מידע כספי. */
export function useScreenHasFinance(key: string | undefined): boolean {
  return useSyncExternalStore(
    subscribe,
    () => screenHasFinance(key),
    () => screenHasFinance(key),
  );
}
