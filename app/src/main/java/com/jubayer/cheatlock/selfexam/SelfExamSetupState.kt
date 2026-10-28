package com.jubayer.cheatlock.selfexam

import com.jubayer.cheatlock.model.AcademicStream
import com.jubayer.cheatlock.model.AdmissionTrack
import com.jubayer.cheatlock.model.SelfExamTrack
import com.jubayer.cheatlock.model.VarsityUnit

data class SelfExamSetupSelection(
    val track: SelfExamTrack = SelfExamTrack.ACADEMIC,
    val selectedTargetCode: String? = null, // "CLASS_6", "SSC", "HSC", "VARSITY", "MEDICAL", "ENGINEERING"
    val selectedStream: AcademicStream? = null, // SCIENCE, COMMERCE, ARTS
    val selectedAdmissionTrack: AdmissionTrack? = null, // VARSITY, MEDICAL, ENGINEERING
    val selectedVarsityUnit: VarsityUnit? = null, // UNIT_A, UNIT_B, UNIT_C, UNIT_D, IBA
    val classId: String? = null,
    val subjectId: String? = null,
    val chapterId: String? = null,
    val selectedChapterIds: Set<String> = emptySet(),
    val nodeId: String? = null,
    val durationMinutes: Int = 60,
    val questionCount: Int = 100,
    val difficultyMode: String = "mixed"
) {
    fun selectTrack(nextTrack: SelfExamTrack) = copy(
        track = nextTrack,
        selectedTargetCode = null,
        selectedStream = null,
        selectedAdmissionTrack = null,
        selectedVarsityUnit = null,
        classId = null,
        subjectId = null,
        chapterId = null,
        selectedChapterIds = emptySet(),
        nodeId = null
    )

    fun selectTargetCode(targetCode: String, resolvedClassId: String?) = copy(
        selectedTargetCode = targetCode,
        classId = resolvedClassId ?: classId,
        selectedStream = null,
        selectedAdmissionTrack = null,
        selectedVarsityUnit = null,
        subjectId = null,
        chapterId = null,
        selectedChapterIds = emptySet(),
        nodeId = null
    )

    fun selectStream(stream: AcademicStream, resolvedClassId: String? = null) = copy(
        selectedStream = stream,
        classId = resolvedClassId ?: classId,
        subjectId = null,
        chapterId = null,
        selectedChapterIds = emptySet(),
        nodeId = null
    )

    fun selectAdmissionTrack(admissionTrack: AdmissionTrack, resolvedClassId: String? = null) = copy(
        selectedAdmissionTrack = admissionTrack,
        selectedVarsityUnit = null,
        classId = resolvedClassId ?: classId,
        subjectId = null,
        chapterId = null,
        selectedChapterIds = emptySet(),
        nodeId = null
    )

    fun selectVarsityUnit(unit: VarsityUnit, resolvedClassId: String? = null) = copy(
        selectedVarsityUnit = unit,
        classId = resolvedClassId ?: classId,
        subjectId = null,
        chapterId = null,
        selectedChapterIds = emptySet(),
        nodeId = null
    )

    fun selectClass(nextClassId: String) = copy(
        classId = nextClassId,
        subjectId = null,
        chapterId = null,
        selectedChapterIds = emptySet(),
        nodeId = null
    )

    fun selectSubject(nextSubjectId: String) = copy(
        subjectId = nextSubjectId,
        chapterId = null,
        selectedChapterIds = emptySet(),
        nodeId = nextSubjectId
    )

    fun selectChapter(nextChapterId: String?) = copy(
        chapterId = nextChapterId,
        selectedChapterIds = if (nextChapterId != null) setOf(nextChapterId) else emptySet(),
        nodeId = nextChapterId ?: subjectId
    )

    fun toggleChapter(chapterId: String): SelfExamSetupSelection {
        val next = if (selectedChapterIds.contains(chapterId)) {
            selectedChapterIds - chapterId
        } else {
            selectedChapterIds + chapterId
        }
        return copy(
            selectedChapterIds = next,
            chapterId = next.firstOrNull(),
            nodeId = next.firstOrNull() ?: subjectId
        )
    }

    fun selectNode(
        categoryId: String,
        currentNodeId: String?,
        finalNodeId: String?
    ) = copy(
        classId = categoryId,
        subjectId = currentNodeId,
        chapterId = finalNodeId,
        nodeId = finalNodeId
    )

    fun withQuestionCount(nextQuestionCount: Int): SelfExamSetupSelection {
        if (difficultyMode == "mixed") {
            return copy(questionCount = 100, durationMinutes = 60)
        }
        val normalizedCount = nextQuestionCount.coerceIn(1, 100)
        return copy(
            questionCount = normalizedCount,
            durationMinutes = durationFor(normalizedCount, difficultyMode)
        )
    }

    fun withDifficultyMode(nextDifficultyMode: String): SelfExamSetupSelection {
        val normalizedDifficulty = if (nextDifficultyMode in VALID_DIFFICULTIES) nextDifficultyMode else "mixed"
        val normalizedCount = if (normalizedDifficulty == "mixed") 100 else questionCount.coerceIn(1, 50)
        return copy(
            difficultyMode = normalizedDifficulty,
            questionCount = normalizedCount,
            durationMinutes = durationFor(normalizedCount, normalizedDifficulty)
        )
    }

    fun canStart(): Boolean {
        return (!classId.isNullOrBlank() || !selectedTargetCode.isNullOrBlank()) &&
            (!nodeId.isNullOrBlank() || !subjectId.isNullOrBlank()) &&
            durationMinutes in 5..180 &&
            questionCount in 1..100 &&
            difficultyMode in VALID_DIFFICULTIES
    }

    companion object {
        private val VALID_DIFFICULTIES = setOf("mixed", "easy", "medium", "hard")

        fun durationFor(questionCount: Int, difficultyMode: String): Int {
            val count = questionCount.coerceIn(1, 100)
            val seconds = when (difficultyMode) {
                "easy" -> count * 30
                "medium" -> count * 45
                "hard" -> count * 60
                else -> return 60
            }
            return ((seconds + 59) / 60).coerceIn(5, 180)
        }
    }
}
