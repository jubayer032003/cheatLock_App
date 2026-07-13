package com.jubayer.cheatlock.ui

import androidx.activity.compose.BackHandler
import android.Manifest
import android.content.pm.PackageManager
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.util.Log
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
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
import androidx.compose.foundation.clickable
import androidx.compose.animation.core.*
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.graphics.drawscope.Stroke
import com.jubayer.cheatlock.model.ExamStatus
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
import com.jubayer.cheatlock.model.ExamSubmission
import com.jubayer.cheatlock.model.StudentAnswer
import com.jubayer.cheatlock.model.QuestionType
import com.jubayer.cheatlock.proctoring.VoiceActivityDetector
import com.jubayer.cheatlock.ui.theme.*
import java.lang.System.currentTimeMillis
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun ExamScreen(
    studentId: String,
    exam: Exam,
    warningCount: Int,
    onFaceWarningsChanged: (Int) -> Unit,
    onCameraPreviewChanged: (String) -> Unit,
    onPhoneDetected: (String) -> Unit,
    onAudioWarning: () -> Unit,
    onSubmitExam: (ExamSubmission) -> Unit,
    onFinishExam: (List<StudentAnswer>, ExamFinishReason) -> Unit
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val haptics = LocalHapticFeedback.current
    val examStorage = remember { ExamStorage(context) }
    val questions = remember {
        (exam.questions ?: emptyList()).mapIndexed { index, question ->
            IndexedQuestion(
                index,
                question.type,
                question.text,
                (question.options ?: emptyList()).shuffled()
            )
        }.shuffled()
    }

    var currentQuestionIndex by remember { mutableStateOf(0) }
    var showWarningDialog by remember { mutableStateOf(false) }
    var showSavedMessage by remember { mutableStateOf(false) }
    var showSubmitConfirm by remember { mutableStateOf(false) }
    var faceMissingWarnings by remember { mutableStateOf(0) }
    var audioWarnings by remember { mutableStateOf(0) }
    var phoneWarnings by remember { mutableStateOf(0) }
    var lastFaceWarningTime by remember { mutableStateOf(0L) }
    var lastPhoneWarningTime by remember { mutableStateOf(0L) }
    var hasFaceBeenDetectedOnce by remember { mutableStateOf(false) }
    var timeLeft by remember { mutableStateOf(exam.durationMinutes * 60) }
    var questionTimeLeft by remember {
        mutableStateOf(((exam.durationMinutes * 60) / exam.questions.size.coerceAtLeast(1)).coerceAtLeast(30))
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

    // Alert animation state
    var alertPulseActive by remember { mutableStateOf(false) }
    LaunchedEffect(warningCount, faceMissingWarnings, audioWarnings, phoneWarnings) {
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

    val answers = remember {
        mutableStateListOf(*questions.map { examStorage.getAnswer(it.id) }.toTypedArray())
    }
    val lockedQuestions = remember {
        mutableStateListOf(*questions.map { false }.toTypedArray())
    }

    fun autoSaveProgress() {
        questions.forEachIndexed { index, question ->
            val currentAnswer = answers[index]
            if (currentAnswer.isNotBlank()) {
                examStorage.saveAnswer(question.id, currentAnswer)
            }
        }
    }

    fun collectAnswers(): List<StudentAnswer> {
        return questions.mapIndexed { index, question ->
            StudentAnswer(
                questionIndex = question.id,
                questionText = question.text,
                answerText = answers[index]
            )
        }
    }

    fun finishExam(reason: ExamFinishReason) {
        if (isFinished) return
        isFinished = true
        showSubmitConfirm = false
        showWarningDialog = false
        examStorage.saveWarnings(warningCount, faceMissingWarnings)
        val answersSnapshot = collectAnswers()
        scope.launch {
            delay(120)
            onFinishExam(answersSnapshot, reason)
        }
    }

    BackHandler(enabled = true) {
        showWarningDialog = true
    }

    val currentQuestion = questions.getOrNull(currentQuestionIndex)
    val isCurrentQuestionLocked = lockedQuestions.getOrNull(currentQuestionIndex) ?: false
    val answeredCount = answers.count { it.isNotBlank() }
    val perQuestionSeconds = remember {
        ((exam.durationMinutes * 60) / questions.size.coerceAtLeast(1)).coerceAtLeast(30)
    }
    val noCopyToolbar = remember { NoCopyTextToolbar }

    LaunchedEffect(Unit) {
        while (timeLeft > 0 && !isFinished) {
            delay(1000)
            timeLeft--
        }
        if (!isFinished) {
            finishExam(ExamFinishReason.TIME_EXPIRED)
        }
    }

    LaunchedEffect(currentQuestionIndex) {
        questionTimeLeft = perQuestionSeconds
        while (questionTimeLeft > 0 && !isFinished && !lockedQuestions[currentQuestionIndex]) {
            delay(1000)
            questionTimeLeft--
        }
        if (!isFinished && !lockedQuestions[currentQuestionIndex]) {
            lockedQuestions[currentQuestionIndex] = true
            if (currentQuestionIndex < questions.lastIndex) {
                currentQuestionIndex++
            }
        }
    }

    LaunchedEffect(warningCount) {
        if (warningCount > 0) {
            haptics.performHapticFeedback(HapticFeedbackType.LongPress)
            showWarningDialog = true
        }
    }

    LaunchedEffect(warningCount, faceMissingWarnings, audioWarnings, phoneWarnings) {
        autoSaveProgress()
        val totalWarnings = warningCount + faceMissingWarnings + audioWarnings + phoneWarnings
        val score = (totalWarnings * 20).coerceIn(0, 100)
        
        if (score >= 100) {
            val submission = ExamSubmission(
                examId = exam.id,
                studentId = studentId,
                answers = collectAnswers(),
                appSwitchWarnings = warningCount,
                faceMissingWarnings = faceMissingWarnings,
                audioWarnings = audioWarnings,
                phoneWarnings = phoneWarnings,
                totalWarnings = totalWarnings,
                riskLevel = "Maximum Risk (Auto-Locked)",
                submittedAt = System.currentTimeMillis()
            )
            onSubmitExam(submission)
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
                    
                    while (recordingStarted && !isFinished) {
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

    if (showSubmitConfirm) {
        AlertDialog(
            onDismissRequest = { showSubmitConfirm = false },
            title = { Text("Submit Exam?") },
            text = { Text("You answered $answeredCount out of ${questions.size} questions. Are you sure you want to submit?") },
            confirmButton = {
                Button(onClick = {
                    showSubmitConfirm = false
                    val totalWarnings = warningCount + faceMissingWarnings + audioWarnings + phoneWarnings
                    val riskLevel = when {
                        totalWarnings >= 5 -> "High Risk"
                        totalWarnings >= 3 -> "Medium Risk"
                        else -> "Low Risk"
                    }
                    val submission = ExamSubmission(examId = exam.id, studentId = studentId, answers = collectAnswers(), appSwitchWarnings = warningCount, faceMissingWarnings = faceMissingWarnings, audioWarnings = audioWarnings, phoneWarnings = phoneWarnings, totalWarnings = totalWarnings, riskLevel = riskLevel, submittedAt = System.currentTimeMillis())
                    onSubmitExam(submission); finishExam(ExamFinishReason.SUBMITTED)
                }) { Text("Submit") }
            },
            dismissButton = { OutlinedButton(onClick = { showSubmitConfirm = false }) { Text("Cancel") } }
        )
    }

    if (showWarningDialog) {
        AlertDialog(
            onDismissRequest = {},
            title = { Text("Security Warning") },
            text = { Text("A suspicious activity was detected and recorded for teacher review.") },
            confirmButton = { Button(onClick = { showWarningDialog = false }) { Text("I Understand") } }
        )
    }

    PremiumScreen(modifier = Modifier.fillMaxSize()) {
        Column(
            modifier = Modifier.fillMaxSize().statusBarsPadding().padding(horizontal = 20.dp, vertical = 16.dp).verticalScroll(rememberScrollState()).imePadding(),
            verticalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            PremiumCard(modifier = Modifier.fillMaxWidth()) {
                Column {
                    PremiumHeader(title = exam.title, subtitle = "Secure exam in progress", icon = Icons.Default.Security)
                    Spacer(modifier = Modifier.height(6.dp))
                    Text(text = "Screenshots and screen recording are blocked. Leaving the app, copy/paste, and suspicious camera activity are monitored.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Spacer(modifier = Modifier.height(6.dp))
                    SuspicionMeter(score = ((warningCount + faceMissingWarnings + audioWarnings + phoneWarnings) * 20).coerceIn(0, 100))
                    Spacer(modifier = Modifier.height(10.dp))
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        StatusPill("Secure", CheatLockSuccess)
                        StatusPill("Apps $warningCount", if (warningCount > 0) CheatLockWarning else CheatLockSuccess)
                        StatusPill("Face $faceMissingWarnings", if (faceMissingWarnings > 0) CheatLockWarning else CheatLockSuccess)
                    }
                    Spacer(modifier = Modifier.height(8.dp))
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        StatusPill("Audio $audioWarnings", if (audioWarnings > 0) CheatLockWarning else CheatLockSuccess)
                        StatusPill("Phone $phoneWarnings", if (phoneWarnings > 0) CheatLockDanger else CheatLockSuccess)
                    }
                }
            }

            PremiumCard(modifier = Modifier.fillMaxWidth()) {
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                    Column {
                        Text("Time remaining", style = MaterialTheme.typography.labelLarge)
                        Text(text = "${animatedTimeLeft / 60}:${(animatedTimeLeft % 60).toString().padStart(2, '0')}", style = MaterialTheme.typography.headlineSmall, color = MaterialTheme.colorScheme.primary)
                    }
                    Column(horizontalAlignment = Alignment.End) {
                        Text("Question timer", style = MaterialTheme.typography.labelLarge)
                        Text(text = "${animatedQuestionTimeLeft / 60}:${(animatedQuestionTimeLeft % 60).toString().padStart(2, '0')}", style = MaterialTheme.typography.titleLarge)
                    }
                }
            }

            // Unified Proctoring Monitor with real-time status HUD
            val alertInfTransition = rememberInfiniteTransition(label = "alert")
            val alertGlowAlpha by alertInfTransition.animateFloat(initialValue = 0f, targetValue = 0.6f, animationSpec = infiniteRepeatable(tween(800, easing = LinearEasing), RepeatMode.Reverse), label = "glow")
            
            PremiumCard(modifier = Modifier.fillMaxWidth()) {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text("Secure Proctoring Monitor", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold, color = Color.White)

                    if (!hasCameraPermission) {
                        Text(text = "Camera permission is required for face monitoring. Enable it in app settings.", color = CheatLockDanger, style = MaterialTheme.typography.bodySmall)
                    } else {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(220.dp)
                                .clip(MaterialTheme.shapes.medium)
                                .background(Color.Black)
                                .border(
                                    width = if (alertPulseActive) 3.dp else 0.dp,
                                    color = if (alertPulseActive) CheatLockDanger.copy(alpha = alertGlowAlpha) else Color.Transparent,
                                    shape = MaterialTheme.shapes.medium
                                )
                        ) {
                            if (cameraHardwareReady) {
                                CameraPreview(
                                    modifier = Modifier.fillMaxSize(),
                                    preferFastStartup = true,
                                    onFaceStatusChanged = { status ->
                                        faceStatus = status
                                        if (status == FaceStatus.FACE_FOUND) hasFaceBeenDetectedOnce = true
                                        val shouldWarn = monitoringEnabled && status != FaceStatus.CHECKING && status != FaceStatus.FACE_FOUND && (hasFaceBeenDetectedOnce || status == FaceStatus.MULTIPLE_FACES)
                                        if (shouldWarn) {
                                            val now = currentTimeMillis()
                                            if (now - lastFaceWarningTime > 5000) {
                                                faceMissingWarnings++; onFaceWarningsChanged(faceMissingWarnings); autoSaveProgress(); showWarningDialog = true; lastFaceWarningTime = now; haptics.performHapticFeedback(HapticFeedbackType.LongPress)
                                            }
                                        }
                                    },
                                    onPreviewSnapshot = { onCameraPreviewChanged(it) },
                                    onPhoneDetectedWithLabels = { labels ->
                                         if (monitoringEnabled) {
                                             val now = currentTimeMillis()
                                             if (now - lastPhoneWarningTime > 8000) {
                                                 phoneWarnings++; lastPhoneWarningTime = now; onPhoneDetected(labels); autoSaveProgress(); showWarningDialog = true; haptics.performHapticFeedback(HapticFeedbackType.LongPress)
                                             }
                                         }
                                     }
                                )
                            }

                            // Ambient Noise Floor Calibration Overlay
                            if (isAudioCalibrating) {
                                Box(
                                    modifier = Modifier
                                        .fillMaxSize()
                                        .background(Color.Black.copy(alpha = 0.85f))
                                        .padding(16.dp),
                                    contentAlignment = Alignment.Center
                                ) {
                                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                        Icon(
                                            imageVector = Icons.Default.VolumeUp, 
                                            contentDescription = null, 
                                            tint = CheatLockPurpleSoft, 
                                            modifier = Modifier.size(36.dp)
                                        )
                                        Spacer(Modifier.height(10.dp))
                                        Text(
                                            text = "CALIBRATING AUDIO ENVIRONMENT",
                                            color = Color.White,
                                            fontWeight = FontWeight.Black,
                                            style = MaterialTheme.typography.labelSmall,
                                            letterSpacing = 1.sp
                                        )
                                        Text(
                                            text = "Please remain silent...",
                                            color = CheatLockTextSecondaryDark,
                                            style = MaterialTheme.typography.bodySmall
                                        )
                                        Spacer(Modifier.height(14.dp))
                                        LinearProgressIndicator(
                                            progress = { audioCalibrationProgress },
                                            color = CheatLockPurpleVibrant,
                                            trackColor = Color.White.copy(alpha = 0.2f),
                                            modifier = Modifier
                                                .fillMaxWidth(0.85f)
                                                .height(6.dp)
                                                .clip(RoundedCornerShape(3.dp))
                                        )
                                    }
                                }
                            }

                            // 1. Premium Camera Status HUD Overlay
                            Box(
                                modifier = Modifier
                                    .align(Alignment.TopEnd)
                                    .padding(12.dp)
                                    .clip(RoundedCornerShape(8.dp))
                                    .background(Color.Black.copy(alpha = 0.6f))
                                    .border(0.5.dp, Color.White.copy(alpha = 0.2f), RoundedCornerShape(8.dp))
                                    .padding(horizontal = 10.dp, vertical = 6.dp)
                            ) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    val statusColor = when (faceStatus) {
                                        FaceStatus.FACE_FOUND -> CheatLockSuccess
                                        FaceStatus.CHECKING -> CheatLockPurpleSoft
                                        else -> CheatLockDanger
                                    }
                                    Box(
                                        modifier = Modifier
                                            .size(8.dp)
                                            .clip(CircleShape)
                                            .background(statusColor)
                                    )
                                    Spacer(Modifier.width(8.dp))
                                    Text(
                                        text = faceStatus.name.replace("_", " "),
                                        style = MaterialTheme.typography.labelSmall,
                                        color = Color.White,
                                        fontWeight = FontWeight.Bold,
                                        fontSize = 10.sp
                                    )
                                }
                            }

                            if (faceStatus == FaceStatus.CHECKING) {
                                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                                    Text(text = "Synchronizing security stream...", style = MaterialTheme.typography.bodySmall, color = Color.White.copy(alpha = 0.6f))
                                }
                            }

                            // Alert Flash Overlay
                            if (alertPulseActive) {
                                Box(
                                    modifier = Modifier
                                        .fillMaxSize()
                                        .background(CheatLockDanger.copy(alpha = alertGlowAlpha * 0.3f))
                                        .border(3.dp, CheatLockDanger.copy(alpha = alertGlowAlpha), MaterialTheme.shapes.medium)
                                )
                            }
                        }
                    }
                }
            }

            // 2. High-End Question Progress Map
            PremiumCard {
                Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text("Assessment Map", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold, color = Color.White)
                        Text("$answeredCount / ${questions.size} Answered", style = MaterialTheme.typography.labelSmall, color = CheatLockPurpleSoft)
                    }

                    // Grid of question indicators
                    FlowRow(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                        verticalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        questions.forEachIndexed { index, question ->
                            val isAnswered = answers[index].isNotBlank()
                            val isCurrent = index == currentQuestionIndex
                            
                            Box(
                                modifier = Modifier
                                    .size(38.dp)
                                    .clip(RoundedCornerShape(8.dp))
                                    .background(
                                        when {
                                            isCurrent -> CheatLockPurpleVibrant
                                            isAnswered -> CheatLockNavySurface
                                            else -> Color.White.copy(alpha = 0.05f)
                                        }
                                    )
                                    .border(
                                        width = 1.dp,
                                        color = when {
                                            isCurrent -> Color.White.copy(alpha = 0.5f)
                                            isAnswered -> CheatLockSuccess.copy(alpha = 0.4f)
                                            else -> Color.Transparent
                                        },
                                        shape = RoundedCornerShape(8.dp)
                                    )
                                    .clickable { 
                                        currentQuestionIndex = index
                                        showSavedMessage = false
                                    },
                                contentAlignment = Alignment.Center
                            ) {
                                Text(
                                    text = (index + 1).toString(),
                                    style = MaterialTheme.typography.labelMedium,
                                    fontWeight = FontWeight.Bold,
                                    color = when {
                                        isCurrent -> Color.White
                                        isAnswered -> CheatLockSuccess
                                        else -> CheatLockTextSecondaryDark
                                    }
                                )
                            }
                        }
                    }
                }
            }

            SectionHeader(title = "Question ${currentQuestionIndex + 1} of ${questions.size}", subtitle = "${currentQuestion?.type ?: ""} • Answer carefully — switching apps triggers warnings")
            
            if (currentQuestion == null) {
                EmptyState(title = "No questions available", body = "This exam does not have any questions. Please contact your teacher.")
            } else {
                Text(text = currentQuestion.text, style = MaterialTheme.typography.titleMedium)
                if (isCurrentQuestionLocked) Text("This answer is locked.")

                Spacer(modifier = Modifier.height(16.dp))

                if (currentQuestion.type == QuestionType.MCQ) {
                    (currentQuestion.options ?: emptyList()).forEach { option ->
                        Row(modifier = Modifier.fillMaxWidth()) {
                            RadioButton(selected = answers[currentQuestionIndex] == option, onClick = { if (!isCurrentQuestionLocked || !exam.lockAnswers) { answers[currentQuestionIndex] = option; examStorage.saveAnswer(currentQuestion.id, option); examStorage.saveWarnings(warningCount, faceMissingWarnings); showSavedMessage = true } }, enabled = !isCurrentQuestionLocked || !exam.lockAnswers)
                            Text(option)
                        }
                    }
                } else {
                    androidx.compose.runtime.CompositionLocalProvider(LocalTextToolbar provides noCopyToolbar) {
                        OutlinedTextField(value = answers[currentQuestionIndex], onValueChange = { value -> if (!isCurrentQuestionLocked || !exam.lockAnswers) { answers[currentQuestionIndex] = value; examStorage.saveAnswer(currentQuestion.id, value); examStorage.saveWarnings(warningCount, faceMissingWarnings); showSavedMessage = true } }, label = { Text("Your answer") }, enabled = !isCurrentQuestionLocked || !exam.lockAnswers, modifier = Modifier.fillMaxWidth().height(180.dp))
                    }
                }

                Spacer(modifier = Modifier.height(24.dp))

                GradientPrimaryButton(text = if (exam.lockAnswers) "Save and Lock Answer" else "Save Answer", onClick = { examStorage.saveAnswer(currentQuestion.id, answers[currentQuestionIndex]); examStorage.saveWarnings(warningCount, faceMissingWarnings); if (answers[currentQuestionIndex].isNotBlank()) { lockedQuestions[currentQuestionIndex] = true }; showSavedMessage = true }, enabled = !isCurrentQuestionLocked || !exam.lockAnswers, modifier = Modifier.fillMaxWidth())
            }

            if (showSavedMessage) { Spacer(modifier = Modifier.height(8.dp)); Text("Answer auto-saved locally.") }

            Spacer(modifier = Modifier.height(12.dp))

            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                OutlinedButton(onClick = { if (currentQuestionIndex > 0) { currentQuestionIndex--; showSavedMessage = false } }) { Text("Previous") }
                OutlinedButton(onClick = { if (currentQuestionIndex < questions.lastIndex) { currentQuestionIndex++; showSavedMessage = false } }) { Text("Next") }
            }

            Spacer(modifier = Modifier.height(12.dp))
            GradientPrimaryButton(text = "Finish Exam", onClick = { showSubmitConfirm = true }, modifier = Modifier.fillMaxWidth())
        }
    }
}

private data class IndexedQuestion(val id: Int, val type: QuestionType, val text: String, val options: List<String>)

private object NoCopyTextToolbar : TextToolbar {
    override val status: TextToolbarStatus = TextToolbarStatus.Hidden
    override fun hide() = Unit
    override fun showMenu(rect: Rect, onCopyRequested: (() -> Unit)?, onPasteRequested: (() -> Unit)?, onCutRequested: (() -> Unit)?, onSelectAllRequested: (() -> Unit)?) = Unit
}
