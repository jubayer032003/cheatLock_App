@file:OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)

package com.jubayer.cheatlock.ui

import android.Manifest
import android.content.pm.PackageManager
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.FactCheck
import androidx.compose.material.icons.automirrored.filled.MenuBook
import androidx.compose.material.icons.automirrored.filled.NavigateBefore
import androidx.compose.material.icons.automirrored.filled.NavigateNext
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.CameraAlt
import androidx.compose.material.icons.filled.ErrorOutline
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Quiz
import androidx.compose.material.icons.filled.RadioButtonUnchecked
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.School
import androidx.compose.material.icons.filled.Timer
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Slider
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.jubayer.cheatlock.model.CreateSelfExamSessionRequest
import com.jubayer.cheatlock.model.SelfExamAnswer
import com.jubayer.cheatlock.model.SelfExamChapter
import com.jubayer.cheatlock.model.SelfExamClass
import com.jubayer.cheatlock.model.SelfExamPayloadResponse
import com.jubayer.cheatlock.model.SelfExamResultResponse
import com.jubayer.cheatlock.model.SelfExamReviewQuestion
import com.jubayer.cheatlock.model.SelfExamSession
import com.jubayer.cheatlock.model.SelfExamSubject
import com.jubayer.cheatlock.selfexam.SelfExamSetupSelection
import com.jubayer.cheatlock.ui.theme.CheatLockDanger
import com.jubayer.cheatlock.ui.theme.CheatLockGlassBorder
import com.jubayer.cheatlock.ui.theme.CheatLockInfo
import com.jubayer.cheatlock.ui.theme.CheatLockPurpleSoft
import com.jubayer.cheatlock.ui.theme.CheatLockSuccess
import com.jubayer.cheatlock.ui.theme.CheatLockTextSecondaryDark
import com.jubayer.cheatlock.ui.theme.CheatLockWarning
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlin.math.roundToInt

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SelfExamSetupScreen(
    persistedSessionId: String?,
    onLoadClasses: suspend () -> List<SelfExamClass>,
    onLoadSubjects: suspend (String) -> List<SelfExamSubject>,
    onLoadChapters: suspend (String) -> List<SelfExamChapter>,
    onLoadActiveSession: suspend () -> SelfExamSession?,
    onLoadSession: suspend (String) -> SelfExamPayloadResponse,
    onCreateSession: suspend (CreateSelfExamSessionRequest) -> SelfExamSession,
    onStartSession: suspend (String) -> SelfExamPayloadResponse,
    onRequestMonitoringPermissions: ((Boolean) -> Unit) -> Unit,
    onClearPersistedSession: () -> Unit,
    onStarted: (SelfExamPayloadResponse) -> Unit,
    onResultReady: (SelfExamResultResponse) -> Unit,
    onSubmitExpired: suspend (String) -> SelfExamResultResponse,
    onBack: () -> Unit
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var selection by remember { mutableStateOf(SelfExamSetupSelection()) }
    var classes by remember { mutableStateOf(emptyList<SelfExamClass>()) }
    var subjects by remember { mutableStateOf(emptyList<SelfExamSubject>()) }
    var chapters by remember { mutableStateOf(emptyList<SelfExamChapter>()) }
    var activeSession by remember { mutableStateOf<SelfExamSession?>(null) }
    var loading by remember { mutableStateOf(true) }
    var subjectsLoading by remember { mutableStateOf(false) }
    var chaptersLoading by remember { mutableStateOf(false) }
    var actionLoading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var success by remember { mutableStateOf<String?>(null) }
    var showInstructions by remember { mutableStateOf(false) }
    var createdSession by remember { mutableStateOf<SelfExamSession?>(null) }
    var monitoringReady by remember {
        mutableStateOf(
            ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED
        )
    }

    fun startCreatedSession(session: SelfExamSession) {
        scope.launch {
            actionLoading = true
            error = null
            runCatching { onStartSession(session.id) }
                .onSuccess {
                    showInstructions = false
                    onStarted(it)
                }
                .onFailure { error = it.message ?: "Could not start self exam." }
            actionLoading = false
        }
    }

    fun refresh() {
        scope.launch {
            loading = true
            error = null
            runCatching {
                val serverActive = runCatching { onLoadActiveSession() }.getOrNull()
                val persistedSession = if (serverActive == null && !persistedSessionId.isNullOrBlank()) {
                    runCatching { onLoadSession(persistedSessionId).session }.getOrNull()
                } else {
                    null
                }
                if (persistedSession != null && persistedSession.status !in setOf("in_progress", "expired")) {
                    onClearPersistedSession()
                }
                activeSession = serverActive ?: persistedSession?.takeIf { it.status == "in_progress" || it.status == "expired" }
                classes = onLoadClasses()
            }.onFailure { error = it.message ?: "Could not load self exam setup." }
            loading = false
        }
    }

    LaunchedEffect(Unit) { refresh() }

    PremiumScreen(Modifier.fillMaxSize()) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .statusBarsPadding()
                .padding(horizontal = 20.dp, vertical = 16.dp)
                .verticalScroll(rememberScrollState())
                .imePadding(),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = onBack) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, null, tint = Color.White)
                }
                PremiumHeader(
                    title = "Self Exam",
                    subtitle = "Practice from the central question bank",
                    icon = Icons.Default.Quiz,
                    badge = "Student"
                )
            }

            when {
                loading -> LoadingCard("Loading question bank hierarchy...")
                error != null -> ErrorCard(error.orEmpty(), onRetry = { refresh() })
                classes.isEmpty() -> EmptyCard("No active classes are available for self exam yet.")
            }

            activeSession?.let { session ->
                PremiumCard {
                    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        SectionHeader(
                            title = if (session.status == "expired") "Expired Session" else "Resume Exam",
                            subtitle = "Continue your active self exam from the server state"
                        )
                        Text(
                            "${session.questionCount} questions • ${session.durationMinutes} minutes • ${session.difficultyMode}",
                            color = CheatLockTextSecondaryDark
                        )
                        GradientPrimaryButton(
                            text = if (actionLoading) "RESTORING..." else "RESUME EXAM",
                            onClick = {
                                if (actionLoading) return@GradientPrimaryButton
                                scope.launch {
                                    actionLoading = true
                                    error = null
                                    runCatching {
                                        val payload = onLoadSession(session.id)
                                        if (payload.session.status == "expired") {
                                            onResultReady(onSubmitExpired(session.id))
                                            onClearPersistedSession()
                                        } else {
                                            onStarted(payload)
                                        }
                                    }.onFailure { error = it.message ?: "Could not resume self exam." }
                                    actionLoading = false
                                }
                            },
                            loading = actionLoading,
                            leadingIcon = Icons.Default.Refresh
                        )
                    }
                }
            }

            if (!loading && error == null && classes.isNotEmpty()) {
                PickerCard(
                    title = "Class",
                    subtitle = "Choose the academic level",
                    icon = Icons.Default.School,
                    emptyText = "No classes available.",
                    items = classes.map { it.id to it.name },
                    selectedId = selection.classId,
                    loading = false,
                    onSelect = { classId ->
                        val selectedClassId = classId ?: return@PickerCard
                        selection = selection.selectClass(selectedClassId)
                        subjects = emptyList()
                        chapters = emptyList()
                        scope.launch {
                            subjectsLoading = true
                            error = null
                            runCatching { subjects = onLoadSubjects(selectedClassId) }
                                .onFailure { error = it.message ?: "Could not load subjects." }
                            subjectsLoading = false
                        }
                    }
                )

                PickerCard(
                    title = "Subject",
                    subtitle = "Narrow the question bank",
                    icon = Icons.AutoMirrored.Filled.MenuBook,
                    emptyText = if (selection.classId == null) "Select a class first." else "No subjects found.",
                    items = subjects.map { it.id to it.name },
                    selectedId = selection.subjectId,
                    loading = subjectsLoading,
                    enabled = selection.classId != null,
                    onSelect = { subjectId ->
                        val selectedSubjectId = subjectId ?: return@PickerCard
                        selection = selection.selectSubject(selectedSubjectId)
                        chapters = emptyList()
                        scope.launch {
                            chaptersLoading = true
                            error = null
                            runCatching { chapters = onLoadChapters(selectedSubjectId) }
                                .onFailure { error = it.message ?: "Could not load chapters." }
                            chaptersLoading = false
                        }
                    }
                )

                PickerCard(
                    title = "Chapter",
                    subtitle = "Optional focus area",
                    icon = Icons.AutoMirrored.Filled.FactCheck,
                    emptyText = if (selection.subjectId == null) "Select a subject first." else "No chapters found. All chapters will be used.",
                    items = listOf(null to "All Chapters") + chapters.map { it.id to it.name },
                    selectedId = selection.chapterId,
                    loading = chaptersLoading,
                    enabled = selection.subjectId != null,
                    onSelect = { chapterId -> selection = selection.selectChapter(chapterId) }
                )

                ConfigCard(
                    selection = selection,
                    onChange = { selection = it }
                )

                MonitoringReadinessCard(
                    ready = monitoringReady,
                    onRequestPermission = {
                        onRequestMonitoringPermissions { granted ->
                            monitoringReady = granted
                            if (!granted) {
                                error = "Camera permission is required before starting a monitored self exam."
                            }
                        }
                    }
                )

                success?.let { SuccessBanner(it) }

                GradientPrimaryButton(
                    text = if (actionLoading) "PREPARING..." else "REVIEW INSTRUCTIONS",
                    onClick = {
                        if (!selection.canStart()) {
                            error = "Select class and subject, then choose a valid duration and question count."
                            return@GradientPrimaryButton
                        }
                        scope.launch {
                            actionLoading = true
                            error = null
                            runCatching {
                                val session = onCreateSession(
                                    CreateSelfExamSessionRequest(
                                        classId = selection.classId.orEmpty(),
                                        subjectId = selection.subjectId.orEmpty(),
                                        chapterId = selection.chapterId,
                                        durationMinutes = selection.durationMinutes,
                                        questionCount = selection.questionCount,
                                        difficultyMode = selection.difficultyMode
                                    )
                                )
                                createdSession = session
                                success = "Self exam configured. Review the instructions to start."
                                showInstructions = true
                            }.onFailure { error = it.message ?: "Could not create self exam." }
                            actionLoading = false
                        }
                    },
                    enabled = selection.canStart() && !actionLoading,
                    loading = actionLoading,
                    leadingIcon = Icons.Default.PlayArrow
                )
            }
        }
    }

    if (showInstructions) {
        SelfExamInstructionsDialog(
            loading = actionLoading,
            onDismiss = { showInstructions = false },
            onStart = {
                val session = createdSession ?: return@SelfExamInstructionsDialog
                if (!monitoringReady) {
                    actionLoading = true
                    onRequestMonitoringPermissions { granted ->
                        monitoringReady = granted
                        if (granted) {
                            startCreatedSession(session)
                        } else {
                            actionLoading = false
                            error = "Camera permission is required before the self exam timer can start."
                        }
                    }
                } else {
                    startCreatedSession(session)
                }
            }
        )
    }
}

@Composable
fun SelfExamResultScreen(
    resultResponse: SelfExamResultResponse,
    onBackToDashboard: () -> Unit
) {
    val answersByQuestion = resultResponse.answers.associateBy { it.questionId }
    PremiumScreen(Modifier.fillMaxSize()) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .statusBarsPadding()
                .padding(20.dp)
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            PremiumHeader(
                title = "Self Exam Result",
                subtitle = "Server-scored practice report",
                icon = Icons.AutoMirrored.Filled.FactCheck,
                badge = "Submitted"
            )
            PremiumCard {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text(
                        "${resultResponse.result.percentage}%",
                        style = MaterialTheme.typography.displaySmall,
                        fontWeight = FontWeight.Black,
                        color = Color.White
                    )
                    Text(
                        "${resultResponse.result.score.formatMarks()} / ${resultResponse.result.totalMarks.formatMarks()} marks",
                        color = CheatLockTextSecondaryDark
                    )
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                        ResultMetric("Correct", resultResponse.result.correctCount, CheatLockSuccess, Modifier.weight(1f))
                        ResultMetric("Wrong", resultResponse.result.incorrectCount, CheatLockDanger, Modifier.weight(1f))
                        ResultMetric("Blank", resultResponse.result.unansweredCount, CheatLockWarning, Modifier.weight(1f))
                    }
                }
            }

            SectionHeader(title = "Review", subtitle = "Correct answers and explanations")
            resultResponse.questions.forEachIndexed { index, question ->
                ReviewQuestionCard(
                    index = index,
                    question = question,
                    answer = answersByQuestion[question.id]
                )
            }
            GradientPrimaryButton(
                text = "RETURN TO DASHBOARD",
                onClick = onBackToDashboard,
                leadingIcon = Icons.AutoMirrored.Filled.ArrowBack
            )
        }
    }
}

@Composable
private fun PickerCard(
    title: String,
    subtitle: String,
    icon: ImageVector,
    emptyText: String,
    items: List<Pair<String?, String>>,
    selectedId: String?,
    loading: Boolean,
    enabled: Boolean = true,
    onSelect: (String?) -> Unit
) {
    PremiumCard {
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            SectionHeader(title = title, subtitle = subtitle, action = {
                Icon(icon, null, tint = CheatLockPurpleSoft)
            })
            when {
                loading -> Row(verticalAlignment = Alignment.CenterVertically) {
                    CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp)
                    Spacer(Modifier.width(10.dp))
                    Text("Loading...", color = CheatLockTextSecondaryDark)
                }
                !enabled || items.isEmpty() -> Text(emptyText, color = CheatLockTextSecondaryDark)
                else -> FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    items.forEach { (id, label) ->
                        FilterChip(
                            selected = selectedId == id,
                            onClick = { onSelect(id) },
                            label = { Text(label) },
                            enabled = enabled
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun ConfigCard(
    selection: SelfExamSetupSelection,
    onChange: (SelfExamSetupSelection) -> Unit
) {
    PremiumCard {
        Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
            SectionHeader(title = "Configuration", subtitle = "Choose how much practice you want")
            SliderSetting(
                label = "Duration",
                value = selection.durationMinutes,
                range = 5..180,
                suffix = "min",
                onChange = { onChange(selection.copy(durationMinutes = it)) }
            )
            SliderSetting(
                label = "Questions",
                value = selection.questionCount,
                range = 1..50,
                suffix = "items",
                onChange = { onChange(selection.copy(questionCount = it)) }
            )
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf("mixed", "easy", "medium", "hard").forEach { difficulty ->
                    FilterChip(
                        selected = selection.difficultyMode == difficulty,
                        onClick = { onChange(selection.copy(difficultyMode = difficulty)) },
                        label = { Text(difficulty.replaceFirstChar { it.uppercase() }) }
                    )
                }
            }
        }
    }
}

@Composable
private fun MonitoringReadinessCard(
    ready: Boolean,
    onRequestPermission: () -> Unit
) {
    PremiumCard(elevated = false) {
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    imageVector = if (ready) Icons.Default.CheckCircle else Icons.Default.CameraAlt,
                    contentDescription = null,
                    tint = if (ready) CheatLockSuccess else CheatLockWarning
                )
                Spacer(Modifier.width(10.dp))
                Column(Modifier.weight(1f)) {
                    Text("Monitoring readiness", color = Color.White, fontWeight = FontWeight.Bold)
                    Text(
                        if (ready) {
                            "Camera permission is ready. Monitoring starts only after the server starts the exam."
                        } else {
                            "Camera permission is required before the self exam timer can start."
                        },
                        color = CheatLockTextSecondaryDark,
                        style = MaterialTheme.typography.bodySmall
                    )
                }
            }
            if (!ready) {
                PremiumOutlinedButton(
                    text = "ALLOW MONITORING",
                    onClick = onRequestPermission,
                    leadingIcon = Icons.Default.CameraAlt,
                    textColor = CheatLockWarning,
                    borderColor = CheatLockWarning.copy(alpha = 0.45f)
                )
            }
        }
    }
}

@Composable
private fun SliderSetting(
    label: String,
    value: Int,
    range: IntRange,
    suffix: String,
    onChange: (Int) -> Unit
) {
    Column {
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text(label, color = Color.White, fontWeight = FontWeight.Bold)
            Text("$value $suffix", color = CheatLockPurpleSoft)
        }
        Slider(
            value = value.toFloat(),
            onValueChange = { onChange(it.roundToInt().coerceIn(range.first, range.last)) },
            valueRange = range.first.toFloat()..range.last.toFloat(),
            steps = (range.last - range.first - 1).coerceAtLeast(0)
        )
    }
}

@Composable
private fun ReviewQuestionCard(
    index: Int,
    question: SelfExamReviewQuestion,
    answer: SelfExamAnswer?
) {
    PremiumCard {
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text("Question ${index + 1}", color = CheatLockPurpleSoft, fontWeight = FontWeight.Bold)
            Text(question.questionText, color = Color.White, style = MaterialTheme.typography.titleMedium)
            question.options.forEach { option ->
                val selected = answer?.selectedOptionId == option.id
                val selectedWrong = answer != null && selected && answer.isCorrect == false
                val tint = when {
                    option.isCorrect -> CheatLockSuccess
                    selectedWrong -> CheatLockDanger
                    else -> CheatLockTextSecondaryDark
                }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        if (option.isCorrect) Icons.Default.CheckCircle else Icons.Default.RadioButtonUnchecked,
                        null,
                        tint = tint,
                        modifier = Modifier.size(20.dp)
                    )
                    Spacer(Modifier.width(8.dp))
                    Text(
                        option.text + if (selected) "  • Your answer" else "",
                        color = tint,
                        modifier = Modifier.weight(1f)
                    )
                }
            }
            if (question.explanation.isNotBlank()) {
                Text("Explanation", color = CheatLockPurpleSoft, fontWeight = FontWeight.Bold)
                Text(question.explanation, color = CheatLockTextSecondaryDark)
            }
        }
    }
}

@Composable
private fun SelfExamInstructionsDialog(
    loading: Boolean,
    onDismiss: () -> Unit,
    onStart: () -> Unit
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Before you start") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text("The timer and scoring are controlled by the CheatLock server.")
                Text("Answers are saved immediately after the server accepts them.")
                Text("Correct answers are shown only after submission.")
            }
        },
        confirmButton = {
            TextButton(onClick = onStart, enabled = !loading) {
                Text(if (loading) "Starting..." else "Start")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss, enabled = !loading) { Text("Cancel") }
        }
    )
}

@Composable
private fun LoadingCard(message: String) {
    PremiumCard {
        Row(verticalAlignment = Alignment.CenterVertically) {
            CircularProgressIndicator(Modifier.size(22.dp), strokeWidth = 2.dp)
            Spacer(Modifier.width(12.dp))
            Text(message, color = CheatLockTextSecondaryDark)
        }
    }
}

@Composable
private fun EmptyCard(message: String) {
    PremiumCard {
        Text(message, color = CheatLockTextSecondaryDark, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth())
    }
}

@Composable
private fun ErrorCard(message: String, onRetry: () -> Unit) {
    PremiumCard {
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Default.ErrorOutline, null, tint = CheatLockDanger)
                Spacer(Modifier.width(10.dp))
                Text(message, color = CheatLockDanger, modifier = Modifier.weight(1f))
            }
            PremiumOutlinedButton(
                text = "RETRY",
                onClick = onRetry,
                leadingIcon = Icons.Default.Refresh,
                textColor = CheatLockInfo,
                borderColor = CheatLockInfo.copy(alpha = 0.45f)
            )
        }
    }
}

@Composable
private fun ResultMetric(label: String, value: Int, color: Color, modifier: Modifier = Modifier) {
    Column(
        modifier = modifier
            .clip(MaterialTheme.shapes.medium)
            .border(BorderStroke(1.dp, color.copy(alpha = 0.45f)), MaterialTheme.shapes.medium)
            .padding(10.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(value.toString(), color = color, fontWeight = FontWeight.Black)
        Text(label, color = CheatLockTextSecondaryDark, style = MaterialTheme.typography.bodySmall)
    }
}

private fun Double.formatMarks(): String {
    return if (this % 1.0 == 0.0) toInt().toString() else "%.1f".format(this)
}
