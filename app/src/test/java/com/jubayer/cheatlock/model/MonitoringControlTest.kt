package com.jubayer.cheatlock.model
import com.jubayer.cheatlock.data.BackendRequestException
import org.junit.Assert.*
import org.junit.Test

class MonitoringControlTest {
    @Test fun teacherLifecycleErrorsProduceSpecificActions() {
        assertEquals(MonitoringControl.END_EXAM, monitoringControl("EXAM_NOT_LIVE"))
        assertEquals(MonitoringControl.RESET_ATTEMPT, monitoringControl("SESSION_RESET"))
        assertEquals(MonitoringControl.RESET_ATTEMPT, monitoringControl("STALE_EXAM_ATTEMPT"))
        assertEquals(MonitoringControl.LOCKED_ATTEMPT, monitoringControl("SESSION_LOCKED"))
    }
    @Test fun networkAuthAndRateLimitFailuresNeverEndTheExamOrImplyMisconduct() {
        for (code in listOf(null, "RATE_LIMITED", "AUTH_INVALID", "SESSION_FINALIZED", "SERVER_ERROR", "UNKNOWN")) {
            assertEquals(MonitoringControl.KEEP_RUNNING, monitoringControl(code))
        }
    }
    @Test fun actualBackendFailureDecodingRetainsTheControlCode() {
        val failure = BackendRequestException.fromJson(410,
            """{"code":"EXAM_NOT_LIVE","message":"Exam ended"}""", "https://synthetic.invalid/")
        assertEquals(MonitoringControl.END_EXAM, monitoringControl(failure.backendCode))
    }
}