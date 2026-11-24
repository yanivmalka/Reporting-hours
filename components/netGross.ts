/**
 * קו אחיד לסכומי הכנסה (צפי, דווח, פוטנציאל, תשלום): הסכום הראשי נטו אחרי מס,
 * ותמיד לצדו הברוטו ואחוז המס — או ציון מפורש שלא הוגדר מס (נטו = ברוטו),
 * כדי שלא ייווצרו ציפיות לסכום שלא ייכנס.
 */
import { money } from './ForecastChart';

/** שורת המשנה לסכום נטו: "ברוטו ₪X · מס Y%", או "לא הוגדר מס". */
export function grossNote(gross: number, taxPercent: number): string {
  return taxPercent > 0 ? `ברוטו ${money(gross)} · מס ${taxPercent}%` : 'לא הוגדר מס · נטו = ברוטו';
}
