package expo.modules.splashtheme

import android.content.ComponentName
import android.content.pm.PackageManager
import android.os.Build
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * צבע מסך הפתיחה לפי ערכת הצבעים: אנדרואיד 13+ שומר את ערכת מסך הפתיחה לפתיחה
 * הבאה של האפליקציה (Activity.splashScreen.setSplashScreenTheme). הערכות עצמן
 * (Theme.App.SplashScreen.<id>) נוצרות ב־plugins/withThemedSplash.js.
 */
class SplashThemeModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("SplashTheme")

    Function("setTheme") { id: String ->
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return@Function false
      val activity = appContext.currentActivity ?: return@Function false
      val resId = activity.resources.getIdentifier(
        "Theme_App_SplashScreen_$id", "style", activity.packageName
      )
      if (resId == 0) return@Function false
      activity.runOnUiThread { activity.splashScreen.setSplashScreenTheme(resId) }
      true
    }

    /**
     * אייקון האפליקציה לפי הערכה: מפעיל את ה־activity-alias ‏Launcher_<id> ומכבה את השאר
     * (plugins/withThemedIcons.js). משנה רק מה שצריך, כדי שהפעלה חוזרת לא תיגע במסך הבית.
     */
    Function("setLauncherIcon") { id: String, ids: List<String> ->
      val context = appContext.reactContext ?: return@Function false
      val pm = context.packageManager
      val pkg = context.packageName
      if (id !in ids) return@Function false
      fun component(alias: String) = ComponentName(pkg, "$pkg.Launcher_$alias")
      fun enabled(alias: String): Boolean {
        val state = pm.getComponentEnabledSetting(component(alias))
        if (state == PackageManager.COMPONENT_ENABLED_STATE_DEFAULT) return alias == "teal"
        return state == PackageManager.COMPONENT_ENABLED_STATE_ENABLED
      }
      try {
        // קודם מפעילים את החדש, ואז מכבים — כך תמיד יש אייקון במסך האפליקציות.
        if (!enabled(id)) {
          pm.setComponentEnabledSetting(component(id), PackageManager.COMPONENT_ENABLED_STATE_ENABLED, PackageManager.DONT_KILL_APP)
        }
        for (other in ids) {
          if (other != id && enabled(other)) {
            pm.setComponentEnabledSetting(component(other), PackageManager.COMPONENT_ENABLED_STATE_DISABLED, PackageManager.DONT_KILL_APP)
          }
        }
        true
      } catch (e: Exception) {
        false
      }
    }
  }
}
