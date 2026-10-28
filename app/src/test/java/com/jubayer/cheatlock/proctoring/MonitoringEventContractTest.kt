package com.jubayer.cheatlock.proctoring

import com.google.gson.Gson
import com.google.gson.JsonParser
import com.jubayer.cheatlock.data.ProctoringEventRequest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

class MonitoringEventContractTest {
    private val gson = Gson()
    private val attempt = 1_793_000_000_000L
    private val exam = "64a100000000000000000201"
    private val jpeg = "data:image/jpeg;base64,/9j/AA==" // Synthetic, not device capture.

    private fun fixtures(): List<ProctoringEventRequest> = listOf(
        ProctoringEventRequest("student_joined_exam", exam, attemptStartedAt = attempt, eventId = "fixture-join"),
        ProctoringEventRequest("camera_preview_updated", exam, attemptStartedAt = attempt, idempotencyKey = "fixture-camera", evidenceId = "fixture-camera", previewBase64 = jpeg, captureSource = MonitoringSnapshotSource.CAMERA.wireName),
        ProctoringEventRequest("screen_telemetry_uploaded", exam, attemptStartedAt = attempt, idempotencyKey = "fixture-screen", evidenceId = "fixture-screen", base64 = jpeg, captureSource = MonitoringSnapshotSource.SCREEN.wireName, capturedAt = java.time.Instant.ofEpochMilli(attempt + 1_000).toString()),
        ProctoringEventRequest("ai_alert_created", exam, attemptStartedAt = attempt, eventId = "fixture-face", mutationId = "fixture-face", scoreDelta = 20, suspicionScore = 20, latestAlert = "Face not detected in camera preview."),
        ProctoringEventRequest("ai_alert_created", exam, attemptStartedAt = attempt, eventId = "fixture-audio", mutationId = "fixture-audio", scoreDelta = 20, suspicionScore = 40, latestAlert = "High ambient noise detected."),
        ProctoringEventRequest("ai_alert_created", exam, attemptStartedAt = attempt, eventId = "fixture-security", mutationId = "fixture-security", scoreDelta = 20, suspicionScore = 60, latestAlert = "Student switched away from the exam app.")
    )

    @Test
    fun numericAttemptAndIndependentSourcePayloadsMatchTheBackendContract() {
        val events = fixtures()
        for (request in events) {
            val json = JsonParser.parseString(gson.toJson(request)).asJsonObject
            assertTrue(json["attemptStartedAt"].asJsonPrimitive.isNumber)
            assertEquals(attempt, json["attemptStartedAt"].asLong)
            assertEquals(exam, json["examId"].asString)
            assertEquals(gson.toJson(request), gson.toJson(request.copy()))
        }
        val camera = JsonParser.parseString(gson.toJson(events[1])).asJsonObject
        assertTrue(camera.has("previewBase64"))
        assertFalse(camera.has("base64"))
        val screen = JsonParser.parseString(gson.toJson(events[2])).asJsonObject
        assertTrue(screen.has("base64"))
        assertFalse(screen.has("previewBase64"))
        assertTrue(screen["capturedAt"].asString.endsWith("Z"))
        // Explicit optional output enables the local Node transport contract test.
        System.getenv("CHEATLOCK_MONITORING_FIXTURES_PATH")?.takeIf { it.isNotBlank() }?.let {
            val output = File(it)
            output.parentFile?.mkdirs()
            output.writeText(gson.toJson(events))
        }
    }

    @Test
    fun allAlertTypesRetainOneStableMutationIdentityAcrossRetries() {
        for (event in fixtures().filter { it.eventName == "ai_alert_created" }) {
            assertEquals(event.eventId, event.mutationId)
            assertEquals(20, event.scoreDelta)
            assertEquals(gson.toJson(event), gson.toJson(event.copy()))
        }
    }
}
