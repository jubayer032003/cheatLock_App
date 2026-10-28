package com.jubayer.cheatlock.model

data class CorrectAnswerScore(val correct: Int, val total: Int) {
    init { require(total > 0 && correct in 0..total) }
    val percentage: Double get() = correct.toDouble() / total * 100.0
}

fun ExamSubmission.isSelfPracticeResult(): Boolean = correctAnswerCount != null ||
    totalQuestionCount != null || examId.isNullOrBlank() ||
    examId.contains("self", ignoreCase = true) || examId.contains("practice", ignoreCase = true)

fun ExamSubmission.correctAnswerScore(): CorrectAnswerScore? {
    if (!isSelfPracticeResult()) return null
    if (correctAnswerCount != null || totalQuestionCount != null) {
        val correct = correctAnswerCount ?: return null
        val total = totalQuestionCount ?: return null
        return if (total > 0 && correct in 0..total) CorrectAnswerScore(correct, total) else null
    }
    if (answers.isEmpty()) return null
    // Older app versions embedded their review verdict in answer text. Recover
    // only complete, recognizable records; never infer correctness from wording.
    val verdicts = answers.map { answer ->
        answer.isCorrect ?: run {
            val review = answer.answerText.substringBefore(" | Note:").trim()
            when {
                review.endsWith("(Correct ✅)") -> true
                review.contains("(Incorrect ❌ • Correct: ") && review.endsWith(")") -> false
                else -> return null
            }
        }
    }
    return CorrectAnswerScore(verdicts.count { it }, verdicts.size)
}

fun ExamSubmission.withCorrectAnswerScore(): ExamSubmission {
    if (!isSelfPracticeResult()) return this
    val score = correctAnswerScore()
    return copy(grade = score?.percentage,
        examId = examId?.replace(Regex("\\s*\\(\\d+(?:\\.\\d+)?%\\)\\s*$"), ""),
        feedback = if (score != null && feedback?.startsWith("Self-Practice:") == true)
            "Self-Practice: ${score.correct}/${score.total} Correct" else feedback,
        correctAnswerCount = score?.correct ?: correctAnswerCount,
        totalQuestionCount = score?.total ?: totalQuestionCount)
}

fun selfPracticeOverviewScore(submissions: List<ExamSubmission>): CorrectAnswerScore? {
    val scores = submissions.mapNotNull { it.correctAnswerScore() }
    if (scores.isEmpty()) return null
    return CorrectAnswerScore(scores.sumOf { it.correct }, scores.sumOf { it.total })
}
