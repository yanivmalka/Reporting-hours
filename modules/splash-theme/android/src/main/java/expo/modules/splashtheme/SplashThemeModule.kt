package expo.modules.splashtheme

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
  }
}
