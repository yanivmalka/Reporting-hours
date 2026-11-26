package expo.modules.apkupdater

import android.app.DownloadManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Environment
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File

/**
 * הורדת עדכון האפליקציה דרך DownloadManager של אנדרואיד.
 *
 * ההורדה רצה בשירות של המערכת — ממשיכה כשהאפליקציה ברקע ואפילו כשהיא נסגרה, עם התקדמות בהתראה.
 * הקובץ נשמר בתיקיית ההורדות הפרטית של האפליקציה (בלי הרשאות אחסון). האפליקציה עוקבת אחרי
 * ההתקדמות ב־query, ובסיום פותחת את המתקין ב־install (או בלחיצה על ההתראה).
 */
class ApkUpdaterModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw IllegalStateException("no context")

  private val manager: DownloadManager
    get() = context.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager

  override fun definition() = ModuleDefinition {
    Name("ApkUpdater")

    /** מתחיל הורדה ומחזיר את המזהה שלה. קובץ ישן באותו שם נמחק קודם. */
    Function("enqueue") { url: String, fileName: String, title: String ->
      val dir = context.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS)
      if (dir != null) File(dir, fileName).delete()
      val request = DownloadManager.Request(Uri.parse(url))
        .setTitle(title)
        .setMimeType("application/vnd.android.package-archive")
        .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
        .setDestinationInExternalFilesDir(context, Environment.DIRECTORY_DOWNLOADS, fileName)
      manager.enqueue(request).toDouble()
    }

    /** מצב ההורדה: status (pending · running · paused · successful · failed · missing), בתים שהורדו וגודל. */
    Function("query") { id: Double ->
      val cursor = manager.query(DownloadManager.Query().setFilterById(id.toLong()))
      try {
        if (cursor == null || !cursor.moveToFirst()) {
          return@Function mapOf("status" to "missing", "downloaded" to 0.0, "total" to -1.0, "reason" to 0.0)
        }
        val status = cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS))
        val downloaded = cursor.getLong(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR))
        val total = cursor.getLong(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_TOTAL_SIZE_BYTES))
        val reason = cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_REASON))
        val name = when (status) {
          DownloadManager.STATUS_PENDING -> "pending"
          DownloadManager.STATUS_RUNNING -> "running"
          DownloadManager.STATUS_PAUSED -> "paused"
          DownloadManager.STATUS_SUCCESSFUL -> "successful"
          DownloadManager.STATUS_FAILED -> "failed"
          else -> "pending"
        }
        mapOf(
          "status" to name,
          "downloaded" to downloaded.toDouble(),
          "total" to total.toDouble(),
          "reason" to reason.toDouble(),
        )
      } finally {
        cursor?.close()
      }
    }

    /** ביטול הורדה ומחיקת הקובץ שלה. */
    Function("remove") { id: Double ->
      manager.remove(id.toLong())
      true
    }

    /** פותח את מתקין החבילות של אנדרואיד עבור הורדה שהסתיימה. */
    Function("install") { id: Double ->
      val uri = manager.getUriForDownloadedFile(id.toLong()) ?: return@Function false
      val intent = Intent(Intent.ACTION_VIEW)
        .setDataAndType(uri, "application/vnd.android.package-archive")
        .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
      val activity = appContext.currentActivity
      if (activity != null) {
        activity.startActivity(intent)
      } else {
        context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
      }
      true
    }
  }
}
