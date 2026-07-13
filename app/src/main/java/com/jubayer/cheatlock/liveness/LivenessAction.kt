package com.jubayer.cheatlock.liveness

/**
 * Enumeration of randomized challenge actions for Face Liveness Detection.
 * Each action contains a user-facing instruction.
 */
enum class LivenessAction(val instruction: String) {
    BLINK("Blink your eyes"),
    SMILE("Smile warmly"),
    TURN_LEFT("Turn your head left"),
    TURN_RIGHT("Turn your head right"),
    LOOK_UP("Look up slightly"),
    LOOK_DOWN("Look down slightly")
}
