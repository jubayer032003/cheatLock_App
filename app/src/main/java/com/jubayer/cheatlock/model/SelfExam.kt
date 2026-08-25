package com.jubayer.cheatlock.model

data class SelfExamClass(
    val id: String,
    val name: String,
    val slug: String = "",
    val displayOrder: Int = 0,
    val isActive: Boolean = true
)

data class SelfExamSubject(
    val id: String,
    val classId: String,
    val name: String,
    val slug: String = "",
    val code: String = "",
    val displayOrder: Int = 0,
    val isActive: Boolean = true
)

data class SelfExamChapter(
    val id: String,
    val subjectId: String,
    val name: String,
    val slug: String = "",
    val chapterNumber: Int? = null,
    val displayOrder: Int = 0,
    val isActive: Boolean = true
)

data class ActiveSelfExamOption(
    val id: String,
    val text: String,
    val displayOrder: Int = 0
)

data class ActiveSelfExamQuestion(
    val id: String,
    val classId: String,
    val subjectId: String,
    val chapterId: String? = null,
    val questionType: String,
    val questionText: String,
    val difficulty: String,
    val marks: Double,
    val explanation: String = "",
    val source: String = "",
    val status: String = "",
    val options: List<ActiveSelfExamOption> = emptyList(),
    val displayOrder: Int = 0,
    val createdAt: String? = null,
    val updatedAt: String? = null
)

data class SelfExamReviewOption(
    val id: String,
    val text: String,
    val displayOrder: Int = 0,
    val isCorrect: Boolean = false
)

data class SelfExamReviewQuestion(
    val id: String,
    val classId: String,
    val subjectId: String,
    val chapterId: String? = null,
    val questionType: String,
    val questionText: String,
    val difficulty: String,
    val marks: Double,
    val explanation: String = "",
    val source: String = "",
    val status: String = "",
    val options: List<SelfExamReviewOption> = emptyList(),
    val displayOrder: Int = 0,
    val createdAt: String? = null,
    val updatedAt: String? = null
)

data class SelfExamSession(
    val id: String,
    val studentId: String,
    val classId: String,
    val subjectId: String,
    val chapterId: String? = null,
    val durationMinutes: Int,
    val questionCount: Int,
    val difficultyMode: String,
    val status: String,
    val startedAt: String? = null,
    val expiresAt: String? = null,
    val submittedAt: String? = null,
    val score: Double = 0.0,
    val totalMarks: Double = 0.0,
    val createdAt: String? = null,
    val updatedAt: String? = null
)

data class SelfExamAnswer(
    val id: String? = null,
    val sessionId: String? = null,
    val questionId: String,
    val selectedOptionId: String? = null,
    val answerText: String = "",
    val isCorrect: Boolean? = null,
    val marksAwarded: Double? = null,
    val answeredAt: String? = null,
    val updatedAt: String? = null
)

data class CreateSelfExamSessionRequest(
    val classId: String,
    val subjectId: String,
    val chapterId: String? = null,
    val durationMinutes: Int,
    val questionCount: Int,
    val difficultyMode: String
)

data class SaveSelfExamAnswerRequest(
    val questionId: String,
    val selectedOptionId: String? = null,
    val answerText: String? = null
)

data class SelfExamClassesResponse(val classes: List<SelfExamClass>)
data class SelfExamSubjectsResponse(val subjects: List<SelfExamSubject>)
data class SelfExamChaptersResponse(val chapters: List<SelfExamChapter>)
data class SelfExamSessionResponse(val session: SelfExamSession?)
data class SelfExamAnswerResponse(val answer: SelfExamAnswer)

data class SelfExamPayloadResponse(
    val session: SelfExamSession,
    val questions: List<ActiveSelfExamQuestion>,
    val answers: List<SelfExamAnswer> = emptyList(),
    val serverTime: String
)

data class SelfExamResult(
    val score: Double,
    val totalMarks: Double,
    val percentage: Int,
    val correctCount: Int,
    val incorrectCount: Int,
    val unansweredCount: Int
)

data class SelfExamResultResponse(
    val session: SelfExamSession,
    val questions: List<SelfExamReviewQuestion>,
    val answers: List<SelfExamAnswer> = emptyList(),
    val serverTime: String,
    val result: SelfExamResult
)
