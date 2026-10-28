package com.jubayer.cheatlock.model

data class Exam(
    val id: String? = null,
    val title: String = "Untitled Exam",
    val durationMinutes: Int = 60,
    val lockAnswers: Boolean = false,
    val status: ExamStatus = ExamStatus.DRAFT,
    val scheduledStartAt: String? = null,
    val scheduledEndAt: String? = null,
    val startedAt: String? = null,
    val endedAt: String? = null,
    val archivedAt: String? = null,
    val questions: List<ExamQuestion> = emptyList(),
    val assignedStudents: List<String> = emptyList(),
    val communityStudents: List<String> = emptyList(),
    val classIds: List<String> = emptyList(),
    val accessCode: String? = null,
    val accessLink: String? = null,
    val useCommunity: Boolean = false
)

data class ExamQuestion(
    val type: QuestionType = QuestionType.CQ,
    val text: String,
    val options: List<String> = emptyList(),
    val optionIds: List<String> = emptyList(),
    val correctAnswer: String = ""
)

enum class QuestionType {
    MCQ,
    CQ
}

// Normal teacher-exam JSON omits optionIds. Gson can bypass Kotlin constructor
// defaults, so the declared non-null list can still be null after deserialization.
internal fun ExamQuestion.optionIdAt(index: Int): String? = optionIds.orEmpty().getOrNull(index)

enum class ExamStatus {
    DRAFT,
    SCHEDULED,
    LIVE,
    ENDED,
    ARCHIVED
}
