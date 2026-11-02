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

/**
 * n צבעים מאותה "משפחה" של צבע המותג, אבל מפוזרים לא־לינארית: הגוון נע
 * בטווח ±55° סביב צבע המותג בצעדי "יחס הזהב", והבהירות מתחלפת בין כמה
 * רמות — כך ששני צבעים סמוכים (ברשימה או בערימה) נבדלים בבירור גם בגוון
 * וגם בבהירות. בערכה כהה הבהירות מוזזת למעלה.
 */
export function distinctShades(c: ColorScheme, n: number): string[] {
  if (n <= 0) return [];
  const [h0, s0] = toHsl(rgb(c.brand));
  const dark = toHsl(rgb(c.background))[2] < 0.4;
  const levels = dark ? [0.62, 0.45, 0.74, 0.53, 0.68] : [0.36, 0.55, 0.28, 0.47, 0.64];
  const sat = Math.max(0.45, Math.min(0.8, s0));
  return Array.from({ length: n }, (_, i) => {
    const t = (i * 0.618034) % 1; // 0, .62, .24, .85, .47 …
    const h = (h0 + (t - 0.5) * 110 + 360) % 360;
    return fromHsl(h, sat, levels[i % levels.length]);
  });
}
