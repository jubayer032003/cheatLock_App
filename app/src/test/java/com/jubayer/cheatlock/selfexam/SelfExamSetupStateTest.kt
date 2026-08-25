package com.jubayer.cheatlock.selfexam

import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class SelfExamSetupStateTest {
    @Test
    fun selectingClassResetsSubjectAndChapter() {
        val next = SelfExamSetupSelection(
            classId = "class-a",
            subjectId = "subject-a",
            chapterId = "chapter-a"
        ).selectClass("class-b")

        assertTrue(next.classId == "class-b")
        assertNull(next.subjectId)
        assertNull(next.chapterId)
    }

    @Test
    fun selectingSubjectResetsChapter() {
        val next = SelfExamSetupSelection(
            classId = "class-a",
            subjectId = "subject-a",
            chapterId = "chapter-a"
        ).selectSubject("subject-b")

        assertTrue(next.subjectId == "subject-b")
        assertNull(next.chapterId)
    }

    @Test
    fun canStartRequiresHierarchyAndValidConfiguration() {
        assertTrue(
            SelfExamSetupSelection(
                classId = "class-a",
                subjectId = "subject-a",
                durationMinutes = 20,
                questionCount = 10,
                difficultyMode = "mixed"
            ).canStart()
        )

        assertFalse(SelfExamSetupSelection(classId = "class-a").canStart())
        assertFalse(SelfExamSetupSelection(classId = "class-a", subjectId = "subject-a", durationMinutes = 4).canStart())
        assertFalse(SelfExamSetupSelection(classId = "class-a", subjectId = "subject-a", questionCount = 0).canStart())
        assertFalse(SelfExamSetupSelection(classId = "class-a", subjectId = "subject-a", difficultyMode = "expert").canStart())
    }
}
