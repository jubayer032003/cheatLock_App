package com.jubayer.cheatlock.util

import org.junit.Assert.*
import org.junit.Test

class CrashSupportCodeTest {
    private fun frame(name: String, line: Int) = StackTraceElement(name, "render", "/private/path.kt", line)

    @Test fun identifiesTheAppFrameWithoutExposingExceptionText() {
        val error = NullPointerException("token=secret account=student@example.test")
        error.stackTrace = arrayOf(frame("kotlin.collections.CollectionsKt", 1),
            frame("com.jubayer.cheatlock.ui.ExamScreenKt", 119))
        assertEquals("CL-EXAM-NPE-119", CrashSupportCode.from(error))
    }

    @Test fun unwrapsAnApplicationFailureInsteadOfReportingTheWrapper() {
        val cause = SecurityException("private media URL")
        cause.stackTrace = arrayOf(frame("com.jubayer.cheatlock.proctoring.ScreenCaptureService", 58))
        val wrapper = IllegalStateException("wrapper", cause)
        wrapper.stackTrace = arrayOf(frame("com.jubayer.cheatlock.MainActivity", 900))
        assertEquals("CL-SCREEN-SECURITY-58", CrashSupportCode.from(wrapper))
    }

    @Test fun rejectsUntrustedIntentText() {
        for (value in listOf(null, "", "token=secret", "CL-EXAM-NPE-119\nsecret", "CL-EXAM-NPE-999999")) {
            assertEquals("CL-APP-OTHER-0", CrashSupportCode.sanitize(value))
        }
        assertEquals("CL-EXAM-NPE-119", CrashSupportCode.sanitize("CL-EXAM-NPE-119"))
    }

    @Test fun handlesMissingFramesAndUnknownLineNumbers() {
        val error = IllegalArgumentException("private")
        error.stackTrace = emptyArray()
        assertEquals("CL-APP-ARG-0", CrashSupportCode.from(error))
        error.stackTrace = arrayOf(frame("com.jubayer.cheatlock.ui.CameraPreviewKt", -1))
        assertEquals("CL-CAMERA-ARG-0", CrashSupportCode.from(error))
    }

    @Test fun causeCyclesAreBounded() {
        val first = IllegalStateException()
        val second = IllegalStateException()
        first.initCause(second)
        second.initCause(first)
        assertTrue(CrashSupportCode.sanitize(CrashSupportCode.from(first)).startsWith("CL-"))
    }
    @Test fun questionConstructorErrorsRemainIdentifiableWhenDexReportsLineTwo() {
        val error = NullPointerException("Parameter specified as non-null is null: method com.jubayer.cheatlock.ui.IndexedQuestion.<init>, parameter type")
        error.stackTrace = arrayOf(StackTraceElement("com.jubayer.cheatlock.ui.IndexedQuestion", "<init>", "ExamScreen.kt", 2))
        assertEquals("CL-EXAM-QTYPE-2", CrashSupportCode.from(error))
        assertEquals("CL-EXAM-QTYPE-2", CrashSupportCode.sanitize(CrashSupportCode.from(error)))
    }

    @Test fun unrecognizedNullParameterTextCannotLeakIntoTheCode() {
        val error = NullPointerException("secret, parameter private-account@example.test")
        error.stackTrace = arrayOf(StackTraceElement("com.jubayer.cheatlock.ui.IndexedQuestion", "<init>", "/private/path.kt", 2))
        assertEquals("CL-EXAM-NPE-2", CrashSupportCode.from(error))
    }
}