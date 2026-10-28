package com.jubayer.cheatlock.model
internal enum class MonitoringControl { KEEP_RUNNING, END_EXAM, RESET_ATTEMPT, LOCKED_ATTEMPT }
/** Network/auth/rate-limit failures must never be interpreted as teacher actions. */
internal fun monitoringControl(code: String?): MonitoringControl = when (code) {
    "EXAM_NOT_LIVE" -> MonitoringControl.END_EXAM
    "SESSION_RESET", "STALE_EXAM_ATTEMPT" -> MonitoringControl.RESET_ATTEMPT
    "SESSION_LOCKED" -> MonitoringControl.LOCKED_ATTEMPT
    else -> MonitoringControl.KEEP_RUNNING
}