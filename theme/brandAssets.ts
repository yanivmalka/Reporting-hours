/**
 * תמונות המותג לכל ערכת צבעים (assets/brand/<id>/, נוצרות ב־scripts/brand_assets.py):
 * שעון החול (מסך הפתיחה הממותג) ושעון החול עם המנעול הסגור / הפתוח (מסך "מידע כספי נעול").
 * ערכה חדשה — להריץ את הסקריפט ולהוסיף אותה כאן.
 */
import type { ImageSourcePropType } from 'react-native';
import type { PaletteId } from './palettes';

type BrandImages = { splash: ImageSourcePropType; locked: ImageSourcePropType; unlocked: ImageSourcePropType };

/* eslint-disable @typescript-eslint/no-require-imports */
const BRAND: Record<PaletteId, BrandImages> = {
  teal: { splash: require('../assets/brand/teal/splash.png'), locked: require('../assets/brand/teal/locked.png'),
    unlocked: require('../assets/brand/teal/unlocked.png'), },
  indigo: { splash: require('../assets/brand/indigo/splash.png'), locked: require('../assets/brand/indigo/locked.png'),
    unlocked: require('../assets/brand/indigo/unlocked.png'), },
  ocean: { splash: require('../assets/brand/ocean/splash.png'), locked: require('../assets/brand/ocean/locked.png'),
    unlocked: require('../assets/brand/ocean/unlocked.png'), },
  forest: { splash: require('../assets/brand/forest/splash.png'), locked: require('../assets/brand/forest/locked.png'),
    unlocked: require('../assets/brand/forest/unlocked.png'), },
  graphite: {
    splash: require('../assets/brand/graphite/splash.png'),
    locked: require('../assets/brand/graphite/locked.png'),
    unlocked: require('../assets/brand/graphite/unlocked.png'),
  },
};
/* eslint-enable @typescript-eslint/no-require-imports */

export function brandImages(id: PaletteId): BrandImages {
  return BRAND[id] ?? BRAND.teal;
}
