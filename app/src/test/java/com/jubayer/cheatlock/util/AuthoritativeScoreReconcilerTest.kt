package com.jubayer.cheatlock.util

import org.junit.Assert.assertEquals
import org.junit.Test

class AuthoritativeScoreReconcilerTest {
    @Test
    fun newerResponseWithinAttemptAdvancesScore() {
        val attempt = ScoreAttempt("exam-a", 100L)
        assertEquals(60, AuthoritativeScoreReconciler.reconcile(20, 60, attempt, attempt))
    }

    @Test
    fun lateLowerResponseWithinAttemptDoesNotRegressScore() {
        val attempt = ScoreAttempt("exam-a", 100L)
        assertEquals(60, AuthoritativeScoreReconciler.reconcile(60, 20, attempt, attempt))
    }

    @Test
    fun responseFromOldAttemptIsIgnoredAfterReset() {
        val oldAttempt = ScoreAttempt("exam-a", 100L)
        val newAttempt = ScoreAttempt("exam-a", 200L)
        assertEquals(0, AuthoritativeScoreReconciler.reconcile(0, 60, newAttempt, oldAttempt))
    }

    @Test
    fun responseFromAnotherExamIsIgnored() {
        val examA = ScoreAttempt("exam-a", 100L)
        val examB = ScoreAttempt("exam-b", 100L)
        assertEquals(20, AuthoritativeScoreReconciler.reconcile(20, 60, examB, examA))
    }
}
