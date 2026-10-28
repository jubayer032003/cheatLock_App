package com.jubayer.cheatlock.model

import java.security.MessageDigest

/** Local answer storage must never alias another student, exam, or teacher-reset attempt. */
@ConsistentCopyVisibility
internal data class ExamAttemptKey private constructor(val studentId: String, val examId: String, val startedAt: Long) {
    val prefix: String by lazy {
        val identity = listOf(studentId, examId, startedAt.toString()).joinToString("") { "${it.length}:$it" }
        "answer_v2_" + MessageDigest.getInstance("SHA-256").digest(identity.toByteArray(Charsets.UTF_8))
            .joinToString("") { "%02x".format(it) } + "_"
    }
    fun answerKey(index: Int): String { require(index >= 0); return "$prefix$index" }
    companion object {
        fun from(studentId: String?, examId: String?, startedAt: Long?): ExamAttemptKey? =
            if (studentId.isNullOrBlank() || examId.isNullOrBlank() || startedAt == null || startedAt <= 0) null
            else ExamAttemptKey(studentId, examId, startedAt)
    }
}