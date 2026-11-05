/**
 * חצים אחידים לכל האפליקציה:
 *   - `EnterChevron` — חץ כניסה לפריט (‹, מצביע שמאלה) בסוף כל שורה לחיצה.
 *     אייקון ולא תו טקסט: התו ‹ מתהפך אוטומטית בטקסט מימין לשמאל.
 *   - `FoldChevron` — חץ קיפול: ⌄ כשמקופל, ⌃ כשפתוח.
 */
import { Icon } from './Icon';
import { useTheme } from '../theme/ThemeContext';

export function EnterChevron({ size = 20, color }: { size?: number; color?: string }) {
  const { colors } = useTheme();
  return <Icon name="chevron-left" size={size} color={color ?? colors.textMuted} />;
}

export function FoldChevron({ open, size = 22, color }: { open: boolean; size?: number; color?: string }) {
  const { colors } = useTheme();
  return <Icon name={open ? 'chevron-up' : 'chevron-down'} size={size} color={color ?? colors.textMuted} />;
}
