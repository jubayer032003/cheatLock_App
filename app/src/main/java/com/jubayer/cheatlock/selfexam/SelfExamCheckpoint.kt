package com.jubayer.cheatlock.selfexam

import com.jubayer.cheatlock.model.BulkSelfExamAnswer
import com.jubayer.cheatlock.model.PendingBulkSelfExamSubmission
import com.jubayer.cheatlock.model.SelfExamResultResponse
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import java.util.UUID

data class CheckpointRequest(val mutationId: String, val expectedRevision: Long, val answers: List<BulkSelfExamAnswer>)
data class PendingCheckpoint(val sessionId: String, val request: CheckpointRequest)
data class CheckpointState(val revision: Long, val mutationId: String?, val answers: List<BulkSelfExamAnswer>,
    val serverTime: String, val expiresAt: String, val status: String, val result: SelfExamResultResponse? = null,
    @Transient var timingAnchor: Long? = null)
interface CheckpointStore {
    fun readCheckpoint(sessionId: String): PendingCheckpoint?
    fun writeCheckpoint(value: PendingCheckpoint)
    fun clearCheckpoint(sessionId: String)
}
interface CheckpointTransport {
    suspend fun state(sessionId: String): CheckpointState
    suspend fun save(sessionId: String, request: CheckpointRequest): CheckpointState
}
class CheckpointConflictException : IllegalStateException("Newer server answers exist. Reload required.")
/** IO-only, serialized CAS. An uncertain request is reconciled before any newer snapshot. */
class SelfExamCheckpointCoordinator(private val store: CheckpointStore, private val transport: CheckpointTransport) {
    private val mutex = Mutex()
    private val states = mutableMapOf<String, CheckpointState>()
    suspend fun reloadServerAnswers(sessionId: String): CheckpointState = mutex.withLock {
        store.clearCheckpoint(sessionId)
        states.remove(sessionId)
        reconcile(sessionId)
    }
    suspend fun refresh(sessionId: String): CheckpointState = mutex.withLock { reconcile(sessionId) }
    private suspend fun reconcile(sessionId: String): CheckpointState {
        var state = transport.state(sessionId)
        val pending = store.readCheckpoint(sessionId)
        if (pending != null) {
            validate(pending)
            if (state.status == "submitted") {
                store.clearCheckpoint(sessionId)
            } else if (state.mutationId == pending.request.mutationId && state.revision == pending.request.expectedRevision + 1) {
                check(state.answers.sortedBy { it.questionId } == pending.request.answers) { "Checkpoint acknowledgement mismatch" }
                store.clearCheckpoint(sessionId)
            } else {
                if (state.revision != pending.request.expectedRevision) throw CheckpointConflictException()
                state = send(pending)
            }
        }
        states[sessionId] = state
        return state
    }
    suspend fun save(sessionId: String, answers: List<BulkSelfExamAnswer>): CheckpointState = mutex.withLock {
        val state = if (store.readCheckpoint(sessionId) != null || states[sessionId] == null) reconcile(sessionId) else checkNotNull(states[sessionId])
        if (state.status == "submitted") return@withLock state
        val sorted = answers.map { it.copy() }.sortedBy { it.questionId }
        if (state.answers.sortedBy { it.questionId } == sorted) return@withLock state
        val pending = PendingCheckpoint(sessionId, CheckpointRequest(UUID.randomUUID().toString(), state.revision, sorted))
        validate(pending)
        store.writeCheckpoint(pending) // durable ID/snapshot before network
        send(pending).also { states[sessionId] = it }
    }
    private suspend fun send(pending: PendingCheckpoint): CheckpointState {
        val state = transport.save(pending.sessionId, pending.request)
        check(state.revision == pending.request.expectedRevision + 1 && state.mutationId == pending.request.mutationId)
        check(state.answers.sortedBy { it.questionId } == pending.request.answers)
        store.clearCheckpoint(pending.sessionId)
        return state
    }
    private fun validate(value: PendingCheckpoint) {
        require(value.request.expectedRevision in 0..9_007_199_254_740_988L)
        validatePendingBulkSubmission(PendingBulkSelfExamSubmission(value.sessionId, value.request.mutationId, value.request.answers))
    }
}
