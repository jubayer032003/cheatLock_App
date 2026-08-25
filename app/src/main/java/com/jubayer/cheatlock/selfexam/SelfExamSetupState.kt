package com.jubayer.cheatlock.selfexam

data class SelfExamSetupSelection(
    val classId: String? = null,
    val subjectId: String? = null,
    val chapterId: String? = null,
    val durationMinutes: Int = 20,
    val questionCount: Int = 10,
    val difficultyMode: String = "mixed"
) {
    fun selectClass(nextClassId: String) = copy(
        classId = nextClassId,
        subjectId = null,
        chapterId = null
    )

    fun selectSubject(nextSubjectId: String) = copy(
        subjectId = nextSubjectId,
        chapterId = null
    )

    fun selectChapter(nextChapterId: String?) = copy(chapterId = nextChapterId)

    fun canStart(): Boolean {
        return !classId.isNullOrBlank() &&
            !subjectId.isNullOrBlank() &&
            durationMinutes in 5..180 &&
            questionCount in 1..100 &&
            difficultyMode in setOf("mixed", "easy", "medium", "hard")
    }
}
