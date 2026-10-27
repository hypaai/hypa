package com.hypaintelligence.hypaintelligence.permissions

import android.Manifest
import android.app.Activity
import android.content.pm.PackageManager
import android.os.Bundle

class MicPermissionActivity : Activity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
      finish()
      overridePendingTransition(0, 0)
      return
    }
    requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO), REQUEST_CODE)
  }

  override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
    super.onRequestPermissionsResult(requestCode, permissions, grantResults)
    finish()
    overridePendingTransition(0, 0)
  }

  companion object {
    private const val REQUEST_CODE = 9701
  }
}
