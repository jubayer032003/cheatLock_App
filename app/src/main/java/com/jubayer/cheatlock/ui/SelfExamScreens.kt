@file:OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)

package com.jubayer.cheatlock.ui

import com.jubayer.cheatlock.data.BackendRequestException

import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.selection.selectable
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.animation.animateColorAsState
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.res.pluralStringResource
import android.content.res.Configuration

import android.Manifest
import android.content.pm.PackageManager
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
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
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.animation.animateContentSize
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.expandVertically
import androidx.compose.animation.shrinkVertically
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.FactCheck
import androidx.compose.material.icons.automirrored.filled.MenuBook
import androidx.compose.material.icons.filled.AccountBalance
import androidx.compose.material.icons.filled.Bolt
import androidx.compose.material.icons.filled.CameraAlt
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.ErrorOutline
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.RadioButtonUnchecked
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.School
import androidx.compose.material.icons.filled.Security
import androidx.compose.material.icons.filled.Timer
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material.icons.filled.WifiOff
import androidx.compose.ui.unit.sp
import com.jubayer.cheatlock.model.SelfExamTrack
import androidx.compose.material3.BasicAlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.activity.compose.BackHandler
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.saveable.Saver
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.togetherWith
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.offset
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.runtime.Composable
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
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.DialogProperties
import androidx.core.content.ContextCompat
import com.jubayer.cheatlock.R
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
import com.jubayer.cheatlock.ui.theme.*
import kotlinx.coroutines.launch

private val LocalSetupAppearance = staticCompositionLocalOf { false }

private val SelfExamBgPrimary: Color
    @Composable get() = SelfExamDesign.canvas
private val SelfExamBgSecondary: Color
    @Composable get() = SelfExamDesign.inset
private val SelfExamSurface: Color
    @Composable get() = SelfExamDesign.surface
private val SelfExamSurfaceRaised: Color
    @Composable get() = SelfExamDesign.surface
private val SelfExamBlue: Color
    @Composable get() = SelfExamDesign.accent
private val SelfExamBlueBright: Color
    @Composable get() = SelfExamDesign.accent
private val SelfExamTextPrimary: Color
    @Composable get() = SelfExamDesign.text
private val SelfExamTextSecondary: Color
    @Composable get() = SelfExamDesign.secondaryText
private val SelfExamTextMuted: Color
    @Composable get() = SelfExamDesign.secondaryText
private val SelfExamBorder: Color
    @Composable get() = SelfExamDesign.border

@Composable
fun SelfExamBrandHeader() {
    val logoRes = if (SelfExamDesign.isLight) R.drawable.cheatlock_logo_light else R.drawable.cheatlock_logo
    FlowRow(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween,
        verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            Image(painterResource(logoRes), stringResource(R.string.se_cheatlock_logo), Modifier.size(36.dp))
            Text("CheatLock", color = SelfExamTextPrimary, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
        }
        Surface(shape = RoundedCornerShape(50), color = SelfExamDesign.inset) {
            Text(stringResource(R.string.se_student), Modifier.padding(horizontal = 14.dp, vertical = 8.dp),
                color = SelfExamTextSecondary, style = MaterialTheme.typography.labelLarge)
        }
    }
}

@Composable
fun SelfExamTitleRow(onBack: () -> Unit) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        IconButton(
            onClick = onBack,
            modifier = Modifier
                .size(48.dp)
                .clip(CircleShape)
                .background(SelfExamSurface.copy(alpha = 0.66f))
                .border(1.dp, SelfExamBorder.copy(alpha = 0.28f), CircleShape)
        ) {
            Icon(Icons.AutoMirrored.Filled.ArrowBack, stringResource(R.string.se_back_to_dashboard), tint = SelfExamTextPrimary)
        }
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text(stringResource(R.string.self_exam), color = SelfExamTextPrimary, style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Black)
            Text(stringResource(R.string.practice_central_question_bank), color = SelfExamTextSecondary, style = MaterialTheme.typography.bodyMedium)
        }
    }
}

@Composable
fun SelfExamCard(
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit
) {
    val setup = LocalSetupAppearance.current
    Surface(modifier = modifier.fillMaxWidth().then(if (setup) Modifier.animateContentSize(
        animationSpec = tween(280, easing = FastOutSlowInEasing)) else Modifier), shape = SelfExamDesign.cardShape,
        color = SelfExamDesign.surface, border = BorderStroke(1.dp, SelfExamDesign.border.copy(alpha = if (setup) 0.35f else 1f)),
        shadowElevation = if (setup) 0.dp else 1.dp) {
        Box(Modifier.padding(20.dp)) { content() }
    }
}

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
    onBack: () -> Unit,
    onRecoverPendingSubmission: (suspend () -> SelfExamResultResponse?)? = null
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var selection by rememberSaveable(stateSaver = Saver<SelfExamSetupSelection, String>(
        save = { com.google.gson.Gson().toJson(it) },
        restore = { runCatching { com.google.gson.Gson().fromJson(it, SelfExamSetupSelection::class.java) }.getOrNull() }
    )) { mutableStateOf(SelfExamSetupSelection()) }
    var rawClasses by remember { mutableStateOf(emptyList<SelfExamClass>()) }
    var loadedSubjects by remember { mutableStateOf(emptyList<SelfExamSubject>()) }
    var loadedChapters by remember { mutableStateOf(emptyList<SelfExamChapter>()) }
    var activeSession by remember { mutableStateOf<SelfExamSession?>(null) }
    var loading by remember { mutableStateOf(true) }
    var subjectsLoading by remember { mutableStateOf(false) }
    var chaptersLoading by remember { mutableStateOf(false) }
    var actionLoading by remember { mutableStateOf(false) }
    var pendingRecoveryBlocked by remember { mutableStateOf(false) }
    var activeErrorPopup by remember { mutableStateOf<SelfExamErrorInfo?>(null) }
    var createdSession by remember { mutableStateOf<SelfExamSession?>(null) }
    var monitoringReady by remember {
        mutableStateOf(
            ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED
        )
    }

    fun refresh() {
        scope.launch {
            loading = true
            runCatching {
                pendingRecoveryBlocked = true
                val recovered = onRecoverPendingSubmission?.invoke()
                if (recovered != null) {
                    onResultReady(recovered)
                    loading = false
                    return@launch
                }
                pendingRecoveryBlocked = false
                val serverActive = runCatching { onLoadActiveSession() }.getOrNull()
                val persistedSession = if (serverActive == null && !persistedSessionId.isNullOrBlank()) {
                    runCatching { onLoadSession(persistedSessionId).session }.getOrNull()
                } else {
                    null
                }
                if (persistedSession?.status == "submitted" && persistedSession.checkpointVersion == 1) {
                    onResultReady(onSubmitExpired(persistedSession.id))
                    onClearPersistedSession()
                    loading = false
                    return@launch
                }
                if (persistedSession != null && persistedSession.status !in setOf("in_progress", "expired")) {
                    onClearPersistedSession()
                }
                activeSession = serverActive ?: persistedSession?.takeIf { it.status == "in_progress" || it.status == "expired" }
                rawClasses = onLoadClasses()
            }.onFailure { err ->
                val displayError = if (err is com.jubayer.cheatlock.data.BulkSelfExamRequestException) IllegalStateException(context.getString(err.messageResource)) else err
                activeErrorPopup = mapSelfExamError(displayError, "Could not load self exam tracks.", defaultCategory = SelfExamErrorCategory.NETWORK, onRetry = { refresh() })
            }
            loading = false
        }
    }

    LaunchedEffect(Unit) { refresh() }

    fun openStartedPayload(payload: SelfExamPayloadResponse) {
        if (payload.questions.isEmpty()) {
            actionLoading = false
            activeErrorPopup = SelfExamErrorInfo(
                title = "No Questions Found",
                message = "This selection does not have any active questions yet. Choose another subject/chapter or add questions from the admin dashboard.",
                category = SelfExamErrorCategory.VALIDATION,
                primaryButtonText = "Choose Again"
            )
            return
        }
        onStarted(payload)
    }

    // When a class / target level is selected, load its subjects
    fun fetchSubjectsForClass(classId: String) {
        scope.launch {
            subjectsLoading = true
            loadedSubjects = emptyList()
            loadedChapters = emptyList()
            runCatching { onLoadSubjects(classId) }
                .onSuccess { subjects ->
                    loadedSubjects = subjects
                }
                .onFailure { err ->
                    activeErrorPopup = mapSelfExamError(err, "Could not load subjects for this level.")
                }
            subjectsLoading = false
        }
    }

    // When a subject is selected, load its chapters
    fun fetchChaptersForSubject(subjectId: String) {
        scope.launch {
            chaptersLoading = true
            loadedChapters = emptyList()
            runCatching { onLoadChapters(subjectId) }
                .onSuccess { chapters ->
                    loadedChapters = chapters
                }
                .onFailure { err ->
                    activeErrorPopup = mapSelfExamError(err, "Could not load chapters for this subject.")
                }
            chaptersLoading = false
        }
    }

    // Restore only dependent UI data after recreation; session recovery still uses refresh().
    val restoredSelection = remember { selection }
    LaunchedEffect(Unit) {
        restoredSelection.classId?.let { fetchSubjectsForClass(it) }
        restoredSelection.subjectId?.let { fetchChaptersForSubject(it) }
    }
    var wizardStep by rememberSaveable { androidx.compose.runtime.mutableIntStateOf(0) }
    var navigationBusy by remember { mutableStateOf(false) }
    fun navigate(next: Int) {
        if (navigationBusy || actionLoading || next == wizardStep) return
        navigationBusy = true
        wizardStep = next.coerceIn(0, 5)
    }
    LaunchedEffect(wizardStep) {
        kotlinx.coroutines.delay(320)
        navigationBusy = false
    }
    val goBack = { if (wizardStep > 0) navigate(wizardStep - 1) else onBack() }
    BackHandler { goBack() }
    CompositionLocalProvider(LocalSetupAppearance provides true) {
        SelfExamWizardLayout(
            step = wizardStep,
            selection = selection,
            chaptersLoading = chaptersLoading,
            monitoringReady = monitoringReady,
            hasActiveSession = activeSession != null,
            navigationBusy = navigationBusy || actionLoading,
            onBack = goBack,
            onReview = { navigate(5) },
            onRetry = {
                when (wizardStep) {
                    2 -> selection.classId?.let { fetchSubjectsForClass(it) }
                    3 -> selection.subjectId?.let { fetchChaptersForSubject(it) }
                    else -> refresh()
                }
            },
            readyAction = {
                SelfExamPrimaryButton(
                    text = if (actionLoading) stringResource(R.string.starting) else stringResource(R.string.start_exam),
                    onClick = {
                        val finalClassId = selection.classId ?: rawClasses.firstOrNull()?.id.orEmpty()
                        val finalSubjectId = selection.subjectId ?: loadedSubjects.firstOrNull()?.id.orEmpty()

                        if (finalClassId.isBlank() || finalSubjectId.isBlank()) {
                            activeErrorPopup = SelfExamErrorInfo(
                                title = "Selection Incomplete",
                                message = "Please choose your track, grade/unit, and subject to begin.",
                                category = SelfExamErrorCategory.VALIDATION,
                                primaryButtonText = "Got it"
                            )
                            return@SelfExamPrimaryButton
                        }

                        scope.launch {
                            actionLoading = true
                            runCatching {
                                val sessionToStart = activeSession ?: createdSession ?: onCreateSession(
                                    CreateSelfExamSessionRequest(
                                        classId = finalClassId,
                                        subjectId = finalSubjectId,
                                        chapterId = selection.chapterId,
                                        nodeId = selection.nodeId ?: selection.chapterId ?: selection.subjectId,
                                        durationMinutes = selection.durationMinutes,
                                        questionCount = selection.questionCount,
                                        difficultyMode = selection.difficultyMode
                                    )
                                )
                                createdSession = sessionToStart

                                suspend fun doStart(session: SelfExamSession) {
                                    runCatching { onStartSession(session.id) }
                                        .onSuccess { payload ->
                                            openStartedPayload(payload)
                                        }
                                        .onFailure { err ->
                                            actionLoading = false
                                            activeErrorPopup = mapSelfExamError(err, "Could not start self exam.", onRetry = {
                                                scope.launch { doStart(session) }
                                            })
                                        }
                                }

                                if (!monitoringReady) {
                                    onRequestMonitoringPermissions { granted ->
                                        monitoringReady = granted
                                        if (granted) {
                                            scope.launch { doStart(sessionToStart) }
                                        } else {
                                            actionLoading = false
                                            activeErrorPopup = SelfExamErrorInfo(
                                                title = "Camera Permission Required",
                                                message = "Camera permission is required before starting.",
                                                primaryButtonText = "Grant Permission",
                                                category = SelfExamErrorCategory.PERMISSION,
                                                onPrimaryAction = {
                                                    onRequestMonitoringPermissions { g -> monitoringReady = g }
                                                }
                                            )
                                        }
                                    }
                                } else {
                                    doStart(sessionToStart)
                                }
                            }.onFailure { err ->
                                actionLoading = false
                                activeErrorPopup = mapSelfExamError(err, "Could not setup self exam.")
                            }
                        }
                    },
                    enabled = !actionLoading && !pendingRecoveryBlocked && selection.canStart(),
                    loading = actionLoading,
                    leadingIcon = Icons.Default.PlayArrow
                )
            },
            content = { page ->
                if (page == 5) activeSession?.let { session ->
                    SelfExamCard {
                        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                            SelfExamSectionHeader(
                                title = if (session.status == "expired") stringResource(R.string.expired_session) else stringResource(R.string.resume_exam),
                                subtitle = stringResource(R.string.continue_active_self_exam),
                                icon = Icons.Default.Refresh
                            )
                            Text(
                                stringResource(R.string.se_session_details, selfExamQuestionCount(session.questionCount), selfExamNumber(session.durationMinutes), selfExamDifficulty(session.difficultyMode)),
                                color = SelfExamTextSecondary
                            )
                            SelfExamPrimaryButton(
                                text = if (actionLoading) stringResource(R.string.restoring) else stringResource(R.string.resume_exam_caps),
                                onClick = {
                                    if (actionLoading) return@SelfExamPrimaryButton
                                    scope.launch {
                                        actionLoading = true
                                        runCatching {
                                            val payload = onLoadSession(session.id)
                                            if (payload.session.status == "expired") {
                                                onResultReady(onSubmitExpired(session.id))
                                                onClearPersistedSession()
                                            } else {
                                                openStartedPayload(payload)
                                            }
                                        }.onFailure { err ->
                                            activeErrorPopup = mapSelfExamError(err, "Could not resume self exam.")
                                        }
                                        actionLoading = false
                                    }
                                },
                                loading = actionLoading,
                                leadingIcon = Icons.Default.Refresh
                            )
                        }
                    }
                }
                when (page) {
                    0 -> {
                        SelfExamHeroBanner(totalClasses = rawClasses.size)
                        WizardTrackCards(selection.track) { next ->
                            if (!navigationBusy) {
                                selection = selection.selectTrack(next)
                                loadedSubjects = emptyList()
                                loadedChapters = emptyList()
                                navigate(1)
                            }
                        }
                    }
                    1 -> AdminQuestionBankTargetCard(
                        categories = rawClasses, selectedTrack = selection.track,
                        selectedCategoryId = selection.classId, loading = loading,
                        onSelectCategory = { category ->
                            if (!navigationBusy) {
                                val targetCode = category.slug.orEmpty().ifBlank { category.name.orEmpty() }
                                selection = selection.selectTargetCode(targetCode, category.id)
                                fetchSubjectsForClass(category.id)
                                navigate(2)
                            }
                        },
                        onSwitchTrack = { next ->
                            if (!navigationBusy) {
                                selection = selection.selectTrack(next)
                                loadedSubjects = emptyList()
                                loadedChapters = emptyList()
                            }
                        })
                    2 -> SubjectSelectionCard(loadedSubjects,
                        rawClasses.firstOrNull { it.id == selection.classId }, selection.subjectId, subjectsLoading) { subject ->
                        if (!navigationBusy) {
                            selection = selection.selectSubject(subject.id)
                            fetchChaptersForSubject(subject.id)
                            navigate(3)
                        }
                    }
                    3 -> ChapterSelectionCard(loadedChapters, selection.selectedChapterIds, chaptersLoading,
                        onToggleChapter = { id ->
                            if (!navigationBusy) { selection = selection.selectChapter(id); navigate(4) }
                        },
                        onSelectAllChapters = {
                            if (!navigationBusy) {
                                selection = selection.copy(selectedChapterIds = emptySet(), chapterId = null, nodeId = selection.subjectId)
                                navigate(4)
                            }
                        })
                    4 -> {
                        ConfigCard(selection = selection, onChange = { selection = it })
                        MonitoringReadinessCard(ready = monitoringReady, onRequestPermission = {
                        onRequestMonitoringPermissions { granted ->
                            monitoringReady = granted
                            if (!granted) {
                                activeErrorPopup = SelfExamErrorInfo(
                                    title = "Camera Permission Required",
                                    message = "Camera permission is required before starting a monitored self exam.",
                                    primaryButtonText = "Grant Permission",
                                    category = SelfExamErrorCategory.PERMISSION,
                                    onPrimaryAction = {
                                        onRequestMonitoringPermissions { g -> monitoringReady = g }
                                    }
                                )
                            }
                        }
                    })
                    }
                    5 -> {
                        SelfExamReadySummary(selection,
                            rawClasses.firstOrNull { it.id == selection.classId },
                            loadedSubjects.firstOrNull { it.id == selection.subjectId },
                            loadedChapters.firstOrNull { it.id == selection.chapterId }, monitoringReady)
                        MonitoringReadinessCard(ready = monitoringReady, onRequestPermission = {
                        onRequestMonitoringPermissions { granted ->
                            monitoringReady = granted
                            if (!granted) {
                                activeErrorPopup = SelfExamErrorInfo(
                                    title = "Camera Permission Required",
                                    message = "Camera permission is required before starting a monitored self exam.",
                                    primaryButtonText = "Grant Permission",
                                    category = SelfExamErrorCategory.PERMISSION,
                                    onPrimaryAction = {
                                        onRequestMonitoringPermissions { g -> monitoringReady = g }
                                    }
                                )
                            }
                        }
                    })
                    }
                }
            })
        activeErrorPopup?.let { errorInfo ->
            SelfExamErrorPopup(errorInfo = errorInfo, onDismiss = { activeErrorPopup = null })
        }
    }
}

@Composable
fun SelfExamResultScreen(
    resultResponse: SelfExamResultResponse,
    onBackToDashboard: () -> Unit
) {
    val answersByQuestion = resultResponse.answers.associateBy { it.questionId }
    val isLightMode = SelfExamDesign.isLight
    val totalQuestions = resultResponse.questions.size
    val correctAnswers = resultResponse.result.correctCount
    val countPercentage = if (totalQuestions > 0) correctAnswers.toDouble() / totalQuestions * 100.0 else 0.0

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(if (isLightMode) SelfExamDesign.canvas else SelfExamDesign.canvas)
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .statusBarsPadding()
                .padding(20.dp)
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(stringResource(R.string.submitted), color = SelfExamDesign.success, style = MaterialTheme.typography.labelLarge)
                Text(stringResource(R.string.self_exam_result), color = SelfExamTextPrimary, style = MaterialTheme.typography.headlineMedium,
                    fontWeight = FontWeight.Bold, modifier = Modifier.semantics { heading() })
                Text(stringResource(R.string.server_scored_report), color = SelfExamTextSecondary, style = MaterialTheme.typography.bodyMedium)
            }

            SelfExamCard {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text(
                        stringResource(R.string.se_percent_value, selfExamNumber(countPercentage)),
                        style = MaterialTheme.typography.displaySmall,
                        fontWeight = FontWeight.Black,
                        color = if (isLightMode) SelfExamBlue else Color.White
                    )
                    Text(
                        stringResource(R.string.sr_correct_count, correctAnswers, totalQuestions),
                        color = if (isLightMode) SelfExamTextSecondary else CheatLockTextSecondaryDark
                    )
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                        ResultMetric(modifier = Modifier.fillMaxWidth(), label = stringResource(R.string.correct), value = resultResponse.result.correctCount, color = SelfExamDesign.success)
                        ResultMetric(modifier = Modifier.fillMaxWidth(), label = stringResource(R.string.wrong), value = resultResponse.result.incorrectCount, color = SelfExamDesign.error)
                        ResultMetric(modifier = Modifier.fillMaxWidth(), label = stringResource(R.string.blank), value = resultResponse.result.unansweredCount, color = SelfExamDesign.warning)
                    }
                }
            }

            SectionHeader(title = stringResource(R.string.review), subtitle = stringResource(R.string.correct_answers_explanations))
            resultResponse.questions.forEachIndexed { index, question ->
                ReviewQuestionCard(
                    index = index,
                    question = question,
                    answer = answersByQuestion[question.id]
                )
            }
            SelfExamPrimaryButton(
                text = stringResource(R.string.return_to_dashboard_caps),
                onClick = onBackToDashboard,
                leadingIcon = Icons.AutoMirrored.Filled.ArrowBack
            )
        }
    }
}



@Composable
private fun SelfExamSetupHeader(onBack: () -> Unit) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        IconButton(onClick = onBack, modifier = Modifier.size(48.dp)
            .clip(SelfExamDesign.controlShape).background(SelfExamDesign.surface)
            .border(1.dp, SelfExamDesign.border.copy(alpha = 0.35f), SelfExamDesign.controlShape)) {
            Icon(Icons.AutoMirrored.Filled.ArrowBack, stringResource(R.string.se_back_to_dashboard), tint = SelfExamTextPrimary)
        }
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            SelfExamLabTitle(examLabColor = SelfExamDesign.accent)
            Text(stringResource(R.string.practice_central_question_bank), color = SelfExamTextSecondary,
                style = MaterialTheme.typography.bodySmall)
        }
    }
}

@Composable
private fun SetupSectionReveal(visible: Boolean, content: @Composable () -> Unit) {
    AnimatedVisibility(visible = visible,
        enter = fadeIn(tween(220)) + expandVertically(tween(300, easing = FastOutSlowInEasing)),
        exit = fadeOut(tween(120)) + shrinkVertically(tween(220, easing = FastOutSlowInEasing))) {
        content()
    }
}

@Composable
private fun SelfExamProgressRail(
    targetSelected: Boolean,
    subjectSelected: Boolean,
    chapterReady: Boolean,
    configurationReady: Boolean,
    monitoringReady: Boolean
) {
    val steps = listOf(stringResource(R.string.se_target) to targetSelected,
        stringResource(R.string.se_subject) to subjectSelected,
        stringResource(R.string.se_chapter) to chapterReady,
        stringResource(R.string.se_setup) to configurationReady,
        stringResource(R.string.se_ready) to (configurationReady && monitoringReady))
    val completed = steps.count { it.second }
    val progress by animateFloatAsState(completed / steps.size.toFloat(), tween(300), label = "self_exam_progress")
    val progressDescription = stringResource(R.string.se_progress_state, selfExamNumber(completed), selfExamNumber(steps.size))
    SelfExamCard {
        Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Text(stringResource(R.string.se_exam_setup_flow), color = SelfExamTextPrimary,
                style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, modifier = Modifier.semantics { heading() })
            LinearProgressIndicator(progress = { progress }, color = SelfExamDesign.accent,
                trackColor = SelfExamDesign.inset, modifier = Modifier.fillMaxWidth().semantics { stateDescription = progressDescription })
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                steps.forEachIndexed { index, step ->
                    val state = stringResource(if (step.second) R.string.se_complete else R.string.se_not_complete)
                    Row(Modifier.semantics(mergeDescendants = true) { stateDescription = state }
                        .padding(vertical = 4.dp, horizontal = 2.dp),
                        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        Icon(if (step.second) Icons.Default.CheckCircle else Icons.Default.RadioButtonUnchecked,
                            null, tint = if (step.second) SelfExamDesign.success else SelfExamTextSecondary, modifier = Modifier.size(18.dp))
                        Text(selfExamNumber(index + 1) + ". " + step.first, color = SelfExamTextPrimary, style = MaterialTheme.typography.labelLarge)
                    }
                }
            }
        }
    }
}

@Composable
private fun AdminQuestionBankTargetCard(
    categories: List<SelfExamClass>,
    selectedTrack: SelfExamTrack,
    selectedCategoryId: String?,
    loading: Boolean,
    onSelectCategory: (SelfExamClass) -> Unit,
    onSwitchTrack: (SelfExamTrack) -> Unit
) {
    val isLight = SelfExamDesign.isLight
    val matchingCategories = remember(categories, selectedTrack) {
        categories.filter { it.matchesTrack(selectedTrack) }
    }

    SelfExamCard {
        Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
            SelfExamSectionHeader(
                title = if (selectedTrack == SelfExamTrack.ACADEMIC) stringResource(R.string.se_select_class) else stringResource(R.string.se_select_admission_track),
                subtitle = stringResource(R.string.se_choose_from_active_classes_configured_in_the_admin_question_bank),
                icon = if (selectedTrack == SelfExamTrack.ACADEMIC) Icons.Default.School else Icons.Default.Security
            )

            when {
                loading -> Row(verticalAlignment = Alignment.CenterVertically) {
                    CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp, color = SelfExamBlueBright)
                    Spacer(Modifier.width(10.dp))
                    Text(stringResource(R.string.se_loading_classes_from_question_bank), color = SelfExamTextSecondary)
                }

                matchingCategories.isEmpty() -> {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(14.dp))
                            .background(if (isLight) Color(0xFFF8FAFC) else Color(0x261E293B))
                            .padding(16.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Text(
                            text = stringResource(R.string.se_no_active_targets, selfExamTrack(selectedTrack == SelfExamTrack.ADMISSION)),
                            color = SelfExamTextSecondary,
                            textAlign = TextAlign.Center,
                            style = MaterialTheme.typography.bodyMedium
                        )
                        Text(
                            text = stringResource(R.string.se_classes_and_subjects_created_in_the_admin_dashboard_will_sync_her),
                            color = SelfExamTextMuted,
                            textAlign = TextAlign.Center,
                            style = MaterialTheme.typography.bodySmall
                        )
                        val otherTrack = if (selectedTrack == SelfExamTrack.ACADEMIC) SelfExamTrack.ADMISSION else SelfExamTrack.ACADEMIC
                        val otherCount = categories.count { it.matchesTrack(otherTrack) }
                        if (otherCount > 0) {
                            Spacer(Modifier.height(4.dp))
                            OutlinedButton(
                                onClick = { onSwitchTrack(otherTrack) },
                                shape = RoundedCornerShape(10.dp)
                            ) {
                                Text(stringResource(R.string.se_switch_track, selfExamTrack(otherTrack == SelfExamTrack.ADMISSION), selfExamNumber(otherCount)))
                            }
                        }
                    }
                }

                else -> {
                    FlowRow(
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        matchingCategories.forEach { category ->
                            val isSelected = selectedCategoryId == category.id
                            Surface(
                                modifier = Modifier.fillMaxWidth().heightIn(min = 64.dp).selectable(selected = isSelected, role = Role.RadioButton, onClick = { onSelectCategory(category) }),
                                shape = RoundedCornerShape(14.dp),
                                color = when {
                                    isSelected -> SelfExamDesign.accent.copy(alpha = 0.09f)
                                    isLight -> Color(0xFFF1F5F9)
                                    else -> Color(0x261E293B)
                                },
                                border = BorderStroke(
                                    1.dp,
                                    if (isSelected) SelfExamBlueBright else SelfExamBorder.copy(alpha = 0.4f)
                                )
                            ) {
                                Row(
                                    modifier = Modifier.padding(horizontal = 14.dp, vertical = 12.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                                ) {
                                    val iconDisplay = category.icon.orEmpty().ifBlank {
                                        if (selectedTrack == SelfExamTrack.ADMISSION) "🚀" else "🎓"
                                    }
                                    Text(
                                        iconDisplay,
                                        fontSize = 18.sp
                                    )
                                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                        Text(
                                            category.name.orEmpty(),
                                            color = SelfExamTextPrimary,
                                            fontWeight = FontWeight.Bold,
                                            fontSize = 14.sp
                                        )
                                        if (!category.description.isNullOrBlank()) {
                                            Text(
                                                category.description,
                                                color = SelfExamTextMuted,
                                                style = MaterialTheme.typography.bodySmall
                                            )
                                        }
                                    }
                                    Icon(if (isSelected) Icons.Default.CheckCircle else Icons.Default.RadioButtonUnchecked,
                                        null, tint = if (isSelected) SelfExamDesign.accent else SelfExamTextMuted,
                                        modifier = Modifier.size(20.dp))
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

/**
 * Animated Hero Banner showing dynamic Question Bank status
 */
@Composable
private fun SelfExamHeroBanner(totalClasses: Int) {
    Column(Modifier.fillMaxWidth().padding(horizontal = 4.dp, vertical = 4.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text(stringResource(R.string.se_personalized_smart_exam_test_prep), color = SelfExamTextPrimary,
            style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
        Text(stringResource(R.string.se_practice_topic_wise_or_take_full_mock_exams_synchronized_directly),
            color = SelfExamTextSecondary, style = MaterialTheme.typography.bodyMedium)
        Surface(shape = CircleShape, color = SelfExamDesign.accent.copy(alpha = 0.08f)) {
            Row(Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Icon(Icons.AutoMirrored.Filled.MenuBook, null, Modifier.size(16.dp), tint = SelfExamDesign.accent)
                Text(if (totalClasses > 0) pluralStringResource(R.plurals.se_curriculum_count, totalClasses, selfExamNumber(totalClasses))
                    else stringResource(R.string.se_central_question_bank), color = SelfExamDesign.accent,
                    style = MaterialTheme.typography.labelMedium)
            }
        }
    }
}

/**
 * Top Segmented Switcher: Academic vs Admission
 */
@Composable
private fun SelfExamTrackSwitcher(
    selectedTrack: SelfExamTrack,
    academicCount: Int,
    admissionCount: Int,
    onSelectTrack: (SelfExamTrack) -> Unit
) {
    val stacked = androidx.compose.ui.platform.LocalConfiguration.current.fontScale > 1.3f
    FlowRow(
        modifier = Modifier.fillMaxWidth().selectableGroup(),
        maxItemsInEachRow = if (stacked) 1 else 2,
        verticalArrangement = Arrangement.spacedBy(12.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        // Academic Card
        TrackSelectCard(
            title = stringResource(R.string.se_academic),
            subtitle = if (academicCount > 0) pluralStringResource(R.plurals.se_class_count, academicCount, selfExamNumber(academicCount)) else stringResource(R.string.se_school_college_1_12),
            icon = "🎓",
            selected = selectedTrack == SelfExamTrack.ACADEMIC,
            gradientColors = listOf(Color(0xFF2563EB), Color(0xFF4F46E5)),
            modifier = if (stacked) Modifier.fillMaxWidth() else Modifier.weight(1f),
            onClick = { onSelectTrack(SelfExamTrack.ACADEMIC) }
        )

        // Admission Card
        TrackSelectCard(
            title = stringResource(R.string.se_admission),
            subtitle = if (admissionCount > 0) pluralStringResource(R.plurals.se_target_count, admissionCount, selfExamNumber(admissionCount)) else stringResource(R.string.se_varsity_medical_eng),
            icon = "🚀",
            selected = selectedTrack == SelfExamTrack.ADMISSION,
            gradientColors = listOf(Color(0xFF7C3AED), Color(0xFF0284C7)),
            modifier = if (stacked) Modifier.fillMaxWidth() else Modifier.weight(1f),
            onClick = { onSelectTrack(SelfExamTrack.ADMISSION) }
        )
    }
}

@Composable
private fun TrackSelectCard(
    modifier: Modifier = Modifier,
    title: String,
    subtitle: String,
    icon: String,
    selected: Boolean,
    gradientColors: List<Color>,
    onClick: () -> Unit
) {
    val background by animateColorAsState(if (selected) SelfExamDesign.accent.copy(alpha = 0.09f) else SelfExamDesign.surface,
        tween(240), label = "track_background")
    val state = stringResource(if (selected) R.string.se_selected else R.string.se_not_selected)
    Column(modifier.clip(SelfExamDesign.controlShape).background(background)
        .border(1.dp, if (selected) SelfExamDesign.accent else SelfExamDesign.border.copy(alpha = 0.4f), SelfExamDesign.controlShape)
        .selectable(selected = selected, role = Role.RadioButton, onClick = onClick)
        .semantics(mergeDescendants = true) { stateDescription = state }.heightIn(min = 96.dp).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically) {
            Icon(if (title == stringResource(R.string.se_academic)) Icons.Default.School else Icons.Default.AccountBalance,
                null, tint = SelfExamDesign.accent)
            Icon(if (selected) Icons.Default.CheckCircle else Icons.Default.RadioButtonUnchecked,
                null, Modifier.size(18.dp), tint = if (selected) SelfExamDesign.accent else SelfExamTextMuted)
        }
        Text(title, color = SelfExamTextPrimary,
            style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
        Text(subtitle, color = SelfExamTextSecondary,
            style = MaterialTheme.typography.bodySmall)
    }
}

/**
 * Subject Selection Card
 */
@Composable
private fun SubjectSelectionCard(
    subjects: List<SelfExamSubject>,
    selectedClass: SelfExamClass?,
    selectedSubjectId: String?,
    loading: Boolean,
    onSelectSubject: (SelfExamSubject) -> Unit
) {
    SelfExamCard {
        Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
            SelfExamSectionHeader(
                title = stringResource(R.string.se_choose_subject),
                subtitle = selectedClass?.let { stringResource(R.string.se_subjects_under, it.name.orEmpty()) }
                    ?: stringResource(R.string.se_choose_your_subject),
                icon = Icons.AutoMirrored.Filled.MenuBook)
            when {
                loading -> Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    CircularProgressIndicator(Modifier.size(20.dp), color = SelfExamDesign.accent, strokeWidth = 2.dp)
                    Text(stringResource(R.string.se_loading_syllabus_subjects), color = SelfExamTextSecondary)
                }
                subjects.isEmpty() -> Text(
                    stringResource(R.string.se_no_subjects_added_for_this_class_yet_please_add_subjects_in_the_a),
                    color = SelfExamTextSecondary, style = MaterialTheme.typography.bodyMedium)
                else -> Column(Modifier.fillMaxWidth().selectableGroup(), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    subjects.forEach { subject ->
                        WizardOptionRow(selected = selectedSubjectId == subject.id, title = subject.name.orEmpty(),
                            onClick = { onSelectSubject(subject) })
                    }
                }
            }
        }
    }
}

/**
 * Chapter Selection Card
 */
@Composable
private fun ChapterSelectionCard(
    chapters: List<SelfExamChapter>,
    selectedChapterIds: Set<String>,
    loading: Boolean,
    onToggleChapter: (String) -> Unit,
    onSelectAllChapters: () -> Unit
) {
    val isFullSubject = selectedChapterIds.isEmpty()
    SelfExamCard {
        Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
            SelfExamSectionHeader(title = stringResource(R.string.se_choose_chapter_topic),
                subtitle = if (isFullSubject) stringResource(R.string.se_full_subject_practice_all_topics_included)
                    else stringResource(R.string.se_one_chapter), icon = Icons.AutoMirrored.Filled.MenuBook)
            if (!loading) WizardOptionRow(title = stringResource(R.string.se_all_chapters_full_subject),
                selected = isFullSubject, onClick = onSelectAllChapters)
            when {
                loading -> Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    CircularProgressIndicator(Modifier.size(20.dp), color = SelfExamDesign.accent, strokeWidth = 2.dp)
                    Text(stringResource(R.string.se_loading_chapters), color = SelfExamTextSecondary)
                }
                chapters.isEmpty() -> Text(
                    stringResource(R.string.se_no_separate_chapters_defined_for_this_subject_the_exam_will_draw_),
                    color = SelfExamTextSecondary, style = MaterialTheme.typography.bodyMedium)
                else -> Column(Modifier.fillMaxWidth().selectableGroup(), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    chapters.forEach { chapter ->
                        WizardOptionRow(selected = selectedChapterIds.contains(chapter.id), title = formatChapter(chapter),
                            onClick = { onToggleChapter(chapter.id) })
                    }
                }
            }
        }
    }
}

@Composable
private fun SelfExamSectionHeader(title: String, subtitle: String, icon: ImageVector? = null) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Top,
        horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        icon?.let {
            Box(Modifier.size(40.dp).clip(RoundedCornerShape(12.dp))
                .background(SelfExamDesign.accent.copy(alpha = 0.08f)), contentAlignment = Alignment.Center) {
                Icon(it, null, tint = SelfExamBlueBright, modifier = Modifier.size(20.dp))
            }
        }
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(5.dp)) {
            Text(title, color = SelfExamTextPrimary, style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold, modifier = Modifier.semantics { heading() })
            Text(subtitle, color = SelfExamTextSecondary, style = MaterialTheme.typography.bodySmall)
        }
    }
}

@Composable
private fun ConfigCard(
    selection: SelfExamSetupSelection,
    onChange: (SelfExamSetupSelection) -> Unit
) {
    val isMixed = selection.difficultyMode == "mixed"
    SelfExamCard {
        Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
            SelfExamSectionHeader(title = stringResource(R.string.configuration), subtitle = stringResource(R.string.choose_practice_amount), icon = Icons.Default.Timer)
            Text(stringResource(R.string.difficulty_level), color = SelfExamTextPrimary,
                style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Bold)
            WizardDifficultyPicker(selection.difficultyMode) { mode -> onChange(selection.withDifficultyMode(mode)) }
            if (!isMixed) {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text(stringResource(R.string.questions), color = SelfExamTextPrimary, fontWeight = FontWeight.Bold)
                Text(
                    if (isMixed) stringResource(R.string.mixed_practice_notice) else stringResource(R.string.how_many_questions),
                    color = SelfExamTextSecondary,
                    style = MaterialTheme.typography.bodySmall
                )
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    SelfExamStepButton(text = "−", enabled = !isMixed && selection.questionCount > 1) {
                        onChange(selection.withQuestionCount(selection.questionCount - 1))
                    }
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(12.dp))
                            .background(SelfExamBlue.copy(alpha = 0.14f))
                            .border(1.dp, SelfExamBlue.copy(alpha = 0.52f), RoundedCornerShape(12.dp))
                            .padding(horizontal = 18.dp, vertical = 12.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(selfExamNumber(selection.questionCount), color = SelfExamTextPrimary, fontWeight = FontWeight.Black)
                    }
                    SelfExamStepButton(text = "+", enabled = !isMixed && selection.questionCount < 50) {
                        onChange(selection.withQuestionCount(selection.questionCount + 1))
                    }
                }
                FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf(10, 20, 30, 40, 50).forEach { count ->
                        SelfExamChip(
                            selected = selection.questionCount == count,
                            enabled = !isMixed,
                            text = selfExamNumber(count),
                            onClick = { onChange(selection.withQuestionCount(count)) }
                        )
                    }
                }
            }

            }
            SelfExamDurationSummary(selection)
        }
    }
}

@Composable
private fun SelfExamDurationSummary(selection: SelfExamSetupSelection) {
    Column(Modifier.fillMaxWidth().clip(SelfExamDesign.controlShape).background(SelfExamDesign.inset).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(if (selection.difficultyMode == "mixed") stringResource(R.string.mixed_practice) else stringResource(R.string.exam_duration),
            color = SelfExamTextPrimary, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
        Text(if (selection.difficultyMode == "mixed") stringResource(R.string.uses_mixed_setup) else stringResource(R.string.based_on_selection),
            color = SelfExamTextSecondary, style = MaterialTheme.typography.bodyMedium)
        Text(stringResource(R.string.se_question_difficulty, selfExamQuestionCount(selection.questionCount), selfExamDifficulty(selection.difficultyMode)), color = SelfExamTextSecondary)
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Icon(Icons.Default.Timer, null, tint = SelfExamDesign.accent)
            Text(stringResource(R.string.se_minutes_value, selfExamNumber(selection.durationMinutes)),
                color = SelfExamDesign.accent, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
        }
    }
}

@Composable
private fun SelfExamChip(
    selected: Boolean,
    text: String,
    onClick: () -> Unit,
    enabled: Boolean = true
) {
    FilterChip(selected = selected, onClick = onClick, enabled = enabled,
        border = FilterChipDefaults.filterChipBorder(enabled = enabled, selected = selected, borderColor = SelfExamDesign.controlBorder, selectedBorderColor = SelfExamDesign.action),
        modifier = Modifier.heightIn(min = 48.dp).semantics { role = Role.RadioButton },
        label = { Text(text, style = MaterialTheme.typography.bodyMedium, fontWeight = if (selected) FontWeight.Bold else FontWeight.Normal) },
        leadingIcon = if (selected) ({ Icon(Icons.Default.CheckCircle, null, Modifier.size(18.dp)) }) else null,
        colors = FilterChipDefaults.filterChipColors(containerColor = SelfExamDesign.inset,
            labelColor = SelfExamTextPrimary, selectedContainerColor = SelfExamDesign.action,
            selectedLabelColor = SelfExamDesign.onAction, selectedLeadingIconColor = SelfExamDesign.onAction,
            disabledContainerColor = SelfExamDesign.inset, disabledLabelColor = SelfExamTextSecondary))
}

@Composable
private fun SelfExamStepButton(
    text: String,
    enabled: Boolean,
    onClick: () -> Unit
) {
    val description = stringResource(if (text == "+") R.string.se_increase_questions else R.string.se_decrease_questions)
    OutlinedButton(onClick = onClick, enabled = enabled, modifier = Modifier.size(48.dp).semantics { contentDescription = description },
        shape = SelfExamDesign.controlShape, contentPadding = androidx.compose.foundation.layout.PaddingValues(0.dp)) {
        Text(text, color = if (enabled) SelfExamDesign.accent else SelfExamTextSecondary,
            style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
    }
}

@Composable
internal fun SelfExamPrimaryButton(
    text: String,
    onClick: () -> Unit,
    enabled: Boolean = true,
    loading: Boolean = false,
    leadingIcon: ImageVector? = null
) {
    Button(onClick = onClick, enabled = enabled, modifier = Modifier.fillMaxWidth().heightIn(min = 56.dp),
        shape = SelfExamDesign.controlShape, contentPadding = SelfExamDesign.buttonPadding,
        colors = ButtonDefaults.buttonColors(containerColor = SelfExamDesign.action, contentColor = SelfExamDesign.onAction,
            disabledContainerColor = SelfExamDesign.inset, disabledContentColor = SelfExamTextSecondary)) {
        if (loading) {
            CircularProgressIndicator(Modifier.size(22.dp), strokeWidth = 2.dp, color = SelfExamDesign.onAction)
            Spacer(Modifier.width(10.dp))
        } else leadingIcon?.let { Icon(it, null, Modifier.size(20.dp)); Spacer(Modifier.width(10.dp)) }
        Text(text, style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Bold, textAlign = TextAlign.Center)
    }
}

@Composable
private fun MonitoringReadinessCard(
    ready: Boolean,
    onRequestPermission: () -> Unit
) {
    SelfExamCard {
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    imageVector = if (ready) Icons.Default.CheckCircle else Icons.Default.CameraAlt,
                    contentDescription = null,
                    tint = if (ready) SelfExamDesign.success else SelfExamDesign.warning
                )
                Spacer(Modifier.width(10.dp))
                Column(Modifier.weight(1f)) {
                    Text(stringResource(R.string.se_monitoring_readiness), color = SelfExamTextPrimary, fontWeight = FontWeight.Bold)
                    Text(
                        if (ready) {
                            stringResource(R.string.se_camera_permission_is_ready_monitoring_starts_only_after_the_serve)
                        } else {
                            stringResource(R.string.se_camera_permission_is_required_before_the_self_exam_timer_can_star)
                        },
                        color = SelfExamTextSecondary,
                        style = MaterialTheme.typography.bodySmall
                    )
                }
            }
            if (!ready) {
                OutlinedButton(onClick = onRequestPermission, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp),
                    shape = SelfExamDesign.controlShape, contentPadding = SelfExamDesign.buttonPadding,
                    border = BorderStroke(1.dp, SelfExamDesign.controlBorder)) {
                    Text(stringResource(R.string.se_allow_monitoring), color = SelfExamDesign.accent, textAlign = TextAlign.Center)
                }
            }
        }
    }
}

@Composable
private fun SelfExamReadySummary(
    selection: SelfExamSetupSelection,
    selectedClass: SelfExamClass?,
    selectedSubject: SelfExamSubject?,
    selectedChapter: SelfExamChapter?,
    monitoringReady: Boolean
) {
    val ready = selection.canStart() && monitoringReady
    SelfExamCard {
        Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(
                    modifier = Modifier
                        .size(48.dp)
                        .clip(RoundedCornerShape(12.dp))
                        .background(if (ready) SelfExamDesign.success.copy(alpha = 0.16f) else SelfExamBlue.copy(alpha = 0.14f))
                        .border(1.dp, if (ready) SelfExamDesign.success.copy(alpha = 0.44f) else SelfExamBlue.copy(alpha = 0.36f), RoundedCornerShape(12.dp)),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        imageVector = if (ready) Icons.Default.CheckCircle else Icons.AutoMirrored.Filled.FactCheck,
                        contentDescription = null,
                        tint = if (ready) SelfExamDesign.success else SelfExamBlueBright,
                        modifier = Modifier.size(24.dp)
                    )
                }
                Spacer(Modifier.width(12.dp))
                Column(Modifier.weight(1f)) {
                    Text(if (ready) stringResource(R.string.se_ready_for_a_clean_exam) else stringResource(R.string.se_review_your_setup), color = SelfExamTextPrimary, fontWeight = FontWeight.Black)
                    Text(stringResource(R.string.se_your_timer_starts_only_after_this_setup_is_accepted), color = SelfExamTextSecondary, style = MaterialTheme.typography.bodySmall)
                }
            }

            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                SummaryLine(stringResource(R.string.se_track), selfExamTrack(selection.track == SelfExamTrack.ADMISSION))
                SummaryLine(stringResource(R.string.se_target), selectedClass?.name.orEmpty().ifBlank { selection.selectedTargetCode?.replace("_", " ") ?: stringResource(R.string.se_choose_a_class_or_admission_target) })
                SummaryLine(stringResource(R.string.se_subject), selectedSubject?.name.orEmpty().ifBlank { stringResource(R.string.se_choose_a_subject) })
                SummaryLine(stringResource(R.string.se_chapter), if (selection.subjectId == null) stringResource(R.string.se_choose_a_subject) else selectedChapter?.let { chapterLabel(it) } ?: stringResource(R.string.se_all_chapters_full_subject_practice))
                SummaryLine(stringResource(R.string.se_questions), selfExamQuestionCount(selection.questionCount))
                SummaryLine(stringResource(R.string.se_difficulty), selfExamDifficulty(selection.difficultyMode))
                SummaryLine(stringResource(R.string.se_duration), stringResource(R.string.se_minutes_value, selfExamNumber(selection.durationMinutes)))
                SummaryLine(stringResource(R.string.se_monitoring_readiness),
                    stringResource(if (monitoringReady) R.string.se_complete else R.string.se_not_complete))
            }
        }
    }
}

@Composable
private fun Double.formatMarks(): String {
    return if (this % 1.0 == 0.0) toInt().toString() else "%.1f".format(this)
}

@Composable
private fun ResultMetric(
    modifier: Modifier = Modifier,
    label: String,
    value: Int,
    color: Color
) {
    Column(modifier.clip(SelfExamDesign.controlShape).background(SelfExamDesign.inset).padding(14.dp)
        .semantics(mergeDescendants = true) {}, verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(selfExamNumber(value), color = color, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
        Text(label, color = SelfExamTextPrimary, style = MaterialTheme.typography.bodyMedium)
    }
}

@Composable
private fun SummaryLine(label: String, value: String) {
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(3.dp)) {
        Text(label, color = SelfExamTextSecondary, style = MaterialTheme.typography.labelMedium)
        Text(value, color = SelfExamTextPrimary, style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.Medium)
    }
}

@Composable
private fun ReviewQuestionCard(
    index: Int,
    question: SelfExamReviewQuestion,
    answer: SelfExamAnswer?
) {
    SelfExamCard {
        Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Text(stringResource(R.string.se_question_label, selfExamNumber(index + 1)), color = SelfExamDesign.accent,
                style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
            Text(question.questionText, color = SelfExamTextPrimary, style = MaterialTheme.typography.titleMedium)
            question.options.forEach { option ->
                val selected = answer?.selectedOptionId == option.id
                val selectedWrong = answer != null && selected && answer.isCorrect == false
                val tint = when { option.isCorrect -> SelfExamDesign.success; selectedWrong -> SelfExamDesign.error; else -> SelfExamTextSecondary }
                val status = when { option.isCorrect -> stringResource(R.string.se_correct_answer); selectedWrong -> stringResource(R.string.se_your_answer_incorrect); selected -> stringResource(R.string.se_your_answer); else -> "" }
                Row(Modifier.fillMaxWidth().clip(SelfExamDesign.controlShape).background(tint.copy(alpha = 0.07f))
                    .border(1.dp, if (option.isCorrect || selectedWrong) tint else SelfExamDesign.border, SelfExamDesign.controlShape)
                    .padding(14.dp).semantics(mergeDescendants = true) {}, verticalAlignment = Alignment.Top,
                    horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Icon(when { option.isCorrect -> Icons.Default.CheckCircle; selectedWrong -> Icons.Default.ErrorOutline; else -> Icons.Default.RadioButtonUnchecked },
                        null, tint = tint, modifier = Modifier.size(20.dp))
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text(option.text, color = SelfExamTextPrimary, style = MaterialTheme.typography.bodyLarge)
                        if (status.isNotBlank()) Text(status + if (selected && option.isCorrect) stringResource(R.string.se_your_answer_suffix) else "",
                            color = tint, style = MaterialTheme.typography.labelLarge)
                    }
                }
            }
            if (question.explanation.isNotBlank()) {
                Text(stringResource(R.string.se_explanation), color = SelfExamDesign.accent, fontWeight = FontWeight.Bold)
                Text(question.explanation, color = SelfExamTextSecondary, style = MaterialTheme.typography.bodyLarge)
            }
        }
    }
}


@Composable
private fun chapterLabel(chapter: SelfExamChapter): String {
    val locale = androidx.compose.ui.platform.LocalConfiguration.current.locales[0]
    val number = chapter.chapterNumber?.let { java.text.NumberFormat.getIntegerInstance(locale).apply { minimumIntegerDigits = 2 }.format(it) }
    return if (number == null) chapter.name.orEmpty() else "$number - ${chapter.name.orEmpty()}"
}

@Composable
private fun formatChapter(chapter: SelfExamChapter): String = chapterLabel(chapter)

private fun SelfExamClass.matchesTrack(track: SelfExamTrack): Boolean {
    val explicitTrack = this.track?.trim()?.lowercase()
    if (explicitTrack == "admission") {
        return track == SelfExamTrack.ADMISSION
    }
    if (explicitTrack == "academic") {
        return track == SelfExamTrack.ACADEMIC
    }

    val haystack = listOf(slug.orEmpty(), name.orEmpty(), description.orEmpty())
        .joinToString(" ")
        .lowercase()
    val isAdmission = haystack.contains("admission") ||
        haystack.contains("varsity") ||
        haystack.contains("university") ||
        haystack.contains("medical") ||
        haystack.contains("engineering")
    return when (track) {
        SelfExamTrack.ACADEMIC -> !isAdmission
        SelfExamTrack.ADMISSION -> isAdmission
    }
}

enum class SelfExamErrorCategory {
    VALIDATION,
    NETWORK,
    SERVER,
    TIMEOUT,
    PERMISSION,
    UNKNOWN
}

data class SelfExamErrorInfo(
    val title: String,
    val message: String,
    val primaryButtonText: String = "Got it",
    val secondaryButtonText: String? = null,
    val category: SelfExamErrorCategory = SelfExamErrorCategory.VALIDATION,
    val onPrimaryAction: (() -> Unit)? = null,
    val onSecondaryAction: (() -> Unit)? = null
)

fun mapSelfExamError(
    throwable: Throwable?,
    fallbackMessage: String = "An unexpected error occurred while setting up your self exam.",
    defaultCategory: SelfExamErrorCategory = SelfExamErrorCategory.UNKNOWN,
    onRetry: (() -> Unit)? = null
): SelfExamErrorInfo {
    val rawMsg = throwable?.message.orEmpty().ifBlank { fallbackMessage }
    val lower = rawMsg.lowercase()

    // Classify HTTP failures before message/URL substring heuristics.
    // Database access is a server problem, never a camera permission request.
    if (throwable is BackendRequestException &&
        (throwable.questionBankFailure != null || throwable.statusCode >= 500)) {
        return SelfExamErrorInfo(
            title = if (throwable.questionBankFailure != null) "Question Bank Unavailable" else "Server Error",
            message = throwable.message ?: fallbackMessage,
            primaryButtonText = if (onRetry != null) "Try Again" else "Got it",
            secondaryButtonText = if (onRetry != null) "Cancel" else null,
            category = SelfExamErrorCategory.SERVER,
            onPrimaryAction = onRetry
        )
    }

    return when {
        lower.contains("network") || lower.contains("connect") || lower.contains("host") || lower.contains("offline") || lower.contains("unreachable") -> {
            SelfExamErrorInfo(
                title = "Connection Problem",
                message = "We couldn't connect to the CheatLock server. Please check your internet connection and try again.",
                primaryButtonText = if (onRetry != null) "Try Again" else "Got it",
                secondaryButtonText = if (onRetry != null) "Cancel" else null,
                category = SelfExamErrorCategory.NETWORK,
                onPrimaryAction = onRetry
            )
        }
        lower.contains("timeout") || lower.contains("timed out") -> {
            SelfExamErrorInfo(
                title = "Request Timed Out",
                message = "The server is taking longer than expected to prepare your exam. Please try again.",
                primaryButtonText = if (onRetry != null) "Try Again" else "Got it",
                secondaryButtonText = if (onRetry != null) "Cancel" else null,
                category = SelfExamErrorCategory.TIMEOUT,
                onPrimaryAction = onRetry
            )
        }
        lower.contains("permission") || lower.contains("camera") -> {
            SelfExamErrorInfo(
                title = "Camera Permission Required",
                message = "Camera permission is required to monitor your self exam session. Please grant permission when prompted.",
                primaryButtonText = "Got it",
                category = SelfExamErrorCategory.PERMISSION
            )
        }
        lower.contains("500") || lower.contains("502") || lower.contains("503") || lower.contains("internal server") -> {
            SelfExamErrorInfo(
                title = "Server Error",
                message = "We couldn't generate your exam right now due to a temporary server issue. Please try again.",
                primaryButtonText = if (onRetry != null) "Try Again" else "Got it",
                secondaryButtonText = if (onRetry != null) "Cancel" else null,
                category = SelfExamErrorCategory.SERVER,
                onPrimaryAction = onRetry
            )
        }
        lower.contains("not found") || lower.contains("no questions") || lower.contains("active questions") -> {
            SelfExamErrorInfo(
                title = "No Questions Available",
                message = "There are no active questions available for the selected topic. Please select a different subject or chapter.",
                primaryButtonText = "Got it",
                category = SelfExamErrorCategory.VALIDATION
            )
        }
        else -> {
            val cleanMessage = if (rawMsg.contains("Exception") || rawMsg.contains("Error:")) {
                "We couldn't process your self exam setup right now. Please try again."
            } else {
                rawMsg
            }
            SelfExamErrorInfo(
                title = if (defaultCategory == SelfExamErrorCategory.VALIDATION) "Selection Required" else "Unable to Setup Exam",
                message = cleanMessage,
                primaryButtonText = if (onRetry != null) "Try Again" else "Got it",
                secondaryButtonText = if (onRetry != null) "Cancel" else null,
                category = defaultCategory,
                onPrimaryAction = onRetry
            )
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SelfExamErrorPopup(
    errorInfo: SelfExamErrorInfo,
    onDismiss: () -> Unit
) {
    BasicAlertDialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false)
    ) {
        var visible by remember { mutableStateOf(false) }
        LaunchedEffect(Unit) { visible = true }

        val isLight = SelfExamDesign.isLight
        val dialogBorder = if (isLight) {
            BorderStroke(1.dp, CheatLockLightBorder)
        } else {
            BorderStroke(
                1.dp,
                Brush.verticalGradient(
                    listOf(
                        Color(0xFF334155),
                        Color(0xFF1E293B)
                    )
                )
            )
        }

        AnimatedVisibility(
            visible = visible,
            enter = cheatLockDialogEnterTransition(),
            exit = cheatLockDialogExitTransition()
        ) {
            Surface(
                modifier = Modifier
                    .fillMaxWidth(0.9f)
                    .padding(16.dp),
                shape = RoundedCornerShape(24.dp),
                color = if (isLight) Color.White else SelfExamSurfaceRaised,
                border = dialogBorder,
                tonalElevation = 8.dp,
                shadowElevation = 16.dp
            ) {
                Column(
                    modifier = Modifier.verticalScroll(rememberScrollState()).padding(24.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(16.dp)
                ) {
                    val (icon, accentColor) = when (errorInfo.category) {
                        SelfExamErrorCategory.VALIDATION -> Icons.Default.School to Color(0xFFF59E0B)
                        SelfExamErrorCategory.NETWORK -> Icons.Default.WifiOff to Color(0xFFF43F5E)
                        SelfExamErrorCategory.SERVER -> Icons.Default.ErrorOutline to Color(0xFFEF4444)
                        SelfExamErrorCategory.TIMEOUT -> Icons.Default.Timer to Color(0xFF06B6D4)
                        SelfExamErrorCategory.PERMISSION -> Icons.Default.CameraAlt to Color(0xFFA855F7)
                        SelfExamErrorCategory.UNKNOWN -> Icons.Default.Warning to Color(0xFFF59E0B)
                    }

                    Box(
                        modifier = Modifier
                            .size(64.dp)
                            .clip(CircleShape)
                            .background(accentColor.copy(alpha = 0.15f))
                            .border(1.dp, accentColor.copy(alpha = 0.35f), CircleShape),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(
                            imageVector = icon,
                            contentDescription = null,
                            tint = accentColor,
                            modifier = Modifier.size(32.dp)
                        )
                    }

                    Text(
                        text = selfExamMessage(errorInfo.title),
                        style = MaterialTheme.typography.titleLarge,
                        fontWeight = FontWeight.Bold,
                        color = SelfExamTextPrimary,
                        textAlign = TextAlign.Center
                    )

                    Text(
                        text = selfExamMessage(errorInfo.message),
                        style = MaterialTheme.typography.bodyMedium,
                        color = SelfExamTextSecondary,
                        textAlign = TextAlign.Center
                    )

                    Spacer(Modifier.height(4.dp))

                    Column(
                        modifier = Modifier.fillMaxWidth(),
                        verticalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        if (errorInfo.secondaryButtonText != null) {
                            OutlinedButton(
                                onClick = {
                                    onDismiss()
                                    errorInfo.onSecondaryAction?.invoke()
                                },
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .heightIn(min = 48.dp),
                                shape = RoundedCornerShape(14.dp),
                                border = BorderStroke(1.dp, SelfExamBorder.copy(alpha = 0.4f)),
                                colors = ButtonDefaults.outlinedButtonColors(
                                    contentColor = SelfExamTextSecondary
                                )
                            ) {
                                Text(
                                    selfExamMessage(errorInfo.secondaryButtonText),
                                    fontWeight = FontWeight.SemiBold
                                )
                            }
                        }

                        Button(
                            onClick = {
                                onDismiss()
                                errorInfo.onPrimaryAction?.invoke()
                            },
                            modifier = Modifier
                                .fillMaxWidth()
                                .heightIn(min = 48.dp),
                            shape = RoundedCornerShape(14.dp),
                            colors = ButtonDefaults.buttonColors(
                                containerColor = SelfExamDesign.action
                            )
                        ) {
                            Text(
                                selfExamMessage(errorInfo.primaryButtonText),
                                fontWeight = FontWeight.Bold,
                                color = Color.White
                            )
                        }
                    }
                }
            }
        }
    }
}


@Composable
private fun SelfExamPresentationPreview(dark: Boolean) {
    CheatLockTheme(darkTheme = dark) {
        CompositionLocalProvider(LocalSetupAppearance provides true) {
        Column(Modifier.fillMaxSize().background(SelfExamDesign.canvas).verticalScroll(rememberScrollState()).padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(20.dp)) {
            SelfExamSetupHeader(onBack = {})
            SelfExamHeroBanner(totalClasses = 0)
            SelfExamProgressRail(false, false, false, false, false)
            SelfExamTrackSwitcher(SelfExamTrack.ACADEMIC, 0, 0, {})
            ConfigCard(SelfExamSetupSelection(), {})
            MonitoringReadinessCard(false, {})
            SelfExamPrimaryButton(stringResource(R.string.start_exam), {}, enabled = false)
        }
    }
    }
}

@Preview(name = "Self Exam · Light English", locale = "en", widthDp = 360, heightDp = 800)
@Composable private fun SelfExamLightEnglishPreview() = SelfExamPresentationPreview(false)
@Preview(name = "Self Exam · Light Bangla", locale = "bn", widthDp = 360, heightDp = 800)
@Composable private fun SelfExamLightBanglaPreview() = SelfExamPresentationPreview(false)
@Preview(name = "Self Exam · Dark English", locale = "en", widthDp = 360, heightDp = 800, uiMode = Configuration.UI_MODE_NIGHT_YES)
@Composable private fun SelfExamDarkEnglishPreview() = SelfExamPresentationPreview(true)
@Preview(name = "Self Exam · Dark Bangla", locale = "bn", widthDp = 360, heightDp = 800, uiMode = Configuration.UI_MODE_NIGHT_YES)
@Composable private fun SelfExamDarkBanglaPreview() = SelfExamPresentationPreview(true)
@Preview(name = "Self Exam · Large Bangla", locale = "bn", widthDp = 320, heightDp = 720, fontScale = 2f)
@Composable private fun SelfExamLargeBanglaPreview() = SelfExamPresentationPreview(false)

/** Six UI pages, mapped to five milestones. None of these values enter an API request. */
@Composable
private fun SelfExamWizardLayout(
    step: Int,
    selection: SelfExamSetupSelection,
    chaptersLoading: Boolean,
    monitoringReady: Boolean,
    hasActiveSession: Boolean,
    navigationBusy: Boolean,
    onBack: () -> Unit,
    onReview: () -> Unit,
    onRetry: () -> Unit,
    readyAction: @Composable () -> Unit,
    content: @Composable androidx.compose.foundation.layout.ColumnScope.(Int) -> Unit
) {
    val scrolls = (0..5).map { rememberScrollState() }
    Column(Modifier.fillMaxSize().background(SelfExamDesign.canvas)
        .statusBarsPadding().navigationBarsPadding().imePadding()) {
        Column(Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)) {
            SelfExamSetupHeader(onBack)
            WizardMilestones(step, selection, chaptersLoading, monitoringReady)
            if (hasActiveSession && step != 5) {
                OutlinedButton(onClick = onReview, enabled = !navigationBusy,
                    modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp), shape = SelfExamDesign.controlShape) {
                    Icon(Icons.Default.Refresh, null, Modifier.size(18.dp))
                    Spacer(Modifier.width(8.dp))
                    Text(stringResource(R.string.resume_exam))
                }
            }
        }
        Box(Modifier.weight(1f).fillMaxWidth()) {
            AnimatedContent(targetState = step, label = "exam_setup_page",
                transitionSpec = {
                    val forward = targetState > initialState
                    (slideInHorizontally(tween(300, easing = FastOutSlowInEasing)) { if (forward) it else -it } + fadeIn(tween(200)))
                        .togetherWith(slideOutHorizontally(tween(300, easing = FastOutSlowInEasing)) { if (forward) -it else it } + fadeOut(tween(150)))
                }) { page ->
                Column(Modifier.fillMaxSize().verticalScroll(scrolls[page])
                    .padding(horizontal = 20.dp, vertical = 12.dp),
                    verticalArrangement = Arrangement.spacedBy(20.dp)) {
                    content(page)
                    if (page in 1..3) TextButton(onClick = onRetry, modifier = Modifier.heightIn(min = 48.dp)) {
                        Icon(Icons.Default.Refresh, null, Modifier.size(18.dp))
                        Spacer(Modifier.width(8.dp))
                        Text(stringResource(R.string.se_wizard_reload))
                    }
                    Spacer(Modifier.height(4.dp))
                }
            }
            if (navigationBusy) Box(Modifier.fillMaxSize().clickable(
                interactionSource = remember { androidx.compose.foundation.interaction.MutableInteractionSource() },
                indication = null, onClick = {}))
        }
        if (step >= 4) Surface(color = SelfExamDesign.surface, shadowElevation = 4.dp) {
            Box(Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 12.dp)) {
                if (step == 4) SelfExamPrimaryButton(stringResource(R.string.se_wizard_review), onReview,
                    enabled = selection.canStart() && !navigationBusy, leadingIcon = Icons.AutoMirrored.Filled.FactCheck)
                else readyAction()
            }
        }
    }
}

@Composable
private fun WizardMilestones(step: Int, selection: SelfExamSetupSelection, chaptersLoading: Boolean, monitoringReady: Boolean) {
    val active = (step - 1).coerceAtLeast(0)
    val labels = listOf(R.string.se_target, R.string.se_subject, R.string.se_chapter, R.string.se_setup, R.string.se_ready)
    val valid = listOf(selection.classId != null, selection.subjectId != null,
        selection.subjectId != null && !chaptersLoading, selection.canStart(), selection.canStart() && monitoringReady)
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            labels.forEachIndexed { index, _ ->
                val complete = index < active && valid[index]
                val tint by animateColorAsState(if (complete || index == active) SelfExamDesign.accent else SelfExamDesign.secondaryText.copy(alpha = 0.35f), tween(240), label = "milestone")
                val description = stringResource(if (complete) R.string.se_complete else R.string.se_not_complete)
                Box(Modifier.size(28.dp).clip(CircleShape).background(tint.copy(alpha = 0.12f))
                    .border(1.dp, tint, CircleShape).semantics { stateDescription = description }, contentAlignment = Alignment.Center) {
                    if (complete) Icon(Icons.Default.CheckCircle, null, Modifier.size(18.dp), tint = tint)
                    else Text(selfExamNumber(index + 1), color = if (index == active) SelfExamDesign.accent else SelfExamTextSecondary,
                        style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.Bold)
                }
                if (index < 4) Box(Modifier.weight(1f).padding(horizontal = 4.dp).height(2.dp)
                    .background(if (complete) SelfExamDesign.accent else SelfExamDesign.border.copy(alpha = 0.4f)))
            }
        }
        Row(Modifier.fillMaxWidth()) {
            labels.forEachIndexed { index, label ->
                Text(stringResource(label), Modifier.weight(1f), textAlign = when (index) { 0 -> TextAlign.Start; 4 -> TextAlign.End; else -> TextAlign.Center },
                    style = MaterialTheme.typography.labelSmall, color = if (index == active) SelfExamDesign.accent else SelfExamTextSecondary,
                    fontWeight = if (index == active) FontWeight.Bold else FontWeight.Normal)
            }
        }
    }
}

@Composable
private fun WizardTrackCards(selected: SelfExamTrack, onSelect: (SelfExamTrack) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
        TrackSelectCard(Modifier.fillMaxWidth(), stringResource(R.string.se_academic),
            stringResource(R.string.se_school_college_1_12), "", selected == SelfExamTrack.ACADEMIC, emptyList()) { onSelect(SelfExamTrack.ACADEMIC) }
        TrackSelectCard(Modifier.fillMaxWidth(), stringResource(R.string.se_admission),
            stringResource(R.string.se_varsity_medical_eng), "", selected == SelfExamTrack.ADMISSION, emptyList()) { onSelect(SelfExamTrack.ADMISSION) }
    }
}

@Composable
private fun WizardOptionRow(title: String, selected: Boolean, onClick: () -> Unit) {
    Surface(Modifier.fillMaxWidth().heightIn(min = 64.dp).selectable(selected, role = Role.RadioButton, onClick = onClick),
        shape = SelfExamDesign.controlShape,
        color = if (selected) SelfExamDesign.accent.copy(alpha = 0.09f) else SelfExamDesign.inset,
        border = BorderStroke(1.dp, if (selected) SelfExamDesign.accent else SelfExamDesign.border.copy(alpha = 0.4f))) {
        Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Icon(Icons.AutoMirrored.Filled.MenuBook, null, Modifier.size(22.dp), tint = SelfExamDesign.accent)
            Text(title, Modifier.weight(1f), style = MaterialTheme.typography.bodyLarge, color = SelfExamTextPrimary,
                fontWeight = if (selected) FontWeight.Bold else FontWeight.Medium)
            Icon(if (selected) Icons.Default.CheckCircle else Icons.Default.RadioButtonUnchecked,
                null, Modifier.size(20.dp), tint = if (selected) SelfExamDesign.accent else SelfExamTextSecondary)
        }
    }
}

@Composable
private fun WizardDifficultyPicker(selected: String, onSelect: (String) -> Unit) {
    val values = listOf("mixed", "easy", "medium", "hard")
    val largeText = LocalConfiguration.current.fontScale > 1.3f
    BoxWithConstraints(Modifier.fillMaxWidth()) {
        if (largeText || maxWidth < 260.dp) {
            FlowRow(Modifier.selectableGroup(), horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)) {
                values.forEach { mode -> SelfExamChip(selected == mode, selfExamDifficulty(mode), { onSelect(mode) }) }
            }
        } else {
            val cellWidth = maxWidth / 4
            val offset by animateDpAsState(cellWidth * values.indexOf(selected).coerceAtLeast(0),
                tween(240, easing = FastOutSlowInEasing), label = "difficulty_highlight")
            Box(Modifier.fillMaxWidth().clip(SelfExamDesign.controlShape).background(SelfExamDesign.inset)) {
                Box(Modifier.offset(x = offset).width(cellWidth).height(52.dp).padding(4.dp)
                    .clip(RoundedCornerShape(10.dp)).background(SelfExamDesign.action))
                Row(Modifier.fillMaxWidth().selectableGroup()) {
                    values.forEach { mode ->
                        Box(Modifier.weight(1f).heightIn(min = 52.dp)
                            .selectable(selected == mode, role = Role.RadioButton, onClick = { onSelect(mode) })
                            .padding(horizontal = 2.dp, vertical = 16.dp), contentAlignment = Alignment.Center) {
                            Text(selfExamDifficulty(mode), color = if (selected == mode) SelfExamDesign.onAction else SelfExamTextSecondary,
                                style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.Bold)
                        }
                    }
                }
            }
        }
    }
}
