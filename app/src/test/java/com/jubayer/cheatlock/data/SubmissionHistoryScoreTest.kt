package com.jubayer.cheatlock.data

import com.jubayer.cheatlock.model.*
import org.junit.Assert.*
import org.junit.Test

class SubmissionHistoryScoreTest {
    private fun submission(correct: Int? = null, total: Int? = null, grade: Double? = null,
        examId: String? = "Self Practice: Easy", answers: List<StudentAnswer> = emptyList()) = ExamSubmission(
        id = "attempt-id", examId = examId, studentId = "student", answers = answers,
        appSwitchWarnings = 1, faceMissingWarnings = 2, audioWarnings = 3, phoneWarnings = 4,
        totalWarnings = 10, riskLevel = "MEDIUM", submittedAt = 123456L, grade = grade,
        feedback = "Feedback", gradedAt = "2026-10-25", correctAnswerCount = correct, totalQuestionCount = total)

    @Test fun correctnessOverridesWeightedMarksAndUsesAllQuestions() {
        val value = submission(correct = 2, total = 10, grade = 90.0).withCorrectAnswerScore()
        assertEquals(20.0, value.grade!!, .0001)
        assertEquals(2, value.correctAnswerScore()!!.correct)
        assertEquals(10, value.correctAnswerScore()!!.total)
    }

    @Test fun wrongAndUnansweredResponsesDoNotEarnPoints() {
        val value = submission(answers = listOf(
            StudentAnswer(0, "A", "Correct", isCorrect = true),
            StudentAnswer(1, "B", "Wrong", isCorrect = false),
            StudentAnswer(2, "C", "", isCorrect = false))).withCorrectAnswerScore()
        assertEquals(100.0 / 3, value.grade!!, .0001)
        assertEquals(1, value.correctAnswerCount)
        assertEquals(3, value.totalQuestionCount)
        assertEquals(0.0, submission(0, 10).withCorrectAnswerScore().grade!!, .0001)
    }

    @Test fun historyRoundTripPreservesIdentityScoresFeedbackAndCorrectness() {
        val original = submission(8, 10, 80.0, answers = listOf(StudentAnswer(0, "Question", "Answer", "option-id", true)))
        val restored = SubmissionHistoryCodec.decode(SubmissionHistoryCodec.encode(listOf(original))).single()
        assertEquals(original, restored)
        assertEquals(restored, SubmissionHistoryCodec.decode(SubmissionHistoryCodec.encode(listOf(restored))).single())
    }

    @Test fun legacyRecordsRecoverScoresFromCompleteReviewVerdicts() {
        val raw = """[{"studentId":"student","answers":[
          {"questionIndex":0,"questionText":"A","answerText":"Yes (Correct ✅) | Note: Explanation"},
          {"questionIndex":1,"questionText":"B","answerText":"No (Incorrect ❌ • Correct: Yes)"},
          {"questionIndex":2,"questionText":"C","answerText":"Unanswered (Incorrect ❌ • Correct: Yes)"}
        ],"submittedAt":123}]"""
        val restored = SubmissionHistoryCodec.decode(raw).single()
        assertEquals(1, restored.correctAnswerCount)
        assertEquals(3, restored.totalQuestionCount)
        assertEquals(100.0 / 3, restored.grade!!, .0001)
    }

    @Test fun missingEvidenceDoesNotInventCorrectnessOrTrustAnOldWeightedScore() {
        val unknown = submission(grade = 90.0, answers = listOf(StudentAnswer(0, "Q", "A"))).withCorrectAnswerScore()
        assertNull(unknown.grade)
        assertNull(unknown.correctAnswerScore())
        assertNull(submission(0, 0).correctAnswerScore())
        assertNull(submission(11, 10).correctAnswerScore())
        assertNull(submission(-1, 10).correctAnswerScore())
    }

    @Test fun teacherGradingIsPreservedWithoutInferringCorrectness() {
        val official = submission(grade = 87.0, examId = "507f1f77bcf86cd799439011")
        assertEquals(official, SubmissionHistoryCodec.decode(SubmissionHistoryCodec.encode(listOf(official))).single())
        assertNull(official.correctAnswerScore())
    }

    @Test fun updatedRecordsProduceUpdatedOverviewAverages() {
        val initial = listOf(submission(8, 10), submission(1, 2), submission()).map { it.withCorrectAnswerScore() }
        assertEquals(75.0, selfPracticeOverviewScore(initial)!!.percentage, .0001)
        val updated = initial + submission(10, 10).withCorrectAnswerScore()
        assertEquals(1900.0 / 22, selfPracticeOverviewScore(updated)!!.percentage, .0001)
    }

    @Test fun oldWeightedPercentageDoesNotRemainInTitleOrFeedback() {
        val value = submission(1, 2, 90.0, examId = "Self Practice: Easy (90%)")
            .copy(feedback = "Self-Practice: 1/2 Correct (90%)").withCorrectAnswerScore()
        assertEquals(50.0, value.grade!!, .0001)
        assertEquals("Self Practice: Easy", value.examId)
        assertEquals("Self-Practice: 1/2 Correct", value.feedback)
    }
}
