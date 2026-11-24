#!/usr/bin/env python3
"""
יצירת האייקונים ומסך הפתיחה לכל ערכת צבעים (assets/brand/<id>/).

המקור — assets/brand/src/*.svg בצבעי ערכת "טורקיז" (שעון החול, רקע אייקוני הנושאים,
שעון החול עם המנעול). לכל ערכה מוחלפים שלושה צבעים:
  רקע         #1B3C3B → brandDark
  מסגרת ורשת  #E8F3F2 → brandLight
  פנים הזכוכית #234746 → brandDark מעורבב ב־35% brand
הגרגרים, המטבעות והמנעול (זהב) — זהים בכל הערכות.

הרצה (דורש rsvg-convert):  python3 scripts/brand_assets.py
הצבעים נקראים מ־theme/palettes.ts, כך שערכה חדשה מקבלת אייקונים בהרצה הבאה.
"""
import os
import re
import subprocess
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'assets', 'brand', 'src')
OUT = os.path.join(ROOT, 'assets', 'brand')

TEAL_BG, TEAL_LIGHT, TEAL_GLASS = '#1B3C3B', '#E8F3F2', '#234746'


def palettes():
    text = open(os.path.join(ROOT, 'theme', 'palettes.ts'), encoding='utf-8').read()
    found = re.findall(
        r"id: '(\w+)'.*?brand: '(#[0-9A-Fa-f]{6})',\s*brandDark: '(#[0-9A-Fa-f]{6})',\s*brandLight: '(#[0-9A-Fa-f]{6})'",
        text,
        re.S,
    )
    return {pid: (brand, dark, light) for pid, brand, dark, light in found}


def mix(a, b, t):
    ca = [int(a[i:i + 2], 16) for i in (1, 3, 5)]
    cb = [int(b[i:i + 2], 16) for i in (1, 3, 5)]
    return '#' + ''.join(f'{round(x + (y - x) * t):02X}' for x, y in zip(ca, cb))


def body(name):
    svg = open(os.path.join(SRC, name), encoding='utf-8').read()
    return re.search(r'<svg[^>]*>(.*)</svg>', svg, re.S).group(1)


def recolor(s, dark, light, glass):
    return s.replace(TEAL_BG, dark).replace(TEAL_LIGHT, light).replace(TEAL_GLASS, glass)


def render(inner, size, path):
    with tempfile.NamedTemporaryFile('w', suffix='.svg', delete=False) as f:
        f.write(f'<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" viewBox="0 0 512 512">{inner}</svg>')
    subprocess.run(['rsvg-convert', '-w', str(size), '-h', str(size), f.name, '-o', path], check=True)
    os.unlink(f.name)


def main():
    art, pattern, locked = body('art.svg'), body('pattern.svg'), body('locked.svg')
    scale = 0.62  # אזור בטוח של אייקון מותאם באנדרואיד
    shift = 256 * (1 - scale)
    for pid, (brand, dark, light) in palettes().items():
        glass = mix(dark, brand, 0.35)
        out = os.path.join(OUT, pid)
        os.makedirs(out, exist_ok=True)
        a = recolor(art, dark, light, glass)
        p = recolor(pattern, dark, light, glass)
        bg = f'<rect width="512" height="512" fill="{dark}"/>'
        render(bg + p + a, 1024, os.path.join(out, 'icon.png'))
        render(bg + p + a, 192, os.path.join(out, 'icon-legacy.png'))
        render(f'<g transform="translate({shift},{shift}) scale({scale})">{a}</g>', 1024, os.path.join(out, 'icon-fg.png'))
        render(bg + p, 1024, os.path.join(out, 'icon-bg.png'))
        render(a, 768, os.path.join(out, 'splash.png'))
        render(recolor(locked, dark, light, glass), 480, os.path.join(out, 'locked.png'))
        print(pid, dark, light, glass)


if __name__ == '__main__':
    main()
