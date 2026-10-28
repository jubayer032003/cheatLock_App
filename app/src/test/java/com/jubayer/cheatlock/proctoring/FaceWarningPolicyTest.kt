package com.jubayer.cheatlock.proctoring

import com.jubayer.cheatlock.ui.FaceStatus
import com.jubayer.cheatlock.util.SuspicionScoreCalculator
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class FaceWarningPolicyTest {
    @Test
    fun operationalFailuresNeverCountEvenAfterAValidFace() {
        for (health in CameraSensorHealth.entries.filter { it != CameraSensorHealth.HEALTHY }) {
            for (status in FaceStatus.entries) assertFalse("$health/$status", shouldCountFaceWarning(status, health, true, true))
        }
    }

    @Test
    fun genuineMissingMultipleAndLookingAwayObservationsStillCount() {
        for (status in listOf(FaceStatus.NO_FACE, FaceStatus.MULTIPLE_FACES, FaceStatus.LOOKING_AWAY)) {
            assertTrue(shouldCountFaceWarning(status, CameraSensorHealth.HEALTHY, true, true))
        }
    }

    @Test
    fun initialFaceGateAndMultipleFaceExceptionRemainUnchanged() {
        assertFalse(shouldCountFaceWarning(FaceStatus.NO_FACE, CameraSensorHealth.HEALTHY, true, false))
        assertFalse(shouldCountFaceWarning(FaceStatus.LOOKING_AWAY, CameraSensorHealth.HEALTHY, true, false))
        assertTrue(shouldCountFaceWarning(FaceStatus.MULTIPLE_FACES, CameraSensorHealth.HEALTHY, true, false))
    }

    @Test
    fun disabledMonitoringAndNonViolationsDoNotCount() {
        for (status in FaceStatus.entries) assertFalse(shouldCountFaceWarning(status, CameraSensorHealth.HEALTHY, false, true))
        assertFalse(shouldCountFaceWarning(FaceStatus.CHECKING, CameraSensorHealth.HEALTHY, true, true))
        assertFalse(shouldCountFaceWarning(FaceStatus.FACE_FOUND, CameraSensorHealth.HEALTHY, true, true))
    }

    @Test
    fun cameraFailureAndRecoveryCannotManufactureAWarningOrScoreIncrement() {
        var warnings = 0
        val observations = listOf(
            FaceStatus.FACE_FOUND to CameraSensorHealth.HEALTHY,
            FaceStatus.CHECKING to CameraSensorHealth.ANALYZER_FAILED,
            FaceStatus.NO_FACE to CameraSensorHealth.FRAME_UNAVAILABLE,
            FaceStatus.NO_FACE to CameraSensorHealth.TEMPORARILY_UNAVAILABLE,
            FaceStatus.FACE_FOUND to CameraSensorHealth.HEALTHY
        )
        for ((status, health) in observations) if (shouldCountFaceWarning(status, health, true, true)) warnings++
        assertEquals(0, warnings)
        assertEquals(0, SuspicionScoreCalculator.calculateScore(faceMissingWarnings = warnings))
    }

    @Test
    fun aRealNoFaceObservationAfterRecoveryKeepsTheExistingTwentyPointRule() {
        val warnings = if (shouldCountFaceWarning(FaceStatus.NO_FACE, CameraSensorHealth.HEALTHY, true, true)) 1 else 0
        assertEquals(20, SuspicionScoreCalculator.calculateScore(faceMissingWarnings = warnings))
    }

    @Test
    fun healthyOptOutMatchesTheLegacySelfExamPredicateForEveryFaceState() {
        for (status in FaceStatus.entries) for (enabled in listOf(false, true)) for (seen in listOf(false, true)) {
            val legacy = enabled && status != FaceStatus.CHECKING && status != FaceStatus.FACE_FOUND && (seen || status == FaceStatus.MULTIPLE_FACES)
            assertEquals(legacy, shouldCountFaceWarning(status, CameraSensorHealth.HEALTHY, enabled, seen))
        }
    }
}
