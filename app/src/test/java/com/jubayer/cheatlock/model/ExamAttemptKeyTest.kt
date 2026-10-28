package com.jubayer.cheatlock.model
import org.junit.Assert.*
import org.junit.Test

class ExamAttemptKeyTest {
    @Test fun separatesStudentsExamsResetsAndQuestionIndexes() {
        val base = ExamAttemptKey.from("student-a", "exam-a", 100)!!
        val keys = listOf(base.answerKey(0), base.answerKey(30),
            ExamAttemptKey.from("student-b", "exam-a", 100)!!.answerKey(0),
            ExamAttemptKey.from("student-a", "exam-b", 100)!!.answerKey(0),
            ExamAttemptKey.from("student-a", "exam-a", 200)!!.answerKey(0))
        assertEquals(keys.size, keys.toSet().size)
        assertEquals(base.answerKey(0), ExamAttemptKey.from("student-a", "exam-a", 100)!!.answerKey(0))
        assertFalse(base.answerKey(0).contains("student-a"))
    }
    @Test fun absentIdentityNeverFallsBackToGlobalQuestionKeys() {
        assertNull(ExamAttemptKey.from("", "exam", 1))
        assertNull(ExamAttemptKey.from("s", null, 1))
        assertNull(ExamAttemptKey.from("s", "exam", null))
        assertNull(ExamAttemptKey.from("s", "exam", 0))
    }
    @Test fun delimitersInsideIdentifiersCannotAliasAnotherScope() {
        assertNotEquals(ExamAttemptKey.from("a:b", "c", 1)!!.prefix,
            ExamAttemptKey.from("a", "b:c", 1)!!.prefix)
    }
}