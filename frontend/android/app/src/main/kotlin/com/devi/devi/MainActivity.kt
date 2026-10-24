package com.devi.devi

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterActivity() {
    private val CHANNEL = "com.devi.app/sms"
    private val EMERGENCY_CHANNEL = "com.devi.app/emergency"
    private val SMS_PERMISSION_CODE = 101
    private var pendingPermissionResult: MethodChannel.Result? = null


    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)

        // Emergency foreground service: background evidence recording + location, app minimize
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, EMERGENCY_CHANNEL).setMethodCallHandler { call, result ->
            when (call.method) {
                "start" -> {
                    val record = call.argument<Boolean>("record") ?: true
                    val canRun = listOf(
                        Manifest.permission.ACCESS_FINE_LOCATION,
                        Manifest.permission.ACCESS_COARSE_LOCATION,
                        Manifest.permission.CAMERA,
                        Manifest.permission.RECORD_AUDIO
                    ).any { EmergencyService.hasPermission(this, it) }
                    if (!canRun) {
                        result.success(false)
                        return@setMethodCallHandler
                    }
                    try {
                        val intent = Intent(this, EmergencyService::class.java).apply {
                            action = EmergencyService.ACTION_START
                            putExtra(EmergencyService.EXTRA_RECORD, record)
                        }
                        ContextCompat.startForegroundService(this, intent)
                        result.success(true)
                    } catch (e: Exception) {
                        android.util.Log.e("DEVI_EMERGENCY", "Could not start emergency service", e)
                        result.success(false)
                    }
                }
                "stopRecording" -> {
                    val service = EmergencyService.instance
                    if (service == null) {
                        result.success(EmergencyService.lastFilePath)
                    } else {
                        service.stopRecording { path -> runOnUiThread { result.success(path) } }
                    }
                }
                "stop" -> {
                    if (EmergencyService.instance != null) {
                        startService(Intent(this, EmergencyService::class.java).apply {
                            action = EmergencyService.ACTION_STOP
                        })
                    }
                    result.success(true)
                }
                "setAlertContext" -> {
                    EmergencyService.alertId = call.argument<String>("alertId")
                    EmergencyService.apiBaseUrl = call.argument<String>("apiBaseUrl")
                    EmergencyService.controlToken = call.argument<String>("controlToken")
                    result.success(true)
                }
                "minimize" -> {
                    moveTaskToBack(true)
                    result.success(true)
                }
                else -> result.notImplemented()
            }
        }

        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, CHANNEL).setMethodCallHandler { call, result ->
            when (call.method) {
                "checkPermission" -> {
                    val hasCall = ContextCompat.checkSelfPermission(
                        this,
                        Manifest.permission.CALL_PHONE
                    ) == PackageManager.PERMISSION_GRANTED
                    result.success(hasCall)
                }
                "requestPermission" -> {
                    val hasCall = ContextCompat.checkSelfPermission(
                        this,
                        Manifest.permission.CALL_PHONE
                    ) == PackageManager.PERMISSION_GRANTED

                    if (hasCall) {
                        result.success(true)
                    } else {
                        pendingPermissionResult = result
                        ActivityCompat.requestPermissions(
                            this,
                            arrayOf(
                                Manifest.permission.CALL_PHONE
                            ),
                            SMS_PERMISSION_CODE
                        )
                    }
                }
                "requestAllSafetyPermissions" -> {
                    val permissionsList = mutableListOf(
                        Manifest.permission.CALL_PHONE,
                        Manifest.permission.CAMERA,
                        Manifest.permission.RECORD_AUDIO,
                        Manifest.permission.ACCESS_FINE_LOCATION
                    )
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                        permissionsList.add(Manifest.permission.POST_NOTIFICATIONS)
                    }
                    val required = permissionsList.toTypedArray()
                    val allGranted = required.all {
                        ContextCompat.checkSelfPermission(this, it) == PackageManager.PERMISSION_GRANTED
                    }
                    if (allGranted) {
                        result.success(true)
                    } else {
                        pendingPermissionResult = result
                        ActivityCompat.requestPermissions(
                            this,
                            required,
                            SMS_PERMISSION_CODE
                        )
                    }
                }
                "sendSms" -> {
                    // Normal SMS permanently disabled per user requirement - alerts dispatched via WhatsApp Cloud API
                    result.success(false)
                }
                "makeCall" -> {
                    val rawPhone = call.argument<String>("phone") ?: "112"
                    val phone = rawPhone.replace(Regex("[^0-9+]"), "")

                    val hasCallPermission = ContextCompat.checkSelfPermission(
                        this,
                        Manifest.permission.CALL_PHONE
                    ) == PackageManager.PERMISSION_GRANTED

                    try {
                        if (hasCallPermission) {
                            // Directly dial without showing dial pad
                            val callIntent = Intent(Intent.ACTION_CALL).apply {
                                data = Uri.parse("tel:$phone")
                                flags = Intent.FLAG_ACTIVITY_NEW_TASK
                            }
                            startActivity(callIntent)
                        } else {
                            // Fallback to dial pad if permission not yet granted
                            val dialIntent = Intent(Intent.ACTION_DIAL).apply {
                                data = Uri.parse("tel:$phone")
                                flags = Intent.FLAG_ACTIVITY_NEW_TASK
                            }
                            startActivity(dialIntent)
                        }
                        result.success(true)
                    } catch (e: Exception) {
                        result.error("CALL_ERROR", e.localizedMessage ?: "Failed to make call", null)
                    }
                }
                else -> result.notImplemented()
            }
        }

    }

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == SMS_PERMISSION_CODE) {
            val granted = grantResults.isNotEmpty() && grantResults.all { it == PackageManager.PERMISSION_GRANTED }
            pendingPermissionResult?.success(granted)
            pendingPermissionResult = null
        }
    }
}
