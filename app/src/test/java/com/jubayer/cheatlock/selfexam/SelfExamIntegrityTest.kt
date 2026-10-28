package com.jubayer.cheatlock.selfexam

import org.junit.Assert.*
import org.junit.Test

class SelfExamIntegrityTest {
    private val account = "0123456789abcdef01234567"
    private val session = "11111111-1111-4111-8111-111111111111"
    private val question = "22222222-2222-4222-8222-222222222222"
    @Test fun deadlineUsesServerTimeAndMonotonicElapsed() {
        val d = ServerExamDeadline.from("2026-10-21T00:01:00Z", "2026-10-21T00:00:00Z", 100L, 10)
        assertEquals(60, d.remainingSeconds(100)); assertEquals(30, d.remainingSeconds(30100))
        assertEquals(0, d.remainingSeconds(70100)); assertEquals(0, d.remainingSeconds(99))
        assertEquals(0, ServerExamDeadline.from("bad", "bad", 0, 10).remainingSeconds(0))
    }
    @Test fun recoveryKeysIsolateAccountsAndAttempts() {
        val first = SelfExamRecoveryScope(account, session)
        assertNotEquals(first.pointerKey(), SelfExamRecoveryScope("1123456789abcdef01234567", session).pointerKey())
        assertNotEquals(first.answerKey(question), SelfExamRecoveryScope(account, question).answerKey(question))
        assertEquals("", confirmedSelfExamAnswer(listOf("one", "two"), listOf("A", "B"), "missing"))
        assertEquals("B", confirmedSelfExamAnswer(listOf("one", "two"), listOf("A", "B"), "two"))
    }
    @Test fun autosaveRequiresRevisionContract() {
        val q = SelfExamAnswerQueue(SelfExamRecoveryScope(account, session), question)
        q.select("option", "mutation"); assertNull(q.nextRequest())
    }
    @Test fun staleAcknowledgementCannotMarkNewSelectionSaved() {
        val q = SelfExamAnswerQueue(SelfExamRecoveryScope(account, session), question, true)
        q.select("first", "mutation-one"); val old = q.nextRequest()!!
        q.select("second", "mutation-two"); assertNull(q.nextRequest())
        q.acknowledge(old, 1); assertEquals(AnswerSaveState.SELECTED_PENDING, q.state)
        val current = q.nextRequest()!!
        assertEquals(1L, current.expectedRevision); assertEquals("second", current.selectedOptionId)
        q.acknowledge(old, 1); assertEquals(AnswerSaveState.SAVING, q.state)
        q.acknowledge(current, 2); assertEquals(AnswerSaveState.SAVED, q.state); assertTrue(q.canSubmit())
    }
    @Test fun retryReusesMutationRevisionAndIsBounded() {
        val q = SelfExamAnswerQueue(SelfExamRecoveryScope(account, session), question, true)
        q.select("first", "mutation-one"); val intent = q.nextRequest()!!
        repeat(3) { q.fail(intent, true); assertEquals(intent, q.nextRequest()) }
        q.fail(intent, true); assertNull(q.nextRequest()); assertFalse(q.canSubmit())
        q.expire(); assertEquals(AnswerSaveState.EXPIRED, q.state); assertNull(q.nextRequest())
    }
    @Test fun conflictAndAuthFailureRequireExplicitRecovery() {
        val q = SelfExamAnswerQueue(SelfExamRecoveryScope(account, session), question, true)
        q.select("new", "mutation"); val intent = q.nextRequest()!!
        q.conflict(intent, 5, "remote"); assertEquals(AnswerSaveState.SAVE_FAILED, q.state); assertNull(q.nextRequest())
        q.select("confirmed intention", "new-mutation"); val next = q.nextRequest()!!
        assertEquals(5L, next.expectedRevision); q.fail(next, false); assertNull(q.nextRequest())
    }
    @Test fun malformedTimingIsDistinctFromRealExpiration() {
        assertFalse(ServerExamDeadline.from(null, null, null, 10).isValid)
        val expired = ServerExamDeadline.from("2026-10-21T00:00:00Z", "2026-10-21T00:01:00Z", 100, 10)
        assertTrue(expired.isValid); assertEquals(0, expired.remainingSeconds(100))
    }
    @Test fun responseTransitAndBackgroundTimeAreDeductedWithoutDeviceWallClock() {
        val d = ServerExamDeadline.from("2026-10-21T00:01:00Z", "2026-10-21T00:00:00Z", 100, 10)
        assertEquals(58, d.remainingSeconds(2100))
        assertEquals(0, d.remainingSeconds(120100))
    }
    @Test fun recreationStartsFromConfirmedRevisionNotUnacknowledgedLocalIntent() {
        val q = SelfExamAnswerQueue(SelfExamRecoveryScope(account, session), question, true, 8, "confirmed")
        assertTrue(q.canSubmit()); q.select("changed", "fresh-mutation")
        assertEquals(8L, q.nextRequest()!!.expectedRevision)
    }
}
