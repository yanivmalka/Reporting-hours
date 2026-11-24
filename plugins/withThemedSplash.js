/**
 * מסך הפתיחה בצבע ערכת הצבעים הנבחרת (אנדרואיד 13+).
 *
 * לכל ערכה נוצרת ערכת מסך פתיחה Theme.App.SplashScreen.<id> (יורשת מזו של
 * expo-splash-screen; הרקע ושעון החול — של הערכה). האפליקציה בוחרת אותה בזמן ריצה
 * (modules/splash-theme ← setSplashTheme ב־theme/ThemeContext.tsx), ואנדרואיד
 * משתמש בה מהפתיחה הבאה. הצבעים — `brandDark` של כל ערכה (כמו ברירת המחדל ב־app.json) ב־theme/palettes.ts
 * (test/splashTheme.test.ts מוודא שהם זהים).
 */
const fs = require('fs');
const path = require('path');
const { withAndroidColors, withAndroidStyles, withDangerousMod, AndroidConfig } = require('expo/config-plugins');

const SPLASH_COLORS = {
  teal: '#1B3C3B',
  indigo: '#1C1D3B',
  ocean: '#381E31',
  forest: '#1D3A29',
  graphite: '#1E293B',
};

const colorName = (id) => `splash_bg_${id}`;
const styleName = (id) => `Theme.App.SplashScreen.${id}`;

function withThemedSplash(config) {
  config = withAndroidColors(config, (cfg) => {
    for (const [id, value] of Object.entries(SPLASH_COLORS)) {
      cfg.modResults = AndroidConfig.Colors.assignColorValue(cfg.modResults, { name: colorName(id), value });
    }
    return cfg;
  });

  config = withAndroidStyles(config, (cfg) => {
    const res = cfg.modResults.resources;
    res.style = (res.style ?? []).filter((s) => !s.$.name.startsWith('Theme.App.SplashScreen.'));
    for (const id of Object.keys(SPLASH_COLORS)) {
      res.style.push({
        $: { name: styleName(id), parent: 'Theme.App.SplashScreen' },
        item: [
          { $: { name: 'windowSplashScreenBackground' }, _: `@color/${colorName(id)}` },
          { $: { name: 'android:windowSplashScreenBackground' }, _: `@color/${colorName(id)}` },
          // שעון החול בצבעי הערכה (drawable/splash_icon_<id>, מ־plugins/withThemedIcons.js)
          { $: { name: 'windowSplashScreenAnimatedIcon' }, _: `@drawable/splash_icon_${id}` },
          { $: { name: 'android:windowSplashScreenAnimatedIcon' }, _: `@drawable/splash_icon_${id}` },
        ],
      });
    }
    return cfg;
  });

  // כיווץ המשאבים (R8) לא רואה את הגישה לפי שם — שומרים עליהם במפורש.
  config = withDangerousMod(config, [
    'android',
    async (cfg) => {
      const dir = path.join(cfg.modRequest.platformProjectRoot, 'app/src/main/res/raw');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        path.join(dir, 'keep_splash_themes.xml'),
        '<?xml version="1.0" encoding="utf-8"?>\n' +
          '<resources xmlns:tools="http://schemas.android.com/tools" ' +
          'tools:keep="@style/Theme.App.SplashScreen.*,@color/splash_bg_*" />\n',
      );
      return cfg;
    },
  ]);

  return config;
}

module.exports = withThemedSplash;
module.exports.SPLASH_COLORS = SPLASH_COLORS;
