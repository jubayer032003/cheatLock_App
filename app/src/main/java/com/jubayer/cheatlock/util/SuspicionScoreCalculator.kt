package com.jubayer.cheatlock.util

object SuspicionScoreCalculator {
    private const val ALERT_WEIGHT = 20

    fun calculateScore(
        appSwitchWarnings: Int = 0,
        faceMissingWarnings: Int = 0,
        audioWarnings: Int = 0,
        phoneWarnings: Int = 0,
    ): Int {
        val rawScore =
            (appSwitchWarnings + faceMissingWarnings + audioWarnings + phoneWarnings) * ALERT_WEIGHT

        return rawScore.coerceIn(0, 100)
    }

    fun riskLevel(score: Int): String = when {
        score >= 70 -> "High Risk"
        score >= 40 -> "Medium Risk"
        else -> "Low Risk"
    }
}
