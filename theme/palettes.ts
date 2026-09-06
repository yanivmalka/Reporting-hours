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
};

export type PaletteId = 'teal' | 'indigo' | 'sunset' | 'forest' | 'rose';

/** מצב התצוגה שהמשתמש בחר; 'system' נגזר מהגדרת מערכת ההפעלה. */
export type ThemeMode = 'light' | 'dark' | 'system';

export type Palette = {
  id: PaletteId;
  labelHe: string;
  labelEn: string;
  light: ColorScheme;
  dark: ColorScheme;
};

const STATUS_LIGHT = {
  success: '#2E7D32',
  warning: '#B26A00',
  danger: '#C62828',
} as const;

const STATUS_DARK = {
  success: '#4ADE80',
  warning: '#FBBF24',
  danger: '#F87171',
} as const;

export const PALETTES: readonly Palette[] = [
  {
    id: 'teal',
    labelHe: 'טורקיז',
    labelEn: 'Teal',
    light: {
      brand: '#0E7C7B',
      brandDark: '#0A5C5B',
      brandLight: '#E3F1F1',
      background: '#F5F7F7',
      surface: '#FFFFFF',
      border: '#E2E6E6',
      text: '#1A2323',
      textMuted: '#5C6B6B',
      textOnBrand: '#FFFFFF',
      ...STATUS_LIGHT,
    },
    dark: {
      brand: '#2AA7A5',
      brandDark: '#6FD9D6',
      brandLight: '#123230',
      background: '#0E1514',
      surface: '#172120',
      border: '#2A3634',
      text: '#E7EEED',
      textMuted: '#9DB0AE',
      textOnBrand: '#04211F',
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
      brandLight: '#E8E7FB',
      background: '#F6F6FB',
      surface: '#FFFFFF',
      border: '#E4E4ED',
      text: '#1B1B2B',
      textMuted: '#5B5B72',
      textOnBrand: '#FFFFFF',
      ...STATUS_LIGHT,
    },
    dark: {
      brand: '#8B85F0',
      brandDark: '#B7B3F7',
      brandLight: '#201F3A',
      background: '#0F0F1A',
      surface: '#1A1A2B',
      border: '#2C2C42',
      text: '#EAEAF4',
      textMuted: '#A6A6C2',
      textOnBrand: '#12102E',
      ...STATUS_DARK,
    },
  },
  {
    id: 'sunset',
    labelHe: 'שקיעה',
    labelEn: 'Sunset',
    light: {
      brand: '#C2410C',
      brandDark: '#9A3412',
      brandLight: '#FBE8DE',
      background: '#FAF7F5',
      surface: '#FFFFFF',
      border: '#ECE4DF',
      text: '#2A1E17',
      textMuted: '#6E5B50',
      textOnBrand: '#FFFFFF',
      ...STATUS_LIGHT,
    },
    dark: {
      brand: '#F97316',
      brandDark: '#FDBA74',
      brandLight: '#3A2416',
      background: '#17110D',
      surface: '#221913',
      border: '#38291F',
      text: '#F2E9E2',
      textMuted: '#C0A794',
      textOnBrand: '#2A1206',
      ...STATUS_DARK,
    },
  },
  {
    id: 'forest',
    labelHe: 'יער',
    labelEn: 'Forest',
    light: {
      brand: '#15803D',
      brandDark: '#14532D',
      brandLight: '#DEF1E3',
      background: '#F5F8F5',
      surface: '#FFFFFF',
      border: '#E1E8E1',
      text: '#182018',
      textMuted: '#556655',
      textOnBrand: '#FFFFFF',
      ...STATUS_LIGHT,
    },
    dark: {
      brand: '#34D058',
      brandDark: '#86EFAC',
      brandLight: '#14311E',
      background: '#0D140F',
      surface: '#161F19',
      border: '#263528',
      text: '#E7EFE8',
      textMuted: '#9FB4A3',
      textOnBrand: '#052611',
      ...STATUS_DARK,
    },
  },
  {
    id: 'rose',
    labelHe: 'ורד',
    labelEn: 'Rose',
    light: {
      brand: '#BE185D',
      brandDark: '#9D174D',
      brandLight: '#FBE3EC',
      background: '#FBF6F8',
      surface: '#FFFFFF',
      border: '#EEE1E7',
      text: '#2A1721',
      textMuted: '#6E5460',
      textOnBrand: '#FFFFFF',
      ...STATUS_LIGHT,
    },
    dark: {
      brand: '#F472B6',
      brandDark: '#F9A8D4',
      brandLight: '#3A1A2A',
      background: '#171014',
      surface: '#22161D',
      border: '#382330',
      text: '#F3E7EE',
      textMuted: '#C29CB0',
      textOnBrand: '#2A0A1B',
      ...STATUS_DARK,
    },
  },
];

export const DEFAULT_PALETTE_ID: PaletteId = 'teal';

export function getPalette(id: PaletteId): Palette {
  return PALETTES.find((p) => p.id === id) ?? PALETTES[0];
}
