package com.jubayer.cheatlock.util

data class ScoreAttempt(
    val examId: String,
    val startedAt: Long?,
)

object AuthoritativeScoreReconciler {
    fun reconcile(
        currentScore: Int,
        incomingScore: Int,
        activeAttempt: ScoreAttempt?,
        responseAttempt: ScoreAttempt,
    ): Int {
        if (activeAttempt != responseAttempt) return currentScore
        return maxOf(currentScore, incomingScore).coerceIn(0, 100)
    }
}
