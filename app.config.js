/**
 * הרחבה דינמית של app.json.
 *
 * ה־workflow של בניית ה־APK מזריק את מספר הגרסה דרך משתני סביבה:
 *   APP_VERSION       — שם הגרסה המוצג (למשל 0.1.12)
 *   APP_VERSION_CODE  — מספר בנייה עולה (versionCode של אנדרואיד)
 *
 * מספר הבנייה נחשף גם ב־extra.buildNumber, כדי שבדיקת העדכונים באפליקציה
 * (lib/update.ts) תוכל להשוות אותו לגרסה האחרונה שפורסמה ב־GitHub Releases.
 */
module.exports = ({ config }) => {
  const buildNumber = Number(process.env.APP_VERSION_CODE || 1);
  const version = process.env.APP_VERSION || config.version;

  return {
    ...config,
    version,
    android: {
      ...config.android,
      versionCode: buildNumber,
    },
    extra: {
      ...config.extra,
      buildNumber,
    },
  };
};
