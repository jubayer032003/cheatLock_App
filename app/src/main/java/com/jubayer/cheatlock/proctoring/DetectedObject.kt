package com.jubayer.cheatlock.proctoring

import android.graphics.RectF

/**
 * Data class representing a detected object frame.
 * Uses normalized coordinates relative to camera frame dimensions.
 */
data class DetectedObject(
    val label: String,
    val confidence: Float,
    val boundingBox: RectF
)
