/**
 * תצוגת תאריך משותפת — לועזי ועברי בלי שבירה באמצע:
 *   - התאריך הלועזי יחידה אחת שלא נשברת, וגם העברי יחידה אחת שלא נשברת
 *     (רווחים קשיחים בתוך כל אחד), כך ששבירת שורה אפשרית רק ביניהם.
 *   - אם לא נכנסים יחד — העברי כולו עובר לשורה משלו, בצבע משני, בלי סוגריים.
 *   - מכבד את ההגדרה "הצגת תאריך עברי". באריחים צרים מעבירים `hebrew={false}`.
 *
 * רכיב Text מקונן: אפשר לשבץ אותו בתוך טקסט אחר, והוא יורש את הסגנון שלו.
 */
import type { StyleProp, TextStyle } from 'react-native';
import { Text } from './Text';
import { hebrewDate } from '../lib/hebrewDate';
import { useShowHebrewDates } from '../lib/hebrewDatePref';
import { formatISODate } from '../lib/time';
import { useTheme } from '../theme/ThemeContext';

/** רווחים קשיחים — היחידה לא תישבר באמצע. */
export const unbreakable = (s: string) => s.replace(/ /g, ' ');

export function DateText({
  iso,
  hebrew = true,
  withHebrewYear = false,
  style,
}: {
  iso: string;
  /** להציג גם תאריך עברי (בכפוף להגדרה). באריחים צרים — false. */
  hebrew?: boolean;
  withHebrewYear?: boolean;
  style?: StyleProp<TextStyle>;
}) {
  const show = useShowHebrewDates();
  const { colors } = useTheme();
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(iso);
  return (
    <Text style={style}>
      {unbreakable(formatISODate(iso))}
      {valid && hebrew && show ? (
        <>
          {' '}
          <Text style={{ color: colors.textMuted, fontWeight: '400' }}>
            {unbreakable(hebrewDate(iso, withHebrewYear))}
          </Text>
        </>
      ) : null}
    </Text>
  );
}
