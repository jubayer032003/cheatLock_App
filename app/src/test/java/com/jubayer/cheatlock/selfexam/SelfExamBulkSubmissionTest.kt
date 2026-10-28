package com.jubayer.cheatlock.selfexam

import com.jubayer.cheatlock.model.*
import com.google.gson.GsonBuilder
import kotlinx.coroutines.*
import org.junit.Assert.*
import org.junit.Test
import java.io.IOException

class SelfExamBulkSubmissionTest {
    private fun id(n: Int) = "00000000-0000-4000-8000-%012d".format(n)
    private val session = id(9000)
    private fun answers(n: Int) = (1..n).map { BulkSelfExamAnswer(id(it), if (it % 3 == 0) null else id(it + 1000)) }
    private fun result() = SelfExamResultResponse(
        SelfExamSession(session,"student","class","subject",durationMinutes=60,questionCount=100,difficultyMode="mixed",status="submitted"),
        emptyList(),serverTime="2026-10-22T00:00:00Z",result=SelfExamResult(0.0,100.0,0,0,0,100))
    private class Store : BulkSubmissionStore {
        var json: String? = null
        private val gson = GsonBuilder().serializeNulls().create()
        override fun read() = json?.let { gson.fromJson(it, PendingBulkSelfExamSubmission::class.java) }
        override fun write(value: PendingBulkSelfExamSubmission) { json = gson.toJson(value) }
        override fun acknowledge(sessionId: String) { if (read()?.sessionId == sessionId) json = null }
    }
    private inner class Transport : BulkSubmissionTransport {
        var posts = 0; var gets = 0; var committed = false; var loseResponse = false; var failBeforeCommit = false
        var statusFailure = false; var observed: PendingBulkSelfExamSubmission? = null
        override suspend fun submit(value: PendingBulkSelfExamSubmission): SelfExamResultResponse {
            posts++; observed=value; delay(1)
            if (failBeforeCommit) throw IOException("test failure before commit")
            committed=true
            if (loseResponse) throw IOException("test response loss after commit")
            return result()
        }
        override suspend fun status(value: PendingBulkSelfExamSubmission): BulkSelfExamStatusResponse {
            gets++
            if (statusFailure) throw IOException("test status timeout")
            return BulkSelfExamStatusResponse(if (committed) "committed" else "pending", if (committed) result() else null)
        }
    }
    @Test fun complete100And300SnapshotsUseOnePostAndPreserveBlanks() = runBlocking {
        for (count in listOf(100,300)) {
            val store=Store();val transport=Transport();val coordinator=SelfExamBulkSubmissionCoordinator(store,transport,{id(9001)})
            coordinator.submit(session,answers(count));assertEquals(1,transport.posts);assertEquals(0,transport.gets)
            assertEquals(count,store.read()!!.answers.size);assertEquals(count/3,store.read()!!.answers.count { it.selectedOptionId == null })
        }
    }
    @Test fun snapshotCommitsBeforeHttp() = runBlocking {
        val store=Store()
        val transport=object:BulkSubmissionTransport {
            override suspend fun submit(value:PendingBulkSelfExamSubmission):SelfExamResultResponse {assertEquals(value,store.read());return result()}
            override suspend fun status(value:PendingBulkSelfExamSubmission)=error("No reconciliation on first submit")
        }
        SelfExamBulkSubmissionCoordinator(store,transport,{id(9001)}).submit(session,answers(100))
        Unit
    }
    @Test fun processRestartAfterLostResponseRecoversWithoutSecondPost() = runBlocking {
        val store=Store();val transport=Transport();transport.loseResponse=true
        val first=SelfExamBulkSubmissionCoordinator(store,transport,{id(9001)})
        try {first.submit(session,answers(100));fail()} catch (_:IOException) {}
        val frozen=store.json;val restarted=SelfExamBulkSubmissionCoordinator(store,transport,{id(9999)})
        assertEquals(result(),restarted.recover());assertEquals(1,transport.posts);assertEquals(frozen,store.json)
        restarted.acknowledge(session);assertNull(store.read())
    }
    @Test fun retryUsesOriginalIdAndPayloadEvenIfCallerChangedAnswers() = runBlocking {
        val store=Store();val transport=Transport();transport.failBeforeCommit=true
        val coordinator=SelfExamBulkSubmissionCoordinator(store,transport,{id(9001)})
        try {coordinator.submit(session,answers(100));fail()} catch (_:IOException) {}
        val frozen=store.read();transport.failBeforeCommit=false
        coordinator.submit(session,answers(50));assertEquals(frozen,transport.observed);assertEquals(1,transport.gets)
    }
    @Test fun concurrentDoubleTapsDoNotCreateAnotherPost() = runBlocking {
        val store=Store();val transport=Transport();var ids=9000
        val coordinator=SelfExamBulkSubmissionCoordinator(store,transport,{id(++ids)})
        coroutineScope { (1..10).map { async { coordinator.submit(session,answers(100)) } }.awaitAll() }
        assertEquals(1,transport.posts);assertEquals(9001,ids)
    }
    @Test fun differentSessionCannotReplacePendingSnapshot() = runBlocking {
        val store=Store();store.write(PendingBulkSelfExamSubmission(session,id(9001),answers(100)))
        val transport=Transport();val coordinator=SelfExamBulkSubmissionCoordinator(store,transport)
        try {coordinator.submit(id(8000),answers(100));fail()} catch (_:IllegalStateException) {}
        assertEquals(session,store.read()!!.sessionId);assertEquals(0,transport.posts)
    }
    @Test fun failedReconciliationRetainsSnapshotAndDoesNotBlindlyPost() = runBlocking {
        val store=Store();store.write(PendingBulkSelfExamSubmission(session,id(9001),answers(100)))
        val transport=Transport();transport.statusFailure=true
        try {SelfExamBulkSubmissionCoordinator(store,transport).recover();fail()} catch (_:IOException) {}
        assertNotNull(store.read());assertEquals(0,transport.posts)
    }
    @Test fun unconfirmedSnapshotCannotBeAcknowledged() = runBlocking {
        val store=Store();store.write(PendingBulkSelfExamSubmission(session,id(9001),answers(100)))
        try {SelfExamBulkSubmissionCoordinator(store,Transport()).acknowledge(session);fail()} catch (_:IllegalStateException) {}
        assertNotNull(store.read())
    }
    @Test fun rejectsDuplicateIdsAndLimitOverflow() {
        for (items in listOf(answers(501),listOf(answers(1).first(),answers(1).first()))) {
            try {validatePendingBulkSubmission(PendingBulkSelfExamSubmission(session,id(9001),items));fail()} catch (_:IllegalArgumentException) {}
        }
    }
    @Test fun defaultRecoveryDoesNotSubmitWithoutPendingData() = runBlocking {
        val transport=Transport();assertNull(SelfExamBulkSubmissionCoordinator(Store(),transport).recover())
        assertEquals(0,transport.posts);assertEquals(0,transport.gets)
    }
    @Test fun failedDurableWriteNeverStartsHttpSubmission() = runBlocking {
        val store=object:BulkSubmissionStore {
            override fun read():PendingBulkSelfExamSubmission?=null
            override fun write(value:PendingBulkSelfExamSubmission){throw IOException("Synthetic disk failure")}
            override fun acknowledge(sessionId:String)=Unit
        }
        val transport=Transport()
        try {SelfExamBulkSubmissionCoordinator(store,transport,{id(9001)}).submit(session,answers(100));fail()} catch (_:IOException) {}
        assertEquals(0,transport.posts)
    }
}
