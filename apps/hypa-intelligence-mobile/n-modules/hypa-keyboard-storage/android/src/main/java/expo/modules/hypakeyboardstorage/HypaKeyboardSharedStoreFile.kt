package expo.modules.hypakeyboardstorage

import android.content.Context
import java.io.File

object HypaKeyboardSharedStoreFile {
  const val FILE_NAME: String = "hypa_shared_store.json"

  private const val EMPTY_STORE_JSON: String =
    """{"version":1,"updatedAt":0,"entries":{},"lexicon":[]}"""

  private fun storeFile(context: Context): File =
    File(context.applicationContext.filesDir, FILE_NAME)

  fun getSharedStoreJson(context: Context): String {
    val file = storeFile(context)
    if (!file.exists()) return EMPTY_STORE_JSON
    val raw = runCatching { file.readText() }.getOrNull()
    return if (raw.isNullOrBlank()) EMPTY_STORE_JSON else raw
  }

  fun setSharedStoreJson(context: Context, json: String) {
    val file = storeFile(context)
    val temp = File(file.parentFile, "$FILE_NAME.tmp")
    temp.writeText(json)
    if (!temp.renameTo(file)) {
      file.writeText(json)
      temp.delete()
    }
  }
}
