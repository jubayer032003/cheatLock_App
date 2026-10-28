package com.jubayer.cheatlock.model

import com.google.gson.Gson
import org.junit.Assert.*
import org.junit.Test

class ExamQuestionStartupTest {
    private val gson = Gson()

    // Match backend serializeExam: ordinary teacher questions have no optionIds.
    private fun teacherQuestion(extra: String = ""): ExamQuestion = gson.fromJson(
        """{"type":"MCQ","text":"Synthetic question","options":["A","B"],"correctAnswer":"A"$extra}""",
        ExamQuestion::class.java
    )

    @Test fun missingIdsDoNotCrashQuestionPreparation() {
        val question = teacherQuestion()
        assertNull(question.optionIds)
        question.options.indices.forEach { assertNull(question.optionIdAt(it)) }
        assertEquals(listOf("A", "B"), question.options)
        assertEquals("Synthetic question", question.text)
        assertEquals(QuestionType.MCQ, question.type)
        assertEquals("A", question.correctAnswer)
    }

    @Test fun explicitNullIdsAreAlsoOptional() {
        val question = teacherQuestion(",\"optionIds\":null")
        question.options.indices.forEach { assertNull(question.optionIdAt(it)) }
    }

    @Test fun suppliedIdsStayPairedWithTheirOptions() {
        val question = teacherQuestion(",\"optionIds\":[\"option-a\",\"option-b\"]")
        assertEquals(listOf("A" to "option-a", "B" to "option-b"),
            question.options.mapIndexed { index, text -> text to question.optionIdAt(index) })
        assertNull(question.optionIdAt(-1))
        assertNull(question.optionIdAt(2))
    }

    @Test fun shortOrEmptyIdsDoNotInventAnIdentity() {
        assertNull(teacherQuestion(",\"optionIds\":[]").optionIdAt(0))
        val question = teacherQuestion(",\"optionIds\":[\"option-a\"]")
        assertEquals("option-a", question.optionIdAt(0))
        assertNull(question.optionIdAt(1))
    }
}