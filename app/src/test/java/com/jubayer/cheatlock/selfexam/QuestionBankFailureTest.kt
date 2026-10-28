package com.jubayer.cheatlock.selfexam

import com.jubayer.cheatlock.data.BackendRequestException
import com.jubayer.cheatlock.data.QuestionBankFailure
import com.jubayer.cheatlock.ui.SelfExamErrorCategory
import com.jubayer.cheatlock.ui.mapSelfExamError
import org.junit.Assert.*
import org.junit.Test

class QuestionBankFailureTest {
    @Test fun legacyAdviceIsSanitizedAndHttpIdentityPreserved() {
        val e = BackendRequestException.fromJson(503,
            """{"code":"PGRST205","message":"Question Bank Supabase migration has not been applied. Apply destructive.sql"}""", "http://localhost:3000/")
        val p = mapSelfExamError(e)
        assertEquals("PGRST205", e.backendCode); assertEquals(503, e.statusCode)
        assertEquals("http://localhost:3000/", e.serverUrl)
        assertEquals(SelfExamErrorCategory.SERVER, p.category)
        assertEquals("Question Bank Unavailable", p.title)
        assertFalse(p.message.contains("Apply")); assertFalse(p.message.contains("migration"))
    }
    @Test fun databasePermissionNeverRequestsCameraPermission() {
        val p = mapSelfExamError(BackendRequestException.fromResponse(403, "42501", "permission denied", ""))
        assertEquals(SelfExamErrorCategory.SERVER, p.category); assertFalse(p.message.contains("camera"))
    }
    @Test fun missingConfigurationIsDistinct() {
        val e = BackendRequestException.fromResponse(503, "SUPABASE_NOT_CONFIGURED", null, "")
        assertEquals(QuestionBankFailure.CONFIGURATION, e.questionBankFailure)
        assertTrue(e.message!!.contains("not configured"))
    }
    @Test fun knownSchemaCodesRemainDistinctWithoutProviderDetails() {
        for (c in listOf("PGRST205", "PGRST204", "42P01", "42703")) {
            val e = BackendRequestException.fromResponse(500, c, "private details", "")
            assertEquals(c, e.backendCode); assertEquals(QuestionBankFailure.SCHEMA, e.questionBankFailure)
            assertFalse(e.message!!.contains("private"))
        }
    }
    @Test fun unknownServerFailureDoesNotExposeRawResponseOrBecomeCameraError() {
        val e = BackendRequestException.fromJson(500, """{"code":"XX000","message":"camera permission secret=value"}""", "")
        val p = mapSelfExamError(e)
        assertEquals(SelfExamErrorCategory.SERVER, p.category)
        assertFalse(p.message.contains("secret")); assertFalse(p.message.contains("camera"))
    }
    @Test fun validationJsonEscapesAreDecoded() {
        val e = BackendRequestException.fromJson(400, """{"code":"BAD_REQUEST","message":"Choose a \"subject\" first"}""", "")
        assertEquals("Choose a \"subject\" first", e.message); assertNull(e.questionBankFailure)
    }
    @Test fun invalidJsonAndUnexpectedTypesDoNotLeakProxyOutput() {
        for (body in listOf("<html>private proxy output</html>", "{", "[]", """{"message":{"private":"value"},"code":[]} """)) {
            val e = BackendRequestException.fromJson(502, body, "")
            assertNull(e.backendCode); assertFalse(e.message!!.contains("private"))
            assertEquals(SelfExamErrorCategory.SERVER, mapSelfExamError(e).category)
        }
    }
    @Test fun retryActionIsPreserved() {
        var retried = false
        val p = mapSelfExamError(BackendRequestException.fromResponse(503, "PGRST205", null, ""), onRetry = { retried = true })
        assertEquals("Try Again", p.primaryButtonText); p.onPrimaryAction!!.invoke(); assertTrue(retried)
    }
}
