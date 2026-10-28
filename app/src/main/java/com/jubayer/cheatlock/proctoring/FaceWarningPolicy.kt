package com.jubayer.cheatlock.proctoring

import com.jubayer.cheatlock.ui.FaceStatus

/** Keeps the existing face rules; operational failures never constitute observations. */
fun shouldCountFaceWarning(
    status: FaceStatus,
    sensorHealth: CameraSensorHealth,
    monitoringEnabled: Boolean,
    hasFaceBeenDetectedOnce: Boolean
): Boolean = monitoringEnabled &&
    sensorHealth == CameraSensorHealth.HEALTHY &&
    status in setOf(FaceStatus.NO_FACE, FaceStatus.MULTIPLE_FACES, FaceStatus.LOOKING_AWAY) &&
    (hasFaceBeenDetectedOnce || status == FaceStatus.MULTIPLE_FACES)
