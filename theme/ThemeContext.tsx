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
};

const STORAGE_KEY = 'reporting-hours/theme/v1';

const DEFAULT_VALUE: ThemeContextValue = {
  colors: fallbackColors,
  paletteId: DEFAULT_PALETTE_ID,
  palettes: PALETTES,
  setPaletteId: () => {},
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
    readJSON<{ paletteId?: unknown }>(STORAGE_KEY, {}).then(
      (saved) => {
        if (!active) return;
        if (isPaletteId(saved.paletteId)) setPaletteId(saved.paletteId);
        setLoaded(true);
      },
    );
    return () => {
      active = false;
    };
  }, []);

  // שמירת הבחירה בכל שינוי, רק אחרי שהטעינה הראשונית הסתיימה.
  useEffect(() => {
    if (loaded) writeJSON(STORAGE_KEY, { paletteId });
  }, [loaded, paletteId]);

  const value = useMemo<ThemeContextValue>(() => {
    return {
      colors: getPalette(paletteId).colors,
      paletteId,
      palettes: PALETTES,
      setPaletteId,
    };
  }, [paletteId]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
