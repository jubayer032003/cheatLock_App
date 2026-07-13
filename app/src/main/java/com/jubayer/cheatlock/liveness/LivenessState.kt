package com.jubayer.cheatlock.liveness

/**
 * Represents the current status of the liveness verification challenge.
 */
sealed class LivenessStatus {
    object Idle : LivenessStatus()
    object InProgress : LivenessStatus()
    object Success : LivenessStatus()
    object FailedRetry : LivenessStatus()
    object FailedFinal : LivenessStatus()
}

/**
 * Data state holding all metrics and parameters of the liveness challenge.
 */
data class LivenessState(
    val actions: List<LivenessAction> = emptyList(),
    val currentActionIndex: Int = 0,
    val status: LivenessStatus = LivenessStatus.Idle,
    val timeLeftSeconds: Int = 10,
    val attemptCount: Int = 1,
    val errorMessage: String? = null,
    val cooldownSeconds: Int = 0
)
