import { describe, expect, it } from 'vitest';
import { PALETTES } from '../theme/palettes';
import { oklchHue, wheelColors } from '../theme/shades';

const workplacePalette = (c: (typeof PALETTES)[number]['colors']) => wheelColors(c, 8);

const schemes = PALETTES.map((p) => p.colors);

function hueGap(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return Math.min(d, 360 - d);
}

describe('צבעי מקומות עבודה — גלגל צבעים', () => {
  it('בלילה (רקע כהה) — אותה נוסחה, בהירים יותר', () => {
    const c = { ...PALETTES[0].colors, background: '#121212' };
    const pal = workplacePalette(c);
    expect(new Set(pal).size).toBe(8);
    expect(pal[0]).not.toBe(workplacePalette(PALETTES[0].colors)[0]);
  });

  it('שמונה צבעים שונים, וכל שניים רחוקים בגוון לפחות ~40°', () => {
    for (const c of schemes) {
      const pal = workplacePalette(c);
      expect(new Set(pal).size).toBe(8);
      const hues = pal.map(oklchHue);
      for (let i = 0; i < hues.length; i++)
        for (let j = i + 1; j < hues.length; j++) expect(hueGap(hues[i], hues[j])).toBeGreaterThan(38);
    }
  });

  it('ארבעת המקומות הראשונים רחוקים לפחות ~85°', () => {
    for (const c of schemes) {
      const hues = workplacePalette(c).slice(0, 4).map(oklchHue);
      for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) expect(hueGap(hues[i], hues[j])).toBeGreaterThan(80);
    }
  });

  it('אותה נוסחה בכל ערכה: משבצת i באותה זווית ביחס למותג, ומעבר בחזרה מחזיר את אותו צבע', () => {
    for (const c of schemes) {
      const h0 = oklchHue(c.brand);
      const hues = workplacePalette(c).map(oklchHue);
      expect(hueGap(hues[1], h0)).toBeGreaterThan(170);
      expect(hueGap(hues[0], h0)).toBeLessThan(10);
      expect(workplacePalette(c)).toEqual(workplacePalette(c));
    }
    const a = PALETTES[0].colors;
    const first = workplacePalette(a)[5];
    workplacePalette(PALETTES[2].colors);
    expect(workplacePalette(a)[5]).toBe(first);
  });
});
