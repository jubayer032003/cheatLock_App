package com.jubayer.cheatlock.proctoring

import android.app.Activity
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import com.jubayer.cheatlock.MainActivity
import com.jubayer.cheatlock.R

/**
 * Foreground service for MediaProjection (Android 14+ requires FGS type
 * [mediaProjection] before [MediaProjection.createVirtualDisplay]).
 */
class ScreenCaptureService : Service() {

    private var captureManager: ScreenCaptureManager? = null
    private var foregroundReady = false

    override fun onCreate() {
        Log.d("CHEATLOCK_FLOW", "ScreenCaptureService onCreate: Service starting")
        super.onCreate()
        runCatching {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                createNotificationChannel()
            }
            val notification = buildNotification()
            Log.d("CHEATLOCK_FLOW", "ScreenCaptureService onCreate: Calling startForeground (initial)")
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(
                    NOTIFICATION_ID,
                    notification,
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION
                )
            } else {
                startForeground(NOTIFICATION_ID, notification)
            }
            foregroundReady = true
        }.onFailure { error ->
            Log.e("CHEATLOCK_FLOW", "ScreenCaptureService onCreate: Failed to start foreground service", error)
            ScreenCaptureCallbacks.onStartFailure?.invoke(getString(R.string.screen_capture_start_failed))
            stopSelf()
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        Log.d("CHEATLOCK_FLOW", "ScreenCaptureService onStartCommand: action=${intent?.action}")
        if (intent?.action == ACTION_STOP) {
            Log.d("CHEATLOCK_FLOW", "ScreenCaptureService onStartCommand: Stopping service via ACTION_STOP")
            stopCapture()
            stopSelf()
            return START_NOT_STICKY
        }

        // Re-apply startForeground IMMEDIATELY with high priority on every start intent.
        runCatching {
            val notification = buildNotification()
            Log.d("CHEATLOCK_FLOW", "ScreenCaptureService onStartCommand: Re-asserting foreground")
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(
                    NOTIFICATION_ID,
                    notification,
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION
                )
            } else {
                startForeground(NOTIFICATION_ID, notification)
            }
        }.onFailure { error ->
            Log.e("CHEATLOCK_FLOW", "ScreenCaptureService onStartCommand: Failed to start foreground service", error)
            ScreenCaptureCallbacks.onStartFailure?.invoke(getString(R.string.screen_capture_start_failed))
            stopSelf()
            return START_NOT_STICKY
        }

        if (!foregroundReady) {
            stopSelf()
            return START_NOT_STICKY
        }

        val resultCode = intent?.getIntExtra(EXTRA_RESULT_CODE, Activity.RESULT_CANCELED)
            ?: Activity.RESULT_CANCELED
        val resultData = readResultData(intent)

        Log.d("CHEATLOCK_FLOW", "ScreenCaptureService onStartCommand: resultCode=$resultCode, hasResultData=${resultData != null}")

        if (resultCode != Activity.RESULT_OK || resultData == null) {
            Log.w("CHEATLOCK_FLOW", "ScreenCaptureService onStartCommand: Screen capture consent missing or invalid; stopping service.")
            stopSelf()
            return START_NOT_STICKY
        }

        runCatching {
            val projectionManager = getSystemService(MediaProjectionManager::class.java)
            if (projectionManager == null) {
                Log.e("CHEATLOCK_FLOW", "ScreenCaptureService onStartCommand: MediaProjectionManager is not available on this device.")
                ScreenCaptureCallbacks.onStartFailure?.invoke(getString(R.string.screen_capture_start_failed))
                stopCapture()
                stopSelf()
                return@runCatching
            }
            Log.d("CHEATLOCK_FLOW", "ScreenCaptureService onStartCommand: Requesting MediaProjection")
            
            // Critical check: Ensure we have result data
            val mediaProjection = projectionManager.getMediaProjection(resultCode, resultData)
            
            if (mediaProjection == null) {
                Log.e("CHEATLOCK_FLOW", "ScreenCaptureService onStartCommand: MediaProjection was NULL. Device might not support this action or session was cancelled.")
                ScreenCaptureCallbacks.onStartFailure?.invoke(getString(R.string.screen_capture_start_failed))
                stopCapture()
                stopSelf()
                return@runCatching
            }

            stopCapture()
            val snapshotCallback = ScreenCaptureCallbacks.onSnapshot
            val manager = ScreenCaptureManager(applicationContext, mediaProjection) { snapshot, capturedAt ->
                snapshotCallback?.invoke(snapshot, capturedAt)
            }
            captureManager = manager
            manager.start()
            Log.d("CHEATLOCK_FLOW", "ScreenCaptureService onStartCommand: Screen capture started successfully.")
            ScreenCaptureCallbacks.onReady?.invoke()
        }.onFailure { error ->
            Log.e("CHEATLOCK_FLOW", "ScreenCaptureService onStartCommand: Screen capture setup failed", error)
            ScreenCaptureCallbacks.onStartFailure?.invoke(getString(R.string.screen_capture_start_failed))
            stopCapture()
            stopSelf()
        }

        return START_NOT_STICKY
    }

    /**
     * Android 15 (API 35) introduces a 6-hour timeout for certain FGS types.
     * We must stop the service to avoid a RemoteServiceException.
     */
    override fun onTimeout(startId: Int, fgsType: Int) {
        if (Build.VERSION.SDK_INT >= 35 && fgsType == ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION) {
            Log.w(TAG, "Screen capture service timed out (6-hour limit reached).")
            stopCapture()
            stopSelf()
        }
    }

    override fun onDestroy() {
        stopCapture()
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun stopCapture() {
        runCatching { captureManager?.stop() }
        captureManager = null
    }

    private fun readResultData(intent: Intent?): Intent? {
        if (intent == null) return null
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            intent.getParcelableExtra(EXTRA_RESULT_DATA, Intent::class.java)
        } else {
            @Suppress("DEPRECATION")
            intent.getParcelableExtra(EXTRA_RESULT_DATA)
        }
    }

    private fun buildNotification() =
        NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_menu_camera) // More reliable system icon
            .setContentTitle("CheatLock Monitoring Active")
            .setContentText("A secure exam session is in progress.")
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
            .setContentIntent(
                PendingIntent.getActivity(
                    this,
                    0,
                    Intent(this, MainActivity::class.java),
                    PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
                )
            )
            .build()

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val channel = NotificationChannel(
            CHANNEL_ID,
            "CheatLock Security Monitor",
            NotificationManager.IMPORTANCE_HIGH
        )
        channel.description = "Maintains connection for exam proctoring."
        channel.lockscreenVisibility = android.app.Notification.VISIBILITY_PUBLIC
        getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
    }

    companion object {
        private const val TAG = "ScreenCaptureService"
        private const val CHANNEL_ID = "cheatlock_screen_capture"
        private const val NOTIFICATION_ID = 34737384 // Use a unique project-specific ID
        private const val EXTRA_RESULT_CODE = "result_code"
        private const val EXTRA_RESULT_DATA = "result_data"
        private const val ACTION_STOP = "com.jubayer.cheatlock.STOP_SCREEN_CAPTURE"

        fun startProjection(context: Context, resultCode: Int, resultData: Intent) {
            val intent = Intent(context, ScreenCaptureService::class.java).apply {
                putExtra(EXTRA_RESULT_CODE, resultCode)
                putExtra(EXTRA_RESULT_DATA, resultData)
            }
            ContextCompat.startForegroundService(context, intent)
        }

        fun stop(context: Context) {
            val intent = Intent(context, ScreenCaptureService::class.java).apply {
                action = ACTION_STOP
            }
            context.stopService(intent)
        }
    }
}

/** Snapshot callback from [ScreenCaptureService] to the UI layer. */
object ScreenCaptureCallbacks {
    @Volatile var onReady: (() -> Unit)? = null
    @Volatile var onStartFailure: ((String) -> Unit)? = null
    @Volatile
    var onSnapshot: ((String, Long) -> Unit)? = null
}
