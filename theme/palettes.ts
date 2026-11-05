/**
 * ערכות צבעים לאפליקציה.
 *
 * כל ערכה מגדירה זוג סכימות — בהירה וכהה — עם אותו מבנה מפתחות בדיוק.
 * ThemeContext בוחר את הערכה הפעילה ואת הסכימה (בהיר/כהה/מערכת) ומספק
 * את התוצאה דרך useTheme(). אף רכיב לא מייבא צבעים ישירות מכאן.
 */

/** מבנה סכימת צבעים בודדת (בהירה או כהה). */
export type ColorScheme = {
  brand: string;
  brandDark: string;
  brandLight: string;

  background: string;
  surface: string;
  border: string;

  text: string;
  textMuted: string;
  textOnBrand: string;

  success: string;
  warning: string;
  danger: string;
  /** אדום כהה לטקסט של פעולה הרסנית (בלי מסגרת ובלי מילוי בוהק) */
  dangerText: string;
  /** רקע ורוד בהיר לפעולה הרסנית מודגשת */
  dangerSoft: string;
};

export type PaletteId = 'teal' | 'indigo' | 'ocean' | 'forest' | 'sunset' | 'graphite';

/** מצב התצוגה שהמשתמש בחר; 'system' נגזר מהגדרת מערכת ההפעלה. */
export type ThemeMode = 'light' | 'dark' | 'system';

export type Palette = {
  id: PaletteId;
  labelHe: string;
  labelEn: string;
  light: ColorScheme;
  dark: ColorScheme;
};

/*
 * עקרונות העיצוב (2026):
 * - בהיר: רקע ניטרלי קריר כמעט־לבן, משטחים לבנים, גבולות עדינים; צבע המותג
 *   בגוון 700 (ניגודיות של 4.5:1 לפחות מול טקסט לבן).
 * - כהה: לא שחור מוחלט — רקע כהה עם נגיעה מהגוון, משטחים מוגבהים מעט
 *   בהירים יותר; צבע המותג בגוון 300–400 עם טקסט כהה עליו.
 * - אותם צבעי סטטוס בכל הערכות, מכוילים לכל מצב.
 */
const STATUS_LIGHT = {
  success: '#15803D',
  warning: '#B45309',
  danger: '#DC2626',
  dangerText: '#B91C1C',
  dangerSoft: '#FDECEC',
} as const;

const STATUS_DARK = {
  success: '#4ADE80',
  warning: '#FBBF24',
  danger: '#F87171',
  dangerText: '#FCA5A5',
  dangerSoft: '#3A1A1C',
} as const;

/** ניטרליים משותפים — אפור־כחלחל (slate) קריר. */
const NEUTRAL_LIGHT = {
  background: '#F6F8FA',
  surface: '#FFFFFF',
  border: '#E2E8F0',
  text: '#0F172A',
  textMuted: '#526070',
  textOnBrand: '#FFFFFF',
} as const;

/** ניטרליים כהים: רקע עם נגיעה מגוון המותג, משטח מוגבה, טקסט רך. */
const darkNeutrals = (background: string, surface: string, border: string) => ({
  background,
  surface,
  border,
  text: '#E8ECF1',
  textMuted: '#9AA6B4',
});

export const PALETTES: readonly Palette[] = [
  {
    id: 'teal',
    labelHe: 'טורקיז',
    labelEn: 'Teal',
    light: {
      brand: '#0F766E',
      brandDark: '#115E59',
      brandLight: '#E0F2EF',
      ...NEUTRAL_LIGHT,
      ...STATUS_LIGHT,
    },
    dark: {
      brand: '#2DD4BF',
      brandDark: '#5EEAD4',
      brandLight: '#0F2F2C',
      ...darkNeutrals('#0B1214', '#131C1F', '#24313A'),
      textOnBrand: '#042F2E',
      ...STATUS_DARK,
    },
  },
  {
    id: 'indigo',
    labelHe: 'אינדיגו',
    labelEn: 'Indigo',
    light: {
      brand: '#4F46E5',
      brandDark: '#3730A3',
      brandLight: '#EAE9FD',
      ...NEUTRAL_LIGHT,
      ...STATUS_LIGHT,
    },
    dark: {
      brand: '#A5B4FC',
      brandDark: '#C7D2FE',
      brandLight: '#1F2147',
      ...darkNeutrals('#0C0E18', '#151827', '#272B40'),
      textOnBrand: '#1E1B4B',
      ...STATUS_DARK,
    },
  },
  {
    id: 'ocean',
    labelHe: 'כחול',
    labelEn: 'Ocean',
    light: {
      brand: '#1D4ED8',
      brandDark: '#1E3A8A',
      brandLight: '#E3ECFD',
      ...NEUTRAL_LIGHT,
      ...STATUS_LIGHT,
    },
    dark: {
      brand: '#60A5FA',
      brandDark: '#93C5FD',
      brandLight: '#13254A',
      ...darkNeutrals('#0A101C', '#121A29', '#233046'),
      textOnBrand: '#0A1A3A',
      ...STATUS_DARK,
    },
  },
  {
    id: 'forest',
    labelHe: 'אזמרגד',
    labelEn: 'Emerald',
    light: {
      brand: '#047857',
      brandDark: '#065F46',
      brandLight: '#DDF3EA',
      ...NEUTRAL_LIGHT,
      ...STATUS_LIGHT,
    },
    dark: {
      brand: '#34D399',
      brandDark: '#6EE7B7',
      brandLight: '#0E2E22',
      ...darkNeutrals('#0A1310', '#121D19', '#23332C'),
      textOnBrand: '#022C22',
      ...STATUS_DARK,
    },
  },
  {
    id: 'sunset',
    labelHe: 'ענבר',
    labelEn: 'Amber',
    light: {
      brand: '#C2410C',
      brandDark: '#9A3412',
      brandLight: '#FDEBDD',
      ...NEUTRAL_LIGHT,
      background: '#F8F7F5',
      border: '#E7E3DE',
      text: '#1C1917',
      textMuted: '#5F5852',
      ...STATUS_LIGHT,
    },
    dark: {
      brand: '#FB923C',
      brandDark: '#FDBA74',
      brandLight: '#35200F',
      ...darkNeutrals('#13100D', '#1D1814', '#342A22'),
      textOnBrand: '#431407',
      ...STATUS_DARK,
    },
  },
  {
    id: 'graphite',
    labelHe: 'גרפיט',
    labelEn: 'Graphite',
    light: {
      brand: '#334155',
      brandDark: '#1E293B',
      brandLight: '#E8ECF1',
      ...NEUTRAL_LIGHT,
      ...STATUS_LIGHT,
    },
    dark: {
      brand: '#CBD5E1',
      brandDark: '#E2E8F0',
      brandLight: '#232B36',
      ...darkNeutrals('#0D1014', '#161A20', '#2A313B'),
      textOnBrand: '#0F172A',
      ...STATUS_DARK,
    },
  },
];

export const DEFAULT_PALETTE_ID: PaletteId = 'teal';

export function getPalette(id: PaletteId): Palette {
  return PALETTES.find((p) => p.id === id) ?? PALETTES[0];
}
