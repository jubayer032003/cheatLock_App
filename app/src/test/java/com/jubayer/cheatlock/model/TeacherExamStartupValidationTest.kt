package com.jubayer.cheatlock.model

import com.google.gson.Gson
import org.junit.Assert.*
import org.junit.Test

class TeacherExamStartupValidationTest {
    private val gson = Gson()
    private fun exam(questions: String): Exam = gson.fromJson(
        """{"id":"synthetic-exam","title":"Synthetic","status":"LIVE","questions":$questions}""",
        Exam::class.java
    )

    @Test fun ordinaryBackendMcqAndCqPayloadsRemainUnchanged() {
        val exam = exam("""[{"type":"MCQ","text":"Pick","options":["A","B"]},{"type":"CQ","text":"Explain","options":[]}]""")
        assertNull(teacherExamStartupIssue(exam))
        assertEquals(listOf("A", "B"), exam.questions[0].options)
        assertEquals(QuestionType.CQ, exam.questions[1].type)
        assertNull(exam.questions[0].optionIds)
        assertNull(exam.questions[0].optionIdAt(0))
    }

    @Test fun backendTypesThatGsonCannotRepresentAreRejectedBeforeStartup() {
        for (type in listOf("MULTI_SELECT", "MATH", "CODE", "TRUE_FALSE", "FILL_BLANK",
            "MATCHING", "ORDERING", "CASE_STUDY", "FILE_UPLOAD", "IMAGE", "FUTURE_TYPE")) {
            val exam = exam("""[{"type":"$type","text":"Synthetic","options":["A","B"]}]""")
            assertNull(exam.questions[0].type)
            assertEquals(TeacherExamStartupIssue(TeacherExamStartupProblem.UNSUPPORTED_QUESTION, 1),
                teacherExamStartupIssue(exam))
        }
    }

    @Test fun missingOrExplicitNullTypesAreNotSilentlyChangedToCq() {
        for (fields in listOf("", "\"type\":null,")) {
            assertEquals(TeacherExamStartupProblem.UNSUPPORTED_QUESTION,
                teacherExamStartupIssue(exam("""[{$fields"text":"Synthetic","options":[]}]"""))?.problem)
        }
    }

    @Test fun emptyNullAndMissingQuestionListsHaveAnActionableFailure() {
        for (questions in listOf("[]", "null")) {
            assertEquals(TeacherExamStartupProblem.QUESTIONS_UNAVAILABLE,
                teacherExamStartupIssue(exam(questions))?.problem)
        }
        assertEquals(TeacherExamStartupProblem.QUESTIONS_UNAVAILABLE,
            teacherExamStartupIssue(gson.fromJson("{}", Exam::class.java))?.problem)
    }

    @Test fun malformedQuestionFieldsNeverReachTheRenderer() {
        for (question in listOf("null",
            """{"type":"MCQ","text":null,"options":["A"]}""",
            """{"type":"CQ","options":[]}""",
            """{"type":"MCQ","text":"Synthetic","options":null}""",
            """{"type":"MCQ","text":"Synthetic","options":[null]}""",
            """{"type":"MCQ","text":"Synthetic","options":[]}""")) {
            assertEquals(TeacherExamStartupProblem.INCOMPLETE_QUESTION,
                teacherExamStartupIssue(exam("[$question]"))?.problem)
        }
    }

    @Test fun reportsTheOriginalQuestionNumberWithoutReorderingAnswers() {
        val exam = exam("""[{"type":"CQ","text":"First","options":[]},{"type":"TRUE_FALSE","text":"Second","options":["True","False"]}]""")
        assertEquals(2, teacherExamStartupIssue(exam)?.questionNumber)
        assertEquals(listOf("First", "Second"), exam.questions.map { it.text })
    }
}