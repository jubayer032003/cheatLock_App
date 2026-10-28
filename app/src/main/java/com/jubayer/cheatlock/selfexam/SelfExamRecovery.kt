package com.jubayer.cheatlock.selfexam

import java.security.MessageDigest

/** Local namespacing only; never an authentication decision. */
data class SelfExamRecoveryScope(val accountId: String, val sessionId: String) {
    init {
        require(accountId.matches(Regex("[a-f0-9]{24}")))
        require(sessionId.matches(Regex("[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}")))
    }
    fun pointerKey(): String = accountPointerKey(accountId)
    fun answerKey(questionId: String): String = hash("answer:$accountId:$sessionId:$questionId")
    companion object {
        fun accountPointerKey(accountId: String): String {
            require(accountId.matches(Regex("[a-f0-9]{24}")))
            return "active_session_v2_" + hash(accountId)
        }
        private fun hash(value: String): String = MessageDigest.getInstance("SHA-256")
            .digest(value.toByteArray(Charsets.UTF_8)).joinToString("") { "%02x".format(it) }
    }
}

fun confirmedSelfExamAnswer(optionIds: List<String>, optionTexts: List<String>, selectedOptionId: String?): String {
    val index = optionIds.indexOf(selectedOptionId)
    return if (index >= 0) optionTexts.getOrNull(index).orEmpty() else ""
}
