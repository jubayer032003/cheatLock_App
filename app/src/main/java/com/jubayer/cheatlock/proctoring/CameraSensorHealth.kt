package com.jubayer.cheatlock.proctoring

/** Operational state is separate from the result of a successful face observation. */
enum class CameraSensorHealth(val displayLabel: String) {
    STARTING("Camera starting"),
    HEALTHY("Camera ready"),
    PERMISSION_DENIED("Camera permission needed"),
    CAMERA_INITIALIZATION_FAILED("Camera could not start"),
    MODEL_INITIALIZATION_FAILED("Face detection unavailable"),
    ANALYZER_FAILED("Camera analysis unavailable"),
    FRAME_UNAVAILABLE("Camera frame unavailable"),
    TEMPORARILY_UNAVAILABLE("Camera temporarily unavailable"),
    STOPPED("Camera stopped")
}
