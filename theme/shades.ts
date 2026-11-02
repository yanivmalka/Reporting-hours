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
