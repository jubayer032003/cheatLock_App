package com.jubayer.cheatlock.ui

import androidx.compose.animation.*
import androidx.compose.animation.core.*
import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Logout
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
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
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.DialogProperties
import com.google.mlkit.vision.face.Face
import com.jubayer.cheatlock.liveness.LivenessViewModel
import com.jubayer.cheatlock.liveness.LivenessStatus
import com.jubayer.cheatlock.liveness.LivenessAction
import com.jubayer.cheatlock.liveness.LivenessState
import androidx.compose.ui.draw.scale
import com.jubayer.cheatlock.model.*
import com.jubayer.cheatlock.ui.theme.*
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

@Composable
fun StudentDashboardScreen(
    account: UserAccount,
    onOpenExamByCode: suspend (String) -> Exam,
    onHasFaceProfile: suspend () -> Boolean,
    onEnrollFace: suspend (List<Double>, String) -> Unit,
    onVerifyFace: suspend (List<Double>) -> Boolean,
    onJoinClass: suspend (String) -> String,
    onStartExam: suspend (Exam) -> Unit,
    onLogout: () -> Unit,
    onUpdateProfile: suspend (String, String) -> Unit,
    externalMessage: String? = null,
    recentNotifications: List<StudentNotification> = emptyList()
) {
    val scope = rememberCoroutineScope()
    val scrollState = rememberScrollState()
    val haptics = LocalHapticFeedback.current
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
    var showInstructions by remember { mutableStateOf(false) }
    var cameraActive by remember { mutableStateOf(true) }
    val isExamLive = selectedExam?.status == ExamStatus.LIVE

    val livenessViewModel = remember { LivenessViewModel() }
    val livenessState by livenessViewModel.state

    LaunchedEffect(livenessState.status) {
        val currentStatus = livenessState.status
        if (currentStatus is LivenessStatus.Success && !faceReady && !faceLoading) {
            if (faceDescriptor.isNotEmpty()) {
                faceLoading = true
                runCatching {
                    if (onHasFaceProfile()) {
                        if (!onVerifyFace(faceDescriptor)) error("Biometric mismatch. Try again.")
                    } else {
                        onEnrollFace(faceDescriptor, faceSnapshot)
                    }
                    faceReady = true
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
                        if (onHasFaceProfile()) {
                            if (!onVerifyFace(faceDescriptor)) error("Biometric mismatch. Try again.")
                        } else {
                            onEnrollFace(faceDescriptor, faceSnapshot)
                        }
                        faceReady = true
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

    PremiumScreen(modifier = Modifier.fillMaxSize()) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .statusBarsPadding()
                .padding(horizontal = 20.dp, vertical = 16.dp)
                .verticalScroll(scrollState)
                .imePadding(),
            verticalArrangement = Arrangement.spacedBy(18.dp)
        ) {
            // 1. Premium Student Command Hero
            BrandHero(
                title = "Student Command",
                subtitle = account.name.ifBlank { account.identifier }
            )
            RoleBadge(label = "Authorized Student")

            if (showProfileManagement) {
                ProfileManagementScreen(account, onUpdateProfile, onHasFaceProfile)
                OutlinedButton(
                    onClick = { showProfileManagement = false },
                    modifier = Modifier.fillMaxWidth().height(52.dp),
                    border = BorderStroke(1.dp, CheatLockPurpleSoft.copy(alpha = 0.4f))
                ) {
                    Text("Return to Command", fontWeight = FontWeight.Bold, color = CheatLockPurpleSoft)
                }
            } else {
                if (recentNotifications.isNotEmpty()) {
                    RecentAlertsCard(recentNotifications)
                }

                // 2. Exam Access Terminal
                PremiumCard {
                    Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
                        SectionHeader(title = "Secure Exam Access", subtitle = "Enter room code or scan physical key")
                        PremiumOutlinedTextField(
                            value = examCode,
                            onValueChange = { examCode = it.uppercase() },
                            label = "Room Access Code",
                            leadingIcon = Icons.Default.VpnKey
                        )
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(12.dp)
                        ) {
                            GradientPrimaryButton(
                                text = if (isLoading) "OPENING..." else "OPEN ROOM",
                                onClick = {
                                    if (examCode.isNotBlank()) {
                                        isLoading = true; message = null
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
                                modifier = Modifier.weight(1f),
                                enabled = !isLoading,
                                loading = isLoading
                            )
                            PremiumOutlinedButton(
                                text = "SCAN KEY",
                                onClick = { showQrScanner = true },
                                modifier = Modifier.weight(1f),
                                leadingIcon = Icons.Default.QrCodeScanner
                            )
                        }

                        // Display Error Message if exists
                        (externalMessage ?: message)?.let {
                            SuccessBanner(message = it, modifier = Modifier.padding(top = 8.dp))
                        }
                    }
                }

                // 3. Class Registration Module
                var classLoading by remember { mutableStateOf(false) }
                PremiumCard {
                    Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
                        SectionHeader(title = "Class Registration", subtitle = "Join new academic modules")
                        PremiumOutlinedTextField(
                            value = classInviteCode,
                            onValueChange = { classInviteCode = it.uppercase() },
                            label = "Class Invite Code",
                            leadingIcon = Icons.Default.GroupAdd
                        )
                        
                        enrollmentStatus?.let { status ->
                            when (status) {
                                "PENDING" -> PremiumCard(elevated = false) {
                                    Row(verticalAlignment = Alignment.CenterVertically) {
                                        Icon(Icons.Default.Pending, null, tint = CheatLockWarning)
                                        Spacer(Modifier.width(12.dp))
                                        Text("WAITING FOR TEACHER APPROVAL", color = CheatLockWarning, style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold)
                                    }
                                }
                                "APPROVED" -> SuccessBanner(message = "YOU ARE NOW A MEMBER OF THIS CLASS")
                                "REJECTED" -> PremiumCard(elevated = false) {
                                    Row(verticalAlignment = Alignment.CenterVertically) {
                                        Icon(Icons.Default.Error, null, tint = CheatLockDanger)
                                        Spacer(Modifier.width(12.dp))
                                        Text("YOUR REQUEST WAS REJECTED BY THE TEACHER", color = CheatLockDanger, style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.Bold)
                                    }
                                }
                            }
                        }

                        GradientPrimaryButton(
                            text = if (classLoading) "REQUESTING..." else "ENROLL IN CLASS",
                            onClick = {
                                if (classInviteCode.isNotBlank()) {
                                    classLoading = true; message = null; enrollmentStatus = null
                                    scope.launch {
                                        runCatching { onJoinClass(classInviteCode.trim()) }
                                            .onSuccess { status ->
                                                enrollmentStatus = status
                                                if (status == "PENDING") {
                                                    message = "Join request submitted successfully."
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
                        onStartLiveness = {
                            livenessViewModel.startChallenge()
                        },
                        onResetLiveness = {
                            livenessViewModel.resetAll()
                        },
                        onVerify = {}
                    )
                    var isStartingSession by remember { mutableStateOf(false) }
                    GradientPrimaryButton(
                        text = if (isStartingSession) "INITIALIZING..." else "START SECURE SESSION",
                        onClick = { 
                            if (!isStartingSession) {
                                isStartingSession = true
                                scope.launch { 
                                    cameraActive = false // Kill camera before transition
                                    runCatching { onStartExam(exam) }
                                        .onFailure { 
                                            message = it.message
                                            cameraActive = true // Restore if failed
                                            isStartingSession = false
                                        }
                                }
                            }
                        },
                        enabled = isExamLive && faceReady && !isStartingSession,
                        loading = isStartingSession,
                        leadingIcon = Icons.Default.Lock
                    )
                }

                Button(
                    onClick = { showProfileManagement = true },
                    modifier = Modifier.fillMaxWidth().height(52.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = Color.Transparent)
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Default.AccountCircle, null, tint = CheatLockPurpleSoft)
                        Spacer(Modifier.width(12.dp))
                        Text("Manage Authorized Profile", color = CheatLockPurpleSoft, fontWeight = FontWeight.Bold, letterSpacing = 0.5.sp)
                    }
                }
            }

            OutlinedButton(
                onClick = onLogout,
                modifier = Modifier.fillMaxWidth().height(52.dp),
                border = BorderStroke(1.dp, CheatLockDanger.copy(alpha = 0.4f))
            ) {
                Icon(Icons.AutoMirrored.Filled.Logout, null, tint = CheatLockDanger); 
                Spacer(Modifier.width(10.dp)); 
                Text("TERMINATE COMMAND", fontWeight = FontWeight.Black, color = CheatLockDanger, letterSpacing = 1.sp)
            }
        }
    }

    if (showQrScanner) {
        AlertDialog(
            onDismissRequest = { showQrScanner = false },
            title = { Text("Scanner") },
            text = {
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
            },
            confirmButton = {},
            dismissButton = { TextButton(onClick = { showQrScanner = false }) { Text("Close") } }
        )
    }

    if (showInstructions) {
        PremiumInstructionDialog(
            onAgree = {
                showInstructions = false
                scope.launch {
                    delay(300)
                    scrollState.animateScrollTo(scrollState.maxValue)
                }
            }
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun PremiumInstructionDialog(onAgree: () -> Unit) {
    AlertDialog(
        onDismissRequest = {}, // Force agreement
        properties = DialogProperties(usePlatformDefaultWidth = false),
        modifier = Modifier
            .fillMaxWidth(0.92f)
            .padding(vertical = 24.dp),
        content = {
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
                            "Security Protocol",
                            style = MaterialTheme.typography.headlineSmall,
                            color = Color.White,
                            fontWeight = FontWeight.Black
                        )
                        Text(
                            "Please review the integrity guidelines",
                            style = MaterialTheme.typography.labelMedium,
                            color = CheatLockTextSecondaryDark
                        )
                    }

                    Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
                        InstructionSection(
                            title = "PRE-EXAM CHECKLIST",
                            items = listOf(
                                "Ensure a stable internet connection.",
                                "Find a quiet, well-lit private environment.",
                                "Close all background applications/tabs.",
                                "Position yourself in front of the camera."
                            ),
                            icon = Icons.Default.FactCheck
                        )

                        InstructionSection(
                            title = "DURING EXAM RULES",
                            items = listOf(
                                "Face must remain visible in frame at all times.",
                                "Eye movement and audio are actively proctored.",
                                "Do not use external devices or materials.",
                                "Leaving the app triggers a lockdown event."
                            ),
                            icon = Icons.Default.Gavel
                        )
                    }

                    GradientPrimaryButton(
                        text = "I AGREE & CONTINUE",
                        onClick = onAgree,
                        leadingIcon = Icons.Default.Verified
                    )
                }
            }
        }
    )
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
                    Text("${exam.durationMinutes} mins", style = MaterialTheme.typography.bodySmall, color = CheatLockTextSecondaryDark)
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
    livenessState: com.jubayer.cheatlock.liveness.LivenessState,
    onFaceStatusChanged: (FaceStatus) -> Unit,
    onPreviewSnapshot: (String) -> Unit,
    onFaceDescriptorChanged: (List<Double>) -> Unit,
    onFaceDetected: (Face) -> Unit,
    onStartLiveness: () -> Unit,
    onResetLiveness: () -> Unit,
    onVerify: () -> Unit
) {
    // Keep callbacks stable to avoid CameraPreview resets
    val currentStatusChanged by rememberUpdatedState(onFaceStatusChanged)
    val currentSnapshot by rememberUpdatedState(onPreviewSnapshot)
    val currentDescriptorChanged by rememberUpdatedState(onFaceDescriptorChanged)
    val currentFaceDetected by rememberUpdatedState(onFaceDetected)

    PremiumCard {
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text("Biometric Verification", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, color = Color.White)
            Box(Modifier.fillMaxWidth().height(200.dp).clip(RoundedCornerShape(16.dp)).background(Color.Black)) {
                // Key the camera to the verify state to prevent unbinding
                if (cameraActive) {
                    key(Unit) {
                        CameraPreview(
                            onFaceStatusChanged = currentStatusChanged, 
                            onPreviewSnapshot = currentSnapshot, 
                            onFaceDescriptorChanged = currentDescriptorChanged,
                            onFaceDetected = currentFaceDetected
                        )
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
                                text = "Step ${livenessState.currentActionIndex + 1}/${livenessState.actions.size}",
                                color = CheatLockPurpleSoft,
                                fontWeight = FontWeight.Bold,
                                fontSize = 14.sp
                            )
                            Text(
                                text = "${livenessState.timeLeftSeconds}s remaining",
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
                                    LivenessAction.TURN_LEFT -> Icons.Default.ArrowBack
                                    LivenessAction.TURN_RIGHT -> Icons.Default.ArrowForward
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
                        Text("CHALLENGE FAILED", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 16.sp)
                        Spacer(Modifier.height(6.dp))
                        Text(
                            text = if (livenessState.cooldownSeconds > 0) 
                                "Retry available in ${livenessState.cooldownSeconds}s" 
                            else 
                                "Tap below to start Attempt 2",
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
                        Text("AUTHENTICATION DENIED", color = CheatLockDanger, fontWeight = FontWeight.Black, fontSize = 16.sp)
                        Spacer(Modifier.height(6.dp))
                        Text(
                            text = "Liveness verification failed both attempts.",
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
                        Text("LIVENESS VERIFIED", color = CheatLockSuccess, fontWeight = FontWeight.Bold, fontSize = 16.sp)
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
                        LivenessStatus.Idle -> "VERIFY IDENTITY"
                        LivenessStatus.InProgress -> "VERIFYING LIVENESS..."
                        LivenessStatus.Success -> "IDENTITY VERIFIED"
                        LivenessStatus.FailedRetry -> if (livenessState.cooldownSeconds > 0) "COOLDOWN..." else "RETRY VERIFICATION"
                        LivenessStatus.FailedFinal -> "ACCESS DENIED"
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
                Text("Security Alerts", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold, color = Color.White)
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
                            val alertMsg = notification.payload.message ?: notification.payload.title ?: "Exam violation recorded."
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
        val w = size.width; val h = size.height
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
        val pad = 30.dp.toPx(); val blen = 20.dp.toPx(); val bthick = 2.dp.toPx()
        // Top Left
        drawLine(hudColor, Offset(pad, pad), Offset(pad + blen, pad), bthick, StrokeCap.Round)
        drawLine(hudColor, Offset(pad, pad), Offset(pad, pad + blen), bthick, StrokeCap.Round)
        // Top Right
        drawLine(hudColor, Offset(w - pad, pad), Offset(w - pad - blen, pad), bthick, StrokeCap.Round)
        drawLine(hudColor, Offset(w - pad, pad), Offset(w - pad, pad + blen), bthick, StrokeCap.Round)
        // Bottom Left
        drawLine(hudColor, Offset(pad, h - pad), Offset(pad + blen, h - pad), bthick, StrokeCap.Round)
        drawLine(hudColor, Offset(pad, h - pad), Offset(pad, h - pad - blen), bthick, StrokeCap.Round)
        // Bottom Right
        drawLine(hudColor, Offset(w - pad, h - pad), Offset(w - pad - blen, h - pad), bthick, StrokeCap.Round)
        drawLine(hudColor, Offset(w - pad, h - pad), Offset(w - pad, h - pad - blen), bthick, StrokeCap.Round)
        
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
