package expo.modules.screenstate

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import android.os.PowerManager
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * מצב מסך המכשיר — לנעילת המידע הכספי כשהמסך כבה (lib/appLock.ts):
 *  - `isScreenOn` — האם המסך דלוק עכשיו (PowerManager.isInteractive);
 *  - `screenOffAt` — מתי המסך כבה לאחרונה (מילישניות מ־1970; 0 — לא כבה מאז שהאפליקציה עלתה).
 */
class ScreenStateModule : Module() {
  private var lastScreenOff = 0L
  private var receiver: BroadcastReceiver? = null

  override fun definition() = ModuleDefinition {
    Name("ScreenState")

    OnCreate {
      val context = appContext.reactContext ?: return@OnCreate
      val r = object : BroadcastReceiver() {
        override fun onReceive(c: Context?, intent: Intent?) {
          if (intent?.action == Intent.ACTION_SCREEN_OFF) lastScreenOff = System.currentTimeMillis()
        }
      }
      val filter = IntentFilter(Intent.ACTION_SCREEN_OFF)
      try {
        // שידור מערכת — מגיע גם לרישום שאינו מיוצא
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
          context.registerReceiver(r, filter, Context.RECEIVER_NOT_EXPORTED)
        } else {
          context.registerReceiver(r, filter)
        }
        receiver = r
      } catch (e: Exception) {
        receiver = null
      }
    }

    OnDestroy {
      val context = appContext.reactContext
      receiver?.let { r -> try { context?.unregisterReceiver(r) } catch (e: Exception) {} }
      receiver = null
    }

    Function("isScreenOn") {
      val context = appContext.reactContext ?: return@Function true
      val pm = context.getSystemService(Context.POWER_SERVICE) as? PowerManager ?: return@Function true
      pm.isInteractive
    }

    Function("screenOffAt") {
      lastScreenOff.toDouble()
    }
  }
}
