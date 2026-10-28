package com.jubayer.cheatlock.selfexam

import com.jubayer.cheatlock.model.BulkSelfExamAnswer
import kotlinx.coroutines.*
import org.junit.Assert.*
import org.junit.Test
import java.io.IOException

class SelfExamCheckpointTest {
    private fun id(n: Int) = "00000000-0000-4000-8000-%012d".format(n)
    private val session = id(9000)
    private fun answers(n: Int) = (1..n).map { BulkSelfExamAnswer(id(it), if (it % 3 == 0) null else id(it + 1000)) }
    private class Store : CheckpointStore {
        var pending: PendingCheckpoint? = null
        var fail = false
        override fun readCheckpoint(sessionId: String) = pending
        override fun writeCheckpoint(value: PendingCheckpoint) { if (fail) throw IOException(); pending = value }
        override fun clearCheckpoint(sessionId: String) { pending = null }
    }
    private class Transport(val store: Store, var current: CheckpointState) : CheckpointTransport {
        var posts = 0
        var loseResponse = false
        val mutations = mutableListOf<String>()
        override suspend fun state(sessionId: String) = current
        override suspend fun save(sessionId: String, request: CheckpointRequest): CheckpointState {
            check(store.pending?.request == request)
            posts++; mutations += request.mutationId
            check(request.expectedRevision == current.revision)
            current = current.copy(revision=current.revision+1, mutationId=request.mutationId, answers=request.answers)
            if (loseResponse) { loseResponse=false; throw IOException("lost acknowledgement") }
            return current
        }
    }
    private fun state(n: Int) = CheckpointState(0,null,answers(n).map { it.copy(selectedOptionId=null) },"2026-10-22T00:00:00Z","2026-10-22T01:00:00Z","in_progress")
    @Test fun fullPartialBlankSnapshots10_100_300() = runBlocking {
        for (n in listOf(10,100,300)) {
            val store=Store();val t=Transport(store,state(n));val c=SelfExamCheckpointCoordinator(store,t)
            assertEquals(1,c.save(session,answers(n)).revision.toInt());assertEquals(1,t.posts);assertNull(store.pending)
            c.save(session,answers(n));assertEquals(1,t.posts)
            assertEquals(2,c.save(session,state(n).answers).revision.toInt())
        }
    }
    @Test fun restartAfterLostCommitAcknowledgementDoesNotResendOrChangeIdentity() = runBlocking {
        val store=Store();val t=Transport(store,state(10));t.loseResponse=true
        try { SelfExamCheckpointCoordinator(store,t).save(session,answers(10)); fail() } catch (_: IOException) {}
        val mutation=checkNotNull(store.pending).request.mutationId
        val recovered=SelfExamCheckpointCoordinator(store,t).refresh(session)
        assertEquals(mutation,recovered.mutationId);assertEquals(1,t.posts);assertNull(store.pending)
    }
    @Test fun stalePendingCannotOverwriteNewerServerRevision() = runBlocking {
        val store=Store();val t=Transport(store,state(10));t.loseResponse=true
        try { SelfExamCheckpointCoordinator(store,t).save(session,answers(10)) } catch (_: IOException) {}
        t.current=t.current.copy(revision=2,mutationId=id(8000))
        try { SelfExamCheckpointCoordinator(store,t).refresh(session);fail() } catch (_: IllegalStateException) {}
        assertNotNull(store.pending);assertEquals(1,t.posts)
    }
    @Test fun failedDurableWriteNeverSends() = runBlocking {
        val store=Store();store.fail=true;val t=Transport(store,state(10))
        try { SelfExamCheckpointCoordinator(store,t).save(session,answers(10));fail() } catch (_: IOException) {}
        assertEquals(0,t.posts)
    }
    @Test fun duplicateConcurrentSelectionsUseOneCheckpoint() = runBlocking {
        val store=Store();val t=Transport(store,state(100));val c=SelfExamCheckpointCoordinator(store,t)
        (1..10).map { async { c.save(session,answers(100)) } }.awaitAll()
        assertEquals(1,t.posts)
    }
    @Test fun recoveryAfterWorkerFinalizationDoesNotSendLateChanges() = runBlocking {
        val store=Store();val t=Transport(store,state(10));t.loseResponse=true
        try { SelfExamCheckpointCoordinator(store,t).save(session,answers(10)) } catch (_: IOException) {}
        t.current=t.current.copy(status="submitted")
        assertEquals("submitted",SelfExamCheckpointCoordinator(store,t).refresh(session).status)
        assertNull(store.pending);assertEquals(1,t.posts)
    }
    @Test fun restartWithUnsentRequestReusesDurableMutation() = runBlocking {
        val store=Store();val t=Transport(store,state(10));val mutation=id(7000)
        store.pending=PendingCheckpoint(session,CheckpointRequest(mutation,0,answers(10).sortedBy { it.questionId }))
        val recovered=SelfExamCheckpointCoordinator(store,t).refresh(session)
        assertEquals(mutation,recovered.mutationId);assertEquals(listOf(mutation),t.mutations);assertNull(store.pending)
    }
    @Test fun explicitReloadDiscardsOnlyUnconfirmedCheckpoint() = runBlocking {
        val store=Store();val t=Transport(store,state(10))
        store.pending=PendingCheckpoint(session,CheckpointRequest(id(7000),0,answers(10)))
        t.current=t.current.copy(revision=2,mutationId=id(8000))
        assertEquals(2,SelfExamCheckpointCoordinator(store,t).reloadServerAnswers(session).revision.toInt())
        assertNull(store.pending);assertEquals(0,t.posts)
    }
}
