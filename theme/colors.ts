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
  sm: 10,
  md: 16,
  lg: 24,
} as const;

/**
 * צל רך לכרטיסים ולאריחים — במקום מסגרת דקה. כרטיס לבן "צף" מעל רקע אפור־ירקרק.
 */
export const cardShadow = {
  elevation: 1,
  shadowColor: '#0F172A',
  shadowOpacity: 0.08,
  shadowRadius: 3,
  shadowOffset: { width: 0, height: 1 },
} as const;

export type AppColors = ColorScheme;

/** ערכת ברירת המחדל (טורקיז, בהיר) — לשימוש מחוץ לעץ הרכיבים בלבד. */
export const fallbackColors: ColorScheme = getPalette(DEFAULT_PALETTE_ID).colors;
