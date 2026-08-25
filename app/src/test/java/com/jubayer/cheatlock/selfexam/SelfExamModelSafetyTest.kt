package com.jubayer.cheatlock.selfexam

import com.jubayer.cheatlock.model.ActiveSelfExamOption
import com.jubayer.cheatlock.model.ActiveSelfExamQuestion
import org.junit.Assert.assertFalse
import org.junit.Test

class SelfExamModelSafetyTest {
    @Test
    fun activeQuestionAndOptionModelsDoNotExposeAnswerKeys() {
        val questionFields = ActiveSelfExamQuestion::class.java.declaredFields.map { it.name }.toSet()
        val optionFields = ActiveSelfExamOption::class.java.declaredFields.map { it.name }.toSet()
        val forbidden = setOf("isCorrect", "correctAnswer", "correctOption", "correctOptionId")

        assertFalse(questionFields.any { it in forbidden })
        assertFalse(optionFields.any { it in forbidden })
    }
}
