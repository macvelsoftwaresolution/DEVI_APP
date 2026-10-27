package com.devi.devi

import android.Manifest
import android.annotation.SuppressLint
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.media.MediaRecorder
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Log
import androidx.camera.core.CameraSelector
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.video.FallbackStrategy
import androidx.camera.video.FileOutputOptions
import androidx.camera.video.Quality
import androidx.camera.video.QualitySelector
import androidx.camera.video.Recorder
import androidx.camera.video.Recording
import androidx.camera.video.VideoCapture
import androidx.camera.video.VideoRecordEvent
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import androidx.lifecycle.LifecycleService
import java.io.File

/**
 * Foreground service that runs for the whole SOS:
 * - records 2 minutes of front-camera video + audio (audio-only fallback) even when the app is minimized
 *   or a phone call is in progress,
 * - shows one discreetly worded ongoing notification.
 *
 * Android only allows camera/microphone in the background when the foreground service is
 * started while the app is visible, so it is started at the moment SOS is pressed.
 */
class EmergencyService : LifecycleService() {

    companion object {
        private const val TAG = "DEVI_EMERGENCY"
        const val ACTION_START = "com.devi.devi.EMERGENCY_START"
        const val ACTION_STOP = "com.devi.devi.EMERGENCY_STOP"
        const val EXTRA_RECORD = "record"

        private const val NOTIFICATION_ID = 4711
        private const val CHANNEL_ID = "devi_reminder"
        private const val RECORDING_LIMIT_MS = 120_000L

        // Read by MainActivity's method channel
        @Volatile var instance: EmergencyService? = null
        @Volatile var lastFilePath: String? = null

        fun hasPermission(context: Context, permission: String) =
            ContextCompat.checkSelfPermission(context, permission) == PackageManager.PERMISSION_GRANTED
    }

    private val mainHandler = Handler(Looper.getMainLooper())
    private var cameraRecording: Recording? = null
    private var audioRecorder: MediaRecorder? = null
    private var audioFile: File? = null
    private val pendingStopCallbacks = mutableListOf<(String?) -> Unit>()
    private var isRecording = false

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        super.onStartCommand(intent, flags, startId)
        instance = this

        when (intent?.action) {
            ACTION_STOP -> {
                stopEverything()
                return START_NOT_STICKY
            }
            else -> {
                val record = intent?.getBooleanExtra(EXTRA_RECORD, true) ?: true
                if (!enterForeground(record)) {
                    stopSelf()
                    return START_NOT_STICKY
                }
                if (record && !isRecording) startRecording()
            }
        }
        return START_STICKY
    }

    override fun onDestroy() {
        stopRecording(null)
        instance = null
        super.onDestroy()
    }

    /** The user swiped DEVI away from recent apps during an SOS: stop recording and clean up. */
    override fun onTaskRemoved(rootIntent: Intent?) {
        stopEverything()
        super.onTaskRemoved(rootIntent)
    }

    // --- Foreground notification -------------------------------------------------------------

    private fun enterForeground(record: Boolean): Boolean {
        var types = 0
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R && record) {
                if (hasPermission(this, Manifest.permission.CAMERA)) {
                    types = types or ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA
                }
                if (hasPermission(this, Manifest.permission.RECORD_AUDIO)) {
                    types = types or ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
                }
            }
            if (types == 0) {
                Log.w(TAG, "No camera/microphone permission: cannot run emergency service")
                return false
            }
        }

        return try {
            ServiceCompat.startForeground(this, NOTIFICATION_ID, buildNotification(), types)
            true
        } catch (e: Exception) {
            Log.e(TAG, "startForeground failed", e)
            false
        }
    }

    private fun buildNotification(): Notification {
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            manager.createNotificationChannel(
                NotificationChannel(CHANNEL_ID, "Devi Safety", NotificationManager.IMPORTANCE_LOW).apply {
                    setShowBadge(false)
                }
            )
        }

        val launchIntent = (packageManager.getLaunchIntentForPackage(packageName)
            ?: Intent(this, MainActivity::class.java)).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val pendingIntent = PendingIntent.getActivity(
            this, 0, launchIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        // Worded discreetly so a bystander does not see that an SOS is active
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle("Devi Safety is active")
            .setContentText("Tap to open")
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_REMINDER)
            .setOngoing(true)
            .setContentIntent(pendingIntent)
            .build()
    }

    // --- Recording ---------------------------------------------------------------------------

    private fun startRecording() {
        isRecording = true
        lastFilePath = null
        if (hasPermission(this, Manifest.permission.CAMERA)) {
            startCameraRecording()
        } else {
            startAudioRecording()
        }
    }

    @SuppressLint("MissingPermission")
    private fun startCameraRecording() {
        val providerFuture = ProcessCameraProvider.getInstance(this)
        providerFuture.addListener({
            try {
                val provider = providerFuture.get()
                val recorder = Recorder.Builder()
                    .setQualitySelector(
                        QualitySelector.from(Quality.SD, FallbackStrategy.lowerQualityOrHigherThan(Quality.SD))
                    )
                    .build()
                val videoCapture = VideoCapture.withOutput(recorder)

                val selector = if (provider.hasCamera(CameraSelector.DEFAULT_FRONT_CAMERA)) {
                    CameraSelector.DEFAULT_FRONT_CAMERA
                } else {
                    CameraSelector.DEFAULT_BACK_CAMERA
                }
                provider.unbindAll()
                provider.bindToLifecycle(this, selector, videoCapture)

                val file = File(cacheDir, "devi_sos_evidence_${System.currentTimeMillis()}.mp4")
                val options = FileOutputOptions.Builder(file)
                    .setDurationLimitMillis(RECORDING_LIMIT_MS)
                    .build()

                var pending = videoCapture.output.prepareRecording(this, options)
                if (hasPermission(this, Manifest.permission.RECORD_AUDIO)) {
                    pending = pending.withAudioEnabled()
                }

                cameraRecording = pending.start(ContextCompat.getMainExecutor(this)) { event ->
                    if (event is VideoRecordEvent.Finalize) {
                        val ok = !event.hasError() ||
                            event.error == VideoRecordEvent.Finalize.ERROR_DURATION_LIMIT_REACHED
                        onRecordingFinished(if (ok) file.absolutePath else null)
                        provider.unbindAll()
                    }
                }
                Log.d(TAG, "Background camera recording started: ${file.absolutePath}")
            } catch (e: Exception) {
                Log.e(TAG, "Camera recording failed, falling back to audio", e)
                cameraRecording = null
                startAudioRecording()
            }
        }, ContextCompat.getMainExecutor(this))
    }

    private fun startAudioRecording() {
        if (!hasPermission(this, Manifest.permission.RECORD_AUDIO)) {
            Log.w(TAG, "No microphone permission: evidence recording skipped")
            onRecordingFinished(null)
            return
        }
        try {
            val file = File(cacheDir, "devi_sos_evidence_${System.currentTimeMillis()}.m4a")
            val recorder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                MediaRecorder(this)
            } else {
                @Suppress("DEPRECATION")
                MediaRecorder()
            }
            recorder.apply {
                setAudioSource(MediaRecorder.AudioSource.MIC)
                setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
                setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
                setAudioEncodingBitRate(128000)
                setAudioSamplingRate(44100)
                setOutputFile(file.absolutePath)
                setMaxDuration(RECORDING_LIMIT_MS.toInt())
                setOnInfoListener { _, what, _ ->
                    if (what == MediaRecorder.MEDIA_RECORDER_INFO_MAX_DURATION_REACHED) stopAudioRecording()
                }
                prepare()
                start()
            }
            audioRecorder = recorder
            audioFile = file
            Log.d(TAG, "Background audio recording started: ${file.absolutePath}")
        } catch (e: Exception) {
            Log.e(TAG, "Audio recording failed", e)
            audioRecorder = null
            onRecordingFinished(null)
        }
    }

    private fun stopAudioRecording() {
        val recorder = audioRecorder ?: return
        audioRecorder = null
        try {
            recorder.stop()
        } catch (_: Exception) {
        }
        recorder.release()
        onRecordingFinished(audioFile?.absolutePath)
    }

    private fun onRecordingFinished(path: String?) {
        mainHandler.post {
            isRecording = false
            cameraRecording = null
            lastFilePath = path
            val callbacks = pendingStopCallbacks.toList()
            pendingStopCallbacks.clear()
            callbacks.forEach { it(path) }
            Log.d(TAG, "Evidence recording finished: $path")
        }
    }

    /**
     * Stops the recording (if still running) and returns the file path through [callback]
     * once the file is finalized. If recording already ended, returns the last file immediately.
     */
    fun stopRecording(callback: ((String?) -> Unit)?) {
        mainHandler.post {
            if (!isRecording) {
                callback?.invoke(lastFilePath)
                return@post
            }
            callback?.let { pendingStopCallbacks.add(it) }
            when {
                cameraRecording != null -> cameraRecording?.stop()
                audioRecorder != null -> stopAudioRecording()
                // Camera still initializing: finish with no file
                else -> onRecordingFinished(null)
            }
        }
    }

    private fun stopEverything() {
        stopRecording(null)
        ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
        stopSelf()
    }
}
