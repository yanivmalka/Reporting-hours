import { describe, expect, it } from 'vitest';
import { PALETTES } from '../theme/palettes';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { SPLASH_COLORS } = require('../plugins/withThemedSplash.js') as { SPLASH_COLORS: Record<string, string> };

describe('splash themes', () => {
  it('has a splash colour for every palette, equal to its brandDark colour', () => {
    expect(Object.keys(SPLASH_COLORS).sort()).toEqual(PALETTES.map((p) => p.id).sort());
    for (const p of PALETTES) expect(SPLASH_COLORS[p.id]).toBe(p.colors.brandDark);
  });
});

describe('themed icons', () => {
  it('has generated brand assets for every palette', async () => {
    const fs = await import('node:fs');
    for (const p of PALETTES) {
      for (const f of ['icon.png', 'icon-fg.png', 'icon-bg.png', 'icon-legacy.png', 'splash.png', 'locked.png', 'unlocked.png']) {
        expect(fs.existsSync(`assets/brand/${p.id}/${f}`), `${p.id}/${f}`).toBe(true);
      }
    }
  });
});
