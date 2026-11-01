/**
 * useStyles — בונה גיליון סגנונות תלוי־ערכה ותלוי־כיווניות, וממחזר אותו
 * כל עוד הצבעים והכיוון לא השתנו.
 *
 * כל רכיב מגדיר makeStyles(c, layout) ברמת המודול וקורא
 * const styles = useStyles(makeStyles). כך החלפת מצב יום/לילה, ערכת צבעים
 * או שפה (RTL/LTR) מרעננת את הסגנונות אוטומטית.
 */
import { TEXT_LEFT, TEXT_RIGHT } from './align';
import { useMemo } from 'react';
import { useI18n } from '../lib/i18n';
import { useTheme } from './ThemeContext';
import type { ColorScheme } from './palettes';

export type { ColorScheme } from './palettes';

export type StyleLayout = {
  isRTL: boolean;
  /** יישור טקסט לתחילת השורה בשפה הנוכחית (right בעברית, left באנגלית). */
  textStart: 'left' | 'right';
  /** יישור טקסט לסוף השורה. */
  textEnd: 'left' | 'right';
  /**
   * כיוון שורה שמתחיל מהצד ה"טבעי" של השפה. תמיד 'row': גם ב־web
   * (dir=rtl על המסמך) וגם באנדרואיד (RTL כפוי) 'row' כבר זורם מימין
   * לשמאל — 'row-reverse' היה הופך פעמיים.
   */
  rowStart: 'row' | 'row-reverse';
};

export function useStyles<T>(
  factory: (c: ColorScheme, layout: StyleLayout) => T,
): T {
  const { colors } = useTheme();
  const { isRTL } = useI18n();
  return useMemo(() => {
    const layout: StyleLayout = {
      isRTL,
      textStart: isRTL ? TEXT_RIGHT : TEXT_LEFT,
      textEnd: isRTL ? TEXT_LEFT : TEXT_RIGHT,
      rowStart: 'row',
    };
    return factory(colors, layout);
  }, [colors, isRTL, factory]);
}
