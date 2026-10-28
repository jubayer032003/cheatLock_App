package com.jubayer.cheatlock.model

internal enum class TeacherExamStartupProblem {
    QUESTIONS_UNAVAILABLE, UNSUPPORTED_QUESTION, INCOMPLETE_QUESTION
}

internal data class TeacherExamStartupIssue(
    val problem: TeacherExamStartupProblem,
    val questionNumber: Int = 0
)

/** Validate Gson's runtime values before admission or navigation, not just Kotlin types. */
internal fun teacherExamStartupIssue(exam: Exam): TeacherExamStartupIssue? {
    val questions: List<ExamQuestion?>? = exam.questions
    if (questions.isNullOrEmpty()) {
        return TeacherExamStartupIssue(TeacherExamStartupProblem.QUESTIONS_UNAVAILABLE)
    }
    questions.forEachIndexed { index, question ->
        val number = index + 1
        if (question == null) {
            return TeacherExamStartupIssue(TeacherExamStartupProblem.INCOMPLETE_QUESTION, number)
        }
        // Gson maps unrecognized backend enum values to null despite the Kotlin declaration.
        val type: QuestionType? = question.type
        if (type == null) {
            return TeacherExamStartupIssue(TeacherExamStartupProblem.UNSUPPORTED_QUESTION, number)
        }
        val text: String? = question.text
        val options: List<String?>? = question.options
        if (text.isNullOrBlank() || options == null || options.any { it == null } ||
            (type == QuestionType.MCQ && options.isEmpty())) {
            return TeacherExamStartupIssue(TeacherExamStartupProblem.INCOMPLETE_QUESTION, number)
        }
    }
    return null
}