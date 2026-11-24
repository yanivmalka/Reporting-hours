/**
 * אייקון האפליקציה ומסך הפתיחה לפי ערכת הצבעים (אנדרואיד).
 *
 * הקבצים נוצרים ב־scripts/brand_assets.py לתוך assets/brand/<id>/ (לכל ערכה ב־theme/palettes.ts).
 *
 * אייקון: לכל ערכה activity-alias ‏(<package>.Launcher_<id>) שמפנה ל־MainActivity עם האייקון
 * שלה, ורק אחד מהם פעיל (ברירת המחדל — טורקיז). MainActivity עצמה כבר לא מופיעה במסך האפליקציות.
 * האפליקציה מפעילה את ה־alias של הערכה הנבחרת (modules/splash-theme ← setLauncherIcon).
 *
 * מסך פתיחה: שעון החול של כל ערכה (drawable/splash_icon_<id>) — ערכות מסך הפתיחה עצמן
 * נבנות ב־plugins/withThemedSplash.js.
 */
const fs = require('fs');
const path = require('path');
const { withAndroidManifest, withDangerousMod } = require('expo/config-plugins');
const { SPLASH_COLORS } = require('./withThemedSplash');

const IDS = Object.keys(SPLASH_COLORS);
const DEFAULT_ID = 'teal';
const aliasName = (id) => `.Launcher_${id}`;

function copy(from, to) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
}

function withThemedIcons(config) {
  config = withDangerousMod(config, [
    'android',
    async (cfg) => {
      const root = cfg.modRequest.projectRoot;
      const res = path.join(cfg.modRequest.platformProjectRoot, 'app/src/main/res');
      copy(path.join(root, 'assets/brand/src/monochrome.png'), path.join(res, 'drawable-nodpi/brand_icon_mono.png'));
      for (const id of IDS) {
        const dir = path.join(root, 'assets/brand', id);
        copy(path.join(dir, 'icon-fg.png'), path.join(res, `drawable-nodpi/brand_icon_fg_${id}.png`));
        copy(path.join(dir, 'icon-bg.png'), path.join(res, `drawable-nodpi/brand_icon_bg_${id}.png`));
        // מסך הפתיחה של המערכת חותך את האייקון לעיגול — לכן הגרסה המוקטנת (אותו אזור בטוח כמו האייקון המותאם).
        copy(path.join(dir, 'icon-fg.png'), path.join(res, `drawable-nodpi/splash_icon_${id}.png`));
        copy(path.join(dir, 'icon-legacy.png'), path.join(res, `mipmap-xxxhdpi/brand_icon_${id}.png`));
        const adaptive =
          '<?xml version="1.0" encoding="utf-8"?>\n' +
          '<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n' +
          `  <background android:drawable="@drawable/brand_icon_bg_${id}"/>\n` +
          `  <foreground android:drawable="@drawable/brand_icon_fg_${id}"/>\n` +
          '  <monochrome android:drawable="@drawable/brand_icon_mono"/>\n' +
          '</adaptive-icon>\n';
        fs.mkdirSync(path.join(res, 'mipmap-anydpi-v26'), { recursive: true });
        fs.writeFileSync(path.join(res, `mipmap-anydpi-v26/brand_icon_${id}.xml`), adaptive);
      }
      // כיווץ המשאבים (R8) לא רואה גישה לפי שם — שומרים עליהם במפורש.
      fs.mkdirSync(path.join(res, 'raw'), { recursive: true });
      fs.writeFileSync(
        path.join(res, 'raw/keep_brand_icons.xml'),
        '<?xml version="1.0" encoding="utf-8"?>\n' +
          '<resources xmlns:tools="http://schemas.android.com/tools" ' +
          'tools:keep="@mipmap/brand_icon_*,@drawable/brand_icon_*,@drawable/splash_icon_*" />\n',
      );
      return cfg;
    },
  ]);

  config = withAndroidManifest(config, (cfg) => {
    const app = cfg.modResults.manifest.application[0];
    const main = app.activity.find((a) => a.$['android:name'] === '.MainActivity');
    // MainActivity לא מופיעה במסך האפליקציות — רק ה־alias של הערכה.
    main['intent-filter'] = (main['intent-filter'] ?? []).filter(
      (f) => !(f.category ?? []).some((c) => c.$['android:name'] === 'android.intent.category.LAUNCHER'),
    );
    app['activity-alias'] = (app['activity-alias'] ?? []).filter((a) => !a.$['android:name'].startsWith('.Launcher_'));
    for (const id of IDS) {
      app['activity-alias'].push({
        $: {
          'android:name': aliasName(id),
          'android:targetActivity': '.MainActivity',
          'android:enabled': id === DEFAULT_ID ? 'true' : 'false',
          'android:exported': 'true',
          'android:icon': `@mipmap/brand_icon_${id}`,
          'android:roundIcon': `@mipmap/brand_icon_${id}`,
          'android:label': '@string/app_name',
        },
        'intent-filter': [
          {
            action: [{ $: { 'android:name': 'android.intent.action.MAIN' } }],
            category: [{ $: { 'android:name': 'android.intent.category.LAUNCHER' } }],
          },
        ],
      });
    }
    return cfg;
  });

  return config;
}

module.exports = withThemedIcons;
module.exports.ICON_IDS = IDS;
