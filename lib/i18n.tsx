/**
 * שכבת בינאום (i18n) לאפליקציה — עברית / אנגלית.
 *
 * השפה נשמרת ב־AsyncStorage ונטענת בהפעלה. useI18n() מספק את פונקציית
 * התרגום t(), את כיווניות הטקסט (isRTL) ואת פירמוט המשך המתורגם.
 * הכיוון (isRTL) נגזר מהשפה שנבחרה, ורכיבים שתלויים בכיוון (צד המגירה,
 * חצים, יישור) קוראים אותו מכאן ולא מ־I18nManager — כך הם מתעדכנים מיד.
 * רק שפות שב־AVAILABLE_LANGS ניתנות לבחירה; שפה שנשמרה ואינה זמינה
 * (למשל אנגלית מגרסה קודמת) חוזרת לעברית בטעינה.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { I18nManager, Platform } from 'react-native';
import { formatDuration as formatDurationRaw } from './time';
import { readJSON, writeJSON } from './storage';
import {
  LANG_LABELS,
  AVAILABLE_LANGS,
  RTL_LANGS,
  STRINGS,
  type Lang,
  type StringTree,
} from './strings';

const STORAGE_KEY = 'reporting-hours/lang/v1';

export type TranslateVars = Record<string, string | number>;

type I18nContextValue = {
  lang: Lang;
  isRTL: boolean;
  /** מחליף שפה; מחזיר false (ולא מחליף) כששפה עדיין לא זמינה. */
  setLang: (lang: Lang) => boolean;
  /** האם אפשר כבר לעבור לשפה */
  isLangAvailable: (lang: Lang) => boolean;
  /** תרגום לפי נתיב מנוקד, למשל t('report.title'); תומך ב־"{name}". */
  t: (key: string, vars?: TranslateVars) => string;
  /** פירמוט משך בדקות בשפה הנוכחית. */
  formatDuration: (totalMinutes: number) => string;
  langLabels: Record<Lang, string>;
  ready: boolean;
};

const I18nContext = createContext<I18nContextValue | null>(null);

function lookup(tree: StringTree, path: string[]): string | undefined {
  let node: string | StringTree | undefined = tree;
  for (const segment of path) {
    if (typeof node !== 'object' || node === null) return undefined;
    node = node[segment];
  }
  return typeof node === 'string' ? node : undefined;
}

function interpolate(template: string, vars?: TranslateVars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match,
  );
}

/** מיישר את כיווניות ה־DOM ב־web לפי השפה (ב־static export אין SSR מותאם). */
function applyWebDirection(lang: Lang, rtl: boolean): void {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;
  document.documentElement.setAttribute('dir', rtl ? 'rtl' : 'ltr');
  document.documentElement.setAttribute('lang', lang);
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>('he');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    readJSON<Lang | null>(STORAGE_KEY, null).then((saved) => {
      if (!active) return;
      if (saved && AVAILABLE_LANGS.includes(saved)) setLangState(saved);
      else if (saved) void writeJSON(STORAGE_KEY, 'he');
      setReady(true);
    });
    return () => {
      active = false;
    };
  }, []);

  const isRTL = RTL_LANGS.includes(lang);

  useEffect(() => {
    applyWebDirection(lang, isRTL);
    try {
      I18nManager.allowRTL(isRTL);
      if (I18nManager.isRTL !== isRTL) I18nManager.forceRTL(isRTL);
    } catch {
      // סביבה ללא המודול — מתעלמים
    }
  }, [lang, isRTL]);

  const isLangAvailable = useCallback((l: Lang) => AVAILABLE_LANGS.includes(l), []);

  const setLang = useCallback((next: Lang) => {
    if (!AVAILABLE_LANGS.includes(next)) return false;
    setLangState(next);
    void writeJSON(STORAGE_KEY, next);
    return true;
  }, []);

  const t = useCallback(
    (key: string, vars?: TranslateVars) => {
      const path = key.split('.');
      const value =
        lookup(STRINGS[lang], path) ?? lookup(STRINGS.he, path) ?? key;
      return interpolate(value, vars);
    },
    [lang],
  );

  const formatDuration = useCallback(
    (totalMinutes: number) =>
      formatDurationRaw(totalMinutes, {
        hoursShort: t('duration.hoursShort'),
        minutesShort: t('duration.minutesShort'),
        join: t('duration.join'),
      }),
    [t],
  );

  const value = useMemo<I18nContextValue>(
    () => ({
      lang,
      isRTL,
      setLang,
      isLangAvailable,
      t,
      formatDuration,
      langLabels: LANG_LABELS,
      ready,
    }),
    [lang, isRTL, setLang, isLangAvailable, t, formatDuration, ready],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error('useI18n חייב לרוץ בתוך <I18nProvider>');
  }
  return ctx;
}
