package com.jubayer.cheatlock.selfexam

import com.jubayer.cheatlock.model.*
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import java.util.UUID

interface BulkSubmissionStore {
    fun read(): PendingBulkSelfExamSubmission?
    fun write(value: PendingBulkSelfExamSubmission)
    fun acknowledge(sessionId: String)
}
interface BulkSubmissionTransport {
    suspend fun submit(value: PendingBulkSelfExamSubmission): SelfExamResultResponse
    suspend fun status(value: PendingBulkSelfExamSubmission): BulkSelfExamStatusResponse
}
private val bulkUuid = Regex("[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}")
fun validatePendingBulkSubmission(value: PendingBulkSelfExamSubmission): PendingBulkSelfExamSubmission {
    require(bulkUuid.matches(value.sessionId) && bulkUuid.matches(value.submissionId))
    require(value.answers.size in 1..500 && value.answers.map { it.questionId }.distinct().size == value.answers.size)
    require(value.answers.all { bulkUuid.matches(it.questionId) && (it.selectedOptionId == null || bulkUuid.matches(it.selectedOptionId)) })
    return value
}
/** Called on IO. The store commits BEFORE HTTP; failures never discard the frozen snapshot. */
class SelfExamBulkSubmissionCoordinator(
    private val store: BulkSubmissionStore,
    private val transport: BulkSubmissionTransport,
    private val newId: () -> String = { UUID.randomUUID().toString() }
) {
    private val mutex = Mutex()
    private var confirmedSession: String? = null
    suspend fun submit(sessionId: String, answers: List<BulkSelfExamAnswer>, reconcileFirst: Boolean = false): SelfExamResultResponse = mutex.withLock {
        val pending = store.read()
        if (pending != null) {
            check(pending.sessionId == sessionId) { "A saved submission must be recovered first." }
            return@withLock reconcile(pending)
        }
        val value = validatePendingBulkSubmission(PendingBulkSelfExamSubmission(sessionId, newId(), answers.map { it.copy() }.sortedBy { it.questionId }))
        store.write(value)
        if (reconcileFirst) reconcile(value) else confirm(value, transport.submit(value))
    }
    suspend fun recover(): SelfExamResultResponse? = mutex.withLock {
        store.read()?.let { reconcile(validatePendingBulkSubmission(it)) }
    }
    private suspend fun reconcile(value: PendingBulkSelfExamSubmission): SelfExamResultResponse {
        val status = transport.status(value)
        return confirm(value, when (status.state) {
            "committed", "finalized_other" -> checkNotNull(status.result) { "Submission result is unavailable." }
            "pending" -> transport.submit(value)
            else -> error("Submission status could not be confirmed.")
        })
    }
    private fun confirm(value: PendingBulkSelfExamSubmission, result: SelfExamResultResponse): SelfExamResultResponse {
        check(result.session.id == value.sessionId && result.session.status == "submitted")
        confirmedSession = value.sessionId
        return result
    }
    // Caller invokes only after persisting the confirmed result in local exam history.
    suspend fun acknowledge(sessionId: String) = mutex.withLock {
        check(confirmedSession == sessionId) { "Submission has not been confirmed." }
        store.acknowledge(sessionId)
        confirmedSession = null
    }
}
