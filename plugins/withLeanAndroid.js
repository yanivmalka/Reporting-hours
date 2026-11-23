/**
 * APK קל יותר (ראו גם expo-build-properties ב־app.json — R8 וכיווץ משאבים):
 * בלי תמיכת GIF / WebP של Fresco בתמונות React Native — האפליקציה לא מציגה כאלה
 * (סמלי האפליקציה ב־WebP נטענים באנדרואיד עצמו, לא דרך Fresco). חוסך ~0.8MB של ספריות.
 */
const { withGradleProperties } = require('expo/config-plugins');

const PROPS = { 'expo.gif.enabled': 'false', 'expo.webp.enabled': 'false', 'expo.webp.animated': 'false' };

module.exports = function withLeanAndroid(config) {
  return withGradleProperties(config, (cfg) => {
    for (const [key, value] of Object.entries(PROPS)) {
      const item = cfg.modResults.find((p) => p.type === 'property' && p.key === key);
      if (item) item.value = value;
      else cfg.modResults.push({ type: 'property', key, value });
    }
    return cfg;
  });
};
