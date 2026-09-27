package com.devi.devi

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.telephony.SmsManager
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterActivity() {
    private val CHANNEL = "com.devi.app/sms"
    private val RECORDER_CHANNEL = "com.devi.app/recorder"
    private val SMS_PERMISSION_CODE = 101
    private var pendingPermissionResult: MethodChannel.Result? = null

    private var mediaRecorder: android.media.MediaRecorder? = null
    private var recordingOutputFile: java.io.File? = null

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)

        // Native Emergency Audio/Evidence Recorder Channel
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, RECORDER_CHANNEL).setMethodCallHandler { call, result ->
            when (call.method) {
                "startRecording" -> {
                    val hasAudio = ContextCompat.checkSelfPermission(
                        this,
                        Manifest.permission.RECORD_AUDIO
                    ) == PackageManager.PERMISSION_GRANTED

                    if (!hasAudio) {
                        result.success(false)
                        return@setMethodCallHandler
                    }
                    val started = startNativeRecording()
                    result.success(started)
                }
                "stopRecording" -> {
                    val filePath = stopNativeRecording()
                    result.success(filePath)
                }
                else -> result.notImplemented()
            }
        }

        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, CHANNEL).setMethodCallHandler { call, result ->
            when (call.method) {
                "checkPermission" -> {
                    val hasSms = ContextCompat.checkSelfPermission(
                        this,
                        Manifest.permission.SEND_SMS
                    ) == PackageManager.PERMISSION_GRANTED
                    val hasCall = ContextCompat.checkSelfPermission(
                        this,
                        Manifest.permission.CALL_PHONE
                    ) == PackageManager.PERMISSION_GRANTED
                    result.success(hasSms && hasCall)
                }
                "requestPermission" -> {
                    val hasSms = ContextCompat.checkSelfPermission(
                        this,
                        Manifest.permission.SEND_SMS
                    ) == PackageManager.PERMISSION_GRANTED
                    val hasCall = ContextCompat.checkSelfPermission(
                        this,
                        Manifest.permission.CALL_PHONE
                    ) == PackageManager.PERMISSION_GRANTED

                    if (hasSms && hasCall) {
                        result.success(true)
                    } else {
                        pendingPermissionResult = result
                        ActivityCompat.requestPermissions(
                            this,
                            arrayOf(
                                Manifest.permission.SEND_SMS,
                                Manifest.permission.CALL_PHONE
                            ),
                            SMS_PERMISSION_CODE
                        )
                    }
                }
                "requestAllSafetyPermissions" -> {
                    val required = arrayOf(
                        Manifest.permission.SEND_SMS,
                        Manifest.permission.CALL_PHONE,
                        Manifest.permission.CAMERA,
                        Manifest.permission.RECORD_AUDIO,
                        Manifest.permission.ACCESS_FINE_LOCATION
                    )
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
                    val phone = call.argument<String>("phone")
                    val message = call.argument<String>("message")

                    if (phone.isNullOrEmpty() || message.isNullOrEmpty()) {
                        result.error("INVALID_ARGS", "Phone or message is empty", null)
                        return@setMethodCallHandler
                    }

                    val hasPermission = ContextCompat.checkSelfPermission(
                        this,
                        Manifest.permission.SEND_SMS
                    ) == PackageManager.PERMISSION_GRANTED

                    if (!hasPermission) {
                        result.error("NO_PERMISSION", "SEND_SMS permission not granted", null)
                        return@setMethodCallHandler
                    }

                    try {
                        val smsManager: SmsManager = try {
                            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                                applicationContext.getSystemService(SmsManager::class.java) ?: SmsManager.getDefault()
                            } else {
                                @Suppress("DEPRECATION")
                                SmsManager.getDefault()
                            }
                        } catch (e: Exception) {
                            @Suppress("DEPRECATION")
                            SmsManager.getDefault()
                        }

                        val parts = smsManager.divideMessage(message)
                        if (parts.size > 1) {
                            smsManager.sendMultipartTextMessage(phone, null, parts, null, null)
                        } else {
                            smsManager.sendTextMessage(phone, null, message, null, null)
                        }
                        result.success(true)
                    } catch (e: Exception) {
                        result.error("SMS_ERROR", e.localizedMessage ?: "Failed to send SMS", null)
                    }
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

    private fun startNativeRecording(): Boolean {
        return try {
            stopNativeRecording() // release any previous session

            val cacheDir = applicationContext.cacheDir
            val outFile = java.io.File(cacheDir, "devi_sos_evidence_${System.currentTimeMillis()}.mp4")
            recordingOutputFile = outFile

            val recorder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                android.media.MediaRecorder(applicationContext)
            } else {
                @Suppress("DEPRECATION")
                android.media.MediaRecorder()
            }

            recorder.apply {
                setAudioSource(android.media.MediaRecorder.AudioSource.MIC)
                setOutputFormat(android.media.MediaRecorder.OutputFormat.MPEG_4)
                setAudioEncoder(android.media.MediaRecorder.AudioEncoder.AAC)
                setAudioEncodingBitRate(128000)
                setAudioSamplingRate(44100)
                setOutputFile(outFile.absolutePath)
                prepare()
                start()
            }
            mediaRecorder = recorder
            android.util.Log.d("DEVI_RECORDER", "Emergency audio recording started: ${outFile.absolutePath}")
            true
        } catch (e: Exception) {
            android.util.Log.e("DEVI_RECORDER", "Failed to start emergency audio recording", e)
            false
        }
    }

    private fun stopNativeRecording(): String? {
        val path = recordingOutputFile?.absolutePath
        try {
            mediaRecorder?.apply {
                try {
                    stop()
                } catch (_: Exception) {}
                reset()
                release()
            }
            android.util.Log.d("DEVI_RECORDER", "Emergency audio recording stopped. File: $path")
        } catch (e: Exception) {
            android.util.Log.e("DEVI_RECORDER", "Error stopping emergency audio recording", e)
        } finally {
            mediaRecorder = null
        }
        return path
    }
}
