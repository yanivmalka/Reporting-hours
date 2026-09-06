/**
 * מידות משותפות (ריווח ורדיוסים) וטיפוסי צבע.
 *
 * הצבעים עצמם עברו ל־theme/palettes.ts ומסופקים בזמן ריצה דרך
 * useTheme() ב־theme/ThemeContext.tsx, כדי לתמוך במצב יום/לילה ובכמה
 * ערכות צבעים שהמשתמש מחליף מתפריט ההמבורגר. `fallbackColors` משמש רק
 * לקוד שאינו רכיב React (למשל ערכי ברירת מחדל של הניווט לפני טעינת הקונטקסט).
 */
import { getPalette, DEFAULT_PALETTE_ID, type ColorScheme } from './palettes';

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 20,
} as const;

export type AppColors = ColorScheme;

/** ערכת ברירת המחדל (טורקיז, בהיר) — לשימוש מחוץ לעץ הרכיבים בלבד. */
export const fallbackColors: ColorScheme = getPalette(DEFAULT_PALETTE_ID).light;
