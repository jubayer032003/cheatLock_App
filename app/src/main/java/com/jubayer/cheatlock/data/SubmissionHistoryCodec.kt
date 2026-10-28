package com.jubayer.cheatlock.data

import com.google.gson.GsonBuilder
import com.google.gson.JsonObject
import com.google.gson.JsonParser
import com.jubayer.cheatlock.model.ExamSubmission
import com.jubayer.cheatlock.model.StudentAnswer
import com.jubayer.cheatlock.model.withCorrectAnswerScore

/** Shared, JVM-testable storage format, including fields needed after relaunch. */
internal object SubmissionHistoryCodec {
    private val gson = GsonBuilder().serializeNulls().create()
    fun encode(values: List<ExamSubmission>): String = gson.toJson(values)

    fun decode(raw: String): List<ExamSubmission> = JsonParser.parseString(raw).asJsonArray.map { element ->
        val item = element.asJsonObject
        val answers = item.get("answers")?.takeUnless { it.isJsonNull }?.asJsonArray?.map { value ->
            val answer = value.asJsonObject
            StudentAnswer(
                questionIndex = answer.int("questionIndex") ?: 0,
                questionText = answer.text("questionText").orEmpty(),
                answerText = answer.text("answerText").orEmpty(),
                selectedOptionId = answer.text("selectedOptionId"),
                isCorrect = answer.get("isCorrect")?.takeUnless { it.isJsonNull }?.asBoolean
            )
        }.orEmpty()
        ExamSubmission(
            id = item.text("id"), examId = item.text("examId"),
            studentId = item.text("studentId") ?: "unknown", answers = answers,
            appSwitchWarnings = item.int("appSwitchWarnings") ?: 0,
            faceMissingWarnings = item.int("faceMissingWarnings") ?: 0,
            audioWarnings = item.int("audioWarnings") ?: 0,
            phoneWarnings = item.int("phoneWarnings") ?: 0,
            totalWarnings = item.int("totalWarnings") ?: 0,
            riskLevel = item.text("riskLevel") ?: "LOW",
            submittedAt = item.get("submittedAt")?.takeUnless { it.isJsonNull }?.asLong ?: 0L,
            grade = item.get("grade")?.takeUnless { it.isJsonNull }?.asDouble,
            feedback = item.text("feedback"), gradedAt = item.text("gradedAt"),
            correctAnswerCount = item.int("correctAnswerCount"), totalQuestionCount = item.int("totalQuestionCount")
        ).withCorrectAnswerScore()
    }

    private fun JsonObject.text(name: String): String? = get(name)?.takeUnless { it.isJsonNull }?.asString
    private fun JsonObject.int(name: String): Int? = get(name)?.takeUnless { it.isJsonNull }?.asInt
}
