/**
 * הגופן של האפליקציה: גופן המערכת — Roboto (ולעברית Noto Sans Hebrew) באנדרואיד,
 * וגופן המערכת של הדפדפן ב־web.
 *
 * טקסט מודגש: כל משקל מודגש (600–900) מוצג כ־bold (700) של אותו גופן —
 * הגרסה המודגשת הרגילה של הגופן הרגיל, ולא משקל אחר שעלול להיראות כגופן שונה.
 */
import { Platform } from 'react-native';

/** undefined = גופן ברירת המחדל של המערכת. */
export const FONT_FAMILY: string | undefined = Platform.select({
  web: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  default: undefined,
});

/** מנרמל משקל גופן: רגיל נשאר רגיל, כל משקל מודגש הופך ל־bold. */
export function normalizeWeight(weight: unknown): 'normal' | 'bold' | undefined {
  if (weight == null) return undefined;
  if (weight === 'bold') return 'bold';
  const n = Number(weight);
  if (!Number.isFinite(n)) return undefined;
  return n >= 600 ? 'bold' : 'normal';
}
