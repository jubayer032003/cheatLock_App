@file:Suppress("UNUSED_VALUE", "AssignedValueIsNeverRead")

package com.jubayer.cheatlock.ui

import android.Manifest
import android.content.pm.PackageManager
import androidx.compose.animation.core.*
import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.automirrored.filled.FactCheck
import androidx.compose.material.icons.automirrored.filled.Logout
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.DialogProperties
import com.google.mlkit.vision.face.Face
import com.jubayer.cheatlock.R
import com.jubayer.cheatlock.liveness.LivenessViewModel
import com.jubayer.cheatlock.liveness.LivenessStatus
import com.jubayer.cheatlock.liveness.LivenessAction
import com.jubayer.cheatlock.liveness.LivenessState
import androidx.compose.ui.draw.scale
import com.jubayer.cheatlock.model.*
import com.jubayer.cheatlock.ui.theme.*
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import androidx.core.content.ContextCompat
import java.time.LocalTime

private data class StudentPalette(
    val bgPrimary: Color,
    val bgSecondary: Color,
    val surface: Color,
    val surfaceRaised: Color,
    val blue: Color,
    val blueBright: Color,
    val cyan: Color,
    val textPrimary: Color,
    val textSecondary: Color,
    val textMuted: Color,
    val border: Color
)

private val DarkStudentPalette = StudentPalette(
    bgPrimary = Color(0xFF050A14),
    bgSecondary = Color(0xFF07101F),
    surface = Color(0xFF09172A),
    surfaceRaised = Color(0xFF0C192C),
    blue = Color(0xFF087CFF),
    blueBright = Color(0xFF169BFF),
    cyan = Color(0xFF16B8FF),
    textPrimary = Color(0xFFF5F8FF),
    textSecondary = Color(0xFF94A3B8),
    textMuted = Color(0xFF64748B),
    border = Color(0xFF5078AA)
)

private val LightStudentPalette = StudentPalette(
    bgPrimary = Color(0xFFF6F8FC),
    bgSecondary = Color(0xFFF1F5F9),
    surface = Color(0xFFFFFFFF),
    surfaceRaised = Color(0xFFFFFFFF),
    blue = Color(0xFF2563EB),
    blueBright = Color(0xFF1D4ED8),
    cyan = Color(0xFF0284C7),
    textPrimary = Color(0xFF0F172A),
    textSecondary = Color(0xFF475569),
    textMuted = Color(0xFF94A3B8),
    border = Color(0xFFE2E8F0)
)

private val LocalStudentPalette = staticCompositionLocalOf { DarkStudentPalette }

private val StudentBgPrimary: Color
    @Composable get() = LocalStudentPalette.current.bgPrimary
private val StudentBgSecondary: Color
    @Composable get() = LocalStudentPalette.current.bgSecondary
private val StudentSurface: Color
    @Composable get() = LocalStudentPalette.current.surface
private val StudentSurfaceRaised: Color
    @Composable get() = LocalStudentPalette.current.surfaceRaised
private val StudentBlue: Color
    @Composable get() = LocalStudentPalette.current.blue
private val StudentBlueBright: Color
    @Composable get() = LocalStudentPalette.current.blueBright
private val StudentCyan: Color
    @Composable get() = LocalStudentPalette.current.cyan
private val StudentTextPrimary: Color
    @Composable get() = LocalStudentPalette.current.textPrimary
private val StudentTextSecondary: Color
    @Composable get() = LocalStudentPalette.current.textSecondary
private val StudentTextMuted: Color
    @Composable get() = LocalStudentPalette.current.textMuted
private val StudentBorder: Color
    @Composable get() = LocalStudentPalette.current.border

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun StudentDashboardScreen(
    account: UserAccount,
    onOpenExamByCode: suspend (String) -> Exam,
    onHasFaceProfile: suspend () -> Boolean,
    onEnrollFace: suspend (List<Double>, String) -> Unit,
    onVerifyFace: suspend (List<Double>) -> Boolean,
    onJoinClass: suspend (String) -> String,
    onStartExam: suspend (Exam) -> Unit,
    onOpenSelfExam: () -> Unit,
    onLogout: () -> Unit,
    onUpdateProfile: suspend (String, String) -> Unit,
    onDeleteAccount: suspend (String) -> Unit,
    onRequestMonitoringPermissions: ((Boolean) -> Unit) -> Unit,
    onOpenAccountDeletionPage: () -> Unit,
    appLanguage: AppLanguage = AppLanguage.English,
    onLanguageChange: (AppLanguage) -> Unit = {},
    appThemeMode: AppThemeMode = AppThemeMode.System,
    onThemeModeChange: (AppThemeMode) -> Unit = {},
    externalMessage: String? = null,
    recentNotifications: List<StudentNotification> = emptyList(),
    submissions: List<ExamSubmission> = emptyList()
) {
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    val scrollState = rememberScrollState()
    val haptics = LocalHapticFeedback.current
    var currentTab by remember { mutableStateOf(StudentNavDestination.HOME) }
    var examCode by remember { mutableStateOf("") }
    var classInviteCode by remember { mutableStateOf("") }
    var enrollmentStatus by remember { mutableStateOf<String?>(null) }
    var lastEnrolledClassId by remember { mutableStateOf<String?>(null) }
    var selectedExam by remember { mutableStateOf<Exam?>(null) }
    var message by remember { mutableStateOf<String?>(null) }
    var isLoading by remember { mutableStateOf(false) }
    var faceStatus by remember { mutableStateOf(FaceStatus.CHECKING) }
    var faceDescriptor by remember { mutableStateOf<List<Double>>(emptyList()) }
    var faceSnapshot by remember { mutableStateOf("") }
    var faceReady by remember { mutableStateOf(false) }
    var faceLoading by remember { mutableStateOf(false) }
    var showQrScanner by remember { mutableStateOf(false) }
    var showProfileManagement by remember { mutableStateOf(false) }
    var showBiometricCalibration by remember { mutableStateOf(false) }
    var forceFaceEnrollment by remember { mutableStateOf(false) }
    var showInstructions by remember { mutableStateOf(false) }
    var cameraActive by remember {
        mutableStateOf(
            ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED
        )
    }
    var showScreenDisclosure by remember { mutableStateOf(false) }
    var pendingExamStart by remember { mutableStateOf<Exam?>(null) }
    var isStartingSession by remember { mutableStateOf(false) }
    val isExamLive = selectedExam?.status == ExamStatus.LIVE

    val livenessViewModel = remember { LivenessViewModel() }
    val livenessState by livenessViewModel.state

    LaunchedEffect(livenessState.status) {
        val currentStatus = livenessState.status
        if (currentStatus is LivenessStatus.Success && !faceReady && !faceLoading) {
            if (faceDescriptor.isNotEmpty()) {
                faceLoading = true
                runCatching {
                    if (forceFaceEnrollment) {
                        onEnrollFace(faceDescriptor, faceSnapshot)
                    } else if (onHasFaceProfile()) {
                        if (!onVerifyFace(faceDescriptor)) error("Biometric mismatch. Try again.")
                    } else {
                        onEnrollFace(faceDescriptor, faceSnapshot)
                    }
                    faceReady = true
                    if (forceFaceEnrollment) {
                        message = context.getString(R.string.biometric_profile_updated)
                    }
                }.onFailure { err ->
                    message = err.message
                    livenessViewModel.resetAll()
                }
                faceLoading = false
            } else {
                message = "Liveness verified. Capturing biometric profile..."
                var attempts = 0
                while (faceDescriptor.isEmpty() && attempts < 10) {
                    delay(200)
                    attempts++
                }
                if (faceDescriptor.isNotEmpty()) {
                    faceLoading = true
                    runCatching {
                        if (forceFaceEnrollment) {
                            onEnrollFace(faceDescriptor, faceSnapshot)
                        } else if (onHasFaceProfile()) {
                            if (!onVerifyFace(faceDescriptor)) error("Biometric mismatch. Try again.")
                        } else {
                            onEnrollFace(faceDescriptor, faceSnapshot)
                        }
                        faceReady = true
                        if (forceFaceEnrollment) {
                            message = context.getString(R.string.biometric_profile_updated)
                        }
                    }.onFailure { err ->
                        message = err.message
                        livenessViewModel.resetAll()
                    }
                    faceLoading = false
                } else {
                    message = "Capture timeout. Try again."
                    livenessViewModel.resetAll()
                }
            }
        }
    }

    LaunchedEffect(selectedExam?.id) {
        livenessViewModel.resetAll()
    }

    // Auto-refresh enrollment status if pending
    LaunchedEffect(enrollmentStatus, lastEnrolledClassId) {
        if (enrollmentStatus != "PENDING" || lastEnrolledClassId == null) return@LaunchedEffect
        
        while (enrollmentStatus == "PENDING") {
            delay(10000) // Poll every 10 seconds
            runCatching { onJoinClass(classInviteCode.ifBlank { "REFRESH_LAST" }) } // We'll need a way to refresh status
                .onSuccess { status ->
                    if (status != enrollmentStatus) {
                        enrollmentStatus = status
                    }
                }
        }
    }

    // Auto-refresh exam status if waiting
    LaunchedEffect(selectedExam?.id, selectedExam?.status) {
        val currentExam = selectedExam ?: return@LaunchedEffect
        if (currentExam.status == ExamStatus.LIVE) return@LaunchedEffect

        while (true) {
            delay(5000) // Poll every 5 seconds for status changes
            runCatching { onOpenExamByCode(currentExam.accessCode ?: "") }
                .onSuccess { updated ->
                    if (updated.status != currentExam.status) {
                        selectedExam = updated
                    }
                }
        }
    }

    val isDark = with(AppUiPreferences) { appThemeMode.isDarkTheme() }
    val studentPalette = if (isDark) DarkStudentPalette else LightStudentPalette

    CompositionLocalProvider(LocalStudentPalette provides studentPalette) {
        Box(modifier = Modifier.fillMaxSize().background(StudentBgPrimary)) {
            StudentDashboardBackground()

            when (currentTab) {
                StudentNavDestination.HOME -> {
                    Column(
                        modifier = Modifier
                            .fillMaxSize()
                            .statusBarsPadding()
                            .navigationBarsPadding()
                            .padding(horizontal = 22.dp, vertical = 16.dp)
                            .verticalScroll(scrollState)
                            .imePadding(),
                        verticalArrangement = Arrangement.spacedBy(20.dp)
                    ) {
                        StudentDashboardHeader(
                            accountName = account.name.ifBlank { account.identifier },
                            appLanguage = appLanguage,
                            onLanguageChange = onLanguageChange,
                            appThemeMode = appThemeMode,
                            onThemeModeChange = onThemeModeChange,
                            onOpenProfile = { currentTab = StudentNavDestination.PROFILE },
                            showHero = true
                        )

                        if (recentNotifications.isNotEmpty()) {
                            RecentAlertsCard(recentNotifications)
                        }

                        SelfExamJourneyEntryCard(onOpenSelfExam = onOpenSelfExam)

                        Text(stringResource(R.string.quick_actions), color = StudentTextPrimary, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Black)
                        Column(
                            modifier = Modifier.fillMaxWidth(),
                            verticalArrangement = Arrangement.spacedBy(14.dp)
                        ) {
                            // Join an Exam (Interchanged to Quick Actions Position)
                            StudentPanel(modifier = Modifier.fillMaxWidth(), contentPadding = PaddingValues(16.dp)) {
                                Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
                                    Row(verticalAlignment = Alignment.CenterVertically) {
                                        StudentIconBox(Icons.Default.EnhancedEncryption, size = 42.dp)
                                        Spacer(Modifier.width(12.dp))
                                        Column {
                                            Text(
                                                stringResource(R.string.join_an_exam),
                                                color = StudentTextPrimary,
                                                style = MaterialTheme.typography.titleMedium,
                                                fontWeight = FontWeight.Black
                                            )
                                            Text(
                                                stringResource(R.string.join_exam_supporting),
                                                color = StudentTextSecondary,
                                                style = MaterialTheme.typography.bodySmall
                                            )
                                        }
                                    }
                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        StudentTextField(
                                            modifier = Modifier.weight(1f),
                                            value = examCode,
                                            onValueChange = { examCode = it.uppercase() },
                                            label = stringResource(R.string.enter_room_code),
                                            leadingIcon = Icons.Default.VpnKey
                                        )
                                        StudentOutlinedIconButton(
                                            onClick = { showQrScanner = true },
                                            icon = Icons.Default.QrCodeScanner,
                                            modifier = Modifier.width(62.dp)
                                        )
                                    }
                                    StudentPrimaryButton(
                                        text = if (isLoading) stringResource(R.string.opening) else stringResource(R.string.join_exam),
                                        onClick = {
                                            if (examCode.isNotBlank()) {
                                                isLoading = true
                                                message = null
                                                val parsedCode = parseExamCode(examCode)
                                                scope.launch {
                                                    runCatching { onOpenExamByCode(parsedCode) }
                                                        .onSuccess {
                                                            selectedExam = it
                                                            showInstructions = true
                                                        }
                                                        .onFailure { message = it.message }
                                                    isLoading = false
                                                }
                                            }
                                        },
                                        enabled = !isLoading,
                                        loading = isLoading,
                                        trailingIcon = Icons.AutoMirrored.Filled.ArrowForward
                                    )

                                    (externalMessage ?: message)?.let {
                                        SuccessBanner(message = it, modifier = Modifier.padding(top = 2.dp))
                                    }
                                }
                            }

                            var classLoading by remember { mutableStateOf(false) }
                            StudentPanel(modifier = Modifier.fillMaxWidth(), contentPadding = PaddingValues(16.dp)) {
                                Column(verticalArrangement = Arrangement.spacedBy(13.dp)) {
                                    StudentIconBox(Icons.Default.Groups, size = 42.dp)
                                    Text(stringResource(R.string.class_registration), color = StudentTextPrimary, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Black)
                                    Text(
                                        stringResource(R.string.class_registration_supporting),
                                        color = StudentTextSecondary,
                                        style = MaterialTheme.typography.bodyMedium
                                    )
                                    StudentTextField(
                                        value = classInviteCode,
                                        onValueChange = { classInviteCode = it.uppercase() },
                                        label = stringResource(R.string.class_invite_code),
                                        leadingIcon = Icons.Default.GroupAdd
                                    )

                                    enrollmentStatus?.let { status ->
                                        when (status) {
                                            "PENDING" -> StudentStatusPanel(CheatLockWarning, Icons.Default.Pending, stringResource(R.string.waiting_teacher_approval))
                                            "APPROVED" -> StudentStatusPanel(CheatLockSuccess, Icons.Default.Verified, stringResource(R.string.class_joined))
                                            "REJECTED" -> StudentStatusPanel(CheatLockDanger, Icons.Default.Error, stringResource(R.string.request_rejected))
                                        }
                                    }

                                    StudentPrimaryButton(
                                        text = if (classLoading) stringResource(R.string.requesting) else stringResource(R.string.join_class),
                                        onClick = {
                                            if (classInviteCode.isNotBlank()) {
                                                classLoading = true
                                                message = null
                                                enrollmentStatus = null
                                                scope.launch {
                                                    runCatching { onJoinClass(classInviteCode.trim()) }
                                                        .onSuccess { status ->
                                                            enrollmentStatus = status
                                                            if (status == "PENDING") {
                                                                message = context.getString(R.string.join_request_submitted)
                                                            }
                                                        }
                                                        .onFailure { message = it.message }
                                                    classLoading = false
                                                }
                                            }
                                        },
                                        enabled = !classLoading,
                                        loading = classLoading,
                                        leadingIcon = Icons.Default.Verified
                                    )
                                }
                            }
                        }

                        StudentSecurityCard()

                        selectedExam?.let { exam ->
                            ExamSummaryCard(exam)
                            FaceVerificationCard(
                                cameraActive = cameraActive,
                                faceStatus = faceStatus,
                                faceLoading = faceLoading,
                                faceReady = faceReady,
                                livenessState = livenessState,
                                onFaceStatusChanged = { faceStatus = it },
                                onPreviewSnapshot = { faceSnapshot = it },
                                onFaceDescriptorChanged = { faceDescriptor = it },
                                onFaceDetected = { face ->
                                    livenessViewModel.onFaceFrameReceived(face)
                                },
                                onCameraError = { message = it },
                                onCameraActiveChanged = { cameraActive = it },
                                onRequestCameraPermission = { callback -> onRequestMonitoringPermissions(callback) },
                                onStartLiveness = {
                                    livenessViewModel.startChallenge()
                                }
                            )
                            StudentPrimaryButton(
                                text = if (isStartingSession) stringResource(R.string.initializing) else stringResource(R.string.start_secure_session),
                                onClick = {
                                    if (!isStartingSession) {
                                        pendingExamStart = exam
                                        showScreenDisclosure = true
                                    }
                                },
                                enabled = isExamLive && faceReady && !isStartingSession,
                                loading = isStartingSession,
                                leadingIcon = Icons.Default.Lock
                            )
                        }

                        StudentOutlinedButton(
                            text = stringResource(R.string.logout),
                            onClick = onLogout,
                            danger = true,
                            leadingIcon = Icons.AutoMirrored.Filled.Logout
                        )

                        // Floating bottom navigation spacing
                        Spacer(Modifier.height(84.dp))
                    }
                }

                StudentNavDestination.PRACTICE -> {
                    // Instantly launch practice setup
                    LaunchedEffect(Unit) {
                        onOpenSelfExam()
                        currentTab = StudentNavDestination.HOME
                    }
                }

                StudentNavDestination.RESULTS -> {
                    Column(
                        modifier = Modifier
                            .fillMaxSize()
                            .statusBarsPadding()
                            .navigationBarsPadding()
                            .imePadding()
                    ) {
                        Box(modifier = Modifier.padding(horizontal = 22.dp, vertical = 16.dp)) {
                            StudentDashboardHeader(
                                accountName = account.name.ifBlank { account.identifier },
                                appLanguage = appLanguage,
                                onLanguageChange = onLanguageChange,
                                appThemeMode = appThemeMode,
                                onThemeModeChange = onThemeModeChange,
                                onOpenProfile = { currentTab = StudentNavDestination.PROFILE }
                            )
                        }

                        StudentResultsScreen(
                            submissions = submissions,
                            studentName = account.name.ifBlank { account.identifier },
                            onPracticeAgain = { onOpenSelfExam() }
                        )
                    }
                }

                StudentNavDestination.PROFILE -> {
                    Column(
                        modifier = Modifier
                            .fillMaxSize()
                            .statusBarsPadding()
                            .navigationBarsPadding()
                            .padding(horizontal = 22.dp, vertical = 16.dp)
                            .verticalScroll(rememberScrollState())
                            .imePadding(),
                        verticalArrangement = Arrangement.spacedBy(20.dp)
                    ) {
                        StudentDashboardHeader(
                            accountName = account.name.ifBlank { account.identifier },
                            appLanguage = appLanguage,
                            onLanguageChange = onLanguageChange,
                            appThemeMode = appThemeMode,
                            onThemeModeChange = onThemeModeChange,
                            onOpenProfile = {}
                        )

                        ProfileManagementScreen(
                            account = account,
                            onUpdateProfile = onUpdateProfile,
                            onHasFaceProfile = onHasFaceProfile,
                            onDeleteAccount = onDeleteAccount,
                            onOpenAccountDeletionPage = onOpenAccountDeletionPage,
                            submissions = submissions,
                            appLanguage = appLanguage,
                            onLanguageChange = onLanguageChange,
                            appThemeMode = appThemeMode,
                            onThemeModeChange = onThemeModeChange,
                            onOpenBiometricCalibration = {
                                forceFaceEnrollment = true
                                faceReady = false
                                faceDescriptor = emptyList()
                                faceSnapshot = ""
                                livenessViewModel.resetAll()
                                showBiometricCalibration = true
                            }
                        )

                        StudentOutlinedButton(
                            text = stringResource(R.string.logout),
                            onClick = onLogout,
                            danger = true,
                            leadingIcon = Icons.AutoMirrored.Filled.Logout
                        )

                        // Floating bottom navigation spacing
                        Spacer(Modifier.height(84.dp))
                    }
                }
            }

            // World-Class Floating Bottom Navigation Bar
            CheatLockBottomNavigation(
                selectedDestination = currentTab,
                onDestinationSelected = { destination ->
                    if (destination == StudentNavDestination.PRACTICE) {
                        onOpenSelfExam()
                    } else {
                        currentTab = destination
                    }
                },
                modifier = Modifier.align(Alignment.BottomCenter)
            )
        }

    if (showQrScanner) {
        BasicAlertDialog(onDismissRequest = { showQrScanner = false }) {
            Surface(
                shape = RoundedCornerShape(28.dp),
                tonalElevation = 6.dp,
                color = MaterialTheme.colorScheme.surface
            ) {
                Column(
                    modifier = Modifier.padding(24.dp),
                    verticalArrangement = Arrangement.spacedBy(16.dp)
                ) {
                    Text(stringResource(R.string.scan_exam_key), style = MaterialTheme.typography.headlineSmall)
                Box(Modifier.fillMaxWidth().height(260.dp).clip(RoundedCornerShape(24.dp)).background(Color.Black)) {
                    QrCodeScannerView(
                        modifier = Modifier.fillMaxSize(),
                        onCodeScanned = { 
                            examCode = parseExamCode(it)
                            showQrScanner = false
                            haptics.performHapticFeedback(HapticFeedbackType.LongPress)
                        }
                    )
                    DigitalScannerOverlay()
                }
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                        TextButton(onClick = { showQrScanner = false }) { Text(stringResource(R.string.close)) }
                    }
                }
            }
        }
    }

    if (showInstructions) {
        PremiumInstructionDialog(
            onAgree = {
                showInstructions = false
                onRequestMonitoringPermissions { granted ->
                    cameraActive = granted
                    if (!granted) {
                        message = context.getString(R.string.camera_permission_denied_retry)
                    }
                }
                scope.launch {
                    delay(300)
                    scrollState.animateScrollTo(scrollState.maxValue)
                }
            }
        )
    }

    if (showScreenDisclosure) {
        BasicAlertDialog(
            onDismissRequest = {
                showScreenDisclosure = false
                pendingExamStart = null
            }
        ) {
            Surface(
                shape = RoundedCornerShape(28.dp),
                tonalElevation = 6.dp,
                color = MaterialTheme.colorScheme.surface
            ) {
                Column(
                    modifier = Modifier.padding(24.dp),
                    verticalArrangement = Arrangement.spacedBy(16.dp)
                ) {
                    Text(stringResource(R.string.screen_monitoring_title), style = MaterialTheme.typography.headlineSmall)
                    Text(stringResource(R.string.screen_monitoring_body))
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.End
                    ) {
                        TextButton(onClick = {
                            showScreenDisclosure = false
                            pendingExamStart = null
                        }) { Text(stringResource(R.string.not_now)) }
                        TextButton(onClick = {
                            val exam = pendingExamStart ?: return@TextButton
                            showScreenDisclosure = false
                            pendingExamStart = null
                            isStartingSession = true
                            cameraActive = false
                            scope.launch {
                                runCatching { onStartExam(exam) }
                                    .onFailure {
                                        message = it.message
                                        cameraActive = true
                                        isStartingSession = false
                                    }
                            }
                        }) { Text(stringResource(R.string.continue_android_permission)) }
                    }
                }
            }
        }
    }

    if (showProfileManagement) {
        BasicAlertDialog(
            onDismissRequest = { showProfileManagement = false }
        ) {
            Surface(
                shape = RoundedCornerShape(24.dp),
                color = MaterialTheme.colorScheme.surface,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = 16.dp)
            ) {
                Column(
                    modifier = Modifier
                        .verticalScroll(rememberScrollState())
                        .padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            stringResource(R.string.manage_authorized_profile),
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.onSurface
                        )
                        IconButton(onClick = { showProfileManagement = false }) {
                            Icon(Icons.Default.Close, contentDescription = stringResource(R.string.close))
                        }
                    }
                    ProfileManagementScreen(
                        account = account,
                        onUpdateProfile = onUpdateProfile,
                        onHasFaceProfile = onHasFaceProfile,
                        onDeleteAccount = onDeleteAccount,
                        onOpenAccountDeletionPage = onOpenAccountDeletionPage,
                        submissions = submissions,
                        appLanguage = appLanguage,
                        onLanguageChange = onLanguageChange,
                        appThemeMode = appThemeMode,
                        onThemeModeChange = onThemeModeChange,
                        onOpenBiometricCalibration = {
                            forceFaceEnrollment = true
                            faceReady = false
                            faceDescriptor = emptyList()
                            faceSnapshot = ""
                            livenessViewModel.resetAll()
                            showBiometricCalibration = true
                        }
                    )
                }
            }
        }
    }

    if (showBiometricCalibration) {
        BasicAlertDialog(
            onDismissRequest = {
                showBiometricCalibration = false
                forceFaceEnrollment = false
                livenessViewModel.resetAll()
            }
        ) {
            Surface(
                shape = RoundedCornerShape(24.dp),
                tonalElevation = 6.dp,
                color = MaterialTheme.colorScheme.surface,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = 16.dp)
            ) {
                Column(
                    modifier = Modifier.padding(18.dp),
                    verticalArrangement = Arrangement.spacedBy(14.dp)
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            stringResource(R.string.recalibrate_biometric_face_id),
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.onSurface
                        )
                        IconButton(onClick = {
                            showBiometricCalibration = false
                            forceFaceEnrollment = false
                            livenessViewModel.resetAll()
                        }) {
                            Icon(Icons.Default.Close, contentDescription = stringResource(R.string.close))
                        }
                    }

                    FaceVerificationCard(
                        cameraActive = cameraActive,
                        faceStatus = faceStatus,
                        faceLoading = faceLoading,
                        faceReady = faceReady,
                        livenessState = livenessState,
                        onFaceStatusChanged = { faceStatus = it },
                        onPreviewSnapshot = { faceSnapshot = it },
                        onFaceDescriptorChanged = { faceDescriptor = it },
                        onFaceDetected = { face -> livenessViewModel.onFaceFrameReceived(face) },
                        onCameraError = { message = it },
                        onCameraActiveChanged = { cameraActive = it },
                        onRequestCameraPermission = { callback -> onRequestMonitoringPermissions(callback) },
                        onStartLiveness = { livenessViewModel.startChallenge() }
                    )

                    Button(
                        onClick = {
                            showBiometricCalibration = false
                            forceFaceEnrollment = false
                            livenessViewModel.resetAll()
                        },
                        enabled = faceReady,
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Text(stringResource(R.string.done))
                    }
                }
            }
        }
    }
}
}

@Composable
private fun StudentDashboardBackground() {
    val palette = LocalStudentPalette.current
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(
                Brush.verticalGradient(
                    colors = listOf(
                        palette.bgPrimary,
                        palette.bgSecondary,
                        palette.bgPrimary
                    )
                )
            )
    )
}

@Composable
private fun StudentHeroSection(
    accountName: String,
    appLanguage: AppLanguage,
    isDark: Boolean,
    onOpenProfile: () -> Unit
) {
    var currentHour by remember { mutableIntStateOf(LocalTime.now().hour) }
    LaunchedEffect(Unit) {
        while (true) {
            delay(60_000)
            currentHour = LocalTime.now().hour
        }
    }

    val greeting = remember(currentHour, appLanguage) { timeBasedGreeting(currentHour, appLanguage) }
    val heroTitle = if (appLanguage == AppLanguage.Bengali) {
        "প্রতিদিন পরীক্ষা,\nসাফল্যের প্রস্তুতি।"
    } else {
        "Daily exams,\nready for success."
    }
    val heroSubtitle = if (appLanguage == AppLanguage.Bengali) {
        "নিরাপদ পরিবেশে আত্মবিশ্বাসের সাথে আপনার পরীক্ষা দিন।"
    } else {
        "Take every exam with confidence in a secure environment."
    }

    BoxWithConstraints(modifier = Modifier.fillMaxWidth()) {
        val compact = maxWidth < 430.dp
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .heightIn(min = if (compact) 190.dp else 230.dp),
            horizontalArrangement = Arrangement.spacedBy(if (compact) 6.dp else 18.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            StudentHeroText(
                greeting = greeting,
                accountName = accountName,
                heroTitle = heroTitle,
                heroSubtitle = heroSubtitle,
                onOpenProfile = onOpenProfile,
                compact = compact,
                modifier = Modifier
                    .weight(0.52f)
                    .fillMaxHeight()
            )
            StudentHeroArtwork(
                isDark = isDark,
                compact = compact,
                modifier = Modifier
                    .weight(0.48f)
                    .fillMaxHeight()
            )
        }
    }
}

@Composable
private fun StudentHeroText(
    greeting: String,
    accountName: String,
    heroTitle: String,
    heroSubtitle: String,
    onOpenProfile: () -> Unit,
    compact: Boolean,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier,
        verticalArrangement = Arrangement.Center
    ) {
        Text(
            text = "$greeting, $accountName",
            color = StudentTextSecondary,
            style = if (compact) MaterialTheme.typography.labelLarge else MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.SemiBold,
            maxLines = 1
        )
        Spacer(Modifier.height(if (compact) 4.dp else 9.dp))
        Text(
            text = heroTitle,
            color = StudentTextPrimary,
            style = MaterialTheme.typography.displaySmall.copy(
                fontSize = if (compact) 24.sp else 36.sp,
                lineHeight = if (compact) 30.sp else 42.sp
            ),
            fontWeight = FontWeight.Black,
        )
        Spacer(Modifier.height(if (compact) 6.dp else 9.dp))
        Text(
            text = heroSubtitle,
            color = StudentTextSecondary,
            style = if (compact) MaterialTheme.typography.bodySmall else MaterialTheme.typography.titleMedium,
            maxLines = if (compact) 2 else Int.MAX_VALUE
        )
        Spacer(Modifier.height(if (compact) 8.dp else 10.dp))
        Row(
            modifier = Modifier
                .clip(RoundedCornerShape(999.dp))
                .border(1.dp, StudentBlue.copy(alpha = 0.8f), RoundedCornerShape(999.dp))
                .background(StudentBlue.copy(alpha = 0.08f))
                .clickable { onOpenProfile() }
                .padding(horizontal = if (compact) 9.dp else 13.dp, vertical = if (compact) 5.dp else 7.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(if (compact) 5.dp else 8.dp)
        ) {
            Icon(Icons.Default.GppGood, null, tint = StudentBlue, modifier = Modifier.size(if (compact) 15.dp else 18.dp))
            Text(
                stringResource(R.string.authorized_student),
                color = StudentBlueBright,
                style = if (compact) MaterialTheme.typography.labelSmall else MaterialTheme.typography.labelLarge,
                fontWeight = FontWeight.Bold,
                maxLines = 1
            )
        }
    }
}

@Composable
private fun StudentHeroArtwork(
    isDark: Boolean,
    compact: Boolean,
    modifier: Modifier = Modifier
) {
    val logoRes = if (isDark) R.drawable.cheatlock_logo else R.drawable.cheatlock_logo_light
    Box(
        modifier = modifier
            .aspectRatio(if (compact) 0.86f else 1.08f),
        contentAlignment = Alignment.Center
    ) {
        Image(
            painter = painterResource(id = logoRes),
            contentDescription = null,
            modifier = Modifier
                .fillMaxSize(if (compact) 0.88f else 0.78f)
                .align(Alignment.CenterEnd)
                .alpha(if (isDark) 0.11f else 0.13f),
            contentScale = ContentScale.Fit
        )
        Image(
            painter = painterResource(id = R.drawable.cheatlock_hero),
            contentDescription = null,
            modifier = Modifier
                .fillMaxSize(if (compact) 1f else 0.9f)
                .align(Alignment.BottomCenter),
            contentScale = ContentScale.Fit
        )
        StudentHeroBubble(
            icon = Icons.Default.Mic,
            size = if (compact) 32.dp else 46.dp,
            modifier = Modifier
                .align(Alignment.TopCenter)
                .offset(x = if (compact) (-34).dp else (-54).dp, y = if (compact) 10.dp else 14.dp)
        )
        StudentHeroBubble(
            icon = Icons.Default.QrCodeScanner,
            size = if (compact) 32.dp else 46.dp,
            modifier = Modifier
                .align(Alignment.TopCenter)
                .offset(x = if (compact) 8.dp else 4.dp, y = if (compact) 2.dp else 4.dp)
        )
        StudentHeroBubble(
            icon = Icons.Default.PhotoCamera,
            size = if (compact) 32.dp else 46.dp,
            modifier = Modifier
                .align(Alignment.TopCenter)
                .offset(x = if (compact) 50.dp else 62.dp, y = if (compact) 12.dp else 18.dp)
        )
    }
}

@Composable
private fun StudentHeroBubble(
    icon: ImageVector,
    size: androidx.compose.ui.unit.Dp,
    modifier: Modifier = Modifier
) {
    Surface(
        modifier = modifier.size(size),
        shape = CircleShape,
        color = StudentSurface.copy(alpha = 0.94f),
        border = BorderStroke(1.dp, StudentBorder.copy(alpha = 0.62f)),
        tonalElevation = 3.dp,
        shadowElevation = 3.dp
    ) {
        Box(contentAlignment = Alignment.Center) {
            Icon(icon, null, tint = StudentBlue, modifier = Modifier.size(size * 0.5f))
        }
    }
}

private fun timeBasedGreeting(hour: Int, language: AppLanguage): String {
    val bucket = when (hour) {
        in 5..10 -> "morning"
        in 11..12 -> "noon"
        in 13..16 -> "afternoon"
        in 17..20 -> "evening"
        else -> "night"
    }
    return if (language == AppLanguage.Bengali) {
        when (bucket) {
            "morning" -> "শুভ সকাল"
            "noon" -> "শুভ দুপুর"
            "afternoon" -> "শুভ বিকাল"
            "evening" -> "শুভ সন্ধ্যা"
            else -> "শুভ রাত্রি"
        }
    } else {
        when (bucket) {
            "morning" -> "Good morning"
            "noon" -> "Good noon"
            "afternoon" -> "Good afternoon"
            "evening" -> "Good evening"
            else -> "Good night"
        }
    }
}

@Composable
private fun StudentDashboardHeader(
    accountName: String,
    appLanguage: AppLanguage,
    onLanguageChange: (AppLanguage) -> Unit,
    appThemeMode: AppThemeMode,
    onThemeModeChange: (AppThemeMode) -> Unit,
    onOpenProfile: () -> Unit = {},
    showHero: Boolean = false
) {
    val isDark = with(AppUiPreferences) { appThemeMode.isDarkTheme() }
    val logoRes = if (isDark) R.drawable.cheatlock_logo else R.drawable.cheatlock_logo_light

    Column(verticalArrangement = Arrangement.spacedBy(18.dp)) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Image(
                    painter = painterResource(id = logoRes),
                    contentDescription = stringResource(R.string.cheatlock_logo),
                    modifier = Modifier.size(42.dp)
                )
                Spacer(Modifier.width(10.dp))
                Row(verticalAlignment = Alignment.Bottom) {
                    Text(
                        "Cheat",
                        style = MaterialTheme.typography.titleLarge,
                        color = StudentTextPrimary,
                        fontWeight = FontWeight.Black
                    )
                    Text(
                        "Lock",
                        style = MaterialTheme.typography.titleLarge,
                        color = StudentBlue,
                        fontWeight = FontWeight.Black
                    )
                }
            }

            // Icon-based Language & Light/Dark Mode controls right after logo / title header
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                // Dual Pill Language Selector [ BN | EN ]
                Surface(
                    shape = RoundedCornerShape(12.dp),
                    color = StudentSurface.copy(alpha = 0.85f),
                    border = BorderStroke(1.dp, StudentBorder.copy(alpha = 0.5f))
                ) {
                    Row(
                        modifier = Modifier.padding(3.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        val isBn = appLanguage == AppLanguage.Bengali

                        // BN Option
                        Box(
                            modifier = Modifier
                                .clip(RoundedCornerShape(9.dp))
                                .background(if (isBn) StudentBlue else Color.Transparent)
                                .clickable {
                                    android.util.Log.e("CHEATLOCK_BUTTON_DEBUG", "========== BN CLICKED ==========")
                                    android.util.Log.e("CHEATLOCK_BUTTON_DEBUG", "Language BEFORE = $appLanguage")
                                    onLanguageChange(AppLanguage.Bengali)
                                    android.util.Log.e("CHEATLOCK_BUTTON_DEBUG", "Language AFTER = ${AppLanguage.Bengali}")
                                }
                                .padding(horizontal = 9.dp, vertical = 6.dp),
                            contentAlignment = Alignment.Center
                        ) {
                            Text(
                                text = "BN",
                                color = if (isBn) Color.White else StudentTextSecondary,
                                style = MaterialTheme.typography.labelMedium,
                                fontWeight = FontWeight.Bold
                            )
                        }

                        // EN Option
                        Box(
                            modifier = Modifier
                                .clip(RoundedCornerShape(9.dp))
                                .background(if (!isBn) StudentBlue else Color.Transparent)
                                .clickable {
                                    android.util.Log.e("CHEATLOCK_BUTTON_DEBUG", "========== EN CLICKED ==========")
                                    android.util.Log.e("CHEATLOCK_BUTTON_DEBUG", "Language BEFORE = $appLanguage")
                                    onLanguageChange(AppLanguage.English)
                                    android.util.Log.e("CHEATLOCK_BUTTON_DEBUG", "Language AFTER = ${AppLanguage.English}")
                                }
                                .padding(horizontal = 9.dp, vertical = 6.dp),
                            contentAlignment = Alignment.Center
                        ) {
                            Text(
                                text = "EN",
                                color = if (!isBn) Color.White else StudentTextSecondary,
                                style = MaterialTheme.typography.labelMedium,
                                fontWeight = FontWeight.Bold
                            )
                        }
                    }
                }

                // Dual Pill Theme Selector [ ☀️ | 🌙 ]
                Surface(
                    shape = RoundedCornerShape(12.dp),
                    color = StudentSurface.copy(alpha = 0.85f),
                    border = BorderStroke(1.dp, StudentBorder.copy(alpha = 0.5f))
                ) {
                    Row(
                        modifier = Modifier.padding(3.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        // Light Mode Option
                        Box(
                            modifier = Modifier
                                .clip(RoundedCornerShape(9.dp))
                                .background(if (!isDark) StudentBlue else Color.Transparent)
                                .clickable {
                                    android.util.Log.e("CHEATLOCK_BUTTON_DEBUG", "========== LIGHT CLICKED ==========")
                                    android.util.Log.e("CHEATLOCK_BUTTON_DEBUG", "Theme BEFORE = $appThemeMode")
                                    onThemeModeChange(AppThemeMode.Light)
                                    android.util.Log.e("CHEATLOCK_BUTTON_DEBUG", "Theme AFTER = ${AppThemeMode.Light}")
                                }
                                .padding(horizontal = 8.dp, vertical = 5.dp),
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(
                                imageVector = Icons.Default.WbSunny,
                                contentDescription = "Light Mode",
                                tint = if (!isDark) Color.White else StudentTextSecondary,
                                modifier = Modifier.size(18.dp)
                            )
                        }

                        // Dark Mode Option
                        Box(
                            modifier = Modifier
                                .clip(RoundedCornerShape(9.dp))
                                .background(if (isDark) StudentBlue else Color.Transparent)
                                .clickable {
                                    android.util.Log.e("CHEATLOCK_BUTTON_DEBUG", "========== DARK CLICKED ==========")
                                    android.util.Log.e("CHEATLOCK_BUTTON_DEBUG", "Theme BEFORE = $appThemeMode")
                                    onThemeModeChange(AppThemeMode.Dark)
                                    android.util.Log.e("CHEATLOCK_BUTTON_DEBUG", "Theme AFTER = ${AppThemeMode.Dark}")
                                }
                                .padding(horizontal = 8.dp, vertical = 5.dp),
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(
                                imageVector = Icons.Default.NightsStay,
                                contentDescription = "Dark Mode",
                                tint = if (isDark) Color.White else StudentTextSecondary,
                                modifier = Modifier.size(18.dp)
                            )
                        }
                    }
                }
            }
        }

        if (showHero) {
            StudentHeroSection(
                accountName = accountName,
                appLanguage = appLanguage,
                isDark = isDark,
                onOpenProfile = onOpenProfile
            )
        }
    }
}

@Composable
private fun StudentPanel(
    modifier: Modifier = Modifier,
    highlighted: Boolean = false,
    contentPadding: PaddingValues = PaddingValues(18.dp),
    content: @Composable () -> Unit
) {
    val palette = LocalStudentPalette.current
    val isLight = palette == LightStudentPalette
    val borderColor = if (isLight) {
        if (highlighted) palette.blue.copy(alpha = 0.5f) else palette.border
    } else {
        if (highlighted) StudentBlue.copy(alpha = 0.72f) else StudentBorder.copy(alpha = 0.42f)
    }
    val bg = if (isLight) {
        Brush.verticalGradient(listOf(Color.White, Color.White))
    } else {
        Brush.linearGradient(
            listOf(
                StudentSurfaceRaised.copy(alpha = 0.92f),
                StudentSurface.copy(alpha = 0.82f)
            )
        )
    }

    Box(
        modifier = modifier
            .clip(RoundedCornerShape(18.dp))
            .background(bg)
            .border(1.dp, borderColor, RoundedCornerShape(18.dp))
            .padding(contentPadding)
    ) {
        content()
    }
}

@Composable
private fun StudentIconBox(icon: ImageVector, size: androidx.compose.ui.unit.Dp = 50.dp) {
    val palette = LocalStudentPalette.current
    val isLight = palette == LightStudentPalette
    val iconBg = if (isLight) {
        Brush.linearGradient(listOf(palette.blue, palette.blueBright))
    } else {
        Brush.linearGradient(listOf(StudentBlue.copy(alpha = 0.98f), Color(0xFF0755FF)))
    }
    val iconBorder = if (isLight) palette.blue.copy(alpha = 0.3f) else StudentCyan.copy(alpha = 0.45f)

    Box(
        modifier = Modifier
            .size(size)
            .clip(RoundedCornerShape(12.dp))
            .background(iconBg)
            .border(1.dp, iconBorder, RoundedCornerShape(12.dp)),
        contentAlignment = Alignment.Center
    ) {
        Icon(icon, null, tint = Color.White, modifier = Modifier.size(size * 0.54f))
    }
}

@Composable
private fun SelfExamJourneyEntryCard(onOpenSelfExam: () -> Unit) {
    SelfExamUniversityPosterCard(onOpenSelfExam = onOpenSelfExam,
        fallback = { SelfExamJourneyEntryCardFallback(onOpenSelfExam) })
}

@Composable
private fun SelfExamJourneyEntryCardFallback(onOpenSelfExam: () -> Unit) {
    SelfExamCard {
        Column(verticalArrangement = Arrangement.spacedBy(18.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                Surface(shape = SelfExamDesign.controlShape, color = SelfExamDesign.inset) {
                    Icon(Icons.Default.Science, null, tint = SelfExamDesign.accent, modifier = Modifier.padding(14.dp).size(24.dp))
                }
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    SelfExamLabTitle(examLabColor = SelfExamDesign.accent)
                    Text(stringResource(R.string.se_choose_a_topic_set_your_practice_and_begin), color = SelfExamDesign.secondaryText,
                        style = MaterialTheme.typography.bodyMedium)
                }
            }
            Text(stringResource(R.string.se_track_subject_chapter_start), color = SelfExamDesign.accent,
                style = MaterialTheme.typography.labelLarge)
            Text(stringResource(R.string.se_practice_from_your_question_bank_one_step_at_a_time),
                color = SelfExamDesign.secondaryText, style = MaterialTheme.typography.bodyMedium)
            SelfExamPrimaryButton(text = stringResource(R.string.start_practice), onClick = onOpenSelfExam,
                leadingIcon = Icons.Default.PlayArrow)
        }
    }
}

@Composable
private fun SelfExamEntryStep(
    number: String,
    label: String,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier
            .clip(RoundedCornerShape(12.dp))
            .background(StudentBgSecondary.copy(alpha = 0.58f))
            .border(1.dp, StudentBorder.copy(alpha = 0.24f), RoundedCornerShape(12.dp))
            .padding(horizontal = 8.dp, vertical = 10.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(number, color = StudentBlueBright, fontWeight = FontWeight.Black, fontSize = 13.sp)
        Text(label, color = StudentTextSecondary, fontWeight = FontWeight.Bold, fontSize = 10.sp)
    }
}

@Composable
private fun StudentTextField(
    value: String,
    onValueChange: (String) -> Unit,
    label: String,
    leadingIcon: ImageVector,
    modifier: Modifier = Modifier
) {
    val palette = LocalStudentPalette.current
    val isLight = palette == LightStudentPalette

    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        modifier = modifier.heightIn(min = 58.dp),
        singleLine = true,
        placeholder = { Text(label, color = StudentTextMuted) },
        leadingIcon = { Icon(leadingIcon, null, tint = StudentBlue, modifier = Modifier.size(24.dp)) },
        shape = RoundedCornerShape(14.dp),
        colors = OutlinedTextFieldDefaults.colors(
            focusedBorderColor = StudentBlue,
            unfocusedBorderColor = if (isLight) palette.border else StudentBorder.copy(alpha = 0.48f),
            focusedContainerColor = if (isLight) Color.White else StudentBgSecondary.copy(alpha = 0.64f),
            unfocusedContainerColor = if (isLight) Color.White else StudentBgSecondary.copy(alpha = 0.48f),
            cursorColor = StudentCyan,
            focusedTextColor = StudentTextPrimary,
            unfocusedTextColor = StudentTextPrimary
        )
    )
}

@Composable
private fun StudentPrimaryButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    loading: Boolean = false,
    leadingIcon: ImageVector? = null,
    trailingIcon: ImageVector? = null
) {
    val palette = LocalStudentPalette.current
    val isLight = palette == LightStudentPalette
    val buttonBg = if (isLight) {
        Brush.linearGradient(listOf(Color(0xFF2563EB), Color(0xFF1D4ED8)))
    } else {
        Brush.linearGradient(listOf(Color(0xFF075CFF), StudentBlueBright, StudentCyan))
    }

    Button(
        onClick = onClick,
        enabled = enabled,
        modifier = modifier.fillMaxWidth().height(58.dp),
        shape = RoundedCornerShape(12.dp),
        colors = ButtonDefaults.buttonColors(containerColor = Color.Transparent, disabledContainerColor = StudentSurfaceRaised.copy(alpha = 0.62f)),
        contentPadding = PaddingValues()
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(buttonBg),
            contentAlignment = Alignment.Center
        ) {
            if (loading) {
                CircularProgressIndicator(modifier = Modifier.size(22.dp), color = Color.White, strokeWidth = 2.dp)
            } else {
                Row(
                    modifier = Modifier.fillMaxWidth().padding(horizontal = 22.dp),
                    horizontalArrangement = Arrangement.Center,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    leadingIcon?.let {
                        Icon(it, null, tint = Color.White, modifier = Modifier.size(22.dp))
                        Spacer(Modifier.width(10.dp))
                    }
                    Text(text, color = Color.White, fontWeight = FontWeight.Black, style = MaterialTheme.typography.titleMedium)
                    trailingIcon?.let {
                        Spacer(Modifier.weight(1f))
                        Icon(it, null, tint = Color.White, modifier = Modifier.size(28.dp))
                    }
                }
            }
        }
    }
}

@Composable
private fun StudentOutlinedButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    leadingIcon: ImageVector? = null,
    danger: Boolean = false
) {
    val palette = LocalStudentPalette.current
    val isLight = palette == LightStudentPalette
    val accent = if (danger) CheatLockDanger else palette.blue
    val textColor = if (danger) CheatLockDanger else (if (isLight) palette.blue else palette.blueBright)
    val buttonBg = if (isLight) Color.White else StudentSurface.copy(alpha = 0.35f)

    OutlinedButton(
        onClick = onClick,
        modifier = modifier.fillMaxWidth().height(54.dp),
        shape = RoundedCornerShape(12.dp),
        border = BorderStroke(1.dp, accent.copy(alpha = if (isLight) 0.6f else 0.76f)),
        colors = ButtonDefaults.outlinedButtonColors(containerColor = buttonBg)
    ) {
        leadingIcon?.let {
            Icon(it, null, tint = accent, modifier = Modifier.size(22.dp))
            Spacer(Modifier.width(10.dp))
        }
        Text(text, color = textColor, fontWeight = FontWeight.Bold)
    }
}

@Composable
private fun StudentOutlinedIconButton(
    onClick: () -> Unit,
    icon: ImageVector,
    modifier: Modifier = Modifier
) {
    val palette = LocalStudentPalette.current
    val isLight = palette == LightStudentPalette
    val buttonBg = if (isLight) Color.White else StudentSurface.copy(alpha = 0.35f)
    val iconColor = if (isLight) palette.blue else palette.blueBright

    OutlinedButton(
        onClick = onClick,
        modifier = modifier.height(58.dp),
        shape = RoundedCornerShape(14.dp),
        border = BorderStroke(1.dp, palette.blue.copy(alpha = if (isLight) 0.5f else 0.76f)),
        colors = ButtonDefaults.outlinedButtonColors(containerColor = buttonBg),
        contentPadding = PaddingValues(0.dp)
    ) {
        Icon(icon, null, tint = iconColor, modifier = Modifier.size(26.dp))
    }
}

@Composable
private fun StudentQuickActionCard(
    modifier: Modifier = Modifier,
    icon: ImageVector,
    title: String,
    subtitle: String,
    action: String,
    onClick: () -> Unit
) {
    StudentPanel(modifier = modifier.clickable(onClick = onClick), contentPadding = PaddingValues(16.dp)) {
        Column(modifier = Modifier.heightIn(min = 194.dp), verticalArrangement = Arrangement.SpaceBetween) {
            Column(verticalArrangement = Arrangement.spacedBy(13.dp)) {
                StudentIconBox(icon, size = 42.dp)
                Text(title, color = StudentTextPrimary, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Black)
                Text(subtitle, color = StudentTextSecondary, style = MaterialTheme.typography.bodyMedium)
            }
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                Text(action, color = StudentBlueBright, fontWeight = FontWeight.Bold)
                Icon(Icons.AutoMirrored.Filled.ArrowForward, null, tint = StudentBlueBright)
            }
        }
    }
}

@Composable
private fun StudentSecurityCard() {
    StudentPanel {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(16.dp)) {
            Box(
                modifier = Modifier
                    .size(68.dp)
                    .clip(CircleShape)
                    .background(StudentBlue.copy(alpha = 0.18f)),
                contentAlignment = Alignment.Center
            ) {
                Icon(Icons.Default.AdminPanelSettings, null, tint = StudentBlueBright, modifier = Modifier.size(38.dp))
            }
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(5.dp)) {
                Text(stringResource(R.string.security_priority_title), color = StudentTextPrimary, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Black)
                Text(stringResource(R.string.security_priority_body), color = StudentTextSecondary, style = MaterialTheme.typography.bodyMedium)
            }
            Icon(Icons.Default.ChevronRight, null, tint = StudentTextSecondary)
        }
    }
}

@Composable
private fun StudentStatusPanel(color: Color, icon: ImageVector, text: String) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(color.copy(alpha = 0.1f))
            .border(1.dp, color.copy(alpha = 0.32f), RoundedCornerShape(12.dp))
            .padding(10.dp)
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Icon(icon, null, tint = color, modifier = Modifier.size(18.dp))
            Text(text, color = color, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.Bold)
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun PremiumInstructionDialog(onAgree: () -> Unit) {
    BasicAlertDialog(
        onDismissRequest = {}, // Force agreement
        properties = DialogProperties(usePlatformDefaultWidth = false),
        modifier = Modifier
            .fillMaxWidth(0.92f)
            .padding(vertical = 24.dp)
    ) {
            PremiumCard(modifier = Modifier.fillMaxWidth()) {
                Column(
                    modifier = Modifier.padding(8.dp),
                    verticalArrangement = Arrangement.spacedBy(20.dp)
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth()) {
                        Box(
                            modifier = Modifier
                                .size(64.dp)
                                .clip(CircleShape)
                                .background(CheatLockPurpleVibrant.copy(alpha = 0.15f))
                                .border(1.dp, CheatLockPurpleSoft.copy(alpha = 0.3f), CircleShape),
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(Icons.Default.Security, null, tint = CheatLockPurpleVibrant, modifier = Modifier.size(32.dp))
                        }
                        Spacer(Modifier.height(16.dp))
                        Text(
                            stringResource(R.string.security_protocol),
                            style = MaterialTheme.typography.headlineSmall,
                            color = Color.White,
                            fontWeight = FontWeight.Black
                        )
                        Text(
                            stringResource(R.string.integrity_guidelines),
                            style = MaterialTheme.typography.labelMedium,
                            color = CheatLockTextSecondaryDark
                        )
                    }

                    Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
                        InstructionSection(
                            title = stringResource(R.string.pre_exam_checklist),
                            items = listOf(
                                stringResource(R.string.instruction_stable_internet),
                                stringResource(R.string.instruction_quiet_environment),
                                stringResource(R.string.instruction_close_apps),
                                stringResource(R.string.instruction_camera_position)
                            ),
                            icon = Icons.AutoMirrored.Filled.FactCheck
                        )

                        InstructionSection(
                            title = stringResource(R.string.camera_microphone_monitoring),
                            items = listOf(
                                stringResource(R.string.instruction_camera_monitoring),
                                stringResource(R.string.instruction_microphone_monitoring),
                                stringResource(R.string.instruction_monitoring_starts),
                                stringResource(R.string.instruction_permission_denial)
                            ),
                            icon = Icons.Default.Gavel
                        )
                    }

                    GradientPrimaryButton(
                        text = stringResource(R.string.continue_to_android_permissions),
                        onClick = onAgree,
                        leadingIcon = Icons.Default.Verified
                    )
                }
            }
    }
}

@Composable
private fun InstructionSection(title: String, items: List<String>, icon: ImageVector) {
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(icon, null, tint = CheatLockPurpleSoft, modifier = Modifier.size(18.dp))
            Spacer(Modifier.width(8.dp))
            Text(title, style = MaterialTheme.typography.labelLarge, color = CheatLockPurpleSoft, fontWeight = FontWeight.Bold, letterSpacing = 1.sp)
        }
        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
            items.forEach { item ->
                Row {
                    Text("•", color = CheatLockPurpleVibrant, modifier = Modifier.padding(end = 8.dp))
                    Text(item, style = MaterialTheme.typography.bodySmall, color = Color.White.copy(alpha = 0.8f))
                }
            }
        }
    }
}

@Composable
private fun ExamSummaryCard(exam: Exam) {
    PremiumCard {
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(horizontalArrangement = Arrangement.SpaceBetween, modifier = Modifier.fillMaxWidth()) {
                Column(Modifier.weight(1f)) {
                    Text(exam.title, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold, color = Color.White)
                    Text(stringResource(R.string.minutes_short, exam.durationMinutes), style = MaterialTheme.typography.bodySmall, color = CheatLockTextSecondaryDark)
                }
                StatusPill(exam.status.name, if (exam.status == ExamStatus.LIVE) CheatLockSuccess else CheatLockWarning)
            }
        }
    }
}

@Composable
private fun FaceVerificationCard(
    cameraActive: Boolean,
    faceStatus: FaceStatus,
    faceLoading: Boolean,
    faceReady: Boolean,
    livenessState: LivenessState,
    onFaceStatusChanged: (FaceStatus) -> Unit,
    onPreviewSnapshot: (String) -> Unit,
    onFaceDescriptorChanged: (List<Double>) -> Unit,
    onFaceDetected: (Face) -> Unit,
    onCameraError: (String) -> Unit,
    onCameraActiveChanged: (Boolean) -> Unit,
    onRequestCameraPermission: ((Boolean) -> Unit) -> Unit,
    onStartLiveness: () -> Unit
) {
    // Keep callbacks stable to avoid CameraPreview resets
    val currentStatusChanged by rememberUpdatedState(onFaceStatusChanged)
    val currentSnapshot by rememberUpdatedState(onPreviewSnapshot)
    val currentDescriptorChanged by rememberUpdatedState(onFaceDescriptorChanged)
    val currentFaceDetected by rememberUpdatedState(onFaceDetected)

    PremiumCard {
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text(stringResource(R.string.biometric_verification), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, color = Color.White)
            Box(Modifier.fillMaxWidth().height(200.dp).clip(RoundedCornerShape(16.dp)).background(Color.Black)) {
                // Key the camera to the verify state to prevent unbinding
                if (cameraActive) {
                    key("camera-preview") {
                        CameraPreview(
                            onFaceStatusChanged = currentStatusChanged, 
                            onPreviewSnapshot = currentSnapshot, 
                            onFaceDescriptorChanged = currentDescriptorChanged,
                            onFaceDetected = currentFaceDetected,
                            onCameraError = onCameraError
                        )
                    }
                } else {
                    val context = LocalContext.current
                    Column(
                        modifier = Modifier.fillMaxSize().padding(16.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.Center
                    ) {
                        Text(stringResource(R.string.camera_access_biometric), color = Color.White)
                        TextButton(onClick = {
                            onRequestCameraPermission { granted ->
                                onCameraActiveChanged(granted)
                                if (!granted) onCameraError(context.getString(R.string.camera_permission_remains_denied))
                            }
                        }) { Text(stringResource(R.string.retry_camera_permission)) }
                    }
                }
                
                // Base biometric HUD circle overlay
                BiometricHUDOverlay(faceStatus, faceReady)

                // Liveness Challenge Active HUD Overlay
                if (livenessState.status is LivenessStatus.InProgress) {
                    val currentAction = livenessState.actions.getOrNull(livenessState.currentActionIndex)
                    Column(
                        modifier = Modifier
                            .fillMaxSize()
                            .background(Color.Black.copy(alpha = 0.7f))
                            .padding(16.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.SpaceBetween
                    ) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                text = stringResource(R.string.step_count, livenessState.currentActionIndex + 1, livenessState.actions.size),
                                color = CheatLockPurpleSoft,
                                fontWeight = FontWeight.Bold,
                                fontSize = 14.sp
                            )
                            Text(
                                text = stringResource(R.string.seconds_remaining, livenessState.timeLeftSeconds),
                                color = if (livenessState.timeLeftSeconds <= 3) CheatLockDanger else Color.White,
                                fontWeight = FontWeight.Black,
                                fontSize = 14.sp
                            )
                        }

                        val infiniteTransition = rememberInfiniteTransition(label = "pulse")
                        val scale by infiniteTransition.animateFloat(
                            initialValue = 0.95f, targetValue = 1.05f,
                            animationSpec = infiniteRepeatable(tween(1000, easing = FastOutSlowInEasing), RepeatMode.Reverse),
                            label = "scale"
                        )

                        Column(
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            Icon(
                                imageVector = when (currentAction) {
                                    LivenessAction.BLINK -> Icons.Default.Visibility
                                    LivenessAction.SMILE -> Icons.Default.SentimentSatisfiedAlt
                                    LivenessAction.TURN_LEFT -> Icons.AutoMirrored.Filled.ArrowBack
                                    LivenessAction.TURN_RIGHT -> Icons.AutoMirrored.Filled.ArrowForward
                                    LivenessAction.LOOK_UP -> Icons.Default.ArrowUpward
                                    LivenessAction.LOOK_DOWN -> Icons.Default.ArrowDownward
                                    else -> Icons.Default.Face
                                },
                                contentDescription = null,
                                tint = CheatLockPurpleVibrant,
                                modifier = Modifier.size(36.dp)
                            )
                            Text(
                                text = currentAction?.instruction?.uppercase() ?: "",
                                color = Color.White,
                                fontWeight = FontWeight.Black,
                                fontSize = 18.sp,
                                modifier = Modifier.scale(scale)
                            )
                        }

                        LinearProgressIndicator(
                            progress = { (livenessState.currentActionIndex.toFloat() / livenessState.actions.size) },
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(6.dp)
                                .clip(RoundedCornerShape(3.dp)),
                            color = CheatLockPurpleVibrant,
                            trackColor = Color.White.copy(alpha = 0.2f),
                        )
                    }
                }

                // Liveness Failed (Retry available) HUD Overlay
                if (livenessState.status is LivenessStatus.FailedRetry) {
                    Column(
                        modifier = Modifier
                            .fillMaxSize()
                            .background(Color.Black.copy(alpha = 0.85f))
                            .padding(16.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.Center
                    ) {
                        Icon(Icons.Default.Refresh, null, tint = CheatLockWarning, modifier = Modifier.size(48.dp))
                        Spacer(Modifier.height(12.dp))
                        Text(stringResource(R.string.challenge_failed), color = Color.White, fontWeight = FontWeight.Bold, fontSize = 16.sp)
                        Spacer(Modifier.height(6.dp))
                        Text(
                            text = if (livenessState.cooldownSeconds > 0) 
                                stringResource(R.string.retry_available_seconds, livenessState.cooldownSeconds)
                            else 
                                stringResource(R.string.tap_start_attempt_two),
                            color = CheatLockTextSecondaryDark,
                            fontSize = 13.sp
                        )
                    }
                }

                // Liveness Failed (Final Lockout) HUD Overlay
                if (livenessState.status is LivenessStatus.FailedFinal) {
                    Column(
                        modifier = Modifier
                            .fillMaxSize()
                            .background(Color.Black.copy(alpha = 0.9f))
                            .padding(16.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.Center
                    ) {
                        Icon(Icons.Default.Lock, null, tint = CheatLockDanger, modifier = Modifier.size(48.dp))
                        Spacer(Modifier.height(12.dp))
                        Text(stringResource(R.string.authentication_denied), color = CheatLockDanger, fontWeight = FontWeight.Black, fontSize = 16.sp)
                        Spacer(Modifier.height(6.dp))
                        Text(
                            text = stringResource(R.string.liveness_failed_both),
                            color = CheatLockTextSecondaryDark,
                            fontSize = 13.sp
                        )
                    }
                }

                // Liveness Success HUD Overlay
                if (livenessState.status is LivenessStatus.Success) {
                    Column(
                        modifier = Modifier
                            .fillMaxSize()
                            .background(Color.Black.copy(alpha = 0.7f))
                            .padding(16.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.Center
                    ) {
                        Icon(Icons.Default.CheckCircle, null, tint = CheatLockSuccess, modifier = Modifier.size(48.dp))
                        Spacer(Modifier.height(12.dp))
                        Text(stringResource(R.string.liveness_verified), color = CheatLockSuccess, fontWeight = FontWeight.Bold, fontSize = 16.sp)
                    }
                }
            }
            Button(
                onClick = {
                    if (livenessState.status is LivenessStatus.FailedRetry && livenessState.cooldownSeconds == 0) {
                        onStartLiveness()
                    } else if (livenessState.status is LivenessStatus.Idle) {
                        onStartLiveness()
                    }
                },
                enabled = !faceReady && (livenessState.status is LivenessStatus.Idle || (livenessState.status is LivenessStatus.FailedRetry && livenessState.cooldownSeconds == 0)),
                modifier = Modifier.fillMaxWidth().height(52.dp)
            ) {
                if (faceLoading) CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp, color = Color.White)
                else Text(
                    text = when (livenessState.status) {
                        LivenessStatus.Idle -> stringResource(R.string.verify_identity)
                        LivenessStatus.InProgress -> stringResource(R.string.verifying_liveness)
                        LivenessStatus.Success -> stringResource(R.string.identity_verified)
                        LivenessStatus.FailedRetry -> if (livenessState.cooldownSeconds > 0) stringResource(R.string.cooldown) else stringResource(R.string.retry_verification)
                        LivenessStatus.FailedFinal -> stringResource(R.string.access_denied)
                    }
                )
            }
        }
    }
}

@Composable
private fun RecentAlertsCard(notifications: List<StudentNotification>) {
    PremiumCard {
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Default.NotificationsActive, null, tint = CheatLockDanger, modifier = Modifier.size(20.dp))
                Spacer(Modifier.width(8.dp))
                Text(stringResource(R.string.security_alerts), style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold, color = Color.White)
            }
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                notifications.take(3).forEach { notification ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(8.dp))
                            .background(Color.White.copy(alpha = 0.05f))
                            .padding(12.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Box(Modifier.size(6.6.dp).clip(CircleShape).background(CheatLockDanger))
                        Spacer(Modifier.width(10.dp))
                        Column {
                            val alertMsg = notification.payload.message ?: notification.payload.title ?: stringResource(R.string.exam_violation_recorded)
                            Text(alertMsg, style = MaterialTheme.typography.bodySmall, color = Color.White)
                            Text(notification.type.replace("_", " ").uppercase(), style = MaterialTheme.typography.labelSmall, color = CheatLockTextTertiaryDark)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun BiometricHUDOverlay(faceStatus: FaceStatus, faceReady: Boolean) {
    val infiniteTransition = rememberInfiniteTransition(label = "hud")
    
    // Core HUD Rotation
    val rotation by infiniteTransition.animateFloat(
        initialValue = 0f, targetValue = 360f,
        animationSpec = infiniteRepeatable(tween(10000, easing = LinearEasing)), label = "rotation"
    )
    
    // Pulse for scanning
    val pulse by infiniteTransition.animateFloat(
        initialValue = 0.8f, targetValue = 1.2f,
        animationSpec = infiniteRepeatable(tween(2000, easing = FastOutSlowInEasing), RepeatMode.Reverse), label = "pulse"
    )

    // Identity Grid Alpha
    val gridAlpha by infiniteTransition.animateFloat(
        initialValue = 0.05f, targetValue = 0.2f,
        animationSpec = infiniteRepeatable(tween(3000, easing = LinearEasing), RepeatMode.Reverse), label = "gridAlpha"
    )

    val hudColor = when {
        faceReady -> CheatLockSuccess
        faceStatus == FaceStatus.FACE_FOUND -> CheatLockSuccess.copy(alpha = 0.8f)
        faceStatus == FaceStatus.NO_FACE || faceStatus == FaceStatus.MULTIPLE_FACES -> CheatLockDanger.copy(alpha = 0.8f)
        else -> CheatLockPurpleSoft
    }

    Canvas(Modifier.fillMaxSize()) {
        val w = size.width
        val h = size.height
        val center = Offset(w / 2, h / 2)
        val radius = size.minDimension / 2.5f

        // 1. Geometric Identity Grid
        val gridSize = 40.dp.toPx()
        for (x in 0..(w / gridSize).toInt()) {
            drawLine(hudColor, Offset(x * gridSize, 0f), Offset(x * gridSize, h), 0.5.dp.toPx(), alpha = gridAlpha)
        }
        for (y in 0..(h / gridSize).toInt()) {
            drawLine(hudColor, Offset(0f, y * gridSize), Offset(w, y * gridSize), 0.5.dp.toPx(), alpha = gridAlpha)
        }

        // 2. Multi-layered Rotating HUD Ring
        rotate(rotation) {
            // Main Outer Segmented Ring
            drawCircle(hudColor, radius, center, style = Stroke(1.dp.toPx(), pathEffect = PathEffect.dashPathEffect(floatArrayOf(20f, 40f), 0f)), alpha = 0.4f)
            
            // Rotating Arcs
            drawArc(hudColor, -45f, 90f, false, center - Offset(radius, radius), Size(radius*2, radius*2), style = Stroke(3.dp.toPx(), cap = StrokeCap.Round))
            drawArc(hudColor, 135f, 90f, false, center - Offset(radius, radius), Size(radius*2, radius*2), style = Stroke(3.dp.toPx(), cap = StrokeCap.Round))
        }

        // 3. Counter-Rotating Inner Ring
        rotate(-rotation * 1.5f) {
            drawCircle(hudColor, radius * 0.7f, center, style = Stroke(1.dp.toPx(), pathEffect = PathEffect.dashPathEffect(floatArrayOf(10f, 20f), 0f)), alpha = 0.3f)
        }

        // 4. Central Identity Pulse
        if (!faceReady) {
            drawCircle(hudColor, radius * 0.5f * pulse, center, style = Stroke(2.dp.toPx()), alpha = 0.2f * (1 - (pulse - 0.8f) / 0.4f))
        }

        // 5. Precision Corner Brackets (Lock-on feel)
        val pad = 30.dp.toPx()
        val bracketLength = 20.dp.toPx()
        val bracketThickness = 2.dp.toPx()
        // Top Left
        drawLine(hudColor, Offset(pad, pad), Offset(pad + bracketLength, pad), bracketThickness, StrokeCap.Round)
        drawLine(hudColor, Offset(pad, pad), Offset(pad, pad + bracketLength), bracketThickness, StrokeCap.Round)
        // Top Right
        drawLine(hudColor, Offset(w - pad, pad), Offset(w - pad - bracketLength, pad), bracketThickness, StrokeCap.Round)
        drawLine(hudColor, Offset(w - pad, pad), Offset(w - pad, pad + bracketLength), bracketThickness, StrokeCap.Round)
        // Bottom Left
        drawLine(hudColor, Offset(pad, h - pad), Offset(pad + bracketLength, h - pad), bracketThickness, StrokeCap.Round)
        drawLine(hudColor, Offset(pad, h - pad), Offset(pad, h - pad - bracketLength), bracketThickness, StrokeCap.Round)
        // Bottom Right
        drawLine(hudColor, Offset(w - pad, h - pad), Offset(w - pad - bracketLength, h - pad), bracketThickness, StrokeCap.Round)
        drawLine(hudColor, Offset(w - pad, h - pad), Offset(w - pad, h - pad - bracketLength), bracketThickness, StrokeCap.Round)
        
        // 6. Text Metadata Simulation
        if (faceStatus == FaceStatus.CHECKING && !faceReady) {
            val scanY = h * (0.1f + 0.8f * ((rotation % 100) / 100f))
            drawLine(brush = Brush.horizontalGradient(listOf(Color.Transparent, hudColor.copy(alpha = 0.4f), Color.Transparent)), start = Offset(pad, scanY), end = Offset(w - pad, scanY), strokeWidth = 1.dp.toPx())
        }
    }
}

@Composable
private fun DigitalScannerOverlay() {
    val transition = rememberInfiniteTransition(label = "digital_scanner")
    val scanLine by transition.animateFloat(initialValue = 0.1f, targetValue = 0.9f, animationSpec = infiniteRepeatable(tween(2500, easing = LinearEasing), RepeatMode.Reverse), label = "scan")
    
    Canvas(Modifier.fillMaxSize()) {
        val pad = 40.dp.toPx()
        val len = 30.dp.toPx()
        val stroke = 3.dp.toPx()
        val color = CheatLockPurpleSoft
        
        // Corners
        drawLine(color, Offset(pad, pad), Offset(pad + len, pad), stroke, StrokeCap.Round)
        drawLine(color, Offset(pad, pad), Offset(pad, pad + len), stroke, StrokeCap.Round)
        drawLine(color, Offset(size.width - pad, pad), Offset(size.width - pad - len, pad), stroke, StrokeCap.Round)
        drawLine(color, Offset(size.width - pad, pad), Offset(size.width - pad, pad + len), stroke, StrokeCap.Round)
        drawLine(color, Offset(pad, size.height - pad), Offset(pad + len, size.height - pad), stroke, StrokeCap.Round)
        drawLine(color, Offset(pad, size.height - pad), Offset(pad, size.height - pad - len), stroke, StrokeCap.Round)
        drawLine(color, Offset(size.width - pad, size.height - pad), Offset(size.width - pad - len, size.height - pad), stroke, StrokeCap.Round)
        drawLine(color, Offset(size.width - pad, size.height - pad), Offset(size.width - pad, size.height - pad - len), stroke, StrokeCap.Round)

        val y = size.height * scanLine
        drawLine(brush = Brush.horizontalGradient(listOf(Color.Transparent, color, Color.Transparent)), start = Offset(pad, y), end = Offset(size.width - pad, y), strokeWidth = 2.dp.toPx())
    }
}

private fun parseExamCode(input: String): String {
    val trimmed = input.trim()
    return when {
        trimmed.contains("code=") -> {
            trimmed.substringAfter("code=")
                .substringBefore("&")
                .substringBefore("/")
                .uppercase()
        }
        trimmed.contains("/") -> {
            trimmed.removeSuffix("/")
                .split("/")
                .last()
                .uppercase()
        }
        else -> trimmed.uppercase()
    }
}
