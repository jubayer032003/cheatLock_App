package com.jubayer.cheatlock

import android.app.Activity
import android.annotation.SuppressLint
import android.content.Intent
import android.net.Uri
import com.jubayer.cheatlock.ui.CrashRecoveryScreen
import com.jubayer.cheatlock.util.CrashSupportCode
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.util.Log
import android.view.KeyEvent
import android.view.WindowManager
import android.widget.Toast
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.compose.animation.AnimatedContent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
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
import com.jubayer.cheatlock.proctoring.MonitoringSnapshotSource
import com.jubayer.cheatlock.data.SelfExamStorage
import com.jubayer.cheatlock.model.Exam
import com.jubayer.cheatlock.model.ExamQuestion
import com.jubayer.cheatlock.model.ExamAttemptKey
import com.jubayer.cheatlock.model.MonitoringControl
import com.jubayer.cheatlock.model.monitoringControl
import com.jubayer.cheatlock.data.BackendRequestException
import com.jubayer.cheatlock.model.ExamSubmission
import com.jubayer.cheatlock.model.StudentAnswer
import com.jubayer.cheatlock.model.ExamSession
import com.jubayer.cheatlock.model.ExamSessionStatus
import com.jubayer.cheatlock.model.ExamFinishReason
import com.jubayer.cheatlock.model.ExamStatus
import com.jubayer.cheatlock.model.QuestionType
import com.jubayer.cheatlock.model.TeacherExamStartupProblem
import com.jubayer.cheatlock.model.teacherExamStartupIssue
import com.jubayer.cheatlock.model.TeacherClass
import com.jubayer.cheatlock.model.UserAccount
import com.jubayer.cheatlock.model.UserRole
import com.jubayer.cheatlock.proctoring.ScreenCaptureCallbacks
import com.jubayer.cheatlock.proctoring.ScreenCaptureService
import com.jubayer.cheatlock.model.StudentNotification
import com.jubayer.cheatlock.model.SelfExamPayloadResponse
import com.jubayer.cheatlock.model.SelfExamResultResponse
import com.jubayer.cheatlock.notifications.StudentNotificationHelper
import com.jubayer.cheatlock.security.ExamSecurityController
import com.jubayer.cheatlock.ui.AdminDashboardScreen
import com.jubayer.cheatlock.ui.AppUiPreferences
import com.jubayer.cheatlock.ui.HomeScreen
import com.jubayer.cheatlock.ui.SelfExamResultScreen
import com.jubayer.cheatlock.ui.SelfExamSetupScreen
import com.jubayer.cheatlock.ui.cheatLockScreenTransition
import com.jubayer.cheatlock.ui.cheatLockSplashTransition
import com.jubayer.cheatlock.util.BackendConnectionProbe
import com.jubayer.cheatlock.util.BackendUrlStore
import com.jubayer.cheatlock.util.SuspicionScoreCalculator
import com.jubayer.cheatlock.util.AuthoritativeScoreReconciler
import com.jubayer.cheatlock.util.ScoreAttempt
import android.media.projection.MediaProjectionManager
import androidx.camera.lifecycle.ProcessCameraProvider
import com.jubayer.cheatlock.util.BackendUrlResolver
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import java.util.UUID
import kotlin.coroutines.resume

private enum class AppRootScreen {
    Splash,
    Home,
    Login,
    Student,
    Teacher,
    Exam,
    Result,
    SelfExamSetup,
    SelfExamResult
}

private fun AppRootScreen.motionOrder(): Int = when (this) {
    AppRootScreen.Splash -> 0
    AppRootScreen.Home -> 1
    AppRootScreen.Login -> 2
    AppRootScreen.Student -> 3
    AppRootScreen.Teacher -> 3
    AppRootScreen.SelfExamSetup -> 4
    AppRootScreen.Exam -> 5
    AppRootScreen.SelfExamResult -> 6
    AppRootScreen.Result -> 6
}

class MainActivity : FragmentActivity() {

    private var isExamRunning = false
    private var isExamFinishing = false
    private var increaseWarning: (() -> Unit)? = null
    private var onScreenCaptureAttempt: (() -> Unit)? = null
    private lateinit var examSecurity: ExamSecurityController
    private var pendingScreenCaptureStart: (() -> Unit)? = null
    @Volatile
    private var screenSnapshotSender: ((String, Long) -> Unit)? = null
    private var screenCaptureDeniedHandler: ((String) -> Unit)? = null
    private var pendingMonitoringPermissionResult: ((Boolean) -> Unit)? = null

    private var showHomeScreen by mutableStateOf(true)
    private var initialSignupMode by mutableStateOf(false)

    private val requestMonitoringPermissions =
        registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { results ->
            val cameraGranted = results[Manifest.permission.CAMERA]
                ?: (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED)
            pendingMonitoringPermissionResult?.invoke(cameraGranted)
            pendingMonitoringPermissionResult = null
            if (!cameraGranted) {
                Toast.makeText(this, "Camera access is required for identity and face-presence checks in proctored exams.", Toast.LENGTH_LONG).show()
            } else if (results[Manifest.permission.RECORD_AUDIO] == false) {
                Toast.makeText(this, "Microphone access is required for voice-activity detection in proctored exams.", Toast.LENGTH_LONG).show()
            }
        }

    private val requestScreenCapture =
        registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
            val onReady = pendingScreenCaptureStart
            pendingScreenCaptureStart = null

            if (onReady == null) {
                window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
                return@registerForActivityResult
            }
            val data = result.data
            Log.d("CHEATLOCK_FLOW", "MediaProjection result returned. Code: ${result.resultCode}, HasData: ${data != null}")

            if (result.resultCode != Activity.RESULT_OK || data == null) {
                Log.w("CHEATLOCK_FLOW", "MediaProjection consent denied by user or returned null data.")
                screenCaptureDeniedHandler?.invoke(
                    getString(R.string.screen_capture_required)
                )

                return@registerForActivityResult
            }

            Log.d("CHEATLOCK_FLOW", "MediaProjection consent granted. Starting ScreenCaptureService.")
            val readyCallback: () -> Unit = {
                runOnUiThread {
                    ScreenCaptureCallbacks.onReady = null
                    ScreenCaptureCallbacks.onStartFailure = null
                    onReady.invoke()
                }
            }
            ScreenCaptureCallbacks.onReady = readyCallback
            ScreenCaptureCallbacks.onStartFailure = { message ->
                runOnUiThread {
                    ScreenCaptureCallbacks.onReady = null
                    ScreenCaptureCallbacks.onStartFailure = null
                    screenCaptureDeniedHandler?.invoke(message)
                }
            }
            window.decorView.postDelayed({
                if (ScreenCaptureCallbacks.onReady === readyCallback) {
                    ScreenCaptureCallbacks.onStartFailure?.invoke(getString(R.string.screen_capture_start_failed))
                }
            }, 15_000L)            // Start the service immediately after consent to comply with Android 14+ FGS restrictions.
            runCatching {
                ScreenCaptureCallbacks.onSnapshot = { snapshot, capturedAt ->
                    val sender = screenSnapshotSender
                    runOnUiThread {
                        sender?.invoke(snapshot, capturedAt)
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
        ScreenCaptureCallbacks.onReady = null
        ScreenCaptureCallbacks.onStartFailure = null
                runCatching { ScreenCaptureService.stop(this) }
                screenCaptureDeniedHandler?.invoke(
                    getString(R.string.screen_capture_start_failed)
                )
            }
            
            // Re-apply FLAG_SECURE after system dialog is gone
            window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)

            // Resume only when ScreenCaptureService has initialized the virtual display.
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        Log.d("CHEATLOCK_FLOW", "MainActivity onCreate: App starting. Manufacturer: ${Build.MANUFACTURER}, Model: ${Build.MODEL}, OS: Android ${Build.VERSION.RELEASE} (API ${Build.VERSION.SDK_INT})")
        
        val isCrashRecovery = intent?.getBooleanExtra("crash_recovery", false) ?: false
        val crashSupportCode = CrashSupportCode.sanitize(intent?.getStringExtra("crash_support_code"))

        super.onCreate(savedInstanceState)
        AppUiPreferences.applyLanguage(this, AppUiPreferences.getLanguage(this))

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
                    putExtra("crash_support_code", CrashSupportCode.from(throwable))
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
            var appLanguage by remember { mutableStateOf(AppUiPreferences.getLanguage(this@MainActivity)) }
            var appThemeMode by remember { mutableStateOf(AppUiPreferences.getThemeMode(this@MainActivity)) }
            val darkTheme = with(AppUiPreferences) { appThemeMode.isDarkTheme() }

            val locale = remember(appLanguage) { java.util.Locale.forLanguageTag(appLanguage.code) }
            val configuration = remember(appLanguage) {
                android.content.res.Configuration(resources.configuration).apply {
                    setLocale(locale)
                    setLocales(android.os.LocaleList(locale))
                }
            }
            val localizedContext = remember(appLanguage) {
                this@MainActivity.createConfigurationContext(configuration)
            }

            CompositionLocalProvider(
                androidx.compose.ui.platform.LocalConfiguration provides configuration,
                androidx.compose.ui.platform.LocalContext provides localizedContext
            ) {
                CheatLockTheme(darkTheme = darkTheme) {
                if (showCrashRecovery) {
                    CrashRecoveryScreen(
                        supportCode = crashSupportCode,
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
                val selfExamStorage = remember { SelfExamStorage(this) }
                var apiBaseUrl by remember {
                    mutableStateOf(BackendUrlStore.effectiveUrl(this@MainActivity))
                }
                val mongoBackendRepository = remember(apiBaseUrl) {
                    MongoBackendRepository(this@MainActivity, apiBaseUrl)
                }
                val reducedMotion = remember {
                    runCatching {
                        Settings.Global.getFloat(
                            contentResolver,
                            Settings.Global.ANIMATOR_DURATION_SCALE,
                            1f
                        ) == 0f
                    }.getOrDefault(false)
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
                var activeTeacherSession by remember { mutableStateOf<ExamSession?>(null) }
                var studentAccount by remember { mutableStateOf<UserAccount?>(null) }
                var studentSubScreen by remember { mutableStateOf<AppRootScreen?>(null) }
                var activeSelfExamPayload by remember { mutableStateOf<SelfExamPayloadResponse?>(null) }
                var selfExamResult by remember { mutableStateOf<SelfExamResultResponse?>(null) }
                var communityStudents by remember { mutableStateOf(emptyList<String>()) }
                var teacherClasses by remember { mutableStateOf(emptyList<TeacherClass>()) }
                var authMessage by remember { mutableStateOf<String?>(null) }
                var studentNotifications by remember {
                    mutableStateOf<List<StudentNotification>>(emptyList())
                }
                var evidenceSequenceNumber by remember { mutableIntStateOf(0) }
                var authoritativeSuspicionScore by remember { mutableIntStateOf(0) }
                var activeScoreAttempt by remember { mutableStateOf<ScoreAttempt?>(null) }

                fun sendScoreChange(examId: String, previousScore: Int, newScore: Int, alertMessage: String? = null) {
                    val scoreAttempt = activeScoreAttempt
                    if (scoreAttempt?.examId != examId) return
                    val delta = (newScore - previousScore).coerceAtLeast(0)
                    val eventId = "$studentId-$examId-${UUID.randomUUID()}"
                    if (BuildConfig.ENABLE_RUNTIME_TRACING) {
                        Log.d("SUSPICIOUS_SCORE", "[SUSPICIOUS EVENT DETECTED] eventId=$eventId studentId=$studentId examId=$examId delta=$delta localScore=$newScore timestamp=${System.currentTimeMillis()}")
                    }
                    scope.launch {
                        runCatching {
                            if (delta > 0 || !alertMessage.isNullOrBlank()) {
                                if (BuildConfig.ENABLE_RUNTIME_TRACING) {
                                    Log.d("SUSPICIOUS_SCORE", "[SCORE UPDATE REQUEST] eventId=$eventId localScore=$previousScore delta=$delta")
                                }
                                val authoritativeStudent = mongoBackendRepository.sendProctoringEvent(
                                    ProctoringEventRequest(
                                        eventName = if (alertMessage.isNullOrBlank()) "suspicion_score_updated" else "ai_alert_created",
                                        examId = examId,
                                        suspicionScore = newScore,
                                        scoreDelta = delta,
                                        mutationId = eventId,
                                        eventId = eventId,
                                        attemptStartedAt = scoreAttempt.startedAt,
                                        latestAlert = alertMessage
                                    )
                                )
                                // Within one attempt the score is monotonic; a new attempt changes activeScoreAttempt,
                                // so late responses from the old attempt are ignored.
                                if (activeScoreAttempt == scoreAttempt) {
                                    authoritativeSuspicionScore = AuthoritativeScoreReconciler.reconcile(
                                        currentScore = authoritativeSuspicionScore,
                                        incomingScore = authoritativeStudent.suspicionScore,
                                        activeAttempt = activeScoreAttempt,
                                        responseAttempt = scoreAttempt,
                                    )
                                }
                                if (BuildConfig.ENABLE_RUNTIME_TRACING) {
                                    Log.d("SUSPICIOUS_SCORE", "[MOBILE SCORE RECEIVED] eventId=$eventId studentId=$studentId examId=$examId receivedValue=${authoritativeStudent.suspicionScore}")
                                }
                            }
                        }.onFailure { error ->
                            Log.e("SUSPICIOUS_SCORE", "Score synchronization failed.", error)
                        }
                    }
                }

                fun recordSecurityWarning(alertMessage: String) {
                    if (isExamFinishing) return
                    val previousScore = SuspicionScoreCalculator.calculateScore(
                        appSwitchWarnings = warningCount,
                        faceMissingWarnings = finalFaceWarnings,
                        audioWarnings = audioWarnings,
                        phoneWarnings = phoneWarnings,
                    )
                    warningCount += 1
                    activeExam?.id?.let { examId ->
                        if (studentId.isNotBlank()) {
                            val score = SuspicionScoreCalculator.calculateScore(
                                appSwitchWarnings = warningCount,
                                faceMissingWarnings = finalFaceWarnings,
                                audioWarnings = audioWarnings,
                                phoneWarnings = phoneWarnings,
                            )
                            sendScoreChange(examId, previousScore, score, alertMessage)
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

                fun sendPreviewSnapshot(snapshot: String, snapshotAttempt: ScoreAttempt?, source: MonitoringSnapshotSource = MonitoringSnapshotSource.CAMERA, capturedAtMillis: Long? = null) {
                    val examId = snapshotAttempt?.examId
                    if (snapshotAttempt == null || snapshotAttempt != activeScoreAttempt || snapshotAttempt.startedAt == null) return
                    if (capturedAtMillis != null && capturedAtMillis < snapshotAttempt.startedAt) return
                    if (BuildConfig.ENABLE_RUNTIME_TRACING) {
                        Log.d("RUNTIME_TRACE", "[Step 3] MainActivity: sendPreviewSnapshot. Event: camera_preview_updated. examId: $examId, studentId: $studentId. Payload size: ${snapshot.length}. Timestamp: ${System.currentTimeMillis()}")
                    }
                    examId?.let { id ->
                        val sequence = evidenceSequenceNumber++
                        val capturedAt = capturedAtMillis?.let { java.time.Instant.ofEpochMilli(it).toString() }
                        val evidenceId = "android-$id-$studentId-${UUID.randomUUID()}"
                        scope.launch {
                            runCatching {
                                mongoBackendRepository.sendProctoringEvent(
                                    ProctoringEventRequest(
                                        eventName = source.eventName,
                                        examId = id,
                                        attemptStartedAt = snapshotAttempt.startedAt,
                                        idempotencyKey = evidenceId,
                                        evidenceId = evidenceId,
                                        sequenceNumber = sequence,
                                        capturedAt = capturedAt,
                                        captureSource = source.wireName,
                                        previewBase64 = if (source == MonitoringSnapshotSource.CAMERA) snapshot else null,
                                        base64 = if (source == MonitoringSnapshotSource.SCREEN) snapshot else null
                                    )
                                )
                            }
                        }
                    }
                }

                suspend fun awaitScreenCaptureConsent() {
                    Log.d("CHEATLOCK_FLOW", "awaitScreenCaptureConsent: Initiating Screen Capture Dialog.")
                    suspendCancellableCoroutine { continuation ->
                        val completeStart: () -> Unit = {
                            if (continuation.isActive) continuation.resume(Unit)
                        }
                        val failStart: (String) -> Unit = { message ->
                            authMessage = message
                            if (continuation.isActive) continuation.resumeWith(Result.failure(IllegalStateException(message)))
                        }
                        pendingScreenCaptureStart = completeStart
                        screenSnapshotSender = null
                        screenCaptureDeniedHandler = failStart
                        continuation.invokeOnCancellation {
                            runOnUiThread {
                                if (pendingScreenCaptureStart === completeStart || screenCaptureDeniedHandler === failStart) {
                                    pendingScreenCaptureStart = null
                                    screenCaptureDeniedHandler = null
                                    stopScreenCapture()
                                }
                            }
                        }
                        val projectionManager = getSystemService(MediaProjectionManager::class.java)
                        if (projectionManager == null) {
                            Log.e("CHEATLOCK_FLOW", "awaitScreenCaptureConsent: MediaProjectionManager is not available on this device.")
                            pendingScreenCaptureStart = null
                            authMessage = getString(R.string.screen_capture_start_failed)
                            if (continuation.isActive) {
                                continuation.resumeWith(Result.failure(IllegalStateException(getString(R.string.screen_capture_start_failed))))
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
                                getString(R.string.screen_capture_start_failed)
                            if (continuation.isActive) {
                                continuation.resumeWith(Result.failure(IllegalStateException(getString(R.string.screen_capture_start_failed))))
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
                    studentAccount != null && studentSubScreen != null -> studentSubScreen ?: AppRootScreen.Student
                    studentAccount != null -> AppRootScreen.Student
                    showHomeScreen -> AppRootScreen.Home
                    else -> AppRootScreen.Login
                }

                LaunchedEffect(rootScreen, activeScoreAttempt, activeSelfExamPayload) {
                    val attempt = activeScoreAttempt ?: return@LaunchedEffect
                    if (rootScreen != AppRootScreen.Exam || activeSelfExamPayload != null || attempt.startedAt == null) return@LaunchedEffect
                    while (isExamRunning && activeScoreAttempt == attempt) {
                        delay(10_000)
                        if (isExamFinishing) continue
                        try {
                            mongoBackendRepository.sendProctoringEvent(
                                ProctoringEventRequest(
                                    eventName = "student_heartbeat",
                                    examId = attempt.examId,
                                    attemptStartedAt = attempt.startedAt
                                )
                            )
                        } catch (cancelled: kotlinx.coroutines.CancellationException) {
                            throw cancelled
                        } catch (failure: Exception) {
                            when (monitoringControl((failure as? BackendRequestException)?.backendCode)) {
                                MonitoringControl.END_EXAM -> activeExam = activeExam?.copy(status = ExamStatus.ENDED)
                                MonitoringControl.RESET_ATTEMPT, MonitoringControl.LOCKED_ATTEMPT -> {
                                    val locked = monitoringControl((failure as? BackendRequestException)?.backendCode) == MonitoringControl.LOCKED_ATTEMPT
                                    stopScreenCapture()
                                    isExamRunning = false
                                    isExamFinishing = false
                                    isLoggedIn = false
                                    isExamSubmitted = false
                                    activeScoreAttempt = null
                                    activeTeacherSession = null
                                    activeExam = null
                                    authMessage = getString(if (locked) R.string.teacher_attempt_locked else R.string.teacher_attempt_reset)
                                    break
                                }
                                MonitoringControl.KEEP_RUNNING -> Log.w("CHEATLOCK_FLOW", "Exam heartbeat unavailable: ${failure.javaClass.simpleName}")
                            }
                        }
                    }
                }
                LaunchedEffect(rootScreen, isLoggedIn, isExamSubmitted) {
                    currentScreenState = rootScreen.name
                    Log.d("CHEATLOCK_FLOW", "Navigation transition to screen: ${rootScreen.name}")

                    val secureExamActive =
                        rootScreen == AppRootScreen.Exam ||
                            (isLoggedIn && !isExamSubmitted && activeExam != null)
                    val resultScreenActive =
                        (rootScreen == AppRootScreen.Result && isExamSubmitted) ||
                            rootScreen == AppRootScreen.SelfExamResult
                    examSecurity.setEnabled(
                        enabled = secureExamActive,
                        keepScreenOnAfterDisable = resultScreenActive
                    )
                }

                AnimatedContent(
                    targetState = rootScreen,
                    transitionSpec = {
                        if (initialState == AppRootScreen.Splash) {
                            cheatLockSplashTransition(reducedMotion)
                        } else {
                            cheatLockScreenTransition(
                                forward = targetState.motionOrder() >= initialState.motionOrder(),
                                reducedMotion = reducedMotion
                            )
                        }
                    },
                    modifier = Modifier
                        .fillMaxSize()
                        .background(MaterialTheme.colorScheme.background),
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
                                    kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
                                        // Reuse the repository and its HTTP client on the normal path.
                                        val repository = if (url == apiBaseUrl) mongoBackendRepository
                                            else MongoBackendRepository(this@MainActivity, url)
                                        repository.validateSession()
                                    }
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
                                },
                                onOpenPrivacyPolicy = {
                                    openConfiguredPublicUrl(BuildConfig.PRIVACY_POLICY_URL, "Privacy policy URL has not been configured.")
                                },
                                onOpenTerms = {
                                    openConfiguredPublicUrl(BuildConfig.TERMS_URL, "Terms URL has not been configured.")
                                },
                                appLanguage = appLanguage,
                                onLanguageChange = { language ->
                                    AppUiPreferences.setLanguage(this@MainActivity, language)
                                    appLanguage = language
                                },
                                appThemeMode = appThemeMode,
                                onThemeModeChange = { mode ->
                                    AppUiPreferences.setThemeMode(this@MainActivity, mode)
                                    appThemeMode = mode
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
                            studentSubScreen = null
                            activeSelfExamPayload = null
                            selfExamResult = null
                            studentAccount = null
                            activeExam = null
                            studentId = ""
                            finalAnswers = emptyList()
                            gradedSubmission = null
                            warningCount = 0
                            isExamFinishing = false
                            finalFaceWarnings = 0
                            authoritativeSuspicionScore = 0
                            activeScoreAttempt = null
                            audioWarnings = 0
                            phoneWarnings = 0
                            submissions = emptyList()
                            sessions = emptyList()
                            exams = emptyList()
                            communityStudents = emptyList()
                            teacherClasses = emptyList()
                            authMessage = null
                            examStorage.clearExam()
                            selfExamStorage.clearActiveSessionId()
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
                            val updatedAccount = mongoBackendRepository.updateProfile(newName, newId)
                            studentAccount = updatedAccount
                            studentId = updatedAccount.identifier
                        },
                        onHasFaceProfile = {
                            mongoBackendRepository.hasFaceProfile()
                        },
                        onRefresh = { refreshTeacherDashboard() }
                    )
                        }

                        AppRootScreen.Result -> {
                    isExamRunning = false
                    fun returnToStudentDashboard() {
                        stopScreenCapture()
                        isLoggedIn = false
                        isAdminMode = false
                        isExamRunning = false
                        activeScoreAttempt = null
                        studentSubScreen = null
                        activeSelfExamPayload = null
                        selfExamResult = null
                        isExamSubmitted = false
                        studentId = studentAccount?.identifier.orEmpty()
                        activeExam = null
                        finalAnswers = emptyList()
                        gradedSubmission = null
                        warningCount = 0
                        finalFaceWarnings = 0
                        audioWarnings = 0
                        phoneWarnings = 0
                        authoritativeSuspicionScore = 0
                        authMessage = null
                        examStorage.clearExam()
                        selfExamStorage.clearActiveSessionId()
                    }
                    BackHandler {
                        returnToStudentDashboard()
                    }
                    ResultScreen(
                        studentId = studentId,
                        appSwitchWarnings = warningCount,
                        faceMissingWarnings = finalFaceWarnings,
                        audioWarnings = audioWarnings,
                        phoneWarnings = phoneWarnings,
                        authoritativeSuspicionScore = authoritativeSuspicionScore,
                        grade = gradedSubmission?.grade,
                        feedback = gradedSubmission?.feedback,
                        gradedAt = gradedSubmission?.gradedAt,
                        answers = finalAnswers,
                        onBackToLogin = {
                            returnToStudentDashboard()
                        }
                    )
                        }

                        AppRootScreen.Exam -> {
                    isExamRunning = true
                    val renderedAttempt = activeScoreAttempt

                    ExamScreen(
                        selfExamPayload = activeSelfExamPayload,
                        teacherSession = if (activeSelfExamPayload == null) activeTeacherSession else null,
                        onCheckpointRefresh = { id -> mongoBackendRepository.refreshSelfExamCheckpoint(id) },
                        onCheckpointReload = { id -> mongoBackendRepository.reloadSelfExamCheckpoint(id) },
                        onCheckpointSave = { payload, snapshot -> mongoBackendRepository.saveSelfExamCheckpoint(payload, snapshot) },
                        studentId = studentId,
                        exam = activeExam ?: fallbackExam(studentId),
                        warningCount = warningCount,
                        authoritativeSuspicionScore = authoritativeSuspicionScore,
                        onFaceWarningsChanged = { count ->
                            if (activeSelfExamPayload == null && renderedAttempt != activeScoreAttempt) return@ExamScreen
                            val previousFaceWarnings = finalFaceWarnings
                            val previousScore = SuspicionScoreCalculator.calculateScore(
                                appSwitchWarnings = warningCount,
                                faceMissingWarnings = previousFaceWarnings,
                                audioWarnings = audioWarnings,
                                phoneWarnings = phoneWarnings,
                            )
                            finalFaceWarnings = count
                            if (activeSelfExamPayload == null) {
                                activeExam?.id?.let { examId ->
                                    val score = SuspicionScoreCalculator.calculateScore(
                                        appSwitchWarnings = warningCount,
                                        faceMissingWarnings = count,
                                        audioWarnings = audioWarnings,
                                        phoneWarnings = phoneWarnings,
                                    )
                                    if (count > previousFaceWarnings) {
                                        sendScoreChange(
                                            examId,
                                            previousScore,
                                            score,
                                            "Face not detected in camera preview."
                                        )
                                    }
                                }
                            }
                        },
                        onCameraPreviewChanged = { snapshot ->
                            if (activeSelfExamPayload == null) {
                                sendPreviewSnapshot(snapshot, renderedAttempt)
                            }
                        },
                        onPhoneDetected = { labels ->
                            if (activeSelfExamPayload == null && renderedAttempt != activeScoreAttempt) return@ExamScreen
                            val previousScore = SuspicionScoreCalculator.calculateScore(
                                appSwitchWarnings = warningCount,
                                faceMissingWarnings = finalFaceWarnings,
                                audioWarnings = audioWarnings,
                                phoneWarnings = phoneWarnings,
                            )
                            phoneWarnings++
                            if (activeSelfExamPayload == null) {
                                activeExam?.id?.let { examId ->
                                    val score = SuspicionScoreCalculator.calculateScore(
                                        appSwitchWarnings = warningCount,
                                        faceMissingWarnings = finalFaceWarnings,
                                        audioWarnings = audioWarnings,
                                        phoneWarnings = phoneWarnings,
                                    )
                                    sendScoreChange(examId, previousScore, score, "Possible $labels detected in camera view.")
                                }
                            }
                        },
                        onAudioWarning = {
                            if (activeSelfExamPayload == null && renderedAttempt != activeScoreAttempt) return@ExamScreen
                            val previousScore = SuspicionScoreCalculator.calculateScore(
                                appSwitchWarnings = warningCount,
                                faceMissingWarnings = finalFaceWarnings,
                                audioWarnings = audioWarnings,
                                phoneWarnings = phoneWarnings,
                            )
                            audioWarnings++
                            if (activeSelfExamPayload == null) {
                                activeExam?.id?.let { examId ->
                                    val score = SuspicionScoreCalculator.calculateScore(
                                        appSwitchWarnings = warningCount,
                                        faceMissingWarnings = finalFaceWarnings,
                                        audioWarnings = audioWarnings,
                                        phoneWarnings = phoneWarnings,
                                    )
                                    sendScoreChange(examId, previousScore, score, "High ambient noise detected.")
                                }
                            }
                        },
                        onFinishExam = { answers, reason ->
                            isExamFinishing = true
                            finalAnswers = answers
                            val selfPayload = activeSelfExamPayload
                            if (selfPayload != null) {
                                val useBulk = BuildConfig.SELF_EXAM_BULK_V1 && selfPayload.session.bulkSubmissionVersion == 1
                                runCatching {
                                    if (useBulk) {
                                        mongoBackendRepository.submitBulkSelfExam(selfPayload, answers)
                                    } else {
                                        persistSelfExamAnswers(selfPayload, answers, mongoBackendRepository)
                                        mongoBackendRepository.submitSelfExam(selfPayload.session.id)
                                    }
                                }.onSuccess { result ->
                                    selfExamResult = result
                                    authMessage = null
                                    val totalWarn = warningCount + finalFaceWarnings + audioWarnings + phoneWarnings
                                    val selfSub = convertSelfExamResultToSubmission(result, totalWarn)
                                    persistSelfExamResultHistory(examStorage, selfSub)
                                    submissions = examStorage.getSubmissions()
                                    if (useBulk) mongoBackendRepository.acknowledgeBulkSelfExamResult(result.session.id)
                                }.onFailure { error ->
                                    isExamFinishing = false
                                    authMessage = if (error is com.jubayer.cheatlock.data.BulkSelfExamRequestException) localizedContext.getString(error.messageResource) else error.message ?: "Could not submit self exam."
                                    if (useBulk) throw error
                                }.isSuccess
                            } else {
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
                                ).copy(attemptStartedAt = activeScoreAttempt?.startedAt)
                                val localSessionStatus = if (reason == ExamFinishReason.LOCKED) {
                                    ExamSessionStatus.LOCKED
                                } else {
                                    ExamSessionStatus.SUBMITTED
                                }

                                runCatching {
                                        val examId = resolvedExamId ?: submission.examId
                                        mongoBackendRepository.saveSubmission(submission)
                                        if (reason == ExamFinishReason.LOCKED) {
                                            val finalSuspicionScore = SuspicionScoreCalculator.calculateScore(
                                                appSwitchWarnings = warningCount,
                                                faceMissingWarnings = finalFaceWarnings,
                                                audioWarnings = audioWarnings,
                                                phoneWarnings = phoneWarnings,
                                            )
                                            mongoBackendRepository.lockSession(
                                                reason = "Too many warning activities were detected.",
                                                examId = examId,
                                                suspicionScore = finalSuspicionScore,
                                                attemptStartedAt = activeScoreAttempt?.startedAt
                                            )
                                        }
                                        examStorage.saveSubmission(submission)
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
                                    }.onFailure { error ->
                                        isExamFinishing = false
                                        authMessage = error.message
                                    }.isSuccess
                            }
                        },
                        onSubmissionTransitionComplete = {
                            stopScreenCapture()
                            isExamRunning = false
                            isExamFinishing = false
                            activeScoreAttempt = null
                            if (selfExamResult != null && activeSelfExamPayload != null) {
                                activeSelfExamPayload = null
                                activeExam = null
                                isLoggedIn = false
                                isExamSubmitted = false
                                selfExamStorage.clearActiveSessionId()
                                studentSubScreen = AppRootScreen.SelfExamResult
                            } else {
                                examStorage.clearExam(ExamAttemptKey.from(studentId, activeExam?.id, activeTeacherSession?.startedAt))
                                isLoggedIn = false
                                isExamSubmitted = true
                            }
                        }
                    )
                        }

                        AppRootScreen.SelfExamSetup -> {
                    isExamRunning = false
                    SelfExamSetupScreen(
                        onRecoverPendingSubmission = { mongoBackendRepository.recoverPendingSelfExamSubmission() },
                        persistedSessionId = selfExamStorage.getActiveSessionId(),
                        onLoadClasses = { mongoBackendRepository.getSelfExamClasses() },
                        onLoadSubjects = { classId -> mongoBackendRepository.getSelfExamSubjects(classId) },
                        onLoadChapters = { subjectId -> mongoBackendRepository.getSelfExamChapters(subjectId) },
                        onLoadActiveSession = { mongoBackendRepository.getActiveSelfExamSession() },
                        onLoadSession = { sessionId -> mongoBackendRepository.getSelfExamSession(sessionId) },
                        onCreateSession = { request -> mongoBackendRepository.createSelfExamSession(request) },
                        onStartSession = { sessionId -> mongoBackendRepository.startSelfExamSession(sessionId) },
                        onRequestMonitoringPermissions = { onResult ->
                            pendingMonitoringPermissionResult = onResult
                            val permissions = buildList {
                                add(Manifest.permission.CAMERA)
                                add(Manifest.permission.RECORD_AUDIO)
                                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                                    add(Manifest.permission.POST_NOTIFICATIONS)
                                }
                            }
                            requestMonitoringPermissions.launch(permissions.toTypedArray())
                        },
                        onClearPersistedSession = { selfExamStorage.clearActiveSessionId() },
                        onStarted = { payload ->
                            activeSelfExamPayload = payload
                            activeExam = payload.toSecureExam()
                            studentId = studentAccount?.identifier.orEmpty().ifBlank { payload.session.studentId }
                            selfExamResult = null
                            selfExamStorage.saveActiveSessionId(payload.session.id)
                            warningCount = 0
                            finalFaceWarnings = 0
                            audioWarnings = 0
                            phoneWarnings = 0
                            authoritativeSuspicionScore = 0
                            finalAnswers = emptyList()
                            isExamSubmitted = false
                            isAdminMode = false
                            isLoggedIn = true
                            studentSubScreen = null
                        },
                        onResultReady = { result ->
                            selfExamResult = result
                            activeSelfExamPayload = null
                            selfExamStorage.clearActiveSessionId()
                            val selfSub = convertSelfExamResultToSubmission(result, 0)
                            persistSelfExamResultHistory(examStorage, selfSub)
                            submissions = examStorage.getSubmissions()
                            studentSubScreen = AppRootScreen.SelfExamResult
                            scope.launch { runCatching { mongoBackendRepository.acknowledgeBulkSelfExamResult(result.session.id) } }
                        },
                        onSubmitExpired = { sessionId ->
                            val result = mongoBackendRepository.submitSelfExam(sessionId)
                            val selfSub = convertSelfExamResultToSubmission(result, 0)
                            persistSelfExamResultHistory(examStorage, selfSub)
                            submissions = examStorage.getSubmissions()
                            result
                        },
                        onBack = {
                            studentSubScreen = null
                            authMessage = null
                        }
                    )
                        }

                        AppRootScreen.SelfExamResult -> {
                    isExamRunning = false
                    val result = selfExamResult
                    if (result == null) {
                        studentSubScreen = AppRootScreen.Student
                    } else {
                        SelfExamResultScreen(
                            resultResponse = result,
                            onBackToDashboard = {
                                selfExamResult = null
                                activeSelfExamPayload = null
                                selfExamStorage.clearActiveSessionId()
                                studentSubScreen = null
                            }
                        )
                    }
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
                                authMessage = null
                                // Reject incompatible transport data before any session/admission request.
                                teacherExamStartupIssue(exam)?.let { issue ->
                                    val message = when (issue.problem) {
                                        TeacherExamStartupProblem.QUESTIONS_UNAVAILABLE -> getString(R.string.teacher_exam_questions_unavailable)
                                        TeacherExamStartupProblem.UNSUPPORTED_QUESTION -> getString(R.string.teacher_exam_question_unsupported, issue.questionNumber)
                                        TeacherExamStartupProblem.INCOMPLETE_QUESTION -> getString(R.string.teacher_exam_question_incomplete, issue.questionNumber)
                                    }
                                    throw IllegalStateException(message)
                                }
                                if (ContextCompat.checkSelfPermission(this@MainActivity, Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED ||
                                    ContextCompat.checkSelfPermission(this@MainActivity, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
                                    throw IllegalStateException(getString(R.string.monitoring_permissions_required))
                                }
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

                                            examSecurity.prepareLockTaskForExamStart()

                                            warningCount = 0
                                            isExamFinishing = false
                                            finalFaceWarnings = 0
                                            audioWarnings = 0
                                            phoneWarnings = 0
                                            authoritativeSuspicionScore = 0
                                            activeScoreAttempt = null
                                            finalAnswers = emptyList()
                                            isExamSubmitted = false

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
                                                throw Exception("Exam Startup Error: ${error.message ?: "Server unreachable"}")
                                            }
                                            
                                            if (startedSession.startedAt == null || startedSession.startedAt <= 0 ||
                                                startedSession.status != ExamSessionStatus.IN_PROGRESS ||
                                                startedSession.studentId != account.identifier || startedSession.examId != examId) {
                                                throw IllegalStateException("The exam session could not be verified. Reload the exam and retry.")
                                            }
                                            activeTeacherSession = startedSession
                                            examStorage.saveSession(startedSession)
                                            authoritativeSuspicionScore = startedSession.suspicionScore
                                            activeScoreAttempt = ScoreAttempt(examId, startedSession.startedAt)
                                            val screenAttempt = activeScoreAttempt
                                            screenSnapshotSender = { snapshot, capturedAt ->
                                                sendPreviewSnapshot(snapshot, screenAttempt, MonitoringSnapshotSource.SCREEN, capturedAt)
                                            }
                                            
                                            runCatching {
                                                mongoBackendRepository.sendProctoringEvent(
                                                    ProctoringEventRequest(
                                                        eventName = "student_joined_exam",
                                                        examId = examId,
                                                        eventId = "join-${UUID.randomUUID()}",
                                                        attemptStartedAt = startedSession.startedAt
                                                    )
                                                )
                                            }
                                            
                                            authMessage = null
                                            studentId = account.identifier
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
                            onOpenSelfExam = {
                                authMessage = null
                                studentSubScreen = AppRootScreen.SelfExamSetup
                            },
                            onLogout = {
                                // Stop any background monitoring
                                stopScreenCapture()

                                // Clear backend session
                                mongoBackendRepository.logout()

                                // Reset all student / exam state and show login instead of exiting.
                                isExamRunning = false
                                activeScoreAttempt = null
                                isLoggedIn = false
                                isAdminMode = false
                                isExamSubmitted = false
                                studentSubScreen = null
                                activeSelfExamPayload = null
                                selfExamResult = null
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
                                selfExamStorage.clearActiveSessionId()
                                showHomeScreen = true
                            },
                            onUpdateProfile = { newName, newId ->
                                val updatedAccount = mongoBackendRepository.updateProfile(newName, newId)
                                studentAccount = updatedAccount
                                studentId = updatedAccount.identifier
                            },
                            onDeleteAccount = { password ->
                                mongoBackendRepository.deleteAccount(password)
                                stopScreenCapture()
                                isExamRunning = false
                                activeScoreAttempt = null
                                isLoggedIn = false
                                isAdminMode = false
                                isExamSubmitted = false
                                studentSubScreen = null
                                activeSelfExamPayload = null
                                selfExamResult = null
                                studentAccount = null
                                activeExam = null
                                studentId = ""
                                finalAnswers = emptyList()
                                gradedSubmission = null
                                warningCount = 0
                                finalFaceWarnings = 0
                                audioWarnings = 0
                                phoneWarnings = 0
                                authMessage = "Your account and associated student data were deleted."
                                examStorage.clearExam()
                                selfExamStorage.clearActiveSessionId()
                                showHomeScreen = true
                            },
                            onRequestMonitoringPermissions = { onResult ->
                                pendingMonitoringPermissionResult = onResult
                                val permissions = buildList {
                                    add(Manifest.permission.CAMERA)
                                    add(Manifest.permission.RECORD_AUDIO)
                                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                                        add(Manifest.permission.POST_NOTIFICATIONS)
                                    }
                                }
                                requestMonitoringPermissions.launch(permissions.toTypedArray())
                            },
                            onOpenAccountDeletionPage = {
                                openConfiguredPublicUrl(
                                    BuildConfig.ACCOUNT_DELETION_URL,
                                    "Public account deletion URL has not been configured."
                                )
                            },
                            appLanguage = appLanguage,
                            onLanguageChange = { language ->
                                AppUiPreferences.setLanguage(this@MainActivity, language)
                                appLanguage = language
                            },
                            appThemeMode = appThemeMode,
                            onThemeModeChange = { mode ->
                                AppUiPreferences.setThemeMode(this@MainActivity, mode)
                                appThemeMode = mode
                            },
                            externalMessage = authMessage,
                            recentNotifications = studentNotifications,
                            submissions = submissions
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
                                submissions = examStorage.getSubmissions()
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
                            submissions = examStorage.getSubmissions()
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
                        externalMessage = authMessage,
                        appLanguage = appLanguage,
                        onLanguageChange = { language ->
                            AppUiPreferences.setLanguage(this@MainActivity, language)
                            appLanguage = language
                        },
                        appThemeMode = appThemeMode,
                        onThemeModeChange = { mode ->
                            AppUiPreferences.setThemeMode(this@MainActivity, mode)
                            appThemeMode = mode
                        }
                    )
                        }
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

        if (isExamRunning && !isExamFinishing) {
            increaseWarning?.invoke()
        }
    }

    override fun onUserLeaveHint() {
        super.onUserLeaveHint()
        if (isExamRunning && !isExamFinishing) {
            increaseWarning?.invoke()
        }
    }

    @SuppressLint("RestrictedApi")
    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        if (isExamRunning && !isExamFinishing && event.action == KeyEvent.ACTION_DOWN && isBlockedExamKey(event)) {
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
        ScreenCaptureCallbacks.onReady = null
        ScreenCaptureCallbacks.onStartFailure = null
        runCatching { ScreenCaptureService.stop(applicationContext) }
    }

    private fun openConfiguredPublicUrl(url: String, missingMessage: String) {
        if (!url.startsWith("https://")) {
            Toast.makeText(this, missingMessage, Toast.LENGTH_LONG).show()
            return
        }
        runCatching { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url))) }
            .onFailure { Toast.makeText(this, "Unable to open this link on the device.", Toast.LENGTH_LONG).show() }
    }

    private fun isBlockedExamKey(event: KeyEvent): Boolean {
        if (event.isCtrlPressed || event.isAltPressed || event.isMetaPressed) {
            return true
        }

        return when (event.keyCode) {
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

    private fun convertSelfExamResultToSubmission(
        result: SelfExamResultResponse,
        warnings: Int = 0
    ): ExamSubmission {
        val correctCount = result.result.correctCount
        val questionCount = result.questions.size
        val percentage = if (questionCount > 0) correctCount.toDouble() / questionCount * 100.0 else 0.0
        val difficultyTitle = result.session.difficultyMode.replaceFirstChar {
            if (it.isLowerCase()) it.titlecase(java.util.Locale.getDefault()) else it.toString()
        }
        return ExamSubmission(
            id = result.session.id,
            studentId = result.session.studentId,
            examId = "Self Practice: $difficultyTitle",
            submittedAt = System.currentTimeMillis(),
            answers = result.questions.mapIndexed { index, q ->
                val ans = result.answers.find { it.questionId == q.id }
                val opt = q.options.find { it.id == ans?.selectedOptionId }
                val correctOpt = q.options.find { it.isCorrect }
                val answerText = opt?.text ?: ans?.answerText.orEmpty().ifBlank { "Unanswered" }
                val isCorrect = ans?.isCorrect ?: (opt?.isCorrect == true)
                val explanationText = if (q.explanation.isNotBlank()) " | Note: ${q.explanation}" else ""
                StudentAnswer(
                    questionIndex = index,
                    questionText = q.questionText,
                    answerText = if (isCorrect) "$answerText (Correct ✅)$explanationText" else "$answerText (Incorrect ❌ • Correct: ${correctOpt?.text ?: "N/A"})$explanationText",
                    selectedOptionId = ans?.selectedOptionId,
                    isCorrect = isCorrect
                )
            },
            appSwitchWarnings = warnings,
            faceMissingWarnings = 0,
            audioWarnings = 0,
            phoneWarnings = 0,
            totalWarnings = warnings,
            riskLevel = if (warnings == 0) "LOW" else "MEDIUM",
            grade = percentage,
            feedback = "Self-Practice: $correctCount/$questionCount Correct",
            correctAnswerCount = correctCount,
            totalQuestionCount = questionCount
        )
    }

    private fun SelfExamPayloadResponse.toSecureExam(): Exam {
        return Exam(
            id = "self:${session.id}",
            title = "Self Exam",
            durationMinutes = session.durationMinutes.coerceAtLeast(1),
            lockAnswers = false,
            status = ExamStatus.LIVE,
            startedAt = session.startedAt,
            endedAt = session.expiresAt,
            questions = questions.map { question ->
                ExamQuestion(
                    type = if (question.questionType.equals("mcq", ignoreCase = true)) QuestionType.MCQ else QuestionType.CQ,
                    text = question.questionText,
                    options = question.options.map { it.text },
                    optionIds = question.options.map { it.id },
                    correctAnswer = ""
                )
            },
            assignedStudents = listOf(session.studentId)
        )
    }

    private fun persistSelfExamResultHistory(storage: ExamStorage, submission: ExamSubmission) {
        if (storage.getSubmissions().none { it.id == submission.id }) storage.saveSubmission(submission)
    }

    private suspend fun persistSelfExamAnswers(
        payload: SelfExamPayloadResponse,
        answers: List<StudentAnswer>,
        repository: MongoBackendRepository
    ) {
        answers.forEach { answer ->
            val question = payload.questions.getOrNull(answer.questionIndex) ?: return@forEach
            val selectedOptionId = answer.selectedOptionId ?: question.options
                .firstOrNull { it.text == answer.answerText }
                ?.id
            repository.saveSelfExamAnswer(
                sessionId = payload.session.id,
                questionId = question.id,
                selectedOptionId = selectedOptionId
            )
        }
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
