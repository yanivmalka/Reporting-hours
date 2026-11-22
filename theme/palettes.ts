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
 * - כל הערכות בסגנון "גרפיט": גוון מעומעם (רוויה ~25%) בבהירות 27% למותג,
 *   17% לכהה ו־93% לבהיר — אותה עוצמה, צבע שונה.
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
  background: '#F3F5F4',
  surface: '#FFFFFF',
  border: '#E4EAE8',
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
      brand: '#305A58',
      brandDark: '#1B3C3B',
      brandLight: '#E8F3F2',
      ...NEUTRAL_LIGHT,
      ...STATUS_LIGHT,
    },
    swatchTint: '#C9E3E2',
  },
  {
    id: 'indigo',
    labelHe: 'אינדיגו',
    labelEn: 'Indigo',
    colors: {
      brand: '#323358',
      brandDark: '#1C1D3B',
      brandLight: '#E8E8F2',
      ...NEUTRAL_LIGHT,
      ...STATUS_LIGHT,
    },
    swatchTint: '#CACBE2',
  },
  {
    id: 'ocean',
    labelHe: 'שזיף',
    labelEn: 'Plum',
    colors: {
      brand: '#54364B',
      brandDark: '#381E31',
      brandLight: '#F1E9EF',
      ...NEUTRAL_LIGHT,
      ...STATUS_LIGHT,
    },
    swatchTint: '#E0CCDA',
  },
  {
    id: 'forest',
    labelHe: 'ירוק',
    labelEn: 'Sage',
    colors: {
      brand: '#335742',
      brandDark: '#1D3A29',
      brandLight: '#E9F2EC',
      ...NEUTRAL_LIGHT,
      ...STATUS_LIGHT,
    },
    swatchTint: '#CBE2D4',
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
