package com.jubayer.cheatlock.model

enum class SelfExamTrack(val code: String, val titleEn: String, val titleBn: String) {
    ACADEMIC("academic", "Academic (Class 1-12)", "একাডেমিক (১ম-১২শ শ্রেণি)"),
    ADMISSION("admission", "Admission Test", "ভর্তি পরীক্ষা (বিশ্ববিদ্যালয় / মেডিকেল / ইঞ্জিনিয়ারিং)")
}

enum class AcademicStream(val code: String, val titleEn: String, val titleBn: String, val icon: String) {
    SCIENCE("science", "Science", "বিজ্ঞান", "🔬"),
    COMMERCE("commerce", "Commerce / Business", "ব্যবসায় শিক্ষা", "📊"),
    ARTS("arts", "Humanities / Arts", "মানবিক", "🎨")
}

enum class AdmissionTrack(val code: String, val titleEn: String, val titleBn: String, val icon: String) {
    VARSITY("varsity", "Varsity Admission", "বিশ্ববিদ্যালয় ভর্তি", "🏛️"),
    MEDICAL("medical", "Medical & Dental", "মেডিকেল ও ডেন্টাল", "🩺"),
    ENGINEERING("engineering", "Engineering", "ইঞ্জিনিয়ারিং", "⚙️")
}

enum class VarsityUnit(val code: String, val titleEn: String, val titleBn: String, val subtitle: String) {
    UNIT_A("unit_a", "A Unit (KA Unit)", "ক ইউনিট", "Science / Engineering Faculty"),
    UNIT_B("unit_b", "B Unit (KHA Unit)", "খ ইউনিট", "Arts & Social Science"),
    UNIT_C("unit_c", "C Unit (GA Unit)", "গ ইউনিট", "Business Studies / Commerce"),
    UNIT_D("unit_d", "D Unit (GHA Unit)", "ঘ ইউনিট", "Combined / Faculty Change"),
    IBA("iba", "IBA / BUP", "আইবিএ ও বিইউপি", "Business Administration")
}

data class SelfExamClass(
    val id: String,
    val name: String?,
    val slug: String? = null,
    val icon: String? = null,
    val color: String? = null,
    val description: String? = null,
    val track: String? = null, // "academic" or "admission"
    val stream: String? = null,     // "science", "commerce", "arts"
    val unit: String? = null,       // "unit_a", "unit_b", etc.
    val displayOrder: Int = 0,
    val isActive: Boolean = true
)

data class SelfExamSubject(
    val id: String,
    val classId: String?,
    val categoryId: String? = null,
    val parentId: String? = null,
    val name: String?,
    val slug: String? = null,
    val code: String? = null,
    val stream: String? = null,
    val unit: String? = null,
    val icon: String? = null,
    val type: String? = null,
    val displayOrder: Int = 0,
    val isActive: Boolean = true
)

data class SelfExamChapter(
    val id: String,
    val subjectId: String?,
    val categoryId: String? = null,
    val parentId: String? = null,
    val name: String?,
    val slug: String? = null,
    val chapterNumber: Int? = null,
    val type: String? = null,
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
    val updatedAt: String? = null,
    val bulkSubmissionVersion: Int? = null,
    val checkpointVersion: Int? = null
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
    val nodeId: String? = chapterId ?: subjectId,
    val durationMinutes: Int,
    val questionCount: Int,
    val difficultyMode: String,
    val checkpointVersion: Int? = null
)

data class SaveSelfExamAnswerRequest(
    val questionId: String,
    val selectedOptionId: String? = null,
    val answerText: String? = null
)

data class SelfExamClassesResponse(val classes: List<SelfExamClass>)
data class SelfExamSubjectsResponse(val subjects: List<SelfExamSubject>)
data class SelfExamChaptersResponse(val chapters: List<SelfExamChapter>)
data class SelfExamCategoriesResponse(val categories: List<SelfExamClass>)
data class SelfExamNodesResponse(val nodes: List<SelfExamSubject>)
data class SelfExamSessionResponse(val session: SelfExamSession?)
data class SelfExamAnswerResponse(val answer: SelfExamAnswer)

data class SelfExamPayloadResponse(
    val session: SelfExamSession,
    val questions: List<ActiveSelfExamQuestion>,
    val answers: List<SelfExamAnswer> = emptyList(),
    val serverTime: String,
    @Transient var timingAnchorElapsedRealtime: Long? = null
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
