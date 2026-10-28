package com.jubayer.cheatlock.ui

import androidx.activity.compose.BackHandler
import android.os.SystemClock
import com.jubayer.cheatlock.model.SelfExamPayloadResponse
import com.jubayer.cheatlock.selfexam.ServerExamDeadline
import com.jubayer.cheatlock.selfexam.confirmedSelfExamAnswer
import android.Manifest
import android.content.pm.PackageManager
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.util.Log
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import com.jubayer.cheatlock.R
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.automirrored.filled.VolumeUp
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.selection.selectable
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion

import androidx.compose.animation.core.*
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.graphics.drawscope.Stroke
import com.jubayer.cheatlock.model.ExamStatus
import com.jubayer.cheatlock.model.ExamSession
import com.jubayer.cheatlock.model.ExamAttemptKey
import com.jubayer.cheatlock.model.TeacherExamTiming
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.platform.LocalTextToolbar
import androidx.compose.ui.platform.TextToolbar
import androidx.compose.ui.platform.TextToolbarStatus
import androidx.core.content.ContextCompat
import com.jubayer.cheatlock.data.ExamStorage
import com.jubayer.cheatlock.model.Exam
import com.jubayer.cheatlock.model.ExamFinishReason
import com.jubayer.cheatlock.model.StudentAnswer
import com.jubayer.cheatlock.model.QuestionType
import com.jubayer.cheatlock.model.optionIdAt
import com.jubayer.cheatlock.proctoring.VoiceActivityDetector
import com.jubayer.cheatlock.proctoring.CameraSensorHealth
import com.jubayer.cheatlock.proctoring.shouldCountFaceWarning
import com.jubayer.cheatlock.ui.theme.*
import com.jubayer.cheatlock.util.SuspicionScoreCalculator
import java.lang.System.currentTimeMillis
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun ExamScreen(
    studentId: String,
    exam: Exam,
    warningCount: Int,
    authoritativeSuspicionScore: Int,
    onFaceWarningsChanged: (Int) -> Unit,
    onCameraPreviewChanged: (String) -> Unit,
    onPhoneDetected: (String) -> Unit,
    onAudioWarning: () -> Unit,
    onFinishExam: suspend (List<StudentAnswer>, ExamFinishReason) -> Boolean,
    onSubmissionTransitionComplete: () -> Unit,
    selfExamPayload: SelfExamPayloadResponse? = null,
    teacherSession: ExamSession? = null,
    onCheckpointReload: (suspend (String) -> com.jubayer.cheatlock.selfexam.CheckpointState)? = null,
    onCheckpointRefresh: (suspend (String) -> com.jubayer.cheatlock.selfexam.CheckpointState)? = null,
    onCheckpointSave: (suspend (SelfExamPayloadResponse, List<StudentAnswer>) -> com.jubayer.cheatlock.selfexam.CheckpointState)? = null
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val haptics = LocalHapticFeedback.current
    val examStorage = remember { ExamStorage(context) }
    val isSelfExam = exam.id?.startsWith("self:") == true
    val answerAttempt = remember(studentId, exam.id, teacherSession?.startedAt) {
        if (isSelfExam) null else ExamAttemptKey.from(studentId, exam.id, teacherSession?.startedAt)
    }
    val teacherTiming = remember(exam.id, teacherSession) {
        if (isSelfExam) null else TeacherExamTiming.from(exam, teacherSession, SystemClock.elapsedRealtime(), System.currentTimeMillis())
    }
    val bulkEnabled = isSelfExam && com.jubayer.cheatlock.BuildConfig.SELF_EXAM_BULK_V1 && selfExamPayload?.session?.bulkSubmissionVersion == 1
    val checkpointEnabled = bulkEnabled && selfExamPayload.session.checkpointVersion == 1
    var serverDeadline by remember(exam.id, selfExamPayload) {
        mutableStateOf(ServerExamDeadline.from(selfExamPayload?.session?.expiresAt, selfExamPayload?.serverTime,
            selfExamPayload?.timingAnchorElapsedRealtime, exam.durationMinutes))
    }
    val examDurationSeconds = remember(exam.id, exam.durationMinutes) {
        exam.durationMinutes.coerceAtLeast(1) * 60
    }
    val questions = remember(exam.id, exam.questions) {
        exam.questions.mapIndexed { index, question ->
            val shuffledOptions = question.options
                .mapIndexed { optionIndex, optionText ->
                    IndexedOption(
                        text = optionText,
                        id = question.optionIdAt(optionIndex)
                    )
                }
                .shuffled()
            IndexedQuestion(
                index,
                question.type,
                question.text,
                shuffledOptions.map { it.text },
                shuffledOptions.map { it.id }
            )
        }.shuffled()
    }

    var currentQuestionIndex by remember(exam.id) { mutableStateOf(0) }
    var showWarningDialog by remember { mutableStateOf(false) }
    var showSavedMessage by remember { mutableStateOf(false) }
    var showSubmitConfirm by remember { mutableStateOf(false) }
    var showReviewSheet by remember { mutableStateOf(false) }
    var submissionState by remember { mutableStateOf(ExamSubmissionState.IDLE) }
    var bulkSnapshotFrozen by remember { mutableStateOf(false) }
    var submissionAttempts by remember { mutableIntStateOf(0) }
    var submissionError by remember { mutableStateOf<String?>(null) }
    var pendingFinishReason by remember { mutableStateOf(ExamFinishReason.SUBMITTED) }
    var faceMissingWarnings by remember { mutableStateOf(0) }
    var audioWarnings by remember { mutableStateOf(0) }
    var phoneWarnings by remember { mutableStateOf(0) }
    var lastFaceWarningTime by remember { mutableStateOf(0L) }
    var lastPhoneWarningTime by remember { mutableStateOf(0L) }
    var hasFaceBeenDetectedOnce by remember { mutableStateOf(false) }
    var timeLeft by remember(exam.id, serverDeadline, examDurationSeconds, teacherTiming) {
        mutableStateOf(if (isSelfExam) serverDeadline.remainingSeconds(SystemClock.elapsedRealtime()) else teacherTiming?.remainingSeconds(SystemClock.elapsedRealtime()) ?: examDurationSeconds)
    }
    val checkpointSignals = remember(exam.id) { kotlinx.coroutines.channels.Channel<Unit>(kotlinx.coroutines.channels.Channel.CONFLATED) }
    var checkpointReady by remember(exam.id) { mutableStateOf(false) }
    var checkpointDirty by remember(exam.id) { mutableStateOf(false) }
    var checkpointReloadRequested by remember(exam.id) { mutableStateOf(false) }
    var checkpointStatus by remember(exam.id) { mutableIntStateOf(R.string.se_checkpoint_restoring) }

    var questionTimeLeft by remember(exam.id, examDurationSeconds, exam.questions.size) {
        mutableStateOf((examDurationSeconds / exam.questions.size.coerceAtLeast(1)).coerceAtLeast(30))
    }
    var faceStatus by remember { mutableStateOf(FaceStatus.CHECKING) }
    var isFinished by remember { mutableStateOf(false) }
    var monitoringEnabled by remember { mutableStateOf(false) }
    var cameraHardwareReady by remember { mutableStateOf(false) }
    var isAudioCalibrating by remember { mutableStateOf(true) }
    var audioCalibrationProgress by remember { mutableStateOf(0f) }
    val hasCameraPermission = remember {
        ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) ==
            PackageManager.PERMISSION_GRANTED
    }
    var cameraSensorHealth by remember(exam.id, hasCameraPermission) {
        mutableStateOf(if (hasCameraPermission) CameraSensorHealth.STARTING else CameraSensorHealth.PERMISSION_DENIED)
    }

    // Alert animation state
    var alertPulseActive by remember { mutableStateOf(false) }
    LaunchedEffect(warningCount, faceMissingWarnings, audioWarnings, phoneWarnings, authoritativeSuspicionScore) {
        if (monitoringEnabled) {
            alertPulseActive = true
            delay(2000)
            alertPulseActive = false
        }
    }

    // Auto-start camera when exam becomes live
    val isExamLive = exam.status == ExamStatus.LIVE
    LaunchedEffect(isExamLive) {
        if (isExamLive) {
            monitoringEnabled = true
        }
    }

    // Animated timers for smooth UI updates
    val animatedTimeLeft by animateIntAsState(targetValue = timeLeft, animationSpec = tween(durationMillis = 500))
    val animatedQuestionTimeLeft by animateIntAsState(targetValue = questionTimeLeft, animationSpec = tween(durationMillis = 500))

    // Calibration and camera grace period
    LaunchedEffect(Unit) {
        delay(1000) 
        cameraHardwareReady = true
        // 5-second environment VAD calibration
        var elapsed = 0f
        while (elapsed < 5000f) {
            delay(100)
            elapsed += 100f
            audioCalibrationProgress = elapsed / 5000f
        }
        isAudioCalibrating = false
        monitoringEnabled = true
    }

    LaunchedEffect(questions.size) {
        if (questions.isEmpty()) {
            currentQuestionIndex = 0
        } else if (currentQuestionIndex !in questions.indices) {
            currentQuestionIndex = questions.lastIndex
        }
    }

    val answers = remember(studentId, exam.id, questions, selfExamPayload, answerAttempt) {
        mutableStateListOf(*questions.map { question ->
            if (isSelfExam) {
                val questionId = selfExamPayload?.questions?.getOrNull(question.id)?.id
                val selected = selfExamPayload?.answers?.find { it.questionId == questionId }?.selectedOptionId
                confirmedSelfExamAnswer(question.optionIds.map { it.orEmpty() }, question.options, selected)
            } else examStorage.getAnswer(answerAttempt, question.id)
        }.toTypedArray())
    }
    val selectedOptionIds = remember(studentId, exam.id, questions, selfExamPayload, answerAttempt) {
        mutableStateListOf(*questions.map { question ->
            val questionId = selfExamPayload?.questions?.getOrNull(question.id)?.id
            selfExamPayload?.answers?.find { it.questionId == questionId }?.selectedOptionId
                ?.takeIf { it in question.optionIds }
        }.toTypedArray())
    }
    val lockedQuestions = remember(exam.id, questions) {
        mutableStateListOf(*questions.map { false }.toTypedArray())
    }
    val flaggedQuestions = remember(exam.id, questions) {
        mutableStateListOf(*questions.map { false }.toTypedArray())
    }

    fun autoSaveProgress() {
        if (isSelfExam) return
        questions.forEachIndexed { index, question ->
            val currentAnswer = answers[index]
            examStorage.saveAnswer(answerAttempt, question.id, currentAnswer)
        }
    }

    fun collectAnswers(): List<StudentAnswer> {
        return questions.mapIndexed { index, question ->
            StudentAnswer(
                questionIndex = question.id,
                questionText = question.text,
                answerText = answers[index],
                selectedOptionId = selectedOptionIds[index] ?: if (isSelfExam) null else question.optionIds.getOrNull(question.options.indexOf(answers[index]))
            )
        }
    }

    fun finishExam(reason: ExamFinishReason) {
        if (isSelfExam && (selfExamPayload == null || !serverDeadline.isValid)) {
            submissionState = ExamSubmissionState.FAILED
            submissionError = "Session timing is unavailable. Reload the self exam before submitting."
            return
        }
        if (isFinished || submissionState == ExamSubmissionState.SUBMITTING || submissionState == ExamSubmissionState.SUBMITTED || submissionState == ExamSubmissionState.REDIRECTING) return
        if (checkpointEnabled && !checkpointReady && reason == ExamFinishReason.SUBMITTED) {
            submissionError = context.getString(R.string.se_checkpoint_restoring)
            submissionState = ExamSubmissionState.FAILED
            return
        }
        pendingFinishReason = reason
        submissionAttempts++
        submissionState = ExamSubmissionState.SUBMITTING
        if (bulkEnabled) bulkSnapshotFrozen = true
        submissionError = null
        monitoringEnabled = false
        showSubmitConfirm = false
        showWarningDialog = false
        examStorage.saveWarnings(warningCount, faceMissingWarnings)
        val finishStarted = SystemClock.elapsedRealtime()
        val answersSnapshot = collectAnswers()
        scope.launch {
            val submitted = runCatching {
                onFinishExam(answersSnapshot, reason)
            }.onFailure { error ->
                submissionError = when {
                    error is com.jubayer.cheatlock.data.BulkSelfExamRequestException -> context.getString(error.messageResource)
                    bulkEnabled -> context.getString(R.string.se_bulk_saved_retry)
                    else -> error.message ?: "We couldn't submit your exam."
                }
            }.getOrDefault(false)

            if (bulkEnabled) android.util.Log.i("SELF_EXAM_BULK", "stage=client_submit_complete itemCount=${answersSnapshot.size} success=$submitted totalMs=${SystemClock.elapsedRealtime()-finishStarted}")

            if (submitted) {
                val transitionStarted = SystemClock.elapsedRealtime()
                isFinished = true
                submissionState = ExamSubmissionState.SUBMITTED
                delay(1000)
                submissionState = ExamSubmissionState.REDIRECTING
                onSubmissionTransitionComplete()
                if (bulkEnabled) android.util.Log.i("SELF_EXAM_BULK", "stage=ui_result_transition durationMs=${SystemClock.elapsedRealtime()-transitionStarted}")
            } else {
                monitoringEnabled = true
                submissionError = submissionError ?: if (bulkSnapshotFrozen) context.getString(R.string.se_bulk_saved_retry) else if (isSelfExam) "Submission failed. Unsaved changes remain in this screen; retry before the deadline." else "We couldn't submit your exam. Your answers are still saved. Please try again."
                submissionState = ExamSubmissionState.FAILED
            }
        }
    }

    fun matchesCheckpoint(state: com.jubayer.cheatlock.selfexam.CheckpointState): Boolean =
        collectAnswers().all { answer ->
            val id = selfExamPayload?.questions?.getOrNull(answer.questionIndex)?.id
            state.answers.any { it.questionId == id && it.selectedOptionId == answer.selectedOptionId }
        }
    LaunchedEffect(exam.id, checkpointEnabled) {
        if (!checkpointEnabled) return@LaunchedEffect
        checkpointSignals.trySend(Unit)
        for (signal in checkpointSignals) {
            if (bulkSnapshotFrozen || submissionState == ExamSubmissionState.SUBMITTING || isFinished) continue
            checkpointStatus = if (checkpointReady) R.string.se_checkpoint_saving else R.string.se_checkpoint_restoring
            var response: com.jubayer.cheatlock.selfexam.CheckpointState? = null
            var failure: Exception? = null
            for (attempt in 0..2) {
                try {
                    response = if (checkpointReloadRequested) {
                        checkNotNull(onCheckpointReload).invoke(checkNotNull(selfExamPayload).session.id)
                    } else if (!checkpointReady || !checkpointDirty) {
                        checkNotNull(onCheckpointRefresh).invoke(checkNotNull(selfExamPayload).session.id)
                    } else checkNotNull(onCheckpointSave).invoke(checkNotNull(selfExamPayload), collectAnswers())
                    failure = null
                    break
                } catch (error: Exception) {
                    if (error is kotlinx.coroutines.CancellationException && error !is kotlinx.coroutines.TimeoutCancellationException) throw error
                    failure = error
                    val code = (error as? com.jubayer.cheatlock.data.BackendRequestException)?.statusCode
                    if (attempt == 2 || (code != null && code !in listOf(408,429) && code < 500)) break
                    delay(500L * (attempt + 1))
                }
            }
            val state = response
            if (state == null) {
                checkpointStatus = if (failure is com.jubayer.cheatlock.selfexam.CheckpointConflictException || (failure as? com.jubayer.cheatlock.data.BackendRequestException)?.statusCode == 409) R.string.se_checkpoint_conflict else R.string.se_checkpoint_failed
                continue
            }
            serverDeadline = ServerExamDeadline.from(state.expiresAt, state.serverTime, state.timingAnchor, exam.durationMinutes)
            timeLeft = serverDeadline.remainingSeconds(SystemClock.elapsedRealtime())
            if (!checkpointReady) {
                questions.forEachIndexed { index, q ->
                    val id = selfExamPayload.questions.getOrNull(q.id)?.id
                    val selected = state.answers.find { it.questionId == id }?.selectedOptionId
                    selectedOptionIds[index] = selected
                    answers[index] = confirmedSelfExamAnswer(q.optionIds.map { it.orEmpty() }, q.options, selected)
                }
                checkpointReady = true
            }
            checkpointDirty = !matchesCheckpoint(state)
            checkpointStatus = if (state.status == "submitted" || timeLeft <= 0) R.string.se_checkpoint_expired else if (checkpointDirty) R.string.se_checkpoint_saving else R.string.se_checkpoint_saved
            checkpointReloadRequested = false
            if (state.status == "submitted" || timeLeft <= 0) finishExam(ExamFinishReason.TIME_EXPIRED)
            else if (checkpointDirty) checkpointSignals.trySend(Unit)
        }
    }
    val checkpointLifecycle = androidx.lifecycle.compose.LocalLifecycleOwner.current
    DisposableEffect(checkpointLifecycle, checkpointEnabled) {
        val observer = androidx.lifecycle.LifecycleEventObserver { _, event ->
            if (checkpointEnabled && event == androidx.lifecycle.Lifecycle.Event.ON_RESUME) {
                checkpointReady = false
                checkpointSignals.trySend(Unit)
            }
        }
        checkpointLifecycle.lifecycle.addObserver(observer)
        onDispose { checkpointLifecycle.lifecycle.removeObserver(observer) }
    }

    BackHandler(enabled = true) {
        if (submissionState == ExamSubmissionState.IDLE || submissionState == ExamSubmissionState.FAILED) {
            showWarningDialog = true
        }
    }

    val currentQuestion = questions.getOrNull(currentQuestionIndex)
    val isCurrentQuestionLocked = lockedQuestions.getOrNull(currentQuestionIndex) ?: false
    val answeredCount = answers.count { it.isNotBlank() }
    val perQuestionSeconds = remember(exam.id, examDurationSeconds, questions.size) {
        (examDurationSeconds / questions.size.coerceAtLeast(1)).coerceAtLeast(30)
    }
    val noCopyToolbar = remember { NoCopyTextToolbar }

    LaunchedEffect(exam.status, isSelfExam) {
        if (!isSelfExam && exam.status in setOf(ExamStatus.ENDED, ExamStatus.ARCHIVED)) {
            finishExam(ExamFinishReason.TIME_EXPIRED)
        }
    }
    LaunchedEffect(exam.id, serverDeadline, teacherTiming) {
        if (isSelfExam && !serverDeadline.isValid) {
            submissionState = ExamSubmissionState.FAILED
            submissionError = "Session timing is unavailable. Reload the self exam before submitting."
            return@LaunchedEffect
        }
        while (timeLeft > 0 && !isFinished) {
            delay(1000)
            if (isSelfExam) {
                timeLeft = serverDeadline.remainingSeconds(SystemClock.elapsedRealtime())
            } else if (submissionState == ExamSubmissionState.IDLE || submissionState == ExamSubmissionState.FAILED) {
                timeLeft = teacherTiming?.remainingSeconds(SystemClock.elapsedRealtime()) ?: (timeLeft - 1).coerceAtLeast(0)
            }
        }
        if (!isFinished && timeLeft <= 0) {
            finishExam(ExamFinishReason.TIME_EXPIRED)
        }
    }

    LaunchedEffect(currentQuestionIndex, submissionState) {
        if (questions.isEmpty() || currentQuestionIndex !in questions.indices) {
            return@LaunchedEffect
        }

        questionTimeLeft = perQuestionSeconds
        while (questionTimeLeft > 0 && !isFinished && lockedQuestions.getOrNull(currentQuestionIndex) != true) {
            delay(1000)
            if (submissionState == ExamSubmissionState.IDLE || submissionState == ExamSubmissionState.FAILED) {
                questionTimeLeft--
            }
        }
        if (!isFinished && questionTimeLeft <= 0 && lockedQuestions.getOrNull(currentQuestionIndex) != true) {
            lockedQuestions[currentQuestionIndex] = true
            if (currentQuestionIndex < questions.lastIndex) {
                currentQuestionIndex++
            }
        }
    }

    LaunchedEffect(warningCount) {
        if (warningCount > 0 && submissionState == ExamSubmissionState.IDLE) {
            haptics.performHapticFeedback(HapticFeedbackType.LongPress)
            showWarningDialog = true
        }
    }

    LaunchedEffect(warningCount, faceMissingWarnings, audioWarnings, phoneWarnings) {
        autoSaveProgress()
        val locallyCalculatedScore = SuspicionScoreCalculator.calculateScore(
            appSwitchWarnings = warningCount,
            faceMissingWarnings = faceMissingWarnings,
            audioWarnings = audioWarnings,
            phoneWarnings = phoneWarnings,
        )

        if (locallyCalculatedScore >= 100 && submissionState == ExamSubmissionState.IDLE) {
            finishExam(ExamFinishReason.LOCKED)
        }
    }

    LaunchedEffect(Unit) {
        kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
            if (ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
                return@withContext
            }

            runCatching {
                val sampleRate = 8000
                val minBufferSize = AudioRecord.getMinBufferSize(sampleRate, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)
                if (minBufferSize == AudioRecord.ERROR || minBufferSize == AudioRecord.ERROR_BAD_VALUE) {
                    Log.w("ExamScreen", "AudioRecord.getMinBufferSize returned error: $minBufferSize")
                    return@runCatching
                }
                val bufferSize = minBufferSize.coerceAtLeast(1024)
                val buffer = ShortArray(bufferSize)
                
                val recorder = try {
                    AudioRecord(MediaRecorder.AudioSource.MIC, sampleRate, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, bufferSize)
                } catch (securityEx: SecurityException) {
                    Log.w("ExamScreen", "AudioRecord creation denied by system", securityEx)
                    return@runCatching
                }
                
                if (recorder.state != AudioRecord.STATE_INITIALIZED) {
                    recorder.release()
                    return@runCatching
                }

                var lastAudioWarningAt = 0L
                val vad = VoiceActivityDetector(sampleRate = 8000)

                try {
                    recorder.startRecording()
                    
                    // Verify recording actually started (some devices silently fail)
                    val recordingStarted = recorder.recordingState == AudioRecord.RECORDSTATE_RECORDING
                    if (!recordingStarted) {
                        Log.w("ExamScreen", "AudioRecord.startRecording() did not transition to RECORDING state")
                    }
                    
                    while (recordingStarted && !isFinished && submissionState != ExamSubmissionState.SUBMITTING && submissionState != ExamSubmissionState.SUBMITTED && submissionState != ExamSubmissionState.REDIRECTING) {
                        val read = recorder.read(buffer, 0, buffer.size)
                        if (read > 0) {
                            // Process raw pcm buffer through offline DSP-VAD engine
                            vad.processAudioBuffer(buffer, read)

                            val now = currentTimeMillis()
                            // Trigger speech warning if speech probability averages > 80% for > 5 seconds
                            if (monitoringEnabled && !isAudioCalibrating && vad.isSpeechViolationTriggered() && now - lastAudioWarningAt > 8000) {
                                audioWarnings++
                                onAudioWarning()
                                autoSaveProgress()
                                lastAudioWarningAt = now
                                vad.clearHistory()
                                scope.launch(kotlinx.coroutines.Dispatchers.Main) {
                                    showWarningDialog = true
                                }
                            }
                        } else if (read == 0) {
                            delay(40)
                        } else if (read < 0) {
                            // read returned an error code; microphone may have been revoked
                            Log.w("ExamScreen", "AudioRecord.read returned error: $read")
                            break
                        }
                    }
                } finally {
                    runCatching { 
                        if (recorder.recordingState == AudioRecord.RECORDSTATE_RECORDING) {
                            recorder.stop() 
                        }
                    }
                    recorder.release()
                }
            }.onFailure { error ->
                Log.e("ExamScreen", "Audio record proctoring failed safely", error)
            }
        }
    }

    if (submissionState == ExamSubmissionState.SUBMITTING ||
        submissionState == ExamSubmissionState.SUBMITTED ||
        submissionState == ExamSubmissionState.REDIRECTING
    ) {
        CompositionLocalProvider(LocalSelfExamPresentation provides isSelfExam) { SubmissionTransitionScreen(submissionState, bulkSnapshotFrozen && submissionAttempts > 1) }
        return
    }

    val totalSecurityWarnings = warningCount + faceMissingWarnings + audioWarnings + phoneWarnings
    val unansweredCount = questions.size - answeredCount
    val flaggedCount = flaggedQuestions.count { it }
    val examProgress = if (questions.isEmpty()) 0f else (currentQuestionIndex + 1).toFloat() / questions.size
    val alertGlowAlpha = if (isSelfExam) 0.45f else {
        val alertInfTransition = rememberInfiniteTransition(label = "exam-alert")
        val teacherAlertAlpha by alertInfTransition.animateFloat(
            initialValue = 0.12f,
            targetValue = 0.55f,
            animationSpec = infiniteRepeatable(tween(900, easing = LinearEasing), RepeatMode.Reverse),
            label = "exam-alert-glow"
        )
        teacherAlertAlpha
    }

    CompositionLocalProvider(LocalSelfExamPresentation provides isSelfExam) {
    if (showSubmitConfirm) {
        SubmitConfirmDialog(
            answeredCount = answeredCount,
            unansweredCount = unansweredCount,
            flaggedCount = flaggedCount,
            totalQuestions = questions.size,
            onReviewUnanswered = {
                val target = answers.indexOfFirst { it.isBlank() }
                if (target >= 0) currentQuestionIndex = target
                showSubmitConfirm = false
            },
            onSubmit = {
                showSubmitConfirm = false
                finishExam(ExamFinishReason.SUBMITTED)
            },
            onDismiss = { showSubmitConfirm = false },
            submitting = submissionState == ExamSubmissionState.SUBMITTING
        )
    }

    if (submissionState == ExamSubmissionState.FAILED) {
        SubmissionFailedDialog(
            message = submissionError ?: if (isSelfExam) "Submission failed. Unsaved changes remain in this screen; retry before the deadline." else "We couldn't submit your exam. Your answers are still saved. Please try again.",
            onRetry = { finishExam(pendingFinishReason) },
            onReview = { submissionState = ExamSubmissionState.IDLE }
        )
    }

    if (showWarningDialog) {
        SecurityWarningDialog(
            warningCount = totalSecurityWarnings.coerceAtLeast(1),
            onConfirm = { showWarningDialog = false }
        )
    }

    if (showReviewSheet) {
        ReviewExamDialog(
            totalQuestions = questions.size,
            answeredCount = answeredCount,
            unansweredCount = unansweredCount,
            flaggedCount = flaggedCount,
            answers = answers,
            flaggedQuestions = flaggedQuestions,
            onJumpToQuestion = { index ->
                currentQuestionIndex = index
                showSavedMessage = false
                showReviewSheet = false
            },
            onSubmit = {
                showReviewSheet = false
                showSubmitConfirm = true
            },
            onDismiss = { showReviewSheet = false }
        )
    }

    PremiumScreen(modifier = Modifier.fillMaxSize()) {
        Box(modifier = Modifier.fillMaxSize()) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .statusBarsPadding()
                    .navigationBarsPadding()
                    .padding(horizontal = 16.dp, vertical = 12.dp)
                    .verticalScroll(rememberScrollState())
                    .imePadding()
                    .padding(bottom = 124.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp)
            ) {
                ExamModeHeader(
                    title = exam.title,
                    timeLeft = animatedTimeLeft,
                    questionTimeLeft = animatedQuestionTimeLeft,
                    warningCount = totalSecurityWarnings,
                    suspicionScore = authoritativeSuspicionScore,
                    currentQuestionNumber = currentQuestionIndex + 1,
                    totalQuestions = questions.size,
                    progress = examProgress,
                    onOpenReview = { showReviewSheet = true }
                )

                CompactSecurityStrip(
                    hasCameraPermission = hasCameraPermission,
                    faceStatus = faceStatus,
                    isAudioCalibrating = isAudioCalibrating,
                    warningCount = totalSecurityWarnings
                )

                QuestionNavigator(
                    totalQuestions = questions.size,
                    currentQuestionIndex = currentQuestionIndex,
                    answers = answers,
                    flaggedQuestions = flaggedQuestions,
                    onQuestionClick = { index ->
                        currentQuestionIndex = index
                        showSavedMessage = false
                    }
                )

                if (currentQuestion == null) {
                    EmptyState(title = "No questions available", body = "This exam does not have any questions. Please contact your teacher.")
                } else {
                    ExamQuestionCard(
                        question = currentQuestion,
                        questionNumber = currentQuestionIndex + 1,
                        totalQuestions = questions.size,
                        answer = answers[currentQuestionIndex],
                        selectedOptionId = selectedOptionIds[currentQuestionIndex],
                        isLocked = bulkSnapshotFrozen || (checkpointEnabled && (!checkpointReady || timeLeft <= 0)) || (isCurrentQuestionLocked && exam.lockAnswers),
                        isFlagged = flaggedQuestions[currentQuestionIndex],
                        onToggleFlag = { flaggedQuestions[currentQuestionIndex] = !flaggedQuestions[currentQuestionIndex] },
                        onAnswerChange = { value, optionId ->
                            if ((!checkpointEnabled || checkpointReady) && !bulkSnapshotFrozen && (!isCurrentQuestionLocked || !exam.lockAnswers) && (!isSelfExam || serverDeadline.remainingSeconds(SystemClock.elapsedRealtime()) > 0)) {
                                answers[currentQuestionIndex] = value
                                selectedOptionIds[currentQuestionIndex] = optionId
                                if (checkpointEnabled) {
                                    checkpointDirty = true
                                    checkpointStatus = R.string.se_checkpoint_saving
                                    checkpointSignals.trySend(Unit)
                                }
                                if (!isSelfExam) examStorage.saveAnswer(answerAttempt, currentQuestion.id, value)
                                examStorage.saveWarnings(warningCount, faceMissingWarnings)
                                showSavedMessage = true
                            }
                        },
                        noCopyToolbar = noCopyToolbar
                    )

                    if (checkpointEnabled) {
                        Text(stringResource(checkpointStatus), style = MaterialTheme.typography.bodySmall,
                            modifier = Modifier.semantics { liveRegion = androidx.compose.ui.semantics.LiveRegionMode.Polite })
                        if (checkpointStatus == R.string.se_checkpoint_failed || checkpointStatus == R.string.se_checkpoint_conflict) {
                            TextButton(onClick = {
                                if (checkpointStatus == R.string.se_checkpoint_conflict) {
                                    checkpointReloadRequested = true
                                    checkpointReady = false
                                }
                                checkpointSignals.trySend(Unit)
                            }) { Text(stringResource(if (checkpointStatus == R.string.se_checkpoint_conflict) R.string.se_checkpoint_reload else R.string.se_checkpoint_retry)) }
                        }
                    }
                    SaveStatusRow(
                        selfExam = isSelfExam,
                        checkpointEnabled = checkpointEnabled,
                        showSaved = showSavedMessage,
                        isLocked = isCurrentQuestionLocked && exam.lockAnswers,
                        faceStatus = faceStatus
                    )

                    if (!isSelfExam) ExamSaveButton(
                        lockAnswers = exam.lockAnswers,
                        enabled = !isCurrentQuestionLocked || !exam.lockAnswers,
                        onClick = {
                            if (!isSelfExam) examStorage.saveAnswer(answerAttempt, currentQuestion.id, answers[currentQuestionIndex])
                            examStorage.saveWarnings(warningCount, faceMissingWarnings)
                            if (answers[currentQuestionIndex].isNotBlank()) {
                                lockedQuestions[currentQuestionIndex] = true
                            }
                            showSavedMessage = true
                        }
                    )
                }

                ExamActionBar(
                    canGoPrevious = currentQuestionIndex > 0,
                    canGoNext = currentQuestionIndex < questions.lastIndex,
                    isLastQuestion = currentQuestionIndex == questions.lastIndex,
                    onPrevious = {
                        if (currentQuestionIndex > 0) {
                            currentQuestionIndex--
                            showSavedMessage = false
                        }
                    },
                    onNext = {
                        if (currentQuestionIndex < questions.lastIndex) {
                            currentQuestionIndex++
                            showSavedMessage = false
                        } else {
                            showReviewSheet = true
                        }
                    },
                    onReview = { showReviewSheet = true }
                )
            }

            if (!hasCameraPermission) {
                CameraPermissionNotice(
                    modifier = Modifier
                        .align(Alignment.BottomEnd)
                        .navigationBarsPadding()
                        .padding(end = 16.dp, bottom = 18.dp)
                )
            } else {
                FloatingCameraMonitor(
                    modifier = Modifier
                        .align(Alignment.BottomEnd)
                        .navigationBarsPadding()
                        .padding(end = 16.dp, bottom = 18.dp),
                    cameraHardwareReady = cameraHardwareReady,
                    submissionIdle = submissionState == ExamSubmissionState.IDLE,
                    faceStatus = faceStatus,
                    separateSensorFailures = !isSelfExam,
                    sensorHealth = cameraSensorHealth,
                    onSensorHealthChanged = { cameraSensorHealth = it },
                    isAudioCalibrating = isAudioCalibrating,
                    audioCalibrationProgress = audioCalibrationProgress,
                    alertPulseActive = alertPulseActive,
                    alertGlowAlpha = alertGlowAlpha,
                    onFaceStatusChanged = { status ->
                        faceStatus = status
                        if (status == FaceStatus.FACE_FOUND) hasFaceBeenDetectedOnce = true
                        val shouldWarn = shouldCountFaceWarning(
                            status = status,
                            sensorHealth = if (isSelfExam) CameraSensorHealth.HEALTHY else cameraSensorHealth,
                            monitoringEnabled = monitoringEnabled,
                            hasFaceBeenDetectedOnce = hasFaceBeenDetectedOnce
                        )
                        if (shouldWarn) {
                            val now = currentTimeMillis()
                            if (now - lastFaceWarningTime > 5000) {
                                faceMissingWarnings++
                                onFaceWarningsChanged(faceMissingWarnings)
                                autoSaveProgress()
                                showWarningDialog = true
                                lastFaceWarningTime = now
                                haptics.performHapticFeedback(HapticFeedbackType.LongPress)
                            }
                        }
                    },
                    onPreviewSnapshot = { onCameraPreviewChanged(it) },
                    onPhoneDetectedWithLabels = { labels ->
                        if (monitoringEnabled) {
                            val now = currentTimeMillis()
                            if (now - lastPhoneWarningTime > 8000) {
                                phoneWarnings++
                                lastPhoneWarningTime = now
                                onPhoneDetected(labels)
                                autoSaveProgress()
                                showWarningDialog = true
                                haptics.performHapticFeedback(HapticFeedbackType.LongPress)
                            }
                        }
                    }
                )
            }
        }
    }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ExamModeHeader(
    title: String,
    timeLeft: Int,
    questionTimeLeft: Int,
    warningCount: Int,
    suspicionScore: Int,
    currentQuestionNumber: Int,
    totalQuestions: Int,
    progress: Float,
    onOpenReview: () -> Unit
) {
    val isLight = if (LocalSelfExamPresentation.current) SelfExamDesign.isLight else MaterialTheme.colorScheme.background == CheatLockLightBackground
    val topBarBg = if (isLight) {
        Brush.verticalGradient(listOf(Color.White, Color.White))
    } else {
        Brush.verticalGradient(listOf(selfExamColor(Color(0xFF07111F), SelfExamDesign.surface), Color(0xFF050A14)))
    }
    val topBarBorder = if (isLight) selfExamColor(CheatLockLightBorder, SelfExamDesign.border) else Color(0xFF7091B4).copy(alpha = 0.18f)

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(18.dp))
            .background(topBarBg)
            .border(1.dp, topBarBorder, RoundedCornerShape(18.dp))
            .padding(14.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        FlowRow(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            FlowRow( horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Image(
                    painter = painterResource(id = com.jubayer.cheatlock.R.drawable.cheatlock_logo_sidebar_svg),
                    contentDescription = stringResource(R.string.se_cheatlock_logo),
                    modifier = Modifier
                        .size(30.dp)
                        .clip(RoundedCornerShape(6.dp))
                )
                Text("CheatLock", color = if (isLight) selfExamColor(CheatLockLightTextPrimary, SelfExamDesign.text) else selfExamColor(Color(0xFFF7F9FC), SelfExamDesign.text), fontWeight = FontWeight.Bold, fontSize = 15.sp)
            }

            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp),) {
                CompactExamPill(
                    icon = Icons.Default.Timer,
                    text = if (LocalSelfExamPresentation.current) selfExamTime(timeLeft) else formatExamTime(timeLeft),
                    color = when {
                        timeLeft <= 60 -> selfExamColor(CheatLockDanger, SelfExamDesign.error)
                        timeLeft <= 600 -> selfExamColor(CheatLockWarning, SelfExamDesign.warning)
                        else -> if (isLight) selfExamColor(CheatLockLightPrimary, SelfExamDesign.accent) else selfExamColor(Color(0xFFF7F9FC), SelfExamDesign.text)
                    }
                )
                if (warningCount > 0 || suspicionScore > 0) {
                    CompactExamPill(
                        icon = Icons.Default.Warning,
                        text = "${warningCount.coerceAtLeast(1)}/5",
                        color = if (warningCount >= 4) selfExamColor(CheatLockDanger, SelfExamDesign.error) else selfExamColor(CheatLockWarning, SelfExamDesign.warning)
                    )
                }
                IconButton(onClick = onOpenReview, modifier = Modifier.size(48.dp)) {
                    Icon(Icons.Default.MoreVert, contentDescription = stringResource(R.string.se_open_exam_review), tint = if (isLight) selfExamColor(CheatLockLightTextSecondary, SelfExamDesign.secondaryText) else selfExamColor(Color(0xFF9AA8BC), SelfExamDesign.secondaryText))
                }
            }
        }

        Text(title, color = if (isLight) selfExamColor(CheatLockLightTextPrimary, SelfExamDesign.text) else selfExamColor(Color(0xFFF7F9FC), SelfExamDesign.text), fontWeight = FontWeight.SemiBold, fontSize = 17.sp)
        FlowRow(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Text(
                stringResource(R.string.se_question_position, selfExamNumber(currentQuestionNumber), selfExamNumber(totalQuestions)),
                color = if (isLight) selfExamColor(CheatLockLightTextSecondary, SelfExamDesign.secondaryText) else selfExamColor(Color(0xFF9AA8BC), SelfExamDesign.secondaryText),
                fontSize = 13.sp,
                fontWeight = FontWeight.Medium
            )
            Text(
                stringResource(R.string.se_question_timer, if (LocalSelfExamPresentation.current) selfExamTime(questionTimeLeft) else formatExamTime(questionTimeLeft)),
                color = if (isLight) selfExamColor(CheatLockLightTextSecondary, SelfExamDesign.secondaryText) else selfExamColor(Color(0xFF64748B), SelfExamDesign.secondaryText),
                fontSize = 12.sp
            )
        }
        LinearProgressIndicator(
            progress = { progress.coerceIn(0f, 1f) },
            color = if (isLight) selfExamColor(CheatLockLightPrimary, SelfExamDesign.accent) else selfExamColor(Color(0xFF087CFF), SelfExamDesign.action),
            trackColor = if (isLight) selfExamColor(CheatLockLightSurfaceSubtle, SelfExamDesign.inset) else selfExamColor(Color(0xFF9AA8BC), SelfExamDesign.secondaryText).copy(alpha = 0.16f),
            modifier = Modifier
                .fillMaxWidth()
                .height(5.dp)
                .clip(RoundedCornerShape(999.dp))
        )
    }
}

@Composable
private fun CompactExamPill(icon: androidx.compose.ui.graphics.vector.ImageVector, text: String, color: Color) {
    val isLight = if (LocalSelfExamPresentation.current) SelfExamDesign.isLight else MaterialTheme.colorScheme.background == CheatLockLightBackground
    val pillBg = if (isLight) Color.White else Color(0xFF0D1C30)

    Row(
        modifier = Modifier
            .clip(RoundedCornerShape(999.dp))
            .background(pillBg)
            .border(1.dp, color.copy(alpha = if (isLight) 0.5f else 0.35f), RoundedCornerShape(999.dp))
            .padding(horizontal = 9.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(5.dp)
    ) {
        Icon(icon, contentDescription = null, tint = color, modifier = Modifier.size(14.dp))
        Text(text, color = color, fontWeight = FontWeight.SemiBold, fontSize = 12.sp)
    }
}

@Composable
private fun CompactSecurityStrip(
    hasCameraPermission: Boolean,
    faceStatus: FaceStatus,
    isAudioCalibrating: Boolean,
    warningCount: Int
) {
    val isLight = if (LocalSelfExamPresentation.current) SelfExamDesign.isLight else MaterialTheme.colorScheme.background == CheatLockLightBackground
    val statusText = when {
        !hasCameraPermission -> stringResource(R.string.camera_permission_needed)
        isAudioCalibrating -> stringResource(R.string.calibrating_audio)
        faceStatus == FaceStatus.FACE_FOUND -> stringResource(if (LocalSelfExamPresentation.current) R.string.se_face_found else R.string.exam_secure)
        faceStatus == FaceStatus.CHECKING -> stringResource(R.string.checking_face)
        else -> stringResource(R.string.security_attention_needed)
    }
    val statusColor = when {
        !hasCameraPermission -> selfExamColor(CheatLockDanger, SelfExamDesign.error)
        warningCount >= 4 -> selfExamColor(CheatLockDanger, SelfExamDesign.error)
        warningCount > 0 -> selfExamColor(CheatLockWarning, SelfExamDesign.warning)
        faceStatus == FaceStatus.FACE_FOUND -> selfExamColor(CheatLockSuccess, SelfExamDesign.success)
        else -> if (isLight) selfExamColor(CheatLockLightPrimary, SelfExamDesign.accent) else selfExamColor(Color(0xFF169BFF), SelfExamDesign.accent)
    }
    val stripBg = if (isLight) Color.White else selfExamColor(Color(0xFF091525), SelfExamDesign.surface)
    val stripBorder = if (isLight) selfExamColor(CheatLockLightBorder, SelfExamDesign.border) else Color(0xFF7091B4).copy(alpha = 0.18f)

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(stripBg)
            .border(1.dp, stripBorder, RoundedCornerShape(16.dp))
            .padding(horizontal = 14.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Row(modifier = Modifier.weight(1f), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Box(
                modifier = Modifier
                    .size(30.dp)
                    .clip(CircleShape)
                    .background(statusColor.copy(alpha = 0.14f)),
                contentAlignment = Alignment.Center
            ) {
                Icon(Icons.Default.Shield, contentDescription = null, tint = statusColor, modifier = Modifier.size(17.dp))
            }
            Column(Modifier.weight(1f)) {
                Text(
                    statusText,
                    color = if (isLight) selfExamColor(CheatLockLightTextPrimary, SelfExamDesign.text) else selfExamColor(Color(0xFFF7F9FC), SelfExamDesign.text),
                    fontWeight = FontWeight.SemiBold,
                    fontSize = 14.sp
                )
                Text(
                    stringResource(if (LocalSelfExamPresentation.current) R.string.se_camera_and_microphone_status else R.string.monitoring_background),
                    color = if (isLight) selfExamColor(CheatLockLightTextSecondary, SelfExamDesign.secondaryText) else selfExamColor(Color(0xFF64748B), SelfExamDesign.secondaryText),
                    fontSize = 12.sp
                )
            }
        }
        if (warningCount > 0) {
            Text("${warningCount}/5", color = statusColor, fontWeight = FontWeight.Bold, fontSize = 13.sp)
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun QuestionNavigator(
    totalQuestions: Int,
    currentQuestionIndex: Int,
    answers: List<String>,
    flaggedQuestions: List<Boolean>,
    onQuestionClick: (Int) -> Unit
) {
    val isLight = if (LocalSelfExamPresentation.current) SelfExamDesign.isLight else MaterialTheme.colorScheme.background == CheatLockLightBackground
    val navBg = if (isLight) Color.White else selfExamColor(Color(0xFF091525), SelfExamDesign.surface)
    val navBorder = if (isLight) selfExamColor(CheatLockLightBorder, SelfExamDesign.border) else Color(0xFF7091B4).copy(alpha = 0.16f)

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(navBg)
            .border(1.dp, navBorder, RoundedCornerShape(16.dp))
            .padding(14.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        FlowRow(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text(
                stringResource(R.string.questions),
                color = if (isLight) selfExamColor(CheatLockLightTextPrimary, SelfExamDesign.text) else selfExamColor(Color(0xFFF7F9FC), SelfExamDesign.text),
                fontWeight = FontWeight.Bold,
                fontSize = 16.sp
            )
            FlowRow(horizontalArrangement = Arrangement.spacedBy(10.dp),) {
                LegendDot(selfExamColor(CheatLockSuccess, SelfExamDesign.success), stringResource(R.string.answered))
                LegendDot(if (isLight) selfExamColor(CheatLockLightTextSecondary, SelfExamDesign.secondaryText) else selfExamColor(Color(0xFF94A3B8), SelfExamDesign.secondaryText), stringResource(R.string.open_unanswered))
                LegendDot(selfExamColor(CheatLockWarning, SelfExamDesign.warning), stringResource(R.string.review))
            }
        }
        FlowRow(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            repeat(totalQuestions) { index ->
                val isCurrent = currentQuestionIndex == index
                val isAnswered = answers.getOrNull(index).orEmpty().isNotBlank()
                val isFlagged = flaggedQuestions.getOrNull(index) == true
                val accent = when {
                    isFlagged -> selfExamColor(CheatLockWarning, SelfExamDesign.warning)
                    isAnswered -> selfExamColor(CheatLockSuccess, SelfExamDesign.success)
                    else -> if (isLight) selfExamColor(CheatLockLightTextSecondary, SelfExamDesign.secondaryText) else selfExamColor(Color(0xFF64748B), SelfExamDesign.secondaryText)
                }
                val questionState = listOfNotNull(if (isCurrent) stringResource(R.string.se_selected) else null, if (isAnswered) stringResource(R.string.answered) else stringResource(R.string.unanswered), if (isFlagged) stringResource(R.string.flagged_for_review) else null).joinToString(", ")
                val chipBg = when {
                    isCurrent -> if (isLight) selfExamColor(CheatLockLightPrimary, SelfExamDesign.accent) else selfExamColor(Color(0xFF087CFF), SelfExamDesign.action)
                    isFlagged -> if (isLight) CheatLockLightWarningContainer else selfExamColor(Color(0xFF0B1829), SelfExamDesign.surface)
                    isAnswered -> if (isLight) CheatLockLightSuccessContainer else selfExamColor(Color(0xFF0B1829), SelfExamDesign.surface)
                    else -> if (isLight) selfExamColor(CheatLockLightSurfaceSubtle, SelfExamDesign.inset) else selfExamColor(Color(0xFF0B1829), SelfExamDesign.surface)
                }
                val chipBorder = when {
                    isCurrent -> if (isLight) selfExamColor(CheatLockLightPrimary, SelfExamDesign.accent) else Color(0xFF16B8FF)
                    isFlagged -> selfExamColor(CheatLockWarning, SelfExamDesign.warning).copy(alpha = 0.5f)
                    isAnswered -> selfExamColor(CheatLockSuccess, SelfExamDesign.success).copy(alpha = 0.5f)
                    else -> if (isLight) selfExamColor(CheatLockLightBorder, SelfExamDesign.border) else accent.copy(alpha = 0.35f)
                }

                Box(
                    modifier = Modifier
                        .size(48.dp)
                        .clip(RoundedCornerShape(10.dp))
                        .background(chipBg)
                        .border(1.dp, chipBorder, RoundedCornerShape(10.dp))
                        .semantics { stateDescription = questionState }.clickable { onQuestionClick(index) },
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = if (isFlagged) selfExamNumber(index + 1) + "*" else selfExamNumber(index + 1),
                        color = if (isCurrent) Color.White else accent,
                        fontWeight = FontWeight.Bold,
                        fontSize = 12.sp
                    )
                }
            }
        }
    }
}

@Composable
private fun LegendDot(color: Color, text: String) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
        Box(Modifier.size(7.dp).clip(CircleShape).background(color))
        Text(text, color = color, fontSize = 10.sp)
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ExamQuestionCard(
    question: IndexedQuestion,
    questionNumber: Int,
    totalQuestions: Int,
    answer: String,
    isLocked: Boolean,
    isFlagged: Boolean,
    onToggleFlag: () -> Unit,
    onAnswerChange: (String, String?) -> Unit,
    selectedOptionId: String?,
    noCopyToolbar: TextToolbar
) {
    val isLight = if (LocalSelfExamPresentation.current) SelfExamDesign.isLight else MaterialTheme.colorScheme.background == CheatLockLightBackground
    val cardBg = if (isLight) Color.White else selfExamColor(Color(0xFF0B1829), SelfExamDesign.surface)
    val cardBorder = if (isLight) selfExamColor(CheatLockLightBorder, SelfExamDesign.border) else Color(0xFF7091B4).copy(alpha = 0.18f)

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(18.dp))
            .background(cardBg)
            .border(1.dp, cardBorder, RoundedCornerShape(18.dp))
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        FlowRow(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(
                stringResource(R.string.question_number_format, questionNumber),
                color = if (isLight) selfExamColor(CheatLockLightTextSecondary, SelfExamDesign.secondaryText) else selfExamColor(Color(0xFF94A3B8), SelfExamDesign.secondaryText),
                fontWeight = FontWeight.SemiBold,
                fontSize = 13.sp
            )
            Text(
                if (question.type == QuestionType.MCQ) stringResource(R.string.multiple_choice) else stringResource(R.string.written_answer),
                color = if (isLight) selfExamColor(CheatLockLightPrimary, SelfExamDesign.accent) else selfExamColor(Color(0xFF169BFF), SelfExamDesign.accent),
                fontWeight = FontWeight.SemiBold,
                fontSize = 12.sp
            )
        }
        Text(
            question.text,
            color = if (isLight) selfExamColor(CheatLockLightTextPrimary, SelfExamDesign.text) else selfExamColor(Color(0xFFF7F9FC), SelfExamDesign.text),
            fontWeight = FontWeight.SemiBold,
            fontSize = 21.sp,
            lineHeight = 28.sp
        )

        if (isLocked) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(12.dp))
                    .background(selfExamColor(CheatLockWarning, SelfExamDesign.warning).copy(alpha = 0.12f))
                    .padding(12.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Icon(Icons.Default.Lock, contentDescription = null, tint = selfExamColor(CheatLockWarning, SelfExamDesign.warning), modifier = Modifier.size(16.dp))
                Text(stringResource(R.string.answer_is_locked), color = selfExamColor(CheatLockWarning, SelfExamDesign.warning), fontSize = 13.sp, fontWeight = FontWeight.Medium)
            }
        }

        if (question.type == QuestionType.MCQ) {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                question.options.forEachIndexed { index, option ->
                    McqAnswerRow(
                        label = ('A' + index).toString(),
                        option = option,
                        selected = if (selectedOptionId != null) question.optionIds.getOrNull(index) == selectedOptionId else answer == option,
                        enabled = !isLocked,
                        onClick = { onAnswerChange(option, question.optionIds.getOrNull(index)) }
                    )
                }
            }
        } else {
            androidx.compose.runtime.CompositionLocalProvider(LocalTextToolbar provides noCopyToolbar) {
                OutlinedTextField(
                    value = answer,
                    onValueChange = { onAnswerChange(it, null) },
                    label = { Text(stringResource(R.string.type_answer_here)) },
                    enabled = !isLocked,
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(min = 190.dp),
                    textStyle = MaterialTheme.typography.bodyLarge.copy(
                        color = if (isLight) selfExamColor(CheatLockLightTextPrimary, SelfExamDesign.text) else selfExamColor(Color(0xFFF7F9FC), SelfExamDesign.text)
                    ),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = if (isLight) selfExamColor(CheatLockLightPrimary, SelfExamDesign.accent) else selfExamColor(Color(0xFF087CFF), SelfExamDesign.action),
                        unfocusedBorderColor = if (isLight) selfExamColor(CheatLockLightBorder, SelfExamDesign.border) else Color(0xFF7091B4).copy(alpha = 0.22f),
                        focusedContainerColor = if (isLight) selfExamColor(CheatLockLightSurfaceSubtle, SelfExamDesign.inset) else selfExamColor(Color(0xFF07111F), SelfExamDesign.surface),
                        unfocusedContainerColor = if (isLight) selfExamColor(CheatLockLightSurfaceSubtle, SelfExamDesign.inset) else selfExamColor(Color(0xFF07111F), SelfExamDesign.surface),
                        focusedLabelColor = if (isLight) selfExamColor(CheatLockLightPrimary, SelfExamDesign.accent) else selfExamColor(Color(0xFF169BFF), SelfExamDesign.accent),
                        unfocusedLabelColor = if (isLight) selfExamColor(CheatLockLightTextSecondary, SelfExamDesign.secondaryText) else selfExamColor(Color(0xFF64748B), SelfExamDesign.secondaryText),
                        cursorColor = if (isLight) selfExamColor(CheatLockLightPrimary, SelfExamDesign.accent) else selfExamColor(Color(0xFF169BFF), SelfExamDesign.accent)
                    ),
                    shape = RoundedCornerShape(14.dp)
                )
            }
        }

        TextButton(onClick = onToggleFlag, contentPadding = PaddingValues(horizontal = 0.dp)) {
            Icon(
                if (isFlagged) Icons.Default.Star else Icons.Default.StarBorder,
                contentDescription = null,
                tint = if (isFlagged) selfExamColor(CheatLockWarning, SelfExamDesign.warning) else (if (isLight) selfExamColor(CheatLockLightTextSecondary, SelfExamDesign.secondaryText) else selfExamColor(Color(0xFF94A3B8), SelfExamDesign.secondaryText)),
                modifier = Modifier.size(18.dp)
            )
            Spacer(Modifier.width(6.dp))
            Text(
                if (isFlagged) stringResource(R.string.flagged_for_review) else stringResource(R.string.flag_for_review),
                color = if (isFlagged) selfExamColor(CheatLockWarning, SelfExamDesign.warning) else (if (isLight) selfExamColor(CheatLockLightTextSecondary, SelfExamDesign.secondaryText) else selfExamColor(Color(0xFF94A3B8), SelfExamDesign.secondaryText)),
                fontWeight = FontWeight.Medium
            )
        }
    }
}

@Composable
private fun McqAnswerRow(label: String, option: String, selected: Boolean, enabled: Boolean, onClick: () -> Unit) {
    val isLight = if (LocalSelfExamPresentation.current) SelfExamDesign.isLight else MaterialTheme.colorScheme.background == CheatLockLightBackground
    val rowBg = when {
        selected -> if (isLight) CheatLockLightPrimaryContainer else selfExamColor(Color(0xFF087CFF), SelfExamDesign.action).copy(alpha = 0.18f)
        else -> if (isLight) Color.White else selfExamColor(Color(0xFF07111F), SelfExamDesign.surface)
    }
    val rowBorder = when {
        selected -> if (isLight) selfExamColor(CheatLockLightPrimary, SelfExamDesign.accent) else Color(0xFF16B8FF)
        else -> if (isLight) selfExamColor(CheatLockLightBorder, SelfExamDesign.border) else Color(0xFF7091B4).copy(alpha = 0.22f)
    }
    val labelBg = when {
        selected -> if (isLight) selfExamColor(CheatLockLightPrimary, SelfExamDesign.accent) else selfExamColor(Color(0xFF087CFF), SelfExamDesign.action)
        else -> if (isLight) selfExamColor(CheatLockLightSurfaceSubtle, SelfExamDesign.inset) else Color(0xFF101E31)
    }
    val labelText = when {
        selected -> Color.White
        else -> if (isLight) selfExamColor(CheatLockLightTextSecondary, SelfExamDesign.secondaryText) else selfExamColor(Color(0xFF9AA8BC), SelfExamDesign.secondaryText)
    }

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = 56.dp)
            .clip(RoundedCornerShape(13.dp))
            .background(rowBg)
            .border(1.dp, rowBorder, RoundedCornerShape(13.dp))
            .selectable(selected = selected, enabled = enabled, role = Role.RadioButton, onClick = onClick)
            .padding(horizontal = 14.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Box(
            modifier = Modifier
                .size(28.dp)
                .clip(CircleShape)
                .background(labelBg),
            contentAlignment = Alignment.Center
        ) {
            Text(label, color = labelText, fontWeight = FontWeight.Bold, fontSize = 12.sp)
        }
        Text(
            option,
            color = if (isLight) selfExamColor(CheatLockLightTextPrimary, SelfExamDesign.text) else selfExamColor(Color(0xFFF7F9FC), SelfExamDesign.text),
            fontSize = 15.sp,
            modifier = Modifier.weight(1f)
        )
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun SaveStatusRow(showSaved: Boolean, isLocked: Boolean, faceStatus: FaceStatus, selfExam: Boolean = false, checkpointEnabled: Boolean = false) {
    FlowRow(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Icon(Icons.Default.CheckCircle, contentDescription = null, tint = selfExamColor(CheatLockSuccess, SelfExamDesign.success), modifier = Modifier.size(15.dp))
            Text(if (checkpointEnabled) stringResource(R.string.se_checkpoint_policy) else if (selfExam) stringResource(R.string.se_changes_remain_in_memory_until_submission) else if (showSaved) stringResource(R.string.auto_saved) else stringResource(R.string.answers_save_locally), color = selfExamColor(Color(0xFF9AA8BC), SelfExamDesign.secondaryText), fontSize = 12.sp)
        }
        Text(
            if (isLocked) stringResource(R.string.locked) else selfExamFaceStatus(faceStatus),
            color = if (isLocked) selfExamColor(CheatLockWarning, SelfExamDesign.warning) else selfExamColor(Color(0xFF64748B), SelfExamDesign.secondaryText),
            fontSize = 12.sp
        )
    }
}

@Composable
private fun ExamSaveButton(lockAnswers: Boolean, enabled: Boolean, onClick: () -> Unit) {
    val isLight = if (LocalSelfExamPresentation.current) SelfExamDesign.isLight else MaterialTheme.colorScheme.background == CheatLockLightBackground
    Button(
        onClick = onClick,
        enabled = enabled,
        modifier = Modifier.fillMaxWidth().heightIn(min = 54.dp),
        colors = ButtonDefaults.buttonColors(
            containerColor = if (isLight) selfExamColor(CheatLockLightPrimary, SelfExamDesign.accent) else selfExamColor(Color(0xFF087CFF), SelfExamDesign.action),
            disabledContainerColor = if (isLight) selfExamColor(CheatLockLightSurfaceSubtle, SelfExamDesign.inset) else Color(0xFF0D1C30)
        ),
        shape = RoundedCornerShape(14.dp)
    ) {
        Icon(Icons.Default.Save, contentDescription = null, modifier = Modifier.size(18.dp))
        Spacer(Modifier.width(8.dp))
        Text(if (lockAnswers) stringResource(R.string.save_and_lock_answer) else stringResource(R.string.save_answer), fontWeight = FontWeight.Bold)
    }
}

@Composable
private fun ExamActionBar(
    canGoPrevious: Boolean,
    canGoNext: Boolean,
    isLastQuestion: Boolean,
    onPrevious: () -> Unit,
    onNext: () -> Unit,
    onReview: () -> Unit
) {
    val isLight = if (LocalSelfExamPresentation.current) SelfExamDesign.isLight else MaterialTheme.colorScheme.background == CheatLockLightBackground
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            OutlinedButton(
                onClick = onPrevious,
                enabled = canGoPrevious,
                modifier = Modifier.weight(1f).heightIn(min = 52.dp),
                shape = RoundedCornerShape(13.dp),
                border = BorderStroke(1.dp, if (isLight) selfExamColor(CheatLockLightBorder, SelfExamDesign.border) else Color(0xFF7091B4).copy(alpha = 0.25f)),
                colors = ButtonDefaults.outlinedButtonColors(
                    contentColor = if (isLight) selfExamColor(CheatLockLightPrimary, SelfExamDesign.accent) else selfExamColor(Color(0xFF169BFF), SelfExamDesign.accent)
                )
            ) {
                Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = null, modifier = Modifier.size(18.dp))
                Spacer(Modifier.width(6.dp))
                Text(stringResource(R.string.previous), fontWeight = FontWeight.SemiBold)
            }
            Button(
                onClick = onNext,
                modifier = Modifier.weight(1f).heightIn(min = 52.dp),
                shape = RoundedCornerShape(13.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = if (isLight) selfExamColor(CheatLockLightPrimary, SelfExamDesign.accent) else selfExamColor(Color(0xFF087CFF), SelfExamDesign.action)
                )
            ) {
                Text(if (canGoNext) stringResource(R.string.next) else stringResource(R.string.review), fontWeight = FontWeight.Bold)
                Spacer(Modifier.width(6.dp))
                Icon(Icons.AutoMirrored.Filled.ArrowForward, contentDescription = null, modifier = Modifier.size(18.dp))
            }
        }
        if (!isLastQuestion) {
            TextButton(onClick = onReview, modifier = Modifier.fillMaxWidth()) {
                Text(stringResource(R.string.review), color = if (isLight) selfExamColor(CheatLockLightTextSecondary, SelfExamDesign.secondaryText) else selfExamColor(Color(0xFF9AA8BC), SelfExamDesign.secondaryText), fontWeight = FontWeight.Medium)
            }
        }
    }
}

@Composable
private fun FloatingCameraMonitor(
    modifier: Modifier,
    cameraHardwareReady: Boolean,
    submissionIdle: Boolean,
    faceStatus: FaceStatus,
    separateSensorFailures: Boolean,
    sensorHealth: CameraSensorHealth,
    onSensorHealthChanged: (CameraSensorHealth) -> Unit,
    isAudioCalibrating: Boolean,
    audioCalibrationProgress: Float,
    alertPulseActive: Boolean,
    alertGlowAlpha: Float,
    onFaceStatusChanged: (FaceStatus) -> Unit,
    onPreviewSnapshot: (String) -> Unit,
    onPhoneDetectedWithLabels: (String) -> Unit
) {
    Box(
        modifier = modifier
            .width(82.dp)
            .height(108.dp)
            .clip(RoundedCornerShape(16.dp))
            .background(Color.Black)
            .border(
                1.5.dp,
                if (alertPulseActive) selfExamColor(CheatLockDanger, SelfExamDesign.error).copy(alpha = alertGlowAlpha) else selfExamColor(CheatLockSuccess, SelfExamDesign.success).copy(alpha = 0.7f),
                RoundedCornerShape(16.dp)
            )
    ) {
        if (cameraHardwareReady && submissionIdle) {
            CameraPreview(
                modifier = Modifier.fillMaxSize(),
                preferFastStartup = true,
                separateSensorFailures = separateSensorFailures,
                onSensorHealthChanged = onSensorHealthChanged,
                onFaceStatusChanged = onFaceStatusChanged,
                onPreviewSnapshot = onPreviewSnapshot,
                onPhoneDetectedWithLabels = onPhoneDetectedWithLabels
            )
        }

        if (separateSensorFailures && sensorHealth != CameraSensorHealth.HEALTHY) {
            Text(
                sensorHealth.displayLabel,
                modifier = Modifier.align(Alignment.TopCenter).background(Color.Black.copy(alpha = 0.8f)).padding(4.dp),
                color = Color.White,
                fontSize = 8.sp,
                maxLines = 3
            )
        }

        if (isAudioCalibrating && submissionIdle) {
            Box(
                modifier = Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.78f)).padding(8.dp),
                contentAlignment = Alignment.Center
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Icon(Icons.AutoMirrored.Filled.VolumeUp, contentDescription = null, tint = selfExamColor(Color(0xFF169BFF), SelfExamDesign.accent), modifier = Modifier.size(18.dp))
                    LinearProgressIndicator(
                        progress = { audioCalibrationProgress },
                        color = selfExamColor(Color(0xFF169BFF), SelfExamDesign.accent),
                        trackColor = Color.White.copy(alpha = 0.18f),
                        modifier = Modifier.fillMaxWidth().height(3.dp).clip(RoundedCornerShape(999.dp))
                    )
                }
            }
        }

        Row(
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .fillMaxWidth()
                .background(Color.Black.copy(alpha = 0.68f))
                .padding(horizontal = 7.dp, vertical = 5.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.Center
        ) {
            Box(
                Modifier
                    .size(7.dp)
                    .clip(CircleShape)
                    .background(if (faceStatus == FaceStatus.FACE_FOUND) selfExamColor(CheatLockSuccess, SelfExamDesign.success) else selfExamColor(Color(0xFF169BFF), SelfExamDesign.accent))
            )
            Spacer(Modifier.width(4.dp))
            Text(stringResource(R.string.live_badge), color = Color.White, fontWeight = FontWeight.Bold, fontSize = 9.sp)
        }
    }
}

@Composable
private fun CameraPermissionNotice(modifier: Modifier) {
    Row(
        modifier = modifier
            .clip(RoundedCornerShape(14.dp))
            .background(selfExamColor(CheatLockDanger, SelfExamDesign.error).copy(alpha = 0.16f))
            .border(1.dp, selfExamColor(CheatLockDanger, SelfExamDesign.error).copy(alpha = 0.4f), RoundedCornerShape(14.dp))
            .padding(horizontal = 12.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        Icon(Icons.Default.VideocamOff, contentDescription = null, tint = selfExamColor(CheatLockDanger, SelfExamDesign.error), modifier = Modifier.size(18.dp))
        Text(stringResource(R.string.camera_needed), color = selfExamColor(CheatLockDanger, SelfExamDesign.error), fontWeight = FontWeight.SemiBold, fontSize = 12.sp)
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ReviewExamDialog(
    totalQuestions: Int,
    answeredCount: Int,
    unansweredCount: Int,
    flaggedCount: Int,
    answers: List<String>,
    flaggedQuestions: List<Boolean>,
    onJumpToQuestion: (Int) -> Unit,
    onSubmit: () -> Unit,
    onDismiss: () -> Unit
) {
    val isLight = if (LocalSelfExamPresentation.current) SelfExamDesign.isLight else MaterialTheme.colorScheme.background == CheatLockLightBackground
    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = if (isLight) Color.White else selfExamColor(Color(0xFF07111F), SelfExamDesign.surface),
        titleContentColor = if (isLight) selfExamColor(CheatLockLightTextPrimary, SelfExamDesign.text) else selfExamColor(Color(0xFFF7F9FC), SelfExamDesign.text),
        textContentColor = if (isLight) selfExamColor(CheatLockLightTextSecondary, SelfExamDesign.secondaryText) else selfExamColor(Color(0xFF9AA8BC), SelfExamDesign.secondaryText),
        title = { Text(stringResource(R.string.review_your_exam), fontWeight = FontWeight.Bold) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    ReviewStat(stringResource(R.string.answered), answeredCount.toString(), selfExamColor(CheatLockSuccess, SelfExamDesign.success), Modifier.weight(1f))
                    ReviewStat(stringResource(R.string.unanswered), unansweredCount.toString(), selfExamColor(CheatLockDanger, SelfExamDesign.error), Modifier.weight(1f))
                    ReviewStat(stringResource(R.string.review), flaggedCount.toString(), selfExamColor(CheatLockWarning, SelfExamDesign.warning), Modifier.weight(1f))
                }
                if (unansweredCount > 0) {
                    Text(stringResource(R.string.unanswered_questions), color = if (isLight) selfExamColor(CheatLockLightTextPrimary, SelfExamDesign.text) else selfExamColor(Color(0xFFF7F9FC), SelfExamDesign.text), fontWeight = FontWeight.SemiBold)
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        answers.forEachIndexed { index, value ->
                            if (value.isBlank()) {
                                QuestionJumpChip(index + 1, selfExamColor(CheatLockDanger, SelfExamDesign.error)) { onJumpToQuestion(index) }
                            }
                        }
                    }
                }
                if (flaggedCount > 0) {
                    Text(stringResource(R.string.flagged_for_review_title), color = if (isLight) selfExamColor(CheatLockLightTextPrimary, SelfExamDesign.text) else selfExamColor(Color(0xFFF7F9FC), SelfExamDesign.text), fontWeight = FontWeight.SemiBold)
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        flaggedQuestions.forEachIndexed { index, isFlagged ->
                            if (isFlagged) {
                                QuestionJumpChip(index + 1, selfExamColor(CheatLockWarning, SelfExamDesign.warning)) { onJumpToQuestion(index) }
                            }
                        }
                    }
                }
                Text(stringResource(R.string.total_questions_format, totalQuestions), color = if (isLight) selfExamColor(CheatLockLightTextSecondary, SelfExamDesign.secondaryText) else selfExamColor(Color(0xFF64748B), SelfExamDesign.secondaryText), fontSize = 12.sp)
            }
        },
        confirmButton = {
            Button(
                onClick = onSubmit,
                colors = ButtonDefaults.buttonColors(
                    containerColor = if (isLight) selfExamColor(CheatLockLightPrimary, SelfExamDesign.accent) else selfExamColor(Color(0xFF087CFF), SelfExamDesign.action)
                )
            ) {
                Text(stringResource(R.string.submit_exam))
            }
        },
        dismissButton = {
            OutlinedButton(
                onClick = onDismiss,
                border = BorderStroke(1.dp, if (isLight) selfExamColor(CheatLockLightBorder, SelfExamDesign.border) else Color(0xFF7091B4).copy(alpha = 0.25f)),
                colors = ButtonDefaults.outlinedButtonColors(
                    contentColor = if (isLight) selfExamColor(CheatLockLightPrimary, SelfExamDesign.accent) else selfExamColor(Color(0xFF169BFF), SelfExamDesign.accent)
                )
            ) {
                Text(stringResource(R.string.return_to_exam))
            }
        }
    )
}

@Composable
private fun ReviewStat(label: String, value: String, color: Color, modifier: Modifier = Modifier) {
    val isLight = if (LocalSelfExamPresentation.current) SelfExamDesign.isLight else MaterialTheme.colorScheme.background == CheatLockLightBackground
    Column(
        modifier = modifier
            .clip(RoundedCornerShape(12.dp))
            .background(if (isLight) selfExamColor(CheatLockLightSurfaceSubtle, SelfExamDesign.inset) else selfExamColor(Color(0xFF0B1829), SelfExamDesign.surface))
            .border(1.dp, if (isLight) selfExamColor(CheatLockLightBorder, SelfExamDesign.border) else color.copy(alpha = 0.22f), RoundedCornerShape(12.dp))
            .padding(10.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(value, color = color, fontWeight = FontWeight.Bold, fontSize = 20.sp)
        Text(label, color = if (isLight) selfExamColor(CheatLockLightTextSecondary, SelfExamDesign.secondaryText) else selfExamColor(Color(0xFF9AA8BC), SelfExamDesign.secondaryText), fontSize = 10.sp)
    }
}

@Composable
private fun QuestionJumpChip(number: Int, color: Color, onClick: () -> Unit) {
    Box(
        modifier = Modifier
            .size(48.dp)
            .clip(RoundedCornerShape(10.dp))
            .background(color.copy(alpha = 0.14f))
            .border(1.dp, color.copy(alpha = 0.45f), RoundedCornerShape(10.dp))
            .clickable { onClick() },
        contentAlignment = Alignment.Center
    ) {
        Text(selfExamNumber(number), color = color, fontWeight = FontWeight.Bold, fontSize = 13.sp)
    }
}

@Composable
private fun SubmitConfirmDialog(
    answeredCount: Int,
    unansweredCount: Int,
    flaggedCount: Int,
    totalQuestions: Int,
    onReviewUnanswered: () -> Unit,
    onSubmit: () -> Unit,
    onDismiss: () -> Unit,
    submitting: Boolean
) {
    val isLight = if (LocalSelfExamPresentation.current) SelfExamDesign.isLight else MaterialTheme.colorScheme.background == CheatLockLightBackground
    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = if (isLight) Color.White else selfExamColor(Color(0xFF07111F), SelfExamDesign.surface),
        titleContentColor = if (isLight) selfExamColor(CheatLockLightTextPrimary, SelfExamDesign.text) else selfExamColor(Color(0xFFF7F9FC), SelfExamDesign.text),
        textContentColor = if (isLight) selfExamColor(CheatLockLightTextSecondary, SelfExamDesign.secondaryText) else selfExamColor(Color(0xFF9AA8BC), SelfExamDesign.secondaryText),
        title = { Text(stringResource(R.string.submit_exam_question), fontWeight = FontWeight.Bold) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                if (unansweredCount > 0) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(12.dp))
                            .background(selfExamColor(CheatLockWarning, SelfExamDesign.warning).copy(alpha = 0.12f))
                            .border(1.dp, selfExamColor(CheatLockWarning, SelfExamDesign.warning).copy(alpha = 0.3f), RoundedCornerShape(12.dp))
                            .padding(12.dp),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Icon(Icons.Default.Warning, contentDescription = null, tint = selfExamColor(CheatLockWarning, SelfExamDesign.warning), modifier = Modifier.size(18.dp))
                        Text(stringResource(R.string.unanswered_warning_format, unansweredCount), color = selfExamColor(CheatLockWarning, SelfExamDesign.warning), fontWeight = FontWeight.Medium)
                    }
                } else {
                    Text(stringResource(R.string.ready_to_submit_notice))
                }
                Text(stringResource(R.string.answered_count_format, answeredCount, totalQuestions), color = if (isLight) selfExamColor(CheatLockLightTextPrimary, SelfExamDesign.text) else selfExamColor(Color(0xFFF7F9FC), SelfExamDesign.text))
                Text(stringResource(R.string.unanswered_count_format, unansweredCount), color = if (unansweredCount > 0) selfExamColor(CheatLockDanger, SelfExamDesign.error) else (if (isLight) selfExamColor(CheatLockLightTextSecondary, SelfExamDesign.secondaryText) else selfExamColor(Color(0xFF9AA8BC), SelfExamDesign.secondaryText)))
                Text(stringResource(R.string.review_count_format, flaggedCount), color = if (flaggedCount > 0) selfExamColor(CheatLockWarning, SelfExamDesign.warning) else (if (isLight) selfExamColor(CheatLockLightTextSecondary, SelfExamDesign.secondaryText) else selfExamColor(Color(0xFF9AA8BC), SelfExamDesign.secondaryText)))
            }
        },
        confirmButton = {
            Button(
                enabled = !submitting,
                onClick = onSubmit,
                colors = ButtonDefaults.buttonColors(
                    containerColor = if (unansweredCount > 0) selfExamColor(CheatLockDanger, SelfExamDesign.error) else (if (isLight) selfExamColor(CheatLockLightPrimary, SelfExamDesign.accent) else selfExamColor(Color(0xFF087CFF), SelfExamDesign.action))
                )
            ) {
                Text(if (unansweredCount > 0) stringResource(R.string.submit_anyway) else stringResource(R.string.submit_exam))
            }
        },
        dismissButton = {
            OutlinedButton(
                onClick = if (unansweredCount > 0) onReviewUnanswered else onDismiss,
                border = BorderStroke(1.dp, if (isLight) selfExamColor(CheatLockLightBorder, SelfExamDesign.border) else Color(0xFF7091B4).copy(alpha = 0.25f)),
                colors = ButtonDefaults.outlinedButtonColors(
                    contentColor = if (isLight) selfExamColor(CheatLockLightPrimary, SelfExamDesign.accent) else selfExamColor(Color(0xFF169BFF), SelfExamDesign.accent)
                )
            ) {
                Text(if (unansweredCount > 0) stringResource(R.string.review_unanswered) else stringResource(R.string.keep_reviewing))
            }
        }
    )
}

@Composable
private fun SubmissionFailedDialog(message: String, onRetry: () -> Unit, onReview: () -> Unit) {
    val isLight = if (LocalSelfExamPresentation.current) SelfExamDesign.isLight else MaterialTheme.colorScheme.background == CheatLockLightBackground
    AlertDialog(
        onDismissRequest = onReview,
        containerColor = if (isLight) Color.White else selfExamColor(Color(0xFF07111F), SelfExamDesign.surface),
        titleContentColor = if (isLight) selfExamColor(CheatLockLightTextPrimary, SelfExamDesign.text) else selfExamColor(Color(0xFFF7F9FC), SelfExamDesign.text),
        textContentColor = if (isLight) selfExamColor(CheatLockLightTextSecondary, SelfExamDesign.secondaryText) else selfExamColor(Color(0xFF9AA8BC), SelfExamDesign.secondaryText),
        title = { Text(stringResource(R.string.submission_failed), fontWeight = FontWeight.Bold) },
        text = { Text(if (LocalSelfExamPresentation.current) selfExamMessage(message) else message) },
        confirmButton = {
            Button(
                onClick = onRetry,
                colors = ButtonDefaults.buttonColors(
                    containerColor = if (isLight) selfExamColor(CheatLockLightPrimary, SelfExamDesign.accent) else selfExamColor(Color(0xFF087CFF), SelfExamDesign.action)
                )
            ) {
                Text(stringResource(R.string.try_again))
            }
        },
        dismissButton = {
            OutlinedButton(
                onClick = onReview,
                border = BorderStroke(1.dp, if (isLight) selfExamColor(CheatLockLightBorder, SelfExamDesign.border) else Color(0xFF7091B4).copy(alpha = 0.25f)),
                colors = ButtonDefaults.outlinedButtonColors(
                    contentColor = if (isLight) selfExamColor(CheatLockLightPrimary, SelfExamDesign.accent) else selfExamColor(Color(0xFF169BFF), SelfExamDesign.accent)
                )
            ) {
                Text(stringResource(R.string.review_answers))
            }
        }
    )
}

@Composable
private fun SecurityWarningDialog(warningCount: Int, onConfirm: () -> Unit) {
    val isLight = if (LocalSelfExamPresentation.current) SelfExamDesign.isLight else MaterialTheme.colorScheme.background == CheatLockLightBackground
    val isFinal = warningCount >= 4
    AlertDialog(
        onDismissRequest = {},
        containerColor = if (isLight) Color.White else selfExamColor(Color(0xFF07111F), SelfExamDesign.surface),
        titleContentColor = if (isFinal) selfExamColor(CheatLockDanger, SelfExamDesign.error) else selfExamColor(CheatLockWarning, SelfExamDesign.warning),
        textContentColor = if (isLight) selfExamColor(CheatLockLightTextSecondary, SelfExamDesign.secondaryText) else selfExamColor(Color(0xFF9AA8BC), SelfExamDesign.secondaryText),
        icon = {
            Icon(Icons.Default.Warning, contentDescription = null, tint = if (isFinal) selfExamColor(CheatLockDanger, SelfExamDesign.error) else selfExamColor(CheatLockWarning, SelfExamDesign.warning))
        },
        title = { Text(if (isFinal) stringResource(R.string.final_warning) else stringResource(R.string.security_warning), fontWeight = FontWeight.Bold) },
        text = {
            Text(
                if (isFinal) {
                    stringResource(R.string.final_warning_body, warningCount)
                } else {
                    stringResource(R.string.security_warning_body, warningCount)
                }
            )
        },
        confirmButton = {
            Button(
                onClick = onConfirm,
                colors = ButtonDefaults.buttonColors(
                    containerColor = if (isFinal) selfExamColor(CheatLockDanger, SelfExamDesign.error) else (if (isLight) selfExamColor(CheatLockLightPrimary, SelfExamDesign.accent) else selfExamColor(Color(0xFF087CFF), SelfExamDesign.action))
                )
            ) {
                Text(stringResource(R.string.i_understand))
            }
        }
    )
}

private fun formatExamTime(seconds: Int): String {
    val safeSeconds = seconds.coerceAtLeast(0)
    return "${safeSeconds / 60}:${(safeSeconds % 60).toString().padStart(2, '0')}"
}

private enum class ExamSubmissionState {
    IDLE,
    SUBMITTING,
    SUBMITTED,
    REDIRECTING,
    FAILED
}

@Composable
private fun SubmissionTransitionScreen(state: ExamSubmissionState, retrying: Boolean = false) {
    var visible by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) { visible = true }

    val isLight = if (LocalSelfExamPresentation.current) SelfExamDesign.isLight else MaterialTheme.colorScheme.background == CheatLockLightBackground
    val textPrimary = if (isLight) selfExamColor(CheatLockLightTextPrimary, SelfExamDesign.text) else Color.White
    val textSecondary = if (isLight) selfExamColor(CheatLockLightTextSecondary, SelfExamDesign.secondaryText) else selfExamColor(Color(0xFF94A3B8), SelfExamDesign.secondaryText)
    val brandBlue = if (isLight) selfExamColor(CheatLockLightPrimary, SelfExamDesign.accent) else Color(0xFF38BDF8)
    val badgeBg = if (isLight) Color(0xFFEFF6FF) else Color(0xFF0F2444)
    val badgeBorder = if (isLight) Color(0xFFBFDBFE) else Color(0xFF1E3A8A)

    PremiumScreen(modifier = Modifier.fillMaxSize()) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .statusBarsPadding()
                .padding(24.dp),
            contentAlignment = Alignment.Center
        ) {
            AnimatedVisibility(
                visible = visible,
                enter = cheatLockDialogEnterTransition(),
                exit = cheatLockDialogExitTransition()
            ) {
                PremiumCard(modifier = Modifier.fillMaxWidth()) {
                    AnimatedContent(
                        targetState = state,
                        transitionSpec = { cheatLockMicroTransition() },
                        label = "exam-submission-state"
                    ) { submissionState ->
                        Column(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(vertical = 12.dp, horizontal = 8.dp),
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.spacedBy(16.dp)
                        ) {
                            if (submissionState == ExamSubmissionState.SUBMITTING) {
                                Box(
                                    modifier = Modifier
                                        .size(68.dp)
                                        .clip(CircleShape)
                                        .background(badgeBg)
                                        .border(1.5.dp, badgeBorder, CircleShape),
                                    contentAlignment = Alignment.Center
                                ) {
                                    CircularProgressIndicator(
                                        color = brandBlue,
                                        strokeWidth = 3.dp,
                                        modifier = Modifier.size(48.dp)
                                    )
                                }
                                Text(
                                    text = stringResource(if (retrying) R.string.se_bulk_retrying else R.string.submitting_your_exam),
                                    style = MaterialTheme.typography.titleLarge,
                                    fontWeight = FontWeight.Bold,
                                    color = textPrimary,
                                    textAlign = androidx.compose.ui.text.style.TextAlign.Center
                                )
                                Box(
                                    modifier = Modifier
                                        .clip(RoundedCornerShape(10.dp))
                                        .background(badgeBg)
                                        .border(1.dp, badgeBorder, RoundedCornerShape(10.dp))
                                        .padding(horizontal = 14.dp, vertical = 8.dp)
                                ) {
                                    Text(
                                        text = stringResource(R.string.keep_page_open),
                                        style = MaterialTheme.typography.bodyMedium,
                                        color = brandBlue,
                                        fontWeight = FontWeight.SemiBold,
                                        textAlign = androidx.compose.ui.text.style.TextAlign.Center
                                    )
                                }
                            } else {
                                Box(
                                    modifier = Modifier
                                        .size(68.dp)
                                        .clip(CircleShape)
                                        .background(if (isLight) Color(0xFFDCFCE7) else Color(0xFF052E16))
                                        .border(1.5.dp, if (isLight) Color(0xFF86EFAC) else Color(0xFF166534), CircleShape),
                                    contentAlignment = Alignment.Center
                                ) {
                                    Icon(
                                        imageVector = Icons.Default.CheckCircle,
                                        contentDescription = null,
                                        tint = selfExamColor(CheatLockSuccess, SelfExamDesign.success),
                                        modifier = Modifier.size(42.dp)
                                    )
                                }
                                Text(
                                    text = stringResource(R.string.exam_completed),
                                    style = MaterialTheme.typography.headlineSmall,
                                    fontWeight = FontWeight.Bold,
                                    color = textPrimary,
                                    textAlign = androidx.compose.ui.text.style.TextAlign.Center
                                )
                                Text(
                                    text = stringResource(R.string.responses_submitted_success),
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = textSecondary,
                                    textAlign = androidx.compose.ui.text.style.TextAlign.Center
                                )
                                Text(
                                    text = stringResource(R.string.preparing_your_results),
                                    style = MaterialTheme.typography.bodySmall,
                                    color = brandBlue,
                                    fontWeight = FontWeight.Medium,
                                    textAlign = androidx.compose.ui.text.style.TextAlign.Center
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

private data class IndexedOption(val text: String, val id: String?)
private data class IndexedQuestion(val id: Int, val type: QuestionType, val text: String, val options: List<String>, val optionIds: List<String?>)

private object NoCopyTextToolbar : TextToolbar {
    override val status: TextToolbarStatus = TextToolbarStatus.Hidden
    override fun hide() = Unit
    override fun showMenu(rect: Rect, onCopyRequested: (() -> Unit)?, onPasteRequested: (() -> Unit)?, onCutRequested: (() -> Unit)?, onSelectAllRequested: (() -> Unit)?) = Unit
}
