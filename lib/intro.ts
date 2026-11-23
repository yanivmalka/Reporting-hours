/**
 * אנימציית הפתיחה (components/Intro.tsx): הכוונת ממסך הפתיחה טסה אל כפתור "היום" בלו״ז הבית,
 * ננעלת עליו ומבזיקה. כאן — ההגדרה (לכל מכשיר, `KEYS.intro`, בדף "הגדרות") והמיקום של
 * כפתור "היום", שמסך הבית מדווח (`setIntroTarget`) והאנימציה ממתינה לו.
 */
import { useSyncExternalStore } from 'react';
import { readJSON, writeJSON } from './storage';
import { KEYS } from './keys';

export type IntroRect = { x: number; y: number; width: number; height: number };

let enabled = true;
let loaded = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const introSettingsReady: Promise<boolean> = readJSON<unknown>(KEYS.intro, true).then((saved) => {
  enabled = saved !== false;
  loaded = true;
  emit();
  return enabled;
});

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useIntroEnabled(): boolean {
  return useSyncExternalStore(subscribe, () => enabled, () => enabled);
}

export const introLoaded = () => loaded;

export async function setIntroEnabled(on: boolean): Promise<void> {
  enabled = on;
  emit();
  await writeJSON(KEYS.intro, on);
}

// ── מיקום כפתור "היום" ──
type Measure = (cb: (r: IntroRect) => void) => void;
let measurer: Measure | null = null;
const targetListeners = new Set<() => void>();

/**
 * מסך הבית רושם איך למדוד את כפתור "היום" (קואורדינטות חלון). המדידה עצמה נעשית רגע לפני
 * התעופה — כך שינוי בגובה התוכן שמעליו (נתונים שנטענו) לא מטעה את הכוונת.
 */
export function setIntroTarget(measure: Measure): void {
  measurer = measure;
  targetListeners.forEach((l) => l());
}

function measureNow(): Promise<IntroRect | null> {
  return new Promise((resolve) => {
    if (!measurer) return resolve(null);
    const t = setTimeout(() => resolve(null), 300);
    measurer((r) => {
      clearTimeout(t);
      resolve(r.width > 0 && r.height > 0 ? r : null);
    });
  });
}

/** מחכה שמסך הבית ירשום את הכפתור (עד `timeoutMs`) ומודד אותו; null — לא הופיע (נפתח מסך אחר). */
export async function waitIntroTarget(timeoutMs: number): Promise<IntroRect | null> {
  if (!measurer) {
    await new Promise<void>((resolve) => {
      const done = () => {
        clearTimeout(timer);
        targetListeners.delete(done);
        resolve();
      };
      const timer = setTimeout(done, timeoutMs);
      targetListeners.add(done);
    });
  }
  // רגע להתייצבות הפריסה אחרי הרישום
  await new Promise((r) => setTimeout(r, 120));
  return measureNow();
}
