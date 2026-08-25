package com.jubayer.cheatlock.util

import org.junit.Assert.assertEquals
import org.junit.Test

class SuspicionScoreCalculatorTest {
    @Test
    fun eachAlertAddsTwentyPointsAcrossWarningTypes() {
        assertEquals(20, SuspicionScoreCalculator.calculateScore(appSwitchWarnings = 1))
        assertEquals(20, SuspicionScoreCalculator.calculateScore(faceMissingWarnings = 1))
        assertEquals(20, SuspicionScoreCalculator.calculateScore(audioWarnings = 1))
        assertEquals(20, SuspicionScoreCalculator.calculateScore(phoneWarnings = 1))
    }

    @Test
    fun fiveAlertsReachMaximumSuspicionScore() {
        assertEquals(
            100,
            SuspicionScoreCalculator.calculateScore(
                appSwitchWarnings = 2,
                faceMissingWarnings = 1,
                audioWarnings = 1,
                phoneWarnings = 1,
            ),
        )
    }

    @Test
    fun scoreNeverExceedsOneHundred() {
        assertEquals(100, SuspicionScoreCalculator.calculateScore(appSwitchWarnings = 99))
    }
}
