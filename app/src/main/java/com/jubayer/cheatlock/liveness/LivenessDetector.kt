package com.jubayer.cheatlock.liveness

import com.google.mlkit.vision.face.Face

/**
 * On-device liveness analyzer. Matches ML Kit Face metrics against target thresholds.
 */
object LivenessDetector {
    // Calibrated mathematical thresholds for liveness detection
    private const val EYE_CLOSED_THRESHOLD = 0.15f
    private const val EYE_OPEN_THRESHOLD = 0.70f
    private const val SMILE_THRESHOLD = 0.75f
    private const val YAW_LEFT_THRESHOLD = 20.0f
    private const val YAW_RIGHT_THRESHOLD = -20.0f
    private const val PITCH_UP_THRESHOLD = 15.0f
    private const val PITCH_DOWN_THRESHOLD = -15.0f

    // Tracks if eyes were closed inside the active blink gesture sequence
    private var isEyeClosedRecorded = false

    /**
     * Resets any stateful action trackers (such as the blink sequence tracker).
     */
    fun reset() {
        isEyeClosedRecorded = false
    }

    /**
     * Checks if the user's current face orientation or features satisfy the requested action.
     */
    fun isActionCompleted(face: Face, action: LivenessAction): Boolean {
        return when (action) {
            LivenessAction.BLINK -> {
                val leftOpen = face.leftEyeOpenProbability ?: 0.5f
                val rightOpen = face.rightEyeOpenProbability ?: 0.5f
                
                // Track state transition: open -> closed -> open
                if (leftOpen < EYE_CLOSED_THRESHOLD && rightOpen < EYE_CLOSED_THRESHOLD) {
                    isEyeClosedRecorded = true
                }
                
                if (isEyeClosedRecorded && leftOpen > EYE_OPEN_THRESHOLD && rightOpen > EYE_OPEN_THRESHOLD) {
                    isEyeClosedRecorded = false
                    true
                } else {
                    false
                }
            }
            LivenessAction.SMILE -> {
                val smileProb = face.smilingProbability ?: 0.0f
                smileProb > SMILE_THRESHOLD
            }
            LivenessAction.TURN_LEFT -> {
                val yaw = face.headEulerAngleY
                yaw > YAW_LEFT_THRESHOLD
            }
            LivenessAction.TURN_RIGHT -> {
                val yaw = face.headEulerAngleY
                yaw < YAW_RIGHT_THRESHOLD
            }
            LivenessAction.LOOK_UP -> {
                val pitch = face.headEulerAngleX
                pitch > PITCH_UP_THRESHOLD
            }
            LivenessAction.LOOK_DOWN -> {
                val pitch = face.headEulerAngleX
                pitch < PITCH_DOWN_THRESHOLD
            }
        }
    }
}
