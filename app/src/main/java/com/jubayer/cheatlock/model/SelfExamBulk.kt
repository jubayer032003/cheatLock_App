package com.jubayer.cheatlock.model

data class BulkSelfExamAnswer(val questionId: String, val selectedOptionId: String?)
data class BulkSelfExamRequest(val submissionId: String, val answers: List<BulkSelfExamAnswer>)
data class PendingBulkSelfExamSubmission(val sessionId: String, val submissionId: String, val answers: List<BulkSelfExamAnswer>) {
    fun request() = BulkSelfExamRequest(submissionId, answers)
}
data class BulkSelfExamStatusResponse(val state: String, val result: SelfExamResultResponse? = null)
