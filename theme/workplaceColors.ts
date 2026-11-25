/**
 * צבע לכל מקום עבודה — כדי שהמשתמש יקשר צבע למקום בכל מקום שבו הוא מופיע
 * (לו״ז, דיווחים, לוח בקרה, דוחות שכר).
 *
 * הצבע נשמר כמספר משבצת (`Workplace.colorIndex`) בפלטה קבועה, ולא כקוד צבע:
 * הפלטה מפוזרת על כל גלגל הצבעים ומתחילה מגוון המערכת (`wheelColors`):
 * משבצת i היא תמיד אותה זווית בגלגל ביחס לצבע המותג. כך החלפת ערכה או
 * מצב יום/לילה מחליפה את הגוונים לפי אותה נוסחה, וחזרה לערכה הקודמת
 * מחזירה בדיוק את מה שהיה (נשמר רק מספר המשבצת).
 */
import { useCallback } from 'react';
import { wheelColors } from './shades';
import { useTheme } from './ThemeContext';
import type { ColorScheme } from './palettes';

/** מספר הצבעים בפלטה שממנה בוחרים צבע למקום עבודה. */
export const WORKPLACE_COLOR_COUNT = 8;

/** הפלטה לבחירה, בצבעי הערכה הפעילה. */
export function workplacePalette(c: ColorScheme): string[] {
  return wheelColors(c, WORKPLACE_COLOR_COUNT);
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
