package com.jubayer.cheatlock.selfexam

import com.jubayer.cheatlock.model.SelfExamTrack
import org.junit.Assert.*
import org.junit.Test

/** Existing state contracts exercised by the redesigned presentation; no network or Android device. */
class SelfExamPresentationContractTest {
    private val selected = SelfExamSetupSelection(classId = "class", subjectId = "subject",
        chapterId = "chapter", nodeId = "chapter", selectedChapterIds = setOf("chapter"))

    @Test fun trackSwitchClearsDependentSelectionsAndPreservesConfiguration() {
        val next = selected.selectTrack(SelfExamTrack.ADMISSION)
        assertNull(next.classId)
        assertNull(next.subjectId)
        assertNull(next.chapterId)
        assertNull(next.nodeId)
        assertTrue(next.selectedChapterIds.isEmpty())
        assertEquals(selected.questionCount, next.questionCount)
        assertEquals(selected.durationMinutes, next.durationMinutes)
    }

    @Test fun targetChangeClearsSubjectAndChapter() {
        val next = selected.selectTargetCode("next-target", "next-class")
        assertEquals("next-class", next.classId)
        assertNull(next.subjectId)
        assertNull(next.chapterId)
        assertNull(next.nodeId)
    }

    @Test fun subjectChangeResetsChapterAndUsesSubjectNode() {
        val next = selected.selectSubject("next-subject")
        assertEquals("next-subject", next.subjectId)
        assertEquals("next-subject", next.nodeId)
        assertNull(next.chapterId)
        assertTrue(next.selectedChapterIds.isEmpty())
    }

    @Test fun chapterSelectionReplacesRatherThanAdds() {
        val next = selected.selectChapter("next-chapter")
        assertEquals(setOf("next-chapter"), next.selectedChapterIds)
        assertEquals("next-chapter", next.chapterId)
        assertEquals("next-chapter", next.nodeId)
    }

    @Test fun fullSubjectClearsChapterAndUsesSubjectNode() {
        val next = selected.selectChapter(null)
        assertNull(next.chapterId)
        assertTrue(next.selectedChapterIds.isEmpty())
        assertEquals("subject", next.nodeId)
    }

    @Test fun mixedCountIsFixedUnderEveryPreset() {
        for (preset in listOf(1, 10, 20, 30, 40, 50, 100)) {
            val next = selected.withQuestionCount(preset)
            assertEquals(100, next.questionCount)
            assertEquals(60, next.durationMinutes)
        }
    }

    @Test fun leavingMixedClampsCountToFiftyAndComputesDuration() {
        for ((difficulty, minutes) in listOf("easy" to 25, "medium" to 38, "hard" to 50)) {
            val next = selected.withDifficultyMode(difficulty)
            assertEquals(50, next.questionCount)
            assertEquals(minutes, next.durationMinutes)
        }
    }

    @Test fun shortPracticeRetainsMinimumFiveMinutes() {
        for (difficulty in listOf("easy", "medium", "hard")) {
            val next = selected.withDifficultyMode(difficulty).withQuestionCount(1)
            assertEquals(1, next.questionCount)
            assertEquals(5, next.durationMinutes)
        }
    }

    @Test fun returningToMixedRestoresOriginalHundredSixtyContract() {
        val next = selected.withDifficultyMode("hard").withQuestionCount(10).withDifficultyMode("mixed")
        assertEquals(100, next.questionCount)
        assertEquals(60, next.durationMinutes)
    }

    @Test fun startEligibilityStillRequiresTheExistingHierarchy() {
        assertTrue(selected.canStart())
        assertFalse(SelfExamSetupSelection().canStart())
        assertFalse(SelfExamSetupSelection(classId = "class").canStart())
    }
}
