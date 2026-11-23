import { describe, expect, it } from 'vitest';
import { PALETTES } from '../theme/palettes';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { SPLASH_COLORS } = require('../plugins/withThemedSplash.js') as { SPLASH_COLORS: Record<string, string> };

describe('splash themes', () => {
  it('has a splash colour for every palette, equal to its brand colour', () => {
    expect(Object.keys(SPLASH_COLORS).sort()).toEqual(PALETTES.map((p) => p.id).sort());
    for (const p of PALETTES) expect(SPLASH_COLORS[p.id]).toBe(p.colors.brand);
  });
});
