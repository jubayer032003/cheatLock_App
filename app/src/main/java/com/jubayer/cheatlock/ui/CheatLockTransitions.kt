package com.jubayer.cheatlock.ui

import androidx.compose.animation.*
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.FastOutLinearInEasing
import androidx.compose.animation.core.LinearOutSlowInEasing
import androidx.compose.animation.core.tween

object CheatLockMotion {
    const val ScreenEnterMs = 300
    const val ScreenExitMs = 240
    const val TabEnterMs = 240
    const val TabExitMs = 190
    const val AuthEnterMs = 280
    const val AuthExitMs = 220
    const val ModalEnterMs = 220
    const val ModalExitMs = 160
    const val MicroEnterMs = 190
    const val MicroExitMs = 150
    const val ReducedEnterMs = 120
    const val ReducedExitMs = 90

    const val ScreenEnterSlideDivisor = 16
    const val ScreenExitSlideDivisor = 24
    const val TabSlideDivisor = 16
    const val AuthSlideDivisor = 12
}

/** A calm crossfade from the startup branding into the ready screen. */
fun cheatLockSplashTransition(reducedMotion: Boolean = false): ContentTransform =
    fadeIn(animationSpec = tween(if (reducedMotion) CheatLockMotion.ReducedEnterMs else 260))
        .togetherWith(fadeOut(animationSpec = tween(if (reducedMotion) CheatLockMotion.ReducedExitMs else 220)))

/** Direction-aware root transition for primary app navigation. */
fun cheatLockScreenTransition(
    forward: Boolean,
    reducedMotion: Boolean = false
): ContentTransform {
    if (reducedMotion) {
        return fadeIn(animationSpec = tween(CheatLockMotion.ReducedEnterMs, easing = LinearOutSlowInEasing))
            .togetherWith(fadeOut(animationSpec = tween(CheatLockMotion.ReducedExitMs, easing = FastOutLinearInEasing)))
    }

    val direction = if (forward) 1 else -1
    return (fadeIn(animationSpec = tween(CheatLockMotion.ScreenEnterMs, easing = LinearOutSlowInEasing)) +
            slideInHorizontally(animationSpec = tween(CheatLockMotion.ScreenEnterMs, easing = FastOutSlowInEasing)) { fullWidth ->
                direction * fullWidth / CheatLockMotion.ScreenEnterSlideDivisor
            } +
            scaleIn(initialScale = 0.985f, animationSpec = tween(CheatLockMotion.ScreenEnterMs, easing = LinearOutSlowInEasing)))
        .togetherWith(
            fadeOut(animationSpec = tween(CheatLockMotion.ScreenExitMs, easing = FastOutLinearInEasing)) +
                slideOutHorizontally(animationSpec = tween(CheatLockMotion.ScreenExitMs, easing = FastOutSlowInEasing)) { fullWidth ->
                    -direction * fullWidth / CheatLockMotion.ScreenExitSlideDivisor
                }
        )
}

/**
 * Lightweight directional tab transition for inner dashboard navigation.
 */
fun cheatLockTabTransition(
    forward: Boolean,
    reducedMotion: Boolean = false
): ContentTransform {
    if (reducedMotion) {
        return fadeIn(animationSpec = tween(CheatLockMotion.ReducedEnterMs, easing = LinearOutSlowInEasing))
            .togetherWith(fadeOut(animationSpec = tween(CheatLockMotion.ReducedExitMs, easing = FastOutLinearInEasing)))
    }

    val enterOffset: (Int) -> Int = { fullWidth -> if (forward) fullWidth / CheatLockMotion.TabSlideDivisor else -fullWidth / CheatLockMotion.TabSlideDivisor }
    val exitOffset: (Int) -> Int = { fullWidth -> if (forward) -fullWidth / CheatLockMotion.TabSlideDivisor else fullWidth / CheatLockMotion.TabSlideDivisor }

    return (fadeIn(animationSpec = tween(CheatLockMotion.TabEnterMs, easing = LinearOutSlowInEasing)) +
            slideInHorizontally(animationSpec = tween(CheatLockMotion.TabEnterMs, easing = FastOutSlowInEasing), initialOffsetX = enterOffset))
        .togetherWith(
            fadeOut(animationSpec = tween(CheatLockMotion.TabExitMs, easing = FastOutLinearInEasing)) +
                slideOutHorizontally(animationSpec = tween(CheatLockMotion.TabExitMs, easing = FastOutSlowInEasing), targetOffsetX = exitOffset)
        )
}

fun cheatLockAuthModeTransition(
    toSignup: Boolean,
    reducedMotion: Boolean = false
): ContentTransform {
    if (reducedMotion) {
        return fadeIn(animationSpec = tween(CheatLockMotion.ReducedEnterMs, easing = LinearOutSlowInEasing))
            .togetherWith(fadeOut(animationSpec = tween(CheatLockMotion.ReducedExitMs, easing = FastOutLinearInEasing)))
    }

    val direction = if (toSignup) 1 else -1
    return (fadeIn(animationSpec = tween(CheatLockMotion.AuthEnterMs, easing = LinearOutSlowInEasing)) +
            slideInHorizontally(animationSpec = tween(CheatLockMotion.AuthEnterMs, easing = FastOutSlowInEasing)) { fullWidth ->
                direction * fullWidth / CheatLockMotion.AuthSlideDivisor
            })
        .togetherWith(
            fadeOut(animationSpec = tween(CheatLockMotion.AuthExitMs, easing = FastOutLinearInEasing)) +
                slideOutHorizontally(animationSpec = tween(CheatLockMotion.AuthExitMs, easing = FastOutSlowInEasing)) { fullWidth ->
                    -direction * fullWidth / CheatLockMotion.AuthSlideDivisor
                }
        )
}

fun cheatLockDialogEnterTransition(): EnterTransition {
    return fadeIn(animationSpec = tween(CheatLockMotion.ModalEnterMs, easing = LinearOutSlowInEasing)) +
        slideInVertically(animationSpec = tween(CheatLockMotion.ModalEnterMs, easing = FastOutSlowInEasing)) { height -> height / 32 } +
        scaleIn(initialScale = 0.96f, animationSpec = tween(CheatLockMotion.ModalEnterMs, easing = LinearOutSlowInEasing))
}

fun cheatLockDialogExitTransition(): ExitTransition {
    return fadeOut(animationSpec = tween(CheatLockMotion.ModalExitMs, easing = FastOutLinearInEasing)) +
        slideOutVertically(animationSpec = tween(CheatLockMotion.ModalExitMs, easing = FastOutSlowInEasing)) { height -> height / 48 } +
        scaleOut(targetScale = 0.98f, animationSpec = tween(CheatLockMotion.ModalExitMs, easing = FastOutLinearInEasing))
}

fun cheatLockMicroTransition(): ContentTransform {
    return (fadeIn(animationSpec = tween(CheatLockMotion.MicroEnterMs, easing = LinearOutSlowInEasing)) +
        scaleIn(initialScale = 0.995f, animationSpec = tween(CheatLockMotion.MicroEnterMs, easing = LinearOutSlowInEasing)))
        .togetherWith(
            fadeOut(animationSpec = tween(CheatLockMotion.MicroExitMs, easing = FastOutLinearInEasing)) +
                scaleOut(targetScale = 0.995f, animationSpec = tween(CheatLockMotion.MicroExitMs, easing = FastOutLinearInEasing))
        )
}
