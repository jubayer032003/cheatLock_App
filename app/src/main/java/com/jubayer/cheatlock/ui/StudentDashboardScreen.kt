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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
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

private val StudentBgPrimary = Color(0xFF050A14)
private val StudentBgSecondary = Color(0xFF07101F)
private val StudentSurface = Color(0xFF09172A)
private val StudentSurfaceRaised = Color(0xFF0C192C)
private val StudentBlue = Color(0xFF087CFF)
private val StudentBlueBright = Color(0xFF169BFF)
private val StudentCyan = Color(0xFF16B8FF)
private val StudentTextPrimary = Color(0xFFF5F8FF)
private val StudentTextSecondary = Color(0xFF94A3B8)
private val StudentTextMuted = Color(0xFF64748B)
private val StudentBorder = Color(0xFF5078AA)

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
    externalMessage: String? = null,
    recentNotifications: List<StudentNotification> = emptyList()
) {
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
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

    Box(modifier = Modifier.fillMaxSize().background(StudentBgPrimary)) {
        StudentDashboardBackground()
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
                onProfileClick = { showProfileManagement = true }
            )

            if (showProfileManagement) {
                ProfileManagementScreen(account, onUpdateProfile, onHasFaceProfile, onDeleteAccount, onOpenAccountDeletionPage)
                StudentOutlinedButton(
                    text = "Return to Dashboard",
                    onClick = { showProfileManagement = false },
                    leadingIcon = Icons.AutoMirrored.Filled.ArrowBack
                )
            } else {
                if (recentNotifications.isNotEmpty()) {
                    RecentAlertsCard(recentNotifications)
                }

                StudentPanel(highlighted = true) {
                    Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            StudentIconBox(Icons.Default.EnhancedEncryption)
                            Spacer(Modifier.width(14.dp))
                            Column {
                                Text("Join an Exam", color = StudentTextPrimary, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Black)
                                Text(
                                    "Enter the room code provided by your instructor.",
                                    color = StudentTextSecondary,
                                    style = MaterialTheme.typography.bodyMedium
                                )
                            }
                        }
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(12.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            StudentTextField(
                                modifier = Modifier.weight(1f),
                                value = examCode,
                                onValueChange = { examCode = it.uppercase() },
                                label = "Enter room code",
                                leadingIcon = Icons.Default.VpnKey
                            )
                            StudentOutlinedIconButton(
                                onClick = { showQrScanner = true },
                                icon = Icons.Default.QrCodeScanner,
                                modifier = Modifier.width(68.dp)
                            )
                        }
                        StudentPrimaryButton(
                            text = if (isLoading) "Opening..." else "Join Exam",
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

                Text("Quick Actions", color = StudentTextPrimary, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Black)
                Column(
                    modifier = Modifier.fillMaxWidth(),
                    verticalArrangement = Arrangement.spacedBy(14.dp)
                ) {
                    StudentQuickActionCard(
                        modifier = Modifier.fillMaxWidth(),
                        icon = Icons.Default.Quiz,
                        title = "Self Exam",
                        subtitle = "Practice MCQs and improve your understanding.",
                        action = "Start Practice",
                        onClick = onOpenSelfExam
                    )

                    var classLoading by remember { mutableStateOf(false) }
                    StudentPanel(modifier = Modifier.fillMaxWidth(), contentPadding = PaddingValues(16.dp)) {
                        Column(verticalArrangement = Arrangement.spacedBy(13.dp)) {
                            StudentIconBox(Icons.Default.Groups, size = 42.dp)
                            Text("Class Registration", color = StudentTextPrimary, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Black)
                            Text(
                                "Join your class using the invite code from your teacher.",
                                color = StudentTextSecondary,
                                style = MaterialTheme.typography.bodyMedium
                            )
                            StudentTextField(
                                value = classInviteCode,
                                onValueChange = { classInviteCode = it.uppercase() },
                                label = "Class invite code",
                                leadingIcon = Icons.Default.GroupAdd
                            )

                            enrollmentStatus?.let { status ->
                                when (status) {
                                    "PENDING" -> StudentStatusPanel(CheatLockWarning, Icons.Default.Pending, "Waiting for teacher approval")
                                    "APPROVED" -> StudentStatusPanel(CheatLockSuccess, Icons.Default.Verified, "You are now a member of this class")
                                    "REJECTED" -> StudentStatusPanel(CheatLockDanger, Icons.Default.Error, "Your request was rejected")
                                }
                            }

                            StudentPrimaryButton(
                                text = if (classLoading) "Requesting..." else "Join Class",
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
                        text = if (isStartingSession) "Initializing..." else "Start Secure Session",
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
                    text = "Manage Authorized Profile",
                    onClick = { showProfileManagement = true },
                    leadingIcon = Icons.Default.AccountCircle
                )
            }

            StudentOutlinedButton(
                text = "Logout",
                onClick = onLogout,
                danger = true,
                leadingIcon = Icons.AutoMirrored.Filled.Logout
            )
        }
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
                    Text("Scanner", style = MaterialTheme.typography.headlineSmall)
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
                        TextButton(onClick = { showQrScanner = false }) { Text("Close") }
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
                        message = "Camera permission was denied. Allow camera access and retry biometric verification."
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
                    Text("Screen monitoring during this exam", style = MaterialTheme.typography.headlineSmall)
                    Text(
                        "After you continue, Android will ask for screen-capture permission. During the proctored exam, CheatLock captures periodic screen images to identify suspicious activity and uploads them over HTTPS to the CheatLock service, where authorized instructors or proctors can review them. Capture begins only after Android permission and stops when the exam or monitoring service ends. A visible notification is shown while capture is active."
                    )
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.End
                    ) {
                        TextButton(onClick = {
                            showScreenDisclosure = false
                            pendingExamStart = null
                        }) { Text("Not now") }
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
                        }) { Text("Continue to Android permission") }
                    }
                }
            }
        }
    }
}

@Composable
private fun StudentDashboardBackground() {
    Canvas(modifier = Modifier.fillMaxSize()) {
        drawRect(
            Brush.verticalGradient(
                colors = listOf(StudentBgPrimary, StudentBgSecondary, StudentBgPrimary),
                startY = 0f,
                endY = size.height
            )
        )
        drawCircle(
            brush = Brush.radialGradient(
                colors = listOf(StudentBlue.copy(alpha = 0.24f), Color.Transparent),
                center = Offset(size.width * 0.48f, size.height * 0.28f),
                radius = size.width * 0.68f
            ),
            radius = size.width * 0.68f,
            center = Offset(size.width * 0.48f, size.height * 0.28f)
        )
        val ringCenter = Offset(size.width * 0.48f, size.height * 0.24f)
        repeat(4) { index ->
            drawCircle(
                color = StudentBlue.copy(alpha = 0.08f - index * 0.012f),
                radius = size.width * (0.28f + index * 0.09f),
                center = ringCenter,
                style = Stroke(width = 1.1.dp.toPx())
            )
        }
        val dotColor = StudentBlue.copy(alpha = 0.28f)
        for (row in 0..9) {
            for (col in 0..7) {
                drawCircle(
                    color = dotColor.copy(alpha = 0.05f + ((row + col) % 3) * 0.035f),
                    radius = 1.15.dp.toPx(),
                    center = Offset(size.width * 0.68f + col * 18.dp.toPx(), size.height * 0.13f + row * 18.dp.toPx())
                )
            }
        }
    }
}

@Composable
private fun StudentDashboardHeader(accountName: String, onProfileClick: () -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(18.dp)) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Image(
                    painter = painterResource(id = R.drawable.cheatlock_logo),
                    contentDescription = "CheatLock logo",
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
            Surface(
                onClick = onProfileClick,
                shape = RoundedCornerShape(12.dp),
                color = StudentSurface.copy(alpha = 0.82f),
                border = BorderStroke(1.dp, StudentBorder.copy(alpha = 0.62f))
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 14.dp, vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Icon(Icons.Default.School, null, tint = StudentBlue, modifier = Modifier.size(22.dp))
                    Text("Student", color = StudentTextPrimary, fontWeight = FontWeight.Bold)
                    Icon(Icons.Default.KeyboardArrowDown, null, tint = StudentTextSecondary, modifier = Modifier.size(20.dp))
                }
            }
        }

        Column(verticalArrangement = Arrangement.spacedBy(7.dp)) {
            Text("Good morning,", color = StudentTextSecondary, style = MaterialTheme.typography.titleMedium)
            Row(verticalAlignment = Alignment.Bottom) {
                Text("Student ", color = StudentTextPrimary, style = MaterialTheme.typography.displaySmall, fontWeight = FontWeight.Black)
                Text("Dashboard", color = StudentBlue, style = MaterialTheme.typography.displaySmall, fontWeight = FontWeight.Black)
            }
            Text("Ready for your next exam?", color = StudentTextSecondary, style = MaterialTheme.typography.titleMedium)
            Row(
                modifier = Modifier
                    .clip(RoundedCornerShape(999.dp))
                    .border(1.dp, StudentBlue.copy(alpha = 0.8f), RoundedCornerShape(999.dp))
                    .background(StudentBlue.copy(alpha = 0.08f))
                    .padding(horizontal = 13.dp, vertical = 7.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Icon(Icons.Default.GppGood, null, tint = StudentBlue, modifier = Modifier.size(18.dp))
                Text("Authorized Student", color = StudentBlueBright, style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Bold)
            }
            if (accountName.isNotBlank()) {
                Text(accountName, color = StudentTextMuted, style = MaterialTheme.typography.labelSmall)
            }
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
    val borderColor = if (highlighted) StudentBlue.copy(alpha = 0.72f) else StudentBorder.copy(alpha = 0.42f)
    Box(
        modifier = modifier
            .clip(RoundedCornerShape(18.dp))
            .background(
                Brush.linearGradient(
                    listOf(
                        StudentSurfaceRaised.copy(alpha = 0.92f),
                        StudentSurface.copy(alpha = 0.82f)
                    )
                )
            )
            .border(1.dp, borderColor, RoundedCornerShape(18.dp))
            .padding(contentPadding)
    ) {
        content()
    }
}

@Composable
private fun StudentIconBox(icon: ImageVector, size: androidx.compose.ui.unit.Dp = 50.dp) {
    Box(
        modifier = Modifier
            .size(size)
            .clip(RoundedCornerShape(12.dp))
            .background(Brush.linearGradient(listOf(StudentBlue.copy(alpha = 0.98f), Color(0xFF0755FF))))
            .border(1.dp, StudentCyan.copy(alpha = 0.45f), RoundedCornerShape(12.dp)),
        contentAlignment = Alignment.Center
    ) {
        Icon(icon, null, tint = StudentTextPrimary, modifier = Modifier.size(size * 0.54f))
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
            unfocusedBorderColor = StudentBorder.copy(alpha = 0.48f),
            focusedContainerColor = StudentBgSecondary.copy(alpha = 0.64f),
            unfocusedContainerColor = StudentBgSecondary.copy(alpha = 0.48f),
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
                .background(Brush.linearGradient(listOf(Color(0xFF075CFF), StudentBlueBright, StudentCyan))),
            contentAlignment = Alignment.Center
        ) {
            if (loading) {
                CircularProgressIndicator(modifier = Modifier.size(22.dp), color = StudentTextPrimary, strokeWidth = 2.dp)
            } else {
                Row(
                    modifier = Modifier.fillMaxWidth().padding(horizontal = 22.dp),
                    horizontalArrangement = Arrangement.Center,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    leadingIcon?.let {
                        Icon(it, null, tint = StudentTextPrimary, modifier = Modifier.size(22.dp))
                        Spacer(Modifier.width(10.dp))
                    }
                    Text(text, color = StudentTextPrimary, fontWeight = FontWeight.Black, style = MaterialTheme.typography.titleMedium)
                    trailingIcon?.let {
                        Spacer(Modifier.weight(1f))
                        Icon(it, null, tint = StudentTextPrimary, modifier = Modifier.size(28.dp))
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
    val accent = if (danger) CheatLockDanger else StudentBlue
    OutlinedButton(
        onClick = onClick,
        modifier = modifier.fillMaxWidth().height(54.dp),
        shape = RoundedCornerShape(12.dp),
        border = BorderStroke(1.dp, accent.copy(alpha = 0.76f)),
        colors = ButtonDefaults.outlinedButtonColors(containerColor = StudentSurface.copy(alpha = 0.35f))
    ) {
        leadingIcon?.let {
            Icon(it, null, tint = accent, modifier = Modifier.size(22.dp))
            Spacer(Modifier.width(10.dp))
        }
        Text(text, color = if (danger) CheatLockDanger else StudentBlueBright, fontWeight = FontWeight.Bold)
    }
}

@Composable
private fun StudentOutlinedIconButton(
    onClick: () -> Unit,
    icon: ImageVector,
    modifier: Modifier = Modifier
) {
    OutlinedButton(
        onClick = onClick,
        modifier = modifier.height(58.dp),
        shape = RoundedCornerShape(14.dp),
        border = BorderStroke(1.dp, StudentBlue.copy(alpha = 0.76f)),
        colors = ButtonDefaults.outlinedButtonColors(containerColor = StudentSurface.copy(alpha = 0.35f)),
        contentPadding = PaddingValues(0.dp)
    ) {
        Icon(icon, null, tint = StudentBlueBright, modifier = Modifier.size(26.dp))
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
                Text("Your exam security is our priority", color = StudentTextPrimary, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Black)
                Text("We ensure a fair, secure and trustworthy exam experience.", color = StudentTextSecondary, style = MaterialTheme.typography.bodyMedium)
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
                            icon = Icons.AutoMirrored.Filled.FactCheck
                        )

                        InstructionSection(
                            title = "CAMERA AND MICROPHONE MONITORING",
                            items = listOf(
                                "During a proctored exam, the camera checks identity, face presence, and visible objects. Periodic face-camera evidence images may be uploaded over HTTPS for authorized instructors or proctors to review.",
                                "Microphone input is processed in memory for voice-activity detection during the exam. The current implementation does not intentionally store or transmit raw audio.",
                                "Monitoring starts only after you continue and grant Android permissions. It stops when the exam monitoring ends.",
                                "If required access is denied, identity verification or the proctored exam may be unavailable."
                            ),
                            icon = Icons.Default.Gavel
                        )
                    }

                    GradientPrimaryButton(
                        text = "CONTINUE TO ANDROID PERMISSIONS",
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
            Text("Biometric Verification", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, color = Color.White)
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
                    Column(
                        modifier = Modifier.fillMaxSize().padding(16.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.Center
                    ) {
                        Text("Camera access is required for biometric verification.", color = Color.White)
                        TextButton(onClick = {
                            onRequestCameraPermission { granted ->
                                onCameraActiveChanged(granted)
                                if (!granted) onCameraError("Camera permission remains denied.")
                            }
                        }) { Text("Retry camera permission") }
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
