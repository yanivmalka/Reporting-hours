import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';
import { useColorScheme } from 'react-native';
import { readJSON, writeJSON } from '../lib/storage';
import { fallbackColors } from './colors';
import {
  DEFAULT_PALETTE_ID,
  PALETTES,
  getPalette,
  type ColorScheme,
  type Palette,
  type PaletteId,
  type ThemeMode,
} from './palettes';

/**
 * ניהול הערכה הפעילה (צבע + בהיר/כהה) ואספקתה לכל עץ הרכיבים דרך useTheme().
 *
 * הבחירה נשמרת מקומית (אותו מנגנון אחסון של שאר האפליקציה) כך שהיא נשמרת
 * בין הפעלות, גם באתר וגם באפליקציית האנדרואיד. המשתמש מחליף ערכה ומצב
 * תצוגה מתוך תפריט ההמבורגר (components/AppDrawer.tsx).
 */

type ThemeContextValue = {
  /** צבעי הערכה הפעילה — לפי הערכה שנבחרה והמצב (בהיר/כהה) שהוכרע */
  colors: ColorScheme;
  /** מזהה ערכת הצבעים הנבחרת */
  paletteId: PaletteId;
  /** מצב התצוגה שהמשתמש בחר (system = לפי הגדרת מערכת ההפעלה) */
  mode: ThemeMode;
  /** המצב שהוכרע בפועל אחרי פתרון 'system' */
  resolvedScheme: 'light' | 'dark';
  /** כל הערכות הזמינות, לבניית בורר בתפריט */
  palettes: readonly Palette[];
  setPaletteId: (id: PaletteId) => void;
  setMode: (mode: ThemeMode) => void;
};

const STORAGE_KEY = 'reporting-hours/theme/v1';

const DEFAULT_VALUE: ThemeContextValue = {
  colors: fallbackColors,
  paletteId: DEFAULT_PALETTE_ID,
  mode: 'system',
  resolvedScheme: 'light',
  palettes: PALETTES,
  setPaletteId: () => {},
  setMode: () => {},
};

const ThemeContext = createContext<ThemeContextValue>(DEFAULT_VALUE);

/** גישה לצבעי הערכה הפעילה ולפעולות ההחלפה. */
export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}

function isPaletteId(value: unknown): value is PaletteId {
  return PALETTES.some((p) => p.id === value);
}

function isThemeMode(value: unknown): value is ThemeMode {
  return value === 'light' || value === 'dark' || value === 'system';
}

export function ThemeProvider({ children }: PropsWithChildren) {
  const systemScheme = useColorScheme();
  const [paletteId, setPaletteId] = useState<PaletteId>(DEFAULT_PALETTE_ID);
  const [mode, setMode] = useState<ThemeMode>('system');
  const [loaded, setLoaded] = useState(false);

  // טעינת הבחירה השמורה פעם אחת בעליית האפליקציה.
  useEffect(() => {
    let active = true;
    readJSON<{ paletteId?: unknown; mode?: unknown }>(STORAGE_KEY, {}).then(
      (saved) => {
        if (!active) return;
        if (isPaletteId(saved.paletteId)) setPaletteId(saved.paletteId);
        if (isThemeMode(saved.mode)) setMode(saved.mode);
        setLoaded(true);
      },
    );
    return () => {
      active = false;
    };
  }, []);

  // שמירת הבחירה בכל שינוי, רק אחרי שהטעינה הראשונית הסתיימה.
  useEffect(() => {
    if (loaded) writeJSON(STORAGE_KEY, { paletteId, mode });
  }, [loaded, paletteId, mode]);

  const resolvedScheme: 'light' | 'dark' =
    mode === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : mode;

  const value = useMemo<ThemeContextValue>(() => {
    const palette = getPalette(paletteId);
    return {
      colors: resolvedScheme === 'dark' ? palette.dark : palette.light,
      paletteId,
      mode,
      resolvedScheme,
      palettes: PALETTES,
      setPaletteId,
      setMode,
    };
  }, [paletteId, mode, resolvedScheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
