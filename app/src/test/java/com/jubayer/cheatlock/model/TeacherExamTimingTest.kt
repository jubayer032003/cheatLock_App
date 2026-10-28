package com.jubayer.cheatlock.model
import org.junit.Assert.*
import org.junit.Test
import java.time.Instant

class TeacherExamTimingTest {
    private val exam = Exam(durationMinutes = 2)
    private fun session(now: Long = 160000) = ExamSession("student", ExamSessionStatus.IN_PROGRESS,
        startedAt = 100000, serverTime = now, timingAnchorElapsedRealtime = 5000)
    @Test fun reentryUsesRemainingAttemptTimeInsteadOfRestartingDuration() {
        val timing = TeacherExamTiming.from(exam, session(), 5000, 9999999)!!
        assertEquals(60, timing.remainingSeconds(5000))
        assertEquals(20, TeacherExamTiming.from(exam, session(200000), 5000, 0)!!.remainingSeconds(5000))
    }
    @Test fun backgroundTimeAndWallClockChangesDoNotPauseOrExtendAnAttempt() {
        val timing = TeacherExamTiming.from(exam, session(), 5000, -9999999)!!
        assertEquals(30, timing.remainingSeconds(35000))
        assertEquals(0, timing.remainingSeconds(65000))
        assertEquals(0, timing.remainingSeconds(1000000))
    }
    @Test fun scheduledEndCapsThePerStudentDeadline() {
        val ending = exam.copy(scheduledEndAt = Instant.ofEpochMilli(190000).toString())
        assertEquals(30, TeacherExamTiming.from(ending, session(), 5000, 0)!!.remainingSeconds(5000))
    }
    @Test fun expiredAndInvalidAttemptsDoNotGetNewTime() {
        assertEquals(0, TeacherExamTiming.from(exam, session(250000), 5000, 0)!!.remainingSeconds(5000))
        assertNull(TeacherExamTiming.from(exam, null, 5000, 0))
        assertNull(TeacherExamTiming.from(exam, session().copy(startedAt = Long.MAX_VALUE), 5000, 0))
    }
    @Test fun oldServerFallbackStillUsesAttemptStartAndNeverExceedsDuration() {
        assertEquals(60, TeacherExamTiming.from(exam, session().copy(serverTime = null), 5000, 160000)!!.remainingSeconds(5000))
        assertEquals(120, TeacherExamTiming.from(exam, session(90000), 5000, 0)!!.remainingSeconds(5000))
    }
}