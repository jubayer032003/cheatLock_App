package com.jubayer.cheatlock.model

import java.time.Instant

/** Keep the server-issued attempt deadline on a monotonic clock, including retries/backgrounding. */
internal data class TeacherExamTiming(val deadlineElapsedRealtime: Long) {
    fun remainingSeconds(elapsedNow: Long): Int =
        ((deadlineElapsedRealtime - elapsedNow).coerceAtLeast(0L).let { (it + 999L) / 1000L })
            .coerceAtMost(Int.MAX_VALUE.toLong()).toInt()
    companion object {
        fun from(exam: Exam, session: ExamSession?, elapsedNow: Long, wallNow: Long): TeacherExamTiming? {
            val start = session?.startedAt?.takeIf { it > 0 } ?: return null
            val duration = exam.durationMinutes.coerceAtLeast(1).toLong() * 60_000L
            val end = runCatching { Math.addExact(start, duration) }.getOrNull() ?: return null
            val scheduledEnd = exam.scheduledEndAt?.let { runCatching { Instant.parse(it).toEpochMilli() }.getOrNull() }
            val deadline = scheduledEnd?.let { minOf(end, it) } ?: end
            val serverNow = session.serverTime?.takeIf { it > 0 } ?: wallNow
            val remaining = (deadline - serverNow).coerceIn(0L, duration)
            val anchor = session.timingAnchorElapsedRealtime ?: elapsedNow
            return TeacherExamTiming(anchor + remaining)
        }
    }
}