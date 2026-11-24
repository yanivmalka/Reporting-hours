/**
 * פענוח שעה שהוקלדה בחופשיות בשדה שעה (components/TimeInput).
 *
 * - הקלדה רציפה של ספרות: הנקודתיים נוספות לבד ("930" → "09:30"), ספרת שעה
 *   ראשונה 3–9 משלימה "0", וכך גם ספרת דקות ראשונה 6–9 (`typed`).
 * - עריכה חופשית: אפשר למחוק ולתקן ספרה בכל מקום; מפריד יכול להיות ":" "." או ",".
 * - ביציאה מהשדה (`finish`): "9" → 09:00, "930" → 09:30, "9:5" → שגוי (דקה אחת חסרה).
 */

const pad2 = (n: number) => String(n).padStart(2, '0');
export const onlyDigits = (text: string) => text.replace(/\D/g, '');

/** לוקח חלק (שעות/דקות) מתחילת רצף ספרות; מחזיר [חלק, שארית]. */
function take(d: string, maxFirst: number): [string, string] {
  if (d === '') return ['', ''];
  if (Number(d[0]) > maxFirst) return [`0${d[0]}`, d.slice(1)];
  return [d.slice(0, 2), d.slice(2)];
}

/** ספרות שהוקלדו ברצף → [שעות, דקות, שארית]. שעה מעל 23 נקבעת ל־23. */
export function typed(d: string): [string, string, string] {
  let [h, rest] = take(d, 2);
  if (h.length === 2 && Number(h) > 23) h = '23';
  if (h.length < 2) return [h, '', ''];
  const [m, extra] = take(rest, 5);
  return [h, m, extra];
}

/** תצוגה בזמן הקלדה רציפה: "9" · "09:" · "09:3" · "09:30" */
export function typedText(h: string, m: string): string {
  if (h.length < 2) return h;
  return `${h}:${m}`;
}

/** שעה תקינה → "HH:MM", אחרת null. */
function valid(h: number, m: number): string | null {
  if (!Number.isInteger(h) || !Number.isInteger(m) || h < 0 || h > 23 || m < 0 || m > 59) return null;
  return `${pad2(h)}:${pad2(m)}`;
}

/** טקסט עם מפריד ("9:30", "09.3") → [שעות, דקות] כמחרוזות ספרות, או null. */
function split(text: string): [string, string] | null {
  const t = text.trim().replace(/[.,]/g, ':');
  const r = /^(\d{0,2}):(\d{0,2})$/.exec(t);
  return r ? [r[1], r[2]] : null;
}

/**
 * שעה שלמה כבר בזמן העריכה ("HH:MM"), אחרת null — כשחסרות ספרות.
 * "9:30" ו־"0930" שלמים; "9:3" ו־"093" עדיין לא.
 */
export function complete(text: string): string | null {
  const s = split(text);
  if (s) return s[0].length >= 1 && s[1].length === 2 ? valid(Number(s[0]), Number(s[1])) : null;
  const d = text.trim();
  if (!/^\d+$/.test(d)) return null;
  if (d.length === 4) return valid(Number(d.slice(0, 2)), Number(d.slice(2)));
  if (d.length === 3 && Number(d[0]) > 2) return valid(Number(d[0]), Number(d.slice(1)));
  return null;
}

/**
 * ביציאה מהשדה: משלים ככל האפשר ("9" → 09:00, "930" → 09:30, "9:" → 09:00).
 * '' — שדה ריק; null — לא ניתן לפענח (מסומן כשגוי).
 */
export function finish(text: string): string | null {
  const t = text.trim();
  if (t === '') return '';
  const s = split(t);
  if (s) {
    const [h, m] = s;
    if (h === '' || m.length === 1) return null;
    return valid(Number(h), m === '' ? 0 : Number(m));
  }
  if (!/^\d+$/.test(t)) return null;
  if (t.length <= 2) return valid(Number(t), 0);
  if (t.length === 3) return valid(Number(t[0]), Number(t.slice(1)));
  if (t.length === 4) return valid(Number(t.slice(0, 2)), Number(t.slice(2)));
  return null;
}
