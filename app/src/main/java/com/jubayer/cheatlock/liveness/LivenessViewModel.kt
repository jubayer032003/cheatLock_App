package com.jubayer.cheatlock.liveness

import androidx.compose.runtime.State
import androidx.compose.runtime.mutableStateOf
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.google.mlkit.vision.face.Face
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlin.random.Random

/**
 * MVVM ViewModel for Liveness Detection. Manages countdown timers, randomizations, and cooldowns.
 */
class LivenessViewModel : ViewModel() {

    private val _state = mutableStateOf(LivenessState())
    val state: State<LivenessState> = _state

    private var timerJob: Job? = null
    private var spamCooldownJob: Job? = null
    private var lastSubmitTime = 0L

    /**
     * Generates a randomized sequence of 2-3 unique liveness actions.
     */
    private fun generateRandomSequence(): List<LivenessAction> {
        val allActions = LivenessAction.values().toList()
        val count = Random.nextInt(2, 4) // Generates either 2 or 3 actions
        return allActions.shuffled().take(count)
    }

    /**
     * Initiates the challenge, verifying rate-limits and resetting detection states.
     */
    fun startChallenge() {
        val now = System.currentTimeMillis()
        // Rate limiting: 1.5 seconds between subsequent activation attempts
        if (now - lastSubmitTime < 1500) {
            _state.value = _state.value.copy(errorMessage = "Rate limit triggered. Please hold still.")
            return
        }
        lastSubmitTime = now

        if (_state.value.cooldownSeconds > 0) {
            _state.value = _state.value.copy(errorMessage = "Cooldown in progress. Please wait.")
            return
        }

        timerJob?.cancel()
        LivenessDetector.reset()

        val actions = generateRandomSequence()
        _state.value = _state.value.copy(
            actions = actions,
            currentActionIndex = 0,
            status = LivenessStatus.InProgress,
            timeLeftSeconds = 10,
            errorMessage = null
        )

        startTimer()
    }

    /**
     * Processes incoming face frames to match active challenge commands.
     */
    fun onFaceFrameReceived(face: Face) {
        val currentState = _state.value
        if (currentState.status != LivenessStatus.InProgress) return

        val currentAction = currentState.actions.getOrNull(currentState.currentActionIndex) ?: return

        if (LivenessDetector.isActionCompleted(face, currentAction)) {
            val nextIndex = currentState.currentActionIndex + 1
            if (nextIndex >= currentState.actions.size) {
                // All actions successfully verified in order!
                timerJob?.cancel()
                _state.value = currentState.copy(
                    currentActionIndex = nextIndex,
                    status = LivenessStatus.Success,
                    errorMessage = null
                )
            } else {
                // Transition to the next action in the sequence
                LivenessDetector.reset()
                _state.value = currentState.copy(
                    currentActionIndex = nextIndex
                )
            }
        }
    }

    /**
     * Starts the 10-second countdown job for completing the actions.
     */
    private fun startTimer() {
        timerJob = viewModelScope.launch {
            while (_state.value.timeLeftSeconds > 0 && _state.value.status == LivenessStatus.InProgress) {
                delay(1000)
                _state.value = _state.value.copy(
                    timeLeftSeconds = _state.value.timeLeftSeconds - 1
                )
            }
            if (_state.value.status == LivenessStatus.InProgress) {
                handleFailure()
            }
        }
    }

    /**
     * Manages retry allowances and final locking triggers upon challenge failures.
     */
    private fun handleFailure() {
        timerJob?.cancel()
        val currentState = _state.value
        if (currentState.attemptCount == 1) {
            // First failure: transition to retry status and start 5-second cooldown
            _state.value = currentState.copy(
                status = LivenessStatus.FailedRetry,
                attemptCount = 2,
                cooldownSeconds = 5,
                errorMessage = "Attempt 1 failed. Retry available in 5s."
            )
            startCooldown()
        } else {
            // Second failure: permanent access denial
            _state.value = currentState.copy(
                status = LivenessStatus.FailedFinal,
                errorMessage = "Liveness verification failed. Access Denied."
            )
        }
    }

    /**
     * Countdown job for the retry cooldown period.
     */
    private fun startCooldown() {
        spamCooldownJob?.cancel()
        spamCooldownJob = viewModelScope.launch {
            while (_state.value.cooldownSeconds > 0) {
                delay(1000)
                _state.value = _state.value.copy(
                    cooldownSeconds = _state.value.cooldownSeconds - 1
                )
            }
            _state.value = _state.value.copy(errorMessage = null)
        }
    }

    /**
     * Resets the entire liveness state (e.g. for complete dashboard session refreshes).
     */
    fun resetAll() {
        timerJob?.cancel()
        spamCooldownJob?.cancel()
        LivenessDetector.reset()
        _state.value = LivenessState()
    }

    override fun onCleared() {
        super.onCleared()
        timerJob?.cancel()
        spamCooldownJob?.cancel()
    }
}
