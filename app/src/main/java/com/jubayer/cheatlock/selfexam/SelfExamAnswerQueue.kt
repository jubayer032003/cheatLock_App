package com.jubayer.cheatlock.selfexam

// IMPLEMENTED_DISABLED: not wired to the legacy unversioned HTTP answer endpoint.
enum class AnswerSaveState { UNANSWERED, SELECTED_PENDING, SAVING, SAVED, SAVE_FAILED, EXPIRED }
data class AnswerSaveIntent(val scope: SelfExamRecoveryScope, val questionId: String, val selectedOptionId: String?, val expectedRevision: Long, val mutationId: String)
class SelfExamAnswerQueue(private val scope: SelfExamRecoveryScope, private val questionId: String, private val revisionContractVerified: Boolean = false, initialRevision: Long = 0, initialSelection: String? = null) {
    init { require(initialRevision in 0..9_007_199_254_740_989L) }
    var state = if (initialSelection == null) AnswerSaveState.UNANSWERED else AnswerSaveState.SAVED
        private set
    private var revision = initialRevision
    private var desired: String? = initialSelection
    private var desiredMutation = ""
    private var active: AnswerSaveIntent? = null
    private var attempts = 0
    private var blocked = false
    private var inFlight = false
    @Synchronized fun select(optionId: String?, mutationId: String) {
        if (state == AnswerSaveState.EXPIRED || blocked) return
        require(mutationId.isNotBlank())
        if (desiredMutation == mutationId) { require(desired == optionId); return }
        desired = optionId
        desiredMutation = mutationId
        state = AnswerSaveState.SELECTED_PENDING
    }
    @Synchronized fun nextRequest(): AnswerSaveIntent? {
        if (inFlight || desiredMutation.isBlank() || !revisionContractVerified || blocked || state == AnswerSaveState.EXPIRED || attempts >= 4 || state == AnswerSaveState.SAVED || state == AnswerSaveState.UNANSWERED || state == AnswerSaveState.SAVING) return null
        val request = active ?: AnswerSaveIntent(scope, questionId, desired, revision, desiredMutation).also { active = it }
        attempts++
        inFlight = true
        state = AnswerSaveState.SAVING
        return request
    }
    @Synchronized fun acknowledge(intent: AnswerSaveIntent, acknowledgedRevision: Long) {
        if (active != intent || blocked || state == AnswerSaveState.EXPIRED) return
        if (acknowledgedRevision != intent.expectedRevision + 1) { blocked = true; state = AnswerSaveState.SAVE_FAILED; return }
        inFlight = false
        revision = acknowledgedRevision
        active = null
        attempts = 0
        state = if (desiredMutation == intent.mutationId) AnswerSaveState.SAVED else AnswerSaveState.SELECTED_PENDING
    }
    @Synchronized fun fail(intent: AnswerSaveIntent, retryable: Boolean) {
        if (active != intent || state == AnswerSaveState.EXPIRED) return
        inFlight = false
        blocked = !retryable
        state = AnswerSaveState.SAVE_FAILED
    }
    @Synchronized fun conflict(intent: AnswerSaveIntent, serverRevision: Long, serverOption: String?) {
        if (active != intent || state == AnswerSaveState.EXPIRED || blocked) return
        require(serverRevision in revision..9_007_199_254_740_989L)
        inFlight = false
        revision = serverRevision
        active = null
        attempts = 0
        desired = serverOption
        desiredMutation = ""
        // Require explicit selection to confirm intention after a conflict.
        state = AnswerSaveState.SAVE_FAILED
    }
    @Synchronized fun expire() { blocked = true; active = null; state = AnswerSaveState.EXPIRED }
    @Synchronized fun canSubmit(): Boolean = state == AnswerSaveState.SAVED || state == AnswerSaveState.UNANSWERED
}
