package com.jubayer.cheatlock

import android.app.Activity
import android.content.Intent
import com.jubayer.cheatlock.ui.CrashRecoveryScreen
import android.os.Build
import android.os.Bundle
import android.util.Log
import android.view.KeyEvent
import android.view.WindowManager
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.compose.animation.AnimatedContent
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.fragment.app.FragmentActivity
import com.jubayer.cheatlock.auth.BiometricAuthManager
import com.jubayer.cheatlock.ui.ExamScreen
import com.jubayer.cheatlock.ui.LoginScreen
import com.jubayer.cheatlock.ui.ResultScreen
import com.jubayer.cheatlock.ui.StudentDashboardScreen
import com.jubayer.cheatlock.ui.SplashScreen
import com.jubayer.cheatlock.ui.theme.CheatLockTheme
import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import com.jubayer.cheatlock.data.ExamStorage
import com.jubayer.cheatlock.data.MongoBackendRepository
import com.jubayer.cheatlock.data.ProctoringEventRequest
import com.jubayer.cheatlock.model.Exam
import com.jubayer.cheatlock.model.ExamQuestion
import com.jubayer.cheatlock.model.ExamSubmission
import com.jubayer.cheatlock.model.StudentAnswer
import com.jubayer.cheatlock.model.ExamSession
import com.jubayer.cheatlock.model.ExamSessionStatus
import com.jubayer.cheatlock.model.ExamFinishReason
import com.jubayer.cheatlock.model.TeacherClass
import com.jubayer.cheatlock.model.UserAccount
import com.jubayer.cheatlock.model.UserRole
import com.jubayer.cheatlock.proctoring.ScreenCaptureCallbacks
import com.jubayer.cheatlock.proctoring.ScreenCaptureService
import com.jubayer.cheatlock.model.StudentNotification
import com.jubayer.cheatlock.notifications.StudentNotificationHelper
import com.jubayer.cheatlock.security.ExamSecurityController
import com.jubayer.cheatlock.ui.AdminDashboardScreen
import com.jubayer.cheatlock.ui.HomeScreen
import com.jubayer.cheatlock.ui.cheatLockScreenTransition
import com.jubayer.cheatlock.util.BackendConnectionProbe
import com.jubayer.cheatlock.util.BackendUrlStore
import android.media.projection.MediaProjectionManager
import androidx.camera.lifecycle.ProcessCameraProvider
import com.jubayer.cheatlock.util.BackendUrlResolver
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlin.coroutines.resume

private enum class AppRootScreen {
    Splash,
    Home,
    Login,
    Student,
    Teacher,
    Exam,
    Result
}

class MainActivity : FragmentActivity() {

    private var isExamRunning = false
    private var increaseWarning: (() -> Unit)? = null
    private var onScreenCaptureAttempt: (() -> Unit)? = null
    private lateinit var examSecurity: ExamSecurityController
    private var pendingScreenCaptureStart: (() -> Unit)? = null
    private var screenSnapshotSender: ((String) -> Unit)? = null
    private var screenCaptureDeniedHandler: ((String) -> Unit)? = null

    private var showHomeScreen by mutableStateOf(true)
    private var initialSignupMode by mutableStateOf(false)

    private val requestCameraPermission =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { }
    private val requestAudioPermission =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { }

    private val requestPostNotificationsPermission =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { }

    private val requestScreenCapture =
        registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
            val onReady = pendingScreenCaptureStart
            pendingScreenCaptureStart = null

            val data = result.data
            Log.d("CHEATLOCK_FLOW", "MediaProjection result returned. Code: ${result.resultCode}, HasData: ${data != null}")

            if (result.resultCode != Activity.RESULT_OK || data == null) {
                Log.w("CHEATLOCK_FLOW", "MediaProjection consent denied by user or returned null data.")
                screenCaptureDeniedHandler?.invoke(
                    "Screen sharing was not allowed. Exam will continue with camera monitoring only."
                )
                runOnUiThread {
                    onReady?.invoke()
                }
                return@registerForActivityResult
            }

            Log.d("CHEATLOCK_FLOW", "MediaProjection consent granted. Starting ScreenCaptureService.")
            // Start the service immediately after consent to comply with Android 14+ FGS restrictions.
            runCatching {
                ScreenCaptureCallbacks.onSnapshot = { snapshot ->
                    runOnUiThread {
                        screenSnapshotSender?.invoke(snapshot)
                    }
                }
                ScreenCaptureService.startProjection(
                    context = this, // Use Activity context for more reliable startup on some OEMs
                    resultCode = result.resultCode,
                    resultData = data
                )
            }.onFailure { error ->
                Log.e("CHEATLOCK_FLOW", "Screen capture service start failed", error)
                ScreenCaptureCallbacks.onSnapshot = null
                runCatching { ScreenCaptureService.stop(this) }
                screenCaptureDeniedHandler?.invoke(
                    "Screen sharing unavailable. Exam will continue with camera monitoring only."
                )
            }
            
            // Re-apply FLAG_SECURE after system dialog is gone
            window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)

            // Allow a tiny window for the service to bind and show notification before UI transition
            window.decorView.postDelayed({
                onReady?.invoke()
            }, 300L) // Increased to 300ms for system dialog cleanup
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        Log.d("CHEATLOCK_FLOW", "MainActivity onCreate: App starting. Manufacturer: ${Build.MANUFACTURER}, Model: ${Build.MODEL}, OS: Android ${Build.VERSION.RELEASE} (API ${Build.VERSION.SDK_INT})")
        
        val isCrashRecovery = intent?.getBooleanExtra("crash_recovery", false) ?: false
        val crashDetails = intent?.getStringExtra("error_details").orEmpty()

        if (ContextCompat.checkSelfPermission(
                this,
                Manifest.permission.CAMERA
            ) != PackageManager.PERMISSION_GRANTED
        ) {
            Log.d("CHEATLOCK_FLOW", "MainActivity onCreate: Camera permission not granted, requesting.")
            requestCameraPermission.launch(Manifest.permission.CAMERA)
        } else {
            Log.d("CHEATLOCK_FLOW", "MainActivity onCreate: Camera permission already granted.")
        }
        if (ContextCompat.checkSelfPermission(
                this,
                Manifest.permission.RECORD_AUDIO
            ) != PackageManager.PERMISSION_GRANTED
        ) {
            Log.d("CHEATLOCK_FLOW", "MainActivity onCreate: Audio permission not granted, requesting.")
            requestAudioPermission.launch(Manifest.permission.RECORD_AUDIO)
        } else {
            Log.d("CHEATLOCK_FLOW", "MainActivity onCreate: Audio permission already granted.")
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(
                this,
                Manifest.permission.POST_NOTIFICATIONS
            ) != PackageManager.PERMISSION_GRANTED
        ) {
            Log.d("CHEATLOCK_FLOW", "MainActivity onCreate: Post-Notifications permission not granted, requesting.")
            requestPostNotificationsPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
        } else {
            Log.d("CHEATLOCK_FLOW", "MainActivity onCreate: Post-Notifications permission already granted or not applicable.")
        }
        super.onCreate(savedInstanceState)

        // Global Exception Logger and Recovery Handler
        Thread.setDefaultUncaughtExceptionHandler { thread, throwable ->
            Log.e("CHEATLOCK_FLOW", "Uncaught exception in thread ${thread.name}", throwable)
            try {
                val stackTrace = Log.getStackTraceString(throwable)
                val deviceModel = "${Build.MANUFACTURER} ${Build.MODEL}"
                val androidVersion = "Android ${Build.VERSION.RELEASE} (API ${Build.VERSION.SDK_INT})"
                val screenState = currentScreenState
                val errorReport = """
                    Activity/Fragment: MainActivity
                    Screen State: $screenState
                    Device Model: $deviceModel
                    Android Version: $androidVersion
                    Thread Name: ${thread.name}
                    
                    Stack Trace:
                    $stackTrace
                """.trimIndent()

                val intent = Intent(this, MainActivity::class.java).apply {
                    putExtra("crash_recovery", true)
                    putExtra("error_details", errorReport)
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
                }
                startActivity(intent)
            } catch (e: Exception) {
                Log.e("CHEATLOCK_FLOW", "Failed to launch crash recovery activity", e)
            } finally {
                android.os.Process.killProcess(android.os.Process.myPid())
                java.lang.System.exit(10)
            }
        }

        window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)

        runCatching { ProcessCameraProvider.getInstance(this) }

        examSecurity = ExamSecurityController(this) {
            runOnUiThread {
                if (isExamRunning) {
                    onScreenCaptureAttempt?.invoke()
                }
            }
        }

        setContent {
            var showCrashRecovery by remember { mutableStateOf(isCrashRecovery) }

            CheatLockTheme(darkTheme = true) {
                if (showCrashRecovery) {
                    CrashRecoveryScreen(
                        errorDetails = crashDetails,
                        onRetry = {
                            showCrashRecovery = false
                            val intent = Intent(this@MainActivity, MainActivity::class.java).apply {
                                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
                            }
                            startActivity(intent)
                        }
                    )
                } else {
                val scope = rememberCoroutineScope()
                val examStorage = remember { ExamStorage(this) }
                var apiBaseUrl by remember {
                    mutableStateOf(BackendUrlStore.effectiveUrl(this@MainActivity))
                }
                val mongoBackendRepository = remember(apiBaseUrl) {
                    MongoBackendRepository(this@MainActivity, apiBaseUrl)
                }

                var showSplashScreen by remember { mutableStateOf(true) }
                val biometricAuthManager = remember { BiometricAuthManager(this) }
                var isLoggedIn by remember { mutableStateOf(false) }
                var isAdminMode by remember { mutableStateOf(false) }
                var warningCount by remember { mutableStateOf(0) }
                var isExamSubmitted by remember { mutableStateOf(false) }
                var finalFaceWarnings by remember { mutableIntStateOf(0) }
                var audioWarnings by remember { mutableIntStateOf(0) }
                var phoneWarnings by remember { mutableIntStateOf(0) }
                var studentId by remember { mutableStateOf("") }
                var finalAnswers by remember { mutableStateOf(emptyList<StudentAnswer>()) }
                var gradedSubmission by remember { mutableStateOf<ExamSubmission?>(null) }
                var submissions by remember { 
                    mutableStateOf(runCatching { examStorage.getSubmissions() }.getOrDefault(emptyList())) 
                }
                var sessions by remember { mutableStateOf(emptyList<ExamSession>()) }
                var exams by remember { mutableStateOf(emptyList<Exam>()) }
                var activeExam by remember { mutableStateOf<Exam?>(null) }
                var studentAccount by remember { mutableStateOf<UserAccount?>(null) }
                var communityStudents by remember { mutableStateOf(emptyList<String>()) }
                var teacherClasses by remember { mutableStateOf(emptyList<TeacherClass>()) }
                var authMessage by remember { mutableStateOf<String?>(null) }
                var studentNotifications by remember {
                    mutableStateOf<List<StudentNotification>>(emptyList())
                }

                fun recordSecurityWarning(alertMessage: String) {
                    warningCount += 1
                    activeExam?.id?.let { examId ->
                        if (studentId.isNotBlank()) {
                            val totalWarnings =
                                warningCount + finalFaceWarnings + audioWarnings + phoneWarnings
                            val score = (totalWarnings * 20).coerceIn(0, 100)
                            scope.launch {
                                runCatching {
                                    mongoBackendRepository.sendProctoringEvent(
                                        ProctoringEventRequest(
                                            eventName = "suspicion_score_updated",
                                            examId = examId,
                                            suspicionScore = score
                                        )
                                    )
                                    mongoBackendRepository.sendProctoringEvent(
                                        ProctoringEventRequest(
                                            eventName = "ai_alert_created",
                                            examId = examId,
                                            latestAlert = alertMessage
                                        )
                                    )
                                }
                            }
                        }
                    }
                }

                increaseWarning = {
                    recordSecurityWarning("Student switched away from the exam app.")
                }

                onScreenCaptureAttempt = {
                    recordSecurityWarning(
                        "Screenshot or screen recording was blocked and logged."
                    )
                }

                fun verifyBiometricThenContinue(
                    title: String,
                    subtitle: String,
                    onVerified: () -> Unit
                ) {
                    if (!biometricAuthManager.canAuthenticate()) {
                        authMessage =
                            "Set up face unlock, fingerprint, or screen lock on this device first."
                        return
                    }

                    biometricAuthManager.authenticate(
                        title = title,
                        subtitle = subtitle,
                        onSuccess = {
                            authMessage = null
                            onVerified()
                        },
                        onError = { error ->
                            authMessage = error
                        }
                    )
                }

                fun sendPreviewSnapshot(snapshot: String, latestAlert: String? = null) {
                    val examId = activeExam?.id
                    Log.d("RUNTIME_TRACE", "[Step 3] MainActivity: sendPreviewSnapshot. Event: camera_preview_updated. examId: $examId, studentId: $studentId. Payload size: ${snapshot.length}. Timestamp: ${System.currentTimeMillis()}")
                    examId?.let { id ->
                        scope.launch {
                            runCatching {
                                mongoBackendRepository.sendProctoringEvent(
                                    ProctoringEventRequest(
                                        eventName = "camera_preview_updated",
                                        examId = id,
                                        latestAlert = latestAlert,
                                        previewBase64 = snapshot
                                    )
                                )
                            }
                        }
                    }
                }

                suspend fun awaitScreenCaptureConsent() {
                    Log.d("CHEATLOCK_FLOW", "awaitScreenCaptureConsent: Initiating Screen Capture Dialog.")
                    suspendCancellableCoroutine { continuation ->
                        pendingScreenCaptureStart = {
                            if (continuation.isActive) {
                                continuation.resume(Unit)
                            }
                        }
                        screenSnapshotSender = { snapshot ->
                            sendPreviewSnapshot(
                                snapshot = snapshot,
                                latestAlert = "Student screen preview updated."
                            )
                        }
                        screenCaptureDeniedHandler = { message ->
                            authMessage = message
                        }

                        continuation.invokeOnCancellation {
                            pendingScreenCaptureStart = null
                        }

                        val projectionManager = getSystemService(MediaProjectionManager::class.java)
                        if (projectionManager == null) {
                            Log.e("CHEATLOCK_FLOW", "awaitScreenCaptureConsent: MediaProjectionManager is not available on this device.")
                            pendingScreenCaptureStart = null
                            authMessage = "Screen sharing is not supported on this device."
                            if (continuation.isActive) {
                                continuation.resume(Unit)
                            }
                            return@suspendCancellableCoroutine
                        }

                        runCatching {
                            // Transient FLAG_SECURE fix for OEM process kills (Oppo/Vivo/Realme)
                            window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
                            Log.d("CHEATLOCK_FLOW", "awaitScreenCaptureConsent: Launching MediaProjection request intent.")
                            requestScreenCapture.launch(projectionManager.createScreenCaptureIntent())
                        }.onFailure { error ->
                            Log.e("CHEATLOCK_FLOW", "Could not launch screen capture consent", error)
                            
                            // Re-apply if failed
                            window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)

                            pendingScreenCaptureStart = null
                            authMessage =
                                "Could not request screen sharing. Exam will continue with camera monitoring only."
                            if (continuation.isActive) {
                                continuation.resume(Unit)
                            }
                        }
                    }
                }

                suspend fun releaseCameraForExamTransition() {
                    Log.d("CHEATLOCK_FLOW", "releaseCameraForExamTransition: Releasing camera hardware.")
                    delay(100)
                    suspendCancellableCoroutine { continuation ->
                        runCatching {
                            val cameraProviderFuture = ProcessCameraProvider.getInstance(this@MainActivity)
                            cameraProviderFuture.addListener(
                                {
                                    runCatching { 
                                        val provider = cameraProviderFuture.get()
                                        provider.unbindAll() 
                                        Log.d("CHEATLOCK_FLOW", "releaseCameraForExamTransition: Camera hardware released successfully.")
                                    }.onFailure {
                                        Log.e("CHEATLOCK_FLOW", "releaseCameraForExamTransition: Error getting camera provider inside listener", it)
                                    }
                                    if (continuation.isActive) {
                                        continuation.resume(Unit)
                                    }
                                },
                                ContextCompat.getMainExecutor(this@MainActivity)
                            )
                        }.onFailure { error ->
                            Log.e("CHEATLOCK_FLOW", "releaseCameraForExamTransition: Failed to obtain camera provider instance", error)
                            if (continuation.isActive) {
                                continuation.resume(Unit)
                            }
                        }
                    }
                    // Crucial delay to ensure hardware is released before next request
                    delay(800)
                }

                suspend fun refreshTeacherDashboard() {
                    submissions = mongoBackendRepository.getSubmissions()
                    sessions = mongoBackendRepository.getSessions()
                    exams = mongoBackendRepository.getExams()
                    communityStudents = mongoBackendRepository.getCommunity()
                    teacherClasses = mongoBackendRepository.getClasses()
                }

                LaunchedEffect(studentAccount?.identifier) {
                    val accountId = studentAccount?.identifier?.trim().orEmpty()
                    if (accountId.isBlank()) return@LaunchedEffect
                    while (true) {
                        runCatching {
                            val pending = mongoBackendRepository.getPendingNotifications(accountId)
                            if (pending.isNotEmpty()) {
                                studentNotifications = pending + studentNotifications
                                    .filter { existing -> pending.none { it.id == existing.id } }
                                    .take(20)
                                pending.forEach { notification ->
                                    StudentNotificationHelper.show(this@MainActivity, notification)
                                    mongoBackendRepository.markNotificationRead(
                                        accountId,
                                        notification.id
                                    )
                                }
                            }
                        }
                        delay(20_000)
                    }
                }

                LaunchedEffect(isExamSubmitted, activeExam?.id, studentId, gradedSubmission?.grade) {
                    val examId = activeExam?.id ?: return@LaunchedEffect
                    if (!isExamSubmitted || studentId.isBlank() || gradedSubmission?.grade != null) {
                        return@LaunchedEffect
                    }
                    while (gradedSubmission?.grade == null) {
                        runCatching {
                            mongoBackendRepository.getSubmissionGrade(studentId, examId)
                        }.onSuccess { submission ->
                            if (submission.grade != null) {
                                gradedSubmission = submission
                                authMessage = "Success: Your exam has been graded!"
                            }
                        }
                        delay(10000)
                    }
                }

                val rootScreen = when {
                    showSplashScreen -> AppRootScreen.Splash
                    isAdminMode -> AppRootScreen.Teacher
                    isExamSubmitted -> AppRootScreen.Result
                    isLoggedIn -> AppRootScreen.Exam
                    studentAccount != null -> AppRootScreen.Student
                    showHomeScreen -> AppRootScreen.Home
                    else -> AppRootScreen.Login
                }

                LaunchedEffect(rootScreen, isLoggedIn, isExamSubmitted) {
                    currentScreenState = rootScreen.name
                    Log.d("CHEATLOCK_FLOW", "Navigation transition to screen: ${rootScreen.name}")

                    val secureExamActive =
                        rootScreen == AppRootScreen.Exam ||
                            (isLoggedIn && !isExamSubmitted && activeExam != null)
                    examSecurity.setEnabled(secureExamActive)
                }

                AnimatedContent(
                    targetState = rootScreen,
                    transitionSpec = { cheatLockScreenTransition() },
                    modifier = Modifier.fillMaxSize(),
                    label = "app-root-screen"
                ) { screen ->
                    when (screen) {
                        AppRootScreen.Splash -> {
                            isExamRunning = false
                            SplashScreen(
                                initialUrl = apiBaseUrl,
                                onProbingComplete = { resolvedUrl, user ->
                                    if (resolvedUrl != apiBaseUrl) {
                                        apiBaseUrl = resolvedUrl
                                        BackendUrlStore.setCustomUrl(this@MainActivity, resolvedUrl)
                                    }
                                    
                                    if (user != null) {
                                        studentId = user.identifier
                                        studentAccount = user
                                        isLoggedIn = false // Will be set to true if they enter an exam
                                        
                                        if (user.role == UserRole.TEACHER) {
                                            isAdminMode = true
                                            scope.launch { runCatching { refreshTeacherDashboard() } }
                                        }
                                    }
                                    
                                    showSplashScreen = false
                                },
                                onValidateSession = { url ->
                                    MongoBackendRepository(this@MainActivity, url).validateSession()
                                }
                            )
                        }

                        AppRootScreen.Home -> {
                            isExamRunning = false
                            HomeScreen(
                                onNavigateToLogin = {
                                    initialSignupMode = false
                                    showHomeScreen = false
                                },
                                onNavigateToSignup = {
                                    initialSignupMode = true
                                    showHomeScreen = false
                                },
                                onPurchasePlan = { planName ->
                                    // Subscription logic can be handled here or inside HomeScreen
                                    // For now, redirecting to signup to process user details
                                    initialSignupMode = true
                                    showHomeScreen = false
                                }
                            )
                        }

                        AppRootScreen.Teacher -> {
                    isExamRunning = false
                    AdminDashboardScreen(
                        account = studentAccount ?: UserAccount(name = "Faculty", identifier = "ADMIN", password = "", role = com.jubayer.cheatlock.model.UserRole.TEACHER),
                        submissions = submissions,
                        sessions = sessions,
                        exams = exams,
                        communityStudents = communityStudents,
                        teacherClasses = teacherClasses,
                        onCreateExam = { exam ->
                            var createdResult: Exam? = null
                            scope.launch {
                                try {
                                    val created = mongoBackendRepository.createExam(exam)
                                    // Refresh list so UI reflects the created exam immediately.
                                    exams = mongoBackendRepository.getExams()
                                    createdResult = created
                                } catch (e: Exception) {
                                    authMessage = e.message ?: "Failed to create exam."
                                }
                            }
                            createdResult ?: exam
                        },
                        onUpdateExamLifecycle = { examId, action ->
                            scope.launch {
                                try {
                                    mongoBackendRepository.updateExamLifecycle(examId, action)
                                    exams = mongoBackendRepository.getExams()
                                } catch (e: Exception) {
                                    authMessage = e.message ?: "Failed to update exam status."
                                }
                            }
                        },
                        onAssignStudentsToExam = { examId, studentIds ->
                            scope.launch {
                                try {
                                    mongoBackendRepository.assignStudentsToExam(examId, studentIds)
                                    exams = mongoBackendRepository.getExams()
                                } catch (e: Exception) {
                                    authMessage = e.message ?: "Failed to assign students."
                                }
                            }
                        },
                        onSaveCommunity = { students ->
                            scope.launch {
                                try {
                                    communityStudents = mongoBackendRepository.updateCommunity(students)
                                } catch (e: Exception) {
                                    authMessage = e.message ?: "Failed to update community."
                                }
                            }
                        },
                        onSaveClass = { classRecord ->
                            scope.launch {
                                try {
                                    if (classRecord.id.isNullOrBlank()) {
                                        mongoBackendRepository.createClass(classRecord)
                                    } else {
                                        mongoBackendRepository.updateClass(classRecord)
                                    }
                                    teacherClasses = mongoBackendRepository.getClasses()
                                } catch (e: Exception) {
                                    authMessage = e.message ?: "Failed to save class."
                                }
                            }
                        },
                        onDeleteClass = { classId ->
                            scope.launch {
                                try {
                                    mongoBackendRepository.deleteClass(classId)
                                    teacherClasses = mongoBackendRepository.getClasses()
                                } catch (e: Exception) {
                                    authMessage = e.message ?: "Failed to delete class."
                                }
                            }
                        },
                        onClearReports = {
                            scope.launch {
                                runCatching {
                                    mongoBackendRepository.clearSubmissions()
                                }
                                submissions = emptyList()
                                examStorage.clearSubmissions()
                            }
                        },
                        onResetAttempt = { studentId, examId ->
                            scope.launch {
                                runCatching {
                                    mongoBackendRepository.resetSession(studentId, examId)
                                    sessions = mongoBackendRepository.getSessions()
                                }
                            }
                        },
                        onLogout = {
                            // Stop any background monitoring
                            stopScreenCapture()

                            // Clear backend session
                            mongoBackendRepository.logout()

                            // Reset all teacher / exam state so we return
                            // to a clean login screen instead of exiting.
                            isExamRunning = false
                            isAdminMode = false
                            isLoggedIn = false
                            isExamSubmitted = false
                            studentAccount = null
                            activeExam = null
                            studentId = ""
                            finalAnswers = emptyList()
                            gradedSubmission = null
                            warningCount = 0
                            finalFaceWarnings = 0
                            audioWarnings = 0
                            phoneWarnings = 0
                            submissions = emptyList()
                            sessions = emptyList()
                            exams = emptyList()
                            communityStudents = emptyList()
                            teacherClasses = emptyList()
                            authMessage = null
                            examStorage.clearExam()
                            showHomeScreen = true
                        },
                        onGetExamOverview = { examId ->
                            mongoBackendRepository.getExamAttendanceOverview(examId)
                        },
                        onGetExamSubmissions = { examId ->
                            mongoBackendRepository.getExamSubmissions(examId)
                        },
                        onGradeSubmission = { examId, studentId, grade, feedback ->
                            mongoBackendRepository.gradeExamSubmission(
                                examId,
                                studentId,
                                grade,
                                feedback
                            )
                        },
                        onDecideEnrollment = { classId, studentId, decision ->
                            scope.launch {
                                try {
                                    mongoBackendRepository.decideClassEnrollment(classId, studentId, decision)
                                    teacherClasses = mongoBackendRepository.getClasses()
                                } catch (e: Exception) {
                                    authMessage = e.message ?: "Failed to process enrollment request."
                                }
                            }
                        },
                        onUpdateProfile = { newName, newId ->
                            // Update local and potential backend profile
                            // For now, updating local account reference
                            studentAccount = studentAccount?.copy(name = newName, identifier = newId)
                        },
                        onHasFaceProfile = {
                            mongoBackendRepository.hasFaceProfile()
                        },
                        onRefresh = { refreshTeacherDashboard() }
                    )
                        }

                        AppRootScreen.Result -> {
                    isExamRunning = false
                    BackHandler {
                        isExamSubmitted = false
                        gradedSubmission = null
                        activeExam = null
                        authMessage = null
                    }
                    ResultScreen(
                        studentId = studentId,
                        appSwitchWarnings = warningCount,
                        faceMissingWarnings = finalFaceWarnings,
                        audioWarnings = audioWarnings,
                        phoneWarnings = phoneWarnings,
                        grade = gradedSubmission?.grade,
                        feedback = gradedSubmission?.feedback,
                        gradedAt = gradedSubmission?.gradedAt,
                        answers = finalAnswers,
                        onBackToLogin = {
                            stopScreenCapture()
                            mongoBackendRepository.logout()
                            isLoggedIn = false
                            isAdminMode = false
                            isExamRunning = false
                            studentAccount = null
                            isExamSubmitted = false
                            studentId = ""
                            finalAnswers = emptyList()
                            gradedSubmission = null
                            warningCount = 0
                            finalFaceWarnings = 0
                            audioWarnings = 0
                            phoneWarnings = 0
                            examStorage.clearExam()
                            showHomeScreen = true
                        }
                    )
                        }

                        AppRootScreen.Exam -> {
                    isExamRunning = true

                    ExamScreen(
                        studentId = studentId,
                        exam = activeExam ?: fallbackExam(studentId),
                        warningCount = warningCount,
                        onFaceWarningsChanged = { count ->
                            finalFaceWarnings = count
                            activeExam?.id?.let { examId ->
                                val totalWarnings = warningCount + count + audioWarnings + phoneWarnings
                                val score = (totalWarnings * 20).coerceIn(0, 100)
                                scope.launch {
                                    runCatching {
                                        mongoBackendRepository.sendProctoringEvent(
                                            ProctoringEventRequest(
                                                eventName = "suspicion_score_updated",
                                                examId = examId,
                                                suspicionScore = score
                                            )
                                        )
                                        if (count > 0) {
                                            mongoBackendRepository.sendProctoringEvent(
                                                ProctoringEventRequest(
                                                    eventName = "ai_alert_created",
                                                    examId = examId,
                                                    latestAlert = "Face not detected in camera preview."
                                                )
                                            )
                                        }
                                    }
                                }
                            }
                        },
                        onCameraPreviewChanged = { snapshot ->
                            sendPreviewSnapshot(snapshot)
                        },
                        onPhoneDetected = { labels ->
                            phoneWarnings++
                            activeExam?.id?.let { examId ->
                                val totalWarnings = warningCount + finalFaceWarnings + audioWarnings + phoneWarnings
                                val score = (totalWarnings * 20).coerceIn(0, 100)
                                scope.launch {
                                    runCatching {
                                        mongoBackendRepository.sendProctoringEvent(
                                            ProctoringEventRequest(
                                                eventName = "suspicion_score_updated",
                                                examId = examId,
                                                suspicionScore = score
                                            )
                                        )
                                        mongoBackendRepository.sendProctoringEvent(
                                            ProctoringEventRequest(
                                                eventName = "ai_alert_created",
                                                examId = examId,
                                                latestAlert = "Possible $labels detected in camera view."
                                            )
                                        )
                                    }
                                }
                            }
                        },
                        onAudioWarning = {
                            audioWarnings++
                            activeExam?.id?.let { examId ->
                                val totalWarnings = warningCount + finalFaceWarnings + audioWarnings + phoneWarnings
                                val score = (totalWarnings * 20).coerceIn(0, 100)
                                scope.launch {
                                    runCatching {
                                        mongoBackendRepository.sendProctoringEvent(
                                            ProctoringEventRequest(
                                                eventName = "suspicion_score_updated",
                                                examId = examId,
                                                suspicionScore = score
                                            )
                                        )
                                        mongoBackendRepository.sendProctoringEvent(
                                            ProctoringEventRequest(
                                                eventName = "ai_alert_created",
                                                examId = examId,
                                                latestAlert = "High ambient noise detected."
                                            )
                                        )
                                    }
                                }
                            }
                        },
                        onSubmitExam = { submission ->
                            val resolvedExamId = submission.examId ?: activeExam?.id
                            val resolvedStudentId = submission.studentId.ifBlank {
                                studentAccount?.identifier.orEmpty()
                            }
                            val payload = submission.copy(
                                examId = resolvedExamId,
                                studentId = resolvedStudentId
                            )
                            examStorage.saveSubmission(payload)
                            scope.launch {
                                runCatching {
                                    mongoBackendRepository.saveSubmission(payload)
                                }.onFailure { error ->
                                    authMessage = error.message
                                }
                            }
                        },
                        onFinishExam = { answers, reason ->
                            stopScreenCapture()
                            isExamRunning = false

                            finalAnswers = answers
                            val resolvedExamId = activeExam?.id
                            val resolvedStudentId = studentId.ifBlank {
                                studentAccount?.identifier.orEmpty()
                            }
                            val submission = createSubmission(
                                studentId = resolvedStudentId,
                                examId = resolvedExamId,
                                answers = answers,
                                appSwitchWarnings = warningCount,
                                faceMissingWarnings = finalFaceWarnings,
                                audioWarnings = audioWarnings,
                                phoneWarnings = phoneWarnings
                            )
                            examStorage.saveSubmission(submission)
                            val localSessionStatus = if (reason == ExamFinishReason.LOCKED) {
                                ExamSessionStatus.LOCKED
                            } else {
                                ExamSessionStatus.SUBMITTED
                            }
                            examStorage.saveSession(
                                ExamSession(
                                    studentId = studentId,
                                    status = localSessionStatus,
                                    submittedAt = if (localSessionStatus == ExamSessionStatus.SUBMITTED) System.currentTimeMillis() else null,
                                    lockedAt = if (localSessionStatus == ExamSessionStatus.LOCKED) System.currentTimeMillis() else null,
                                    lockReason = if (localSessionStatus == ExamSessionStatus.LOCKED) "Too many warning activities were detected." else null
                                )
                            )
                            submissions = examStorage.getSubmissions()
                            examStorage.clearExam()

                            scope.launch {
                                runCatching {
                                    val examId = resolvedExamId ?: submission.examId
                                    mongoBackendRepository.saveSubmission(submission)
                                    if (reason == ExamFinishReason.LOCKED) {
                                        mongoBackendRepository.lockSession(
                                            reason = "Too many warning activities were detected.",
                                            examId = examId
                                        )
                                    } else {
                                        mongoBackendRepository.submitSession(examId)
                                    }
                                }.onFailure { error ->
                                    authMessage = error.message
                                }
                            }

                            isLoggedIn = false
                            isExamSubmitted = true
                        }
                    )
                        }

                        AppRootScreen.Student -> {
                    isExamRunning = false
                    val currentAccount = studentAccount
                    if (currentAccount != null) {
                        StudentDashboardScreen(
                            account = currentAccount,
                            onOpenExamByCode = { code ->
                                if (!mongoBackendRepository.hasAuthToken()) {
                                    error("Please log in again with your backend student account.")
                                }
                                mongoBackendRepository.getExamByCode(code)
                            },
                            onHasFaceProfile = {
                                mongoBackendRepository.hasFaceProfile()
                            },
                            onEnrollFace = { descriptor, snapshot ->
                                mongoBackendRepository.enrollFaceProfile(descriptor, snapshot)
                            },
                            onVerifyFace = { descriptor ->
                                mongoBackendRepository.verifyFaceProfile(descriptor)
                            },
                            onJoinClass = { inviteCode ->
                                mongoBackendRepository.joinClass(inviteCode)
                            },
                            onStartExam = { exam ->
                                val account = studentAccount ?: throw Exception("Please log in again.")
                                val examId = exam.id?.trim().orEmpty()
                                if (examId.isBlank()) {
                                    throw Exception("Could not resolve this exam. Enter the exam code again and retry.")
                                }

                                val session = runCatching {
                                    mongoBackendRepository.getMySession(examId)
                                }.getOrNull()

                                when (session?.status) {
                                    ExamSessionStatus.SUBMITTED -> {
                                        throw Exception("This exam is already submitted. Ask your teacher to reset it.")
                                    }

                                    ExamSessionStatus.LOCKED -> {
                                        throw Exception("This exam is locked. Ask your teacher to reset it.")
                                    }

                                    else -> {
                                        try {
                                            // 1. Connection Health Check
                                            if (!mongoBackendRepository.checkHealth()) {
                                                throw Exception("Network Issue: Cannot reach CheatLock server. Check your internet.")
                                            }

                                            activeExam = exam
                                            
                                            // 2. Safe Hardware Release
                                            runCatching { releaseCameraForExamTransition() }
                                                .onFailure { Log.w("MainActivity", "Camera release soft-failure", it) }
                                            
                                            // 3. Request Consent
                                            awaitScreenCaptureConsent()
                                            
                                            // 4. Start Session
                                            val startedSession = runCatching {
                                                mongoBackendRepository.startSession(examId)
                                            }.getOrElse { error ->
                                                Log.e("MainActivity", "Failed to start session", error)
                                                // If session fails, it might be due to an existing one. We allow the student to join.
                                                runCatching { mongoBackendRepository.getMySession(examId) }.getOrNull()
                                                    ?: throw Exception("Exam Startup Error: ${error.message ?: "Server unreachable"}")
                                            }
                                            
                                            examStorage.saveSession(startedSession)
                                            
                                            runCatching {
                                                mongoBackendRepository.sendProctoringEvent(
                                                    ProctoringEventRequest(
                                                        eventName = "student_joined_exam",
                                                        examId = examId
                                                    )
                                                )
                                            }
                                            
                                            authMessage = null
                                            studentId = account.identifier
                                            warningCount = 0
                                            finalFaceWarnings = 0
                                            finalAnswers = emptyList()
                                            isExamSubmitted = false
                                            isAdminMode = false
                                            isLoggedIn = true
                                        } catch (error: Exception) {
                                            Log.e("MainActivity", "Global exam startup failure", error)
                                            stopScreenCapture()
                                            activeExam = null
                                            examSecurity.setEnabled(false)
                                            authMessage = error.message ?: "An unexpected error occurred during startup."
                                            throw error // Re-throw so StudentDashboardScreen can catch it
                                        }
                                    }
                                }
                            },
                            onLogout = {
                                // Stop any background monitoring
                                stopScreenCapture()

                                // Clear backend session
                                mongoBackendRepository.logout()

                                // Reset all student / exam state and show login instead of exiting.
                                isExamRunning = false
                                isLoggedIn = false
                                isAdminMode = false
                                isExamSubmitted = false
                                studentAccount = null
                                activeExam = null
                                studentId = ""
                                finalAnswers = emptyList()
                                gradedSubmission = null
                                warningCount = 0
                                finalFaceWarnings = 0
                                audioWarnings = 0
                                phoneWarnings = 0
                                authMessage = null
                                examStorage.clearExam()
                                showHomeScreen = true
                            },
                            onUpdateProfile = { newName, newId ->
                                studentAccount = studentAccount?.copy(name = newName, identifier = newId)
                            },
                            externalMessage = authMessage,
                            recentNotifications = studentNotifications
                        )
                    }
                        }

                        AppRootScreen.Login -> {
                    isExamRunning = false
                    LoginScreen(
                        serverUrl = apiBaseUrl,
                        configuredServerUrl = BackendUrlStore.configuredUrl(this@MainActivity),
                        initialSignupMode = initialSignupMode,
                        onBackToHome = { showHomeScreen = true },
                        onServerUrlSave = { url ->
                            BackendUrlStore.setCustomUrl(this@MainActivity, url)
                            apiBaseUrl = BackendUrlResolver.resolve(url)
                        },
                        onTestServerConnection = { url ->
                            BackendConnectionProbe.testUrl(url)
                        },
                        onLogin = { identifier, password, role ->
                            mongoBackendRepository.login(identifier, password, role)
                        },
                        onSignup = { account ->
                            mongoBackendRepository.signup(account)
                        },
                        onSignupSuccess = { account ->
                            if (account.role == com.jubayer.cheatlock.model.UserRole.STUDENT) {
                                studentAccount = account
                                authMessage = "Success: Account created. Welcome to Student Command!"
                            } else {
                                verifyBiometricThenContinue(
                                    title = "Verify Teacher",
                                    subtitle = "Use face unlock or device biometric to open reports."
                                ) {
                                    try {
                                        if (!mongoBackendRepository.hasAuthToken()) {
                                            authMessage = "Account created. Please log in again."
                                            return@verifyBiometricThenContinue
                                        }
                                        studentAccount = account
                                        isLoggedIn = false
                                        isAdminMode = true
                                        scope.launch { runCatching { refreshTeacherDashboard() } }
                                    } catch (t: Throwable) {
                                        Log.e("MainActivity", "Teacher signup biometric callback failed", t)
                                        authMessage = "Verification error: ${t.message ?: t.toString()}"
                                    }
                                }
                            }
                        },
                        onStudentLogin = { account ->
                            studentAccount = account
                            authMessage = null
                        },
                        onTeacherLogin = { account ->
                            verifyBiometricThenContinue(
                                title = "Verify Teacher",
                                subtitle = "Use face unlock or device biometric to open reports."
                            ) {
                                try {
                                    // Save the teacher account for profile display
                                    studentAccount = account
                                    isLoggedIn = false
                                    
                                    // Load local state first for immediate UI
                                    runCatching {
                                        submissions = examStorage.getSubmissions()
                                        sessions = examStorage.getSessions()
                                    }

                                    // Enter admin mode
                                    isAdminMode = true
                                    
                                    // Fetch fresh data from backend
                                    scope.launch {
                                        runCatching { refreshTeacherDashboard() }
                                            .onFailure { t ->
                                                Log.e("MainActivity", "Initial teacher data fetch failed", t)
                                            }
                                    }
                                } catch (t: Throwable) {
                                    Log.e("MainActivity", "Teacher login biometric callback failed", t)
                                    authMessage = "Verification error: ${t.message ?: t.toString()}"
                                }
                            }
                        },
                        externalMessage = authMessage
                    )
                        }
                    }
                }
            }
        }
    }
}

    override fun onResume() {
        super.onResume()
        if (isExamRunning) {
            examSecurity.reapplyIfActive()
        }
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus && isExamRunning) {
            examSecurity.reapplyIfActive()
        }
    }

    override fun onPause() {
        super.onPause()

        if (isExamRunning) {
            increaseWarning?.invoke()
        }
    }

    override fun onUserLeaveHint() {
        super.onUserLeaveHint()
        if (isExamRunning) {
            increaseWarning?.invoke()
        }
    }

    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        if (isExamRunning && event.action == KeyEvent.ACTION_DOWN && isBlockedExamKey(event)) {
            increaseWarning?.invoke()
            return true
        }
        return super.dispatchKeyEvent(event)
    }

    override fun onDestroy() {
        if (::examSecurity.isInitialized) {
            examSecurity.setEnabled(false)
        }
        stopScreenCapture()
        super.onDestroy()
    }

    private fun stopScreenCapture() {
        ScreenCaptureCallbacks.onSnapshot = null
        runCatching { ScreenCaptureService.stop(applicationContext) }
    }

    private fun isBlockedExamKey(event: KeyEvent): Boolean {
        if (event.isCtrlPressed || event.isAltPressed || event.isMetaPressed) {
            return true
        }

        return when (event.keyCode) {
            KeyEvent.KEYCODE_BACK,
            KeyEvent.KEYCODE_APP_SWITCH,
            KeyEvent.KEYCODE_ESCAPE,
            KeyEvent.KEYCODE_MOVE_HOME,
            KeyEvent.KEYCODE_SEARCH,
            KeyEvent.KEYCODE_SYSRQ -> true
            else -> false
        }
    }

    private fun createSubmission(
        studentId: String,
        examId: String?,
        answers: List<StudentAnswer>,
        appSwitchWarnings: Int,
        faceMissingWarnings: Int,
        audioWarnings: Int,
        phoneWarnings: Int
    ): ExamSubmission {
        val totalWarnings = appSwitchWarnings + faceMissingWarnings + audioWarnings + phoneWarnings
        val riskLevel = when {
            totalWarnings >= 5 -> "High Risk"
            totalWarnings >= 3 -> "Medium Risk"
            else -> "Low Risk"
        }

        return ExamSubmission(
            examId = examId,
            studentId = studentId,
            answers = answers,
            appSwitchWarnings = appSwitchWarnings,
            faceMissingWarnings = faceMissingWarnings,
            audioWarnings = audioWarnings,
            phoneWarnings = phoneWarnings,
            totalWarnings = totalWarnings,
            riskLevel = riskLevel,
            submittedAt = System.currentTimeMillis()
        )
    }

    companion object {
        private const val TAG = "MainActivity"
        var currentScreenState: String = "Splash"
    }

    private fun fallbackExam(studentId: String): Exam {
        return Exam(
            title = "CheatLock Demo Exam",
            durationMinutes = 10,
            lockAnswers = true,
            questions = listOf(
                ExamQuestion(text = "Explain the difference between RAM and ROM."),
                ExamQuestion(text = "What is an operating system?"),
                ExamQuestion(text = "What is the purpose of a database?")
            ),
            assignedStudents = listOf(studentId)
        )
    }
}
