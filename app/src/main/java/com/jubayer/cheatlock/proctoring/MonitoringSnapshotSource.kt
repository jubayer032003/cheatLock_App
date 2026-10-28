package com.jubayer.cheatlock.proctoring

enum class MonitoringSnapshotSource(val eventName: String, val wireName: String) {
    CAMERA("camera_preview_updated", "camera"),
    SCREEN("screen_telemetry_uploaded", "screen")
}
