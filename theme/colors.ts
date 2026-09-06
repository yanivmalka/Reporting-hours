/**
 * ערכת צבעים בסיסית לאפליקציה.
 * צבע המותג הוא טורקיז כהה (#0E7C7B); ברירת מחדל בהירה בלבד בשלב זה.
 */
export const colors = {
  brand: '#0E7C7B',
  brandDark: '#0A5C5B',
  brandLight: '#E3F1F1',

  background: '#F5F7F7',
  surface: '#FFFFFF',
  border: '#E2E6E6',

  text: '#1A2323',
  textMuted: '#5C6B6B',
  textOnBrand: '#FFFFFF',

  success: '#2E7D32',
  warning: '#B26A00',
  danger: '#C62828',
} as const;

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

export type AppColors = typeof colors;
