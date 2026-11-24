import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';
import { readJSON, writeJSON } from '../lib/storage';
import { fallbackColors } from './colors';
import {
  DEFAULT_PALETTE_ID,
  PALETTES,
  getPalette,
  type ColorScheme,
  type Palette,
  type PaletteId,
} from './palettes';
import { KEYS } from '../lib/keys';
import * as SplashScreen from 'expo-splash-screen';
import { setLauncherIcon, setSplashTheme } from '../modules/splash-theme/src';

// מסך הפתיחה נשאר עד שהערכה השמורה נטענת — כך האפליקציה לא מהבהבת בצבע ברירת המחדל.
SplashScreen.preventAutoHideAsync().catch(() => {});
const hideSplash = () => SplashScreen.hideAsync().catch(() => {});

/**
 * ניהול ערכת הצבעים הפעילה ואספקתה לכל עץ הרכיבים דרך useTheme().
 * האפליקציה תמיד בהירה — אין מצב כהה.
 *
 * הבחירה נשמרת מקומית (אותו מנגנון אחסון של שאר האפליקציה) כך שהיא נשמרת
 * בין הפעלות, גם באתר וגם באפליקציית האנדרואיד. המשתמש מחליף ערכה מתוך תפריט ההמבורגר (components/AppDrawer.tsx).
 */

type ThemeContextValue = {
  /** צבעי הערכה הפעילה */
  colors: ColorScheme;
  /** מזהה ערכת הצבעים הנבחרת */
  paletteId: PaletteId;
  /** כל הערכות הזמינות, לבניית בורר בתפריט */
  palettes: readonly Palette[];
  setPaletteId: (id: PaletteId) => void;
  /** הערכה השמורה נטענה ומסך הפתיחה של המערכת הוסתר (מסך הפתיחה הממותג מתחיל ממנו) */
  loaded: boolean;
};

const STORAGE_KEY = KEYS.theme;

const DEFAULT_VALUE: ThemeContextValue = {
  colors: fallbackColors,
  paletteId: DEFAULT_PALETTE_ID,
  palettes: PALETTES,
  setPaletteId: () => {},
  loaded: false,
};

const ThemeContext = createContext<ThemeContextValue>(DEFAULT_VALUE);

/** גישה לצבעי הערכה הפעילה ולפעולות ההחלפה. */
export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}

function isPaletteId(value: unknown): value is PaletteId {
  return PALETTES.some((p) => p.id === value);
}

export function ThemeProvider({ children }: PropsWithChildren) {
  const [paletteId, setPaletteId] = useState<PaletteId>(DEFAULT_PALETTE_ID);
  const [loaded, setLoaded] = useState(false);

  // טעינת הבחירה השמורה פעם אחת בעליית האפליקציה.
  useEffect(() => {
    let active = true;
    // רשת ביטחון: מסך הפתיחה לא נשאר יותר משנייה וחצי גם אם הקריאה מתעכבת.
    const safety = setTimeout(hideSplash, 1500);
    readJSON<{ paletteId?: unknown }>(STORAGE_KEY, {})
      .then((saved) => {
        if (!active) return;
        if (isPaletteId(saved.paletteId)) setPaletteId(saved.paletteId);
      })
      .finally(() => {
        if (!active) return;
        setLoaded(true);
        hideSplash();
      });
    return () => {
      active = false;
      clearTimeout(safety);
    };
  }, []);

  // שמירת הבחירה בכל שינוי, רק אחרי שהטעינה הראשונית הסתיימה.
  useEffect(() => {
    if (!loaded) return;
    writeJSON(STORAGE_KEY, { paletteId });
    // מסך הפתיחה בפתיחה הבאה — בצבע הערכה (אנדרואיד 13+).
    setSplashTheme(paletteId);
    // ואייקון האפליקציה — בצבעי הערכה (משתנה רק כשצריך).
    setLauncherIcon(paletteId, PALETTES.map((p) => p.id));
  }, [loaded, paletteId]);

  const value = useMemo<ThemeContextValue>(() => {
    return {
      colors: getPalette(paletteId).colors,
      paletteId,
      palettes: PALETTES,
      setPaletteId,
      loaded,
    };
  }, [paletteId, loaded]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
