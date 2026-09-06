import type { AppColors } from './colors';
import { useStyles } from './useStyles';

/**
 * גרסה מצומצמת של {@link useStyles} למקרה הנפוץ שבו הסגנונות תלויים רק
 * בערכת הצבעים ולא בכיווניות. עוטף את useStyles ומעביר לו factory שמתעלם
 * מפרמטר ה־layout, כך שיש מימוש אחד בלבד לבניית סגנונות תלויי־נושא.
 *
 * שימוש: מגדירים `const makeStyles = (colors: AppColors) => StyleSheet.create({…})`
 * ברמת המודול, ובתוך הרכיב קוראים `const styles = useThemedStyles(makeStyles)`.
 */
export function useThemedStyles<T>(factory: (colors: AppColors) => T): T {
  return useStyles(factory);
}
