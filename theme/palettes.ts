/**
 * ערכות צבעים לאפליקציה.
 *
 * כל ערכה מגדירה סכימה בהירה אחת (האפליקציה תמיד בהירה).
 * ThemeContext בוחר את הערכה הפעילה ומספק אותה דרך useTheme().
 * אף רכיב לא מייבא צבעים ישירות מכאן.
 */

/** מבנה סכימת הצבעים של ערכה. */
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

export type PaletteId = 'teal' | 'indigo' | 'ocean' | 'forest' | 'graphite';

export type Palette = {
  id: PaletteId;
  labelHe: string;
  labelEn: string;
  colors: ColorScheme;
  /** גוון שני לחצי העיגול בבורר הערכות בתפריט */
  swatchTint: string;
};

/*
 * עקרונות העיצוב (2026):
 * - רקע ניטרלי קריר כמעט־לבן, משטחים לבנים, גבולות עדינים; צבע המותג
 *   בגוון 700 (ניגודיות של 4.5:1 לפחות מול טקסט לבן).
 * - אותם צבעי סטטוס בכל הערכות.
 */
const STATUS_LIGHT = {
  success: '#15803D',
  warning: '#B45309',
  danger: '#DC2626',
  dangerText: '#B91C1C',
  dangerSoft: '#FDECEC',
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

export const PALETTES: readonly Palette[] = [
  {
    id: 'teal',
    labelHe: 'טורקיז',
    labelEn: 'Teal',
    colors: {
      brand: '#0F766E',
      brandDark: '#115E59',
      brandLight: '#E0F2EF',
      ...NEUTRAL_LIGHT,
      ...STATUS_LIGHT,
    },
    swatchTint: '#2DD4BF',
  },
  {
    id: 'indigo',
    labelHe: 'אינדיגו',
    labelEn: 'Indigo',
    colors: {
      brand: '#4F46E5',
      brandDark: '#3730A3',
      brandLight: '#EAE9FD',
      ...NEUTRAL_LIGHT,
      ...STATUS_LIGHT,
    },
    swatchTint: '#A5B4FC',
  },
  {
    id: 'ocean',
    labelHe: 'כחול',
    labelEn: 'Ocean',
    colors: {
      brand: '#1D4ED8',
      brandDark: '#1E3A8A',
      brandLight: '#E3ECFD',
      ...NEUTRAL_LIGHT,
      ...STATUS_LIGHT,
    },
    swatchTint: '#60A5FA',
  },
  {
    id: 'forest',
    labelHe: 'אזמרגד',
    labelEn: 'Emerald',
    colors: {
      brand: '#047857',
      brandDark: '#065F46',
      brandLight: '#DDF3EA',
      ...NEUTRAL_LIGHT,
      ...STATUS_LIGHT,
    },
    swatchTint: '#34D399',
  },
  {
    id: 'graphite',
    labelHe: 'גרפיט',
    labelEn: 'Graphite',
    colors: {
      brand: '#334155',
      brandDark: '#1E293B',
      brandLight: '#E8ECF1',
      ...NEUTRAL_LIGHT,
      ...STATUS_LIGHT,
    },
    swatchTint: '#CBD5E1',
  },
];

export const DEFAULT_PALETTE_ID: PaletteId = 'teal';

export function getPalette(id: PaletteId): Palette {
  return PALETTES.find((p) => p.id === id) ?? PALETTES[0];
}
