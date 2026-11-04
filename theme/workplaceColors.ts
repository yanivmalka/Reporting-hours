/**
 * צבע לכל מקום עבודה — כדי שהמשתמש יקשר צבע למקום בכל מקום שבו הוא מופיע
 * (לו״ז, דיווחים, לוח בקרה, דוחות שכר).
 *
 * הצבע נשמר כמספר משבצת (`Workplace.colorIndex`) בפלטה קבועה, ולא כקוד צבע:
 * הפלטה נגזרת מצבע המערכת (`distinctShades`), כך שהחלפת ערכת הצבעים או
 * מצב יום/לילה מחליפה בהתאמה גם את צבעי מקומות העבודה.
 */
import { useCallback } from 'react';
import { distinctShades } from './shades';
import { useTheme } from './ThemeContext';
import type { ColorScheme } from './palettes';

/** מספר הצבעים בפלטה שממנה בוחרים צבע למקום עבודה. */
export const WORKPLACE_COLOR_COUNT = 8;

/** הפלטה לבחירה, בצבעי הערכה הפעילה. */
export function workplacePalette(c: ColorScheme): string[] {
  return distinctShades(c, WORKPLACE_COLOR_COUNT);
}

/** הצבע של מקום עבודה (משבצת 0 כשעוד לא נקבע). */
export function workplaceColor(c: ColorScheme, w: { colorIndex?: number } | null | undefined): string {
  const palette = workplacePalette(c);
  const i = w?.colorIndex ?? 0;
  return palette[((i % palette.length) + palette.length) % palette.length];
}

/** ‏(w) => צבע, בצבעי הערכה הפעילה. */
export function useWorkplaceColor(): (w: { colorIndex?: number } | null | undefined) => string {
  const { colors } = useTheme();
  return useCallback((w) => workplaceColor(colors, w), [colors]);
}
