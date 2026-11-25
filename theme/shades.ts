/**
 * גוונים מאותה משפחת צבע — לגרפים: כל מקום עבודה מקבל גוון אחר של צבע
 * המותג, מהכהה (brandDark) ועד גוון בהיר שמתקרב לרקע. כך הגרף נשאר בפלטה
 * אחת בכל ערכת צבעים ובמצב יום/לילה.
 */
import type { ColorScheme } from './palettes';

function rgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((x) => x + x).join('') : h;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as [number, number, number];
}

/** ערבוב שני צבעים: t=0 — a, t=1 — b. */
export function mix(a: string, b: string, t: number): string {
  const x = rgb(a);
  const y = rgb(b);
  return (
    '#' +
    x
      .map((v, i) => Math.round(v + (y[i] - v) * t))
      .map((v) => v.toString(16).padStart(2, '0'))
      .join('')
  );
}

/** n גוונים מאותה משפחה, מהכהה לבהיר. */
export function familyShades(c: ColorScheme, n: number): string[] {
  const light = mix(c.brand, c.background, 0.55);
  if (n <= 1) return [c.brand];
  return Array.from({ length: n }, (_, i) => {
    const t = i / (n - 1);
    return t <= 0.5 ? mix(c.brandDark, c.brand, t * 2) : mix(c.brand, light, (t - 0.5) * 2);
  });
}

// ───────────────────────── מניפה לא־לינארית ─────────────────────────

function toHsl([r, g, b]: [number, number, number]): [number, number, number] {
  const x = [r, g, b].map((v) => v / 255);
  const max = Math.max(...x);
  const min = Math.min(...x);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = max === x[0] ? (x[1] - x[2]) / d + (x[1] < x[2] ? 6 : 0) : max === x[1] ? (x[2] - x[0]) / d + 2 : (x[0] - x[1]) / d + 4;
  h *= 60;
  return [h, s, l];
}

function fromHsl(h: number, s: number, l: number): string {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return '#' + [f(0), f(8), f(4)].map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
}

// ───────────────────────── גלגל צבעים (OKLCH) ─────────────────────────
//
// OKLCH הוא מרחב צבע "שווה לעין": אותה בהירות (L) ואותה עוצמה (C) נראות
// באמת זהות בכל גוון, כך שהמרחק בין שני צבעים תלוי רק בהפרש הגוון.

function srgbToLinear(v: number): number {
  const x = v / 255;
  return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
}

function linearToSrgb(v: number): number {
  return v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
}

/** hex ← גוון OKLCH (במעלות). */
export function oklchHue(hex: string): number {
  const [r, g, b] = rgb(hex).map(srgbToLinear);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return ((Math.atan2(bb, a) * 180) / Math.PI + 360) % 360;
}

/** OKLCH ← sRGB לינארי, או null כשהצבע מחוץ לטווח המסך. */
function oklchToLinear(L: number, C: number, h: number): [number, number, number] | null {
  const hr = (h * Math.PI) / 180;
  const a = C * Math.cos(hr);
  const b = C * Math.sin(hr);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const out: [number, number, number] = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  return out.every((v) => v >= -0.0005 && v <= 1.0005) ? out : null;
}

/** צבע OKLCH כ־hex; אם הוא חורג מטווח המסך — מורידים עוצמה עד שנכנס. */
export function oklch(L: number, C: number, h: number): string {
  let c = C;
  let lin = oklchToLinear(L, c, h);
  while (!lin && c > 0) {
    c = Math.max(0, c - 0.005);
    lin = oklchToLinear(L, c, h);
  }
  return (
    '#' +
    (lin ?? [L, L, L])
      .map((v) => Math.round(Math.min(1, Math.max(0, linearToSrgb(v))) * 255))
      .map((v) => v.toString(16).padStart(2, '0'))
      .join('')
  );
}

/**
 * סדר הגוונים בגלגל (מעלות מעל גוון המותג). כל משבצת חדשה נופלת באמצע
 * הפער הגדול ביותר שנשאר: 0° ← 180° (הצד השני) ← 90°/270° ← האלכסונים.
 * כך גם 2, 3 או 4 מקומות עבודה רחוקים זה מזה ככל האפשר.
 */
export const WHEEL_OFFSETS = [0, 180, 90, 270, 45, 225, 135, 315] as const;

/**
 * n צבעים מפוזרים על כל גלגל הצבעים — הנוסחה:
 *
 *   גוון(i)   = גוון המותג + WHEEL_OFFSETS[i]
 *   בהירות(i) = בסיס לפי מצב יום/לילה; ארבע המשבצות האלכסוניות (4–7) מוזזות
 *               מעט, כך שגם שכנים בגלגל (45°) נבדלים בבהירות
 *   עוצמה    = קבועה ומעומעמת (בסגנון הערכות), פחות אם חורגת מהמסך
 *
 * הנוסחה זהה בכל ערכה: משבצת i היא תמיד "אותו מקום בגלגל ביחס למותג",
 * ולכן החלפת ערכה ומעבר בחזרה מחזירים בדיוק את אותם צבעים.
 */
export function wheelColors(c: ColorScheme, n: number): string[] {
  if (n <= 0) return [];
  const h0 = oklchHue(c.brand);
  const dark = toHsl(rgb(c.background))[2] < 0.4;
  const baseL = dark ? 0.74 : 0.52;
  const shiftL = dark ? -0.08 : 0.09;
  const chroma = dark ? 0.1 : 0.11;
  return Array.from({ length: n }, (_, i) => {
    const off = WHEEL_OFFSETS[i % WHEEL_OFFSETS.length];
    const L = i % WHEEL_OFFSETS.length >= 4 ? baseL + shiftL : baseL;
    return oklch(L, chroma, (h0 + off) % 360);
  });
}
