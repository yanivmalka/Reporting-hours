/**
 * הגופן של האפליקציה: Heebo — הגופן העברי ממשפחת Roboto של גוגל, שמתאים
 * לשפת העיצוב של Android/Google ויש לו משקלים אמיתיים (400–800). בלעדיו
 * הדפדפן מדגיש את גופן המערכת באופן מלאכותי, והטקסט המודגש נראה דק וקטן.
 *
 * - אנדרואיד: קובצי הגופן ב־assets/fonts, נארזים כמשפחת XML אחת בשם "Heebo"
 *   (app.json → expo-font), כך ש־fontWeight בוחר את הקובץ הנכון.
 * - web: נטען מ־Google Fonts (app/+html.tsx) תחת אותו שם משפחה.
 */
import { Platform } from 'react-native';

export const FONT_FAMILY = Platform.select({
  web: "Heebo, system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif",
  default: 'Heebo',
});
