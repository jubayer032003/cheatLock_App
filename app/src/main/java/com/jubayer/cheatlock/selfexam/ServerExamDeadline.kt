package com.jubayer.cheatlock.selfexam

import java.time.Instant

/** Anchored to request start, deducting full transit/processing time conservatively. */
class ServerExamDeadline private constructor(private val budgetMillis: Long, private val anchor: Long, val isValid: Boolean = true) {
    fun remainingSeconds(nowElapsedMillis: Long): Int {
        if (nowElapsedMillis < anchor || anchor < 0) return 0
        val elapsed = nowElapsedMillis - anchor
        val remaining = (budgetMillis - elapsed).coerceAtLeast(0)
        return ((remaining + 999) / 1000).toInt()
    }
    companion object {
        fun from(expiresAt: String?, serverTime: String?, requestStartedElapsedMillis: Long?, durationMinutes: Int): ServerExamDeadline {
            return runCatching {
                require(requestStartedElapsedMillis != null && requestStartedElapsedMillis >= 0)
                require(durationMinutes in 1..360)
                val budget = Math.subtractExact(Instant.parse(expiresAt).toEpochMilli(), Instant.parse(serverTime).toEpochMilli())
                require(budget <= durationMinutes * 60_000L)
                ServerExamDeadline(budget.coerceAtLeast(0), requestStartedElapsedMillis)
            }.getOrElse { ServerExamDeadline(0, 0, false) }
        }
    }
}
