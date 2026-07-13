package com.jubayer.cheatlock.security

import android.app.Activity
import android.os.Build
import android.util.Log
import android.view.WindowManager
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat

/**
 * Applies window-level protections during a secure exam:
 * blocks screenshots/screen recording (FLAG_SECURE), hides overlays, and
 * registers system screen-capture callbacks when available.
 */
class ExamSecurityController(
    private val activity: Activity,
    private val onScreenCaptureAttempt: () -> Unit
) {
    private var active = false
    private var screenCaptureCallback: Activity.ScreenCaptureCallback? = null

    fun isActive(): Boolean = active

    fun setEnabled(enabled: Boolean) {
        if (enabled) {
            applyProtection()
            active = true
        } else if (active) {
            removeProtection()
            active = false
        }
    }

    /** Re-apply flags after resume/focus — some OEMs clear them transiently. */
    fun reapplyIfActive() {
        if (active) {
            applyProtection()
        }
    }

    private fun applyProtection() {
        val window = activity.window
        window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            runCatching {
                window.setHideOverlayWindows(true)
            }.onFailure { error ->
                Log.w("CHEATLOCK_FLOW", "Failed to setHideOverlayWindows(true): ${error.message}")
            }
        }

        // Trigger native Android screen pinning / Lock Task Mode
        runCatching {
            activity.startLockTask()
        }.onFailure { error ->
            Log.w("CHEATLOCK_FLOW", "Failed to startLockTask(): ${error.message}")
        }

        enterImmersiveMode()
        registerScreenCaptureCallback()
    }

    private fun removeProtection() {
        val window = activity.window
        window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            runCatching {
                window.setHideOverlayWindows(false)
            }.onFailure { error ->
                Log.w("CHEATLOCK_FLOW", "Failed to setHideOverlayWindows(false): ${error.message}")
            }
        }

        // Release native Android screen pinning / Lock Task Mode
        runCatching {
            activity.stopLockTask()
        }.onFailure { error ->
            Log.w("CHEATLOCK_FLOW", "Failed to stopLockTask(): ${error.message}")
        }

        exitImmersiveMode()
        unregisterScreenCaptureCallback()
    }

    private fun enterImmersiveMode() {
        WindowCompat.setDecorFitsSystemWindows(activity.window, false)
        WindowInsetsControllerCompat(activity.window, activity.window.decorView).apply {
            hide(WindowInsetsCompat.Type.systemBars())
            systemBarsBehavior =
                WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        }
    }

    private fun exitImmersiveMode() {
        WindowCompat.setDecorFitsSystemWindows(activity.window, true)
        WindowInsetsControllerCompat(activity.window, activity.window.decorView).apply {
            show(WindowInsetsCompat.Type.systemBars())
        }
    }

    private fun registerScreenCaptureCallback() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE) return
        if (screenCaptureCallback != null) return

        val callback = Activity.ScreenCaptureCallback {
            onScreenCaptureAttempt()
        }
        screenCaptureCallback = callback
        runCatching {
            activity.registerScreenCaptureCallback(activity.mainExecutor, callback)
        }.onFailure { error ->
            Log.e("CHEATLOCK_FLOW", "Failed to register screen capture callback", error)
        }
    }

    private fun unregisterScreenCaptureCallback() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE) return
        screenCaptureCallback?.let { callback ->
            runCatching { activity.unregisterScreenCaptureCallback(callback) }
        }
        screenCaptureCallback = null
    }
}
