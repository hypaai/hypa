package expo.modules.hypakeyboardinputmethodpicker

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.provider.Settings
import android.view.inputmethod.InputMethod
import android.view.inputmethod.InputMethodManager
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

private const val HYPA_IME_SERVICE_SIMPLE_NAME = "HypaKeyboardInputMethodService"

class HypaKeyboardInputMethodPickerModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("HypaKeyboardInputMethodPicker")

    Function("isHypaKeyboardEnabled") {
      val context =
        appContext.reactContext?.applicationContext
          ?: throw CodedException("E_NO_CONTEXT", "Application context is not available.", null)
      val imm =
        context.getSystemService(Context.INPUT_METHOD_SERVICE) as? InputMethodManager
          ?: throw CodedException("E_NO_INPUT_METHOD_MANAGER", "Input method manager is unavailable.", null)

      val hypaImeId = getHypaImeId(context)
      imm.enabledInputMethodList.any { it.id == hypaImeId }
    }

    Function("isHypaKeyboardSelected") {
      val context =
        appContext.reactContext?.applicationContext
          ?: throw CodedException("E_NO_CONTEXT", "Application context is not available.", null)
      val imm =
        context.getSystemService(Context.INPUT_METHOD_SERVICE) as? InputMethodManager
          ?: throw CodedException("E_NO_INPUT_METHOD_MANAGER", "Input method manager is unavailable.", null)

      val hypaImeId = getHypaImeId(context)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
        imm.currentInputMethodInfo?.id == hypaImeId
      } else {
        Settings.Secure.getString(context.contentResolver, Settings.Secure.DEFAULT_INPUT_METHOD) == hypaImeId
      }
    }

    AsyncFunction("showInputMethodPicker") {
      val currentActivity = appContext.currentActivity
      if (currentActivity == null) {
        throw CodedException("E_NO_ACTIVITY", "Current activity is not available.", null)
      }

      currentActivity.runOnUiThread {
        val imm =
          currentActivity.getSystemService(Context.INPUT_METHOD_SERVICE) as? InputMethodManager
        if (imm == null) {
          throw CodedException("E_NO_INPUT_METHOD_MANAGER", "Input method manager is unavailable.", null)
        }

        imm.showInputMethodPicker()
      }
    }
  }

  private fun getHypaImeId(context: Context): String {
    return resolveHypaImeComponent(context)?.flattenToShortString()
      ?: throw CodedException(
        "E_IME_NOT_REGISTERED",
        "Hypa keyboard input method service is not registered in the app manifest.",
        null,
      )
  }

  private fun resolveHypaImeComponent(context: Context): ComponentName? {
    val packageManager = context.packageManager
    val intent = Intent(InputMethod.SERVICE_INTERFACE).setPackage(context.packageName)
    val services = packageManager.queryIntentServices(intent, PackageManager.GET_META_DATA)
    for (resolveInfo in services) {
      val serviceInfo = resolveInfo.serviceInfo ?: continue
      val className = serviceInfo.name ?: continue
      if (
        className == HYPA_IME_SERVICE_SIMPLE_NAME ||
          className.endsWith(".$HYPA_IME_SERVICE_SIMPLE_NAME")
      ) {
        return ComponentName(serviceInfo.packageName, className)
      }
    }
    return null
  }
}
