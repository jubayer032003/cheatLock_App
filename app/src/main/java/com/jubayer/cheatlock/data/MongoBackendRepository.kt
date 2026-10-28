package com.jubayer.cheatlock.data

import com.jubayer.cheatlock.BuildConfig

import android.content.Context
import android.provider.Settings
import com.jubayer.cheatlock.model.Exam
import com.jubayer.cheatlock.model.ExamAttendanceOverview
import com.jubayer.cheatlock.model.ExamSubmission
import com.jubayer.cheatlock.model.ExamSession
import com.jubayer.cheatlock.model.CreateSelfExamSessionRequest
import com.jubayer.cheatlock.model.SaveSelfExamAnswerRequest
import com.jubayer.cheatlock.model.SelfExamAnswer
import com.jubayer.cheatlock.model.SelfExamChapter
import com.jubayer.cheatlock.model.SelfExamClass
import com.jubayer.cheatlock.model.SelfExamPayloadResponse
import com.jubayer.cheatlock.model.SelfExamResultResponse
import com.jubayer.cheatlock.model.SelfExamSession
import com.jubayer.cheatlock.model.SelfExamSubject
import com.jubayer.cheatlock.model.StudentNotification
import com.jubayer.cheatlock.model.TeacherClass
import com.jubayer.cheatlock.model.UserAccount
import com.jubayer.cheatlock.model.UserRole
import com.jubayer.cheatlock.util.BackendUrlResolver
import com.jubayer.cheatlock.util.IdentifierNormalizer
import android.util.Log
import okhttp3.OkHttpClient
import java.util.concurrent.TimeUnit
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import retrofit2.HttpException
import java.io.IOException
import com.google.gson.GsonBuilder
import com.jubayer.cheatlock.model.BulkSelfExamAnswer
import com.jubayer.cheatlock.model.PendingBulkSelfExamSubmission
import com.jubayer.cheatlock.model.StudentAnswer
import com.jubayer.cheatlock.selfexam.SelfExamBulkSubmissionCoordinator
import com.jubayer.cheatlock.selfexam.BulkSubmissionTransport
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeout
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.delay
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit

class MongoBackendRepository(
    context: Context,
    private val baseUrl: String = DEFAULT_BASE_URL
) {
    private val appContext = context.applicationContext
    private val sessionManager = SessionManager(context)
    private val monitoringRequests = Semaphore(2)
    private val cameraSnapshotRequest = Mutex()
    private val screenSnapshotRequest = Mutex()

    private val okHttpClient = OkHttpClient.Builder()
        .connectTimeout(50, TimeUnit.SECONDS)
        .readTimeout(50, TimeUnit.SECONDS)
        .writeTimeout(50, TimeUnit.SECONDS)
        .build()

    private val api = Retrofit.Builder()
        .baseUrl(baseUrl)
        .client(okHttpClient)
        .addConverterFactory(GsonConverterFactory.create())
        .build()
        .create(BackendApi::class.java)

    private val bulkApi = Retrofit.Builder().baseUrl(baseUrl)
        .client(okHttpClient.newBuilder().callTimeout(35, TimeUnit.SECONDS).retryOnConnectionFailure(false).build())
        .addConverterFactory(GsonConverterFactory.create()).build().create(BackendApi::class.java)
    private val bulkJson = GsonBuilder().serializeNulls().create()
    private val bulkStorage = SelfExamStorage(appContext)
    private val bulkSubmission = SelfExamBulkSubmissionCoordinator(bulkStorage, object : BulkSubmissionTransport {
        override suspend fun submit(value: PendingBulkSelfExamSubmission): SelfExamResultResponse {
            val prepareStarted = android.os.SystemClock.elapsedRealtime()
            val body = okhttp3.RequestBody.create(okhttp3.MediaType.parse("application/json; charset=utf-8"), bulkJson.toJson(value.request()))
            val serialized = android.os.SystemClock.elapsedRealtime()
            val raw = runBackendRequest { bulkApi.submitBulkSelfExam(bearerToken(), value.sessionId, value.submissionId, body) }.use { it.string() }
            val received = android.os.SystemClock.elapsedRealtime()
            val result = checkNotNull(bulkJson.fromJson(raw, SelfExamResultResponse::class.java))
            check(result.session.id == value.sessionId && result.session.status == "submitted")
            Log.i("SELF_EXAM_BULK", "stage=submit correlationId=${value.submissionId} itemCount=${value.answers.size} serializationMs=${serialized-prepareStarted} httpMs=${received-serialized} responseProcessingMs=${android.os.SystemClock.elapsedRealtime()-received}")
            return result
        }
        override suspend fun status(value: PendingBulkSelfExamSubmission) =
            runBackendRequest { bulkApi.getBulkSelfExamStatus(bearerToken(), value.sessionId, value.submissionId, value.submissionId) }
    })

    private val checkpoints by lazy { com.jubayer.cheatlock.selfexam.SelfExamCheckpointCoordinator(SelfExamStorage(appContext), object : com.jubayer.cheatlock.selfexam.CheckpointTransport {
        override suspend fun state(sessionId: String): com.jubayer.cheatlock.selfexam.CheckpointState {
            val anchor = android.os.SystemClock.elapsedRealtime()
            return runBackendRequest { bulkApi.getSelfExamCheckpoint(bearerToken(), sessionId) }.also { it.timingAnchor = anchor }
        }
        override suspend fun save(sessionId: String, request: com.jubayer.cheatlock.selfexam.CheckpointRequest): com.jubayer.cheatlock.selfexam.CheckpointState {
            val anchor = android.os.SystemClock.elapsedRealtime()
            val body = okhttp3.RequestBody.create(okhttp3.MediaType.parse("application/json; charset=utf-8"), bulkJson.toJson(request))
            return runBackendRequest { bulkApi.saveSelfExamCheckpoint(bearerToken(), sessionId, body) }.also { it.timingAnchor = anchor }
        }
    }) }
    suspend fun reloadSelfExamCheckpoint(sessionId: String) = withContext(Dispatchers.IO) { withTimeout(15_000) { checkpoints.reloadServerAnswers(sessionId) } }
    suspend fun refreshSelfExamCheckpoint(sessionId: String) = withContext(Dispatchers.IO) { withTimeout(15_000) { checkpoints.refresh(sessionId) } }
    suspend fun saveSelfExamCheckpoint(payload: SelfExamPayloadResponse, answers: List<StudentAnswer>) = withContext(Dispatchers.IO) {
        withTimeout(15_000) {
            val snapshot = answers.map { answer ->
                val q = requireNotNull(payload.questions.getOrNull(answer.questionIndex))
                BulkSelfExamAnswer(q.id, answer.selectedOptionId ?: q.options.firstOrNull { it.text == answer.answerText }?.id)
            }
            checkpoints.save(payload.session.id, snapshot)
        }
    }

    suspend fun submitBulkSelfExam(payload: SelfExamPayloadResponse, answers: List<StudentAnswer>): SelfExamResultResponse = withContext(Dispatchers.IO) {
        try {
            withTimeout(65_000) {
                val started = android.os.SystemClock.elapsedRealtime()
                val snapshot = answers.map { answer ->
                    val question = requireNotNull(payload.questions.getOrNull(answer.questionIndex))
                    BulkSelfExamAnswer(question.id, answer.selectedOptionId ?: question.options.firstOrNull { it.text == answer.answerText }?.id)
                }
                Log.i("SELF_EXAM_BULK", "stage=snapshot itemCount=${snapshot.size} durationMs=${android.os.SystemClock.elapsedRealtime()-started}")
                bulkSubmission.submit(payload.session.id, snapshot, reconcileFirst = payload.session.checkpointVersion == 1)
            }
        } catch (error: Exception) { throw localizedBulkFailure(error) }
    }
    suspend fun recoverPendingSelfExamSubmission(): SelfExamResultResponse? = withContext(Dispatchers.IO) {
        try { withTimeout(65_000) { bulkSubmission.recover() } }
        catch (error: Exception) { throw localizedBulkFailure(error) }
    }
    suspend fun acknowledgeBulkSelfExamResult(sessionId: String) = withContext(Dispatchers.IO) { bulkSubmission.acknowledge(sessionId) }
    private fun localizedBulkFailure(error: Exception): Exception {
        if (error is CancellationException && error !is kotlinx.coroutines.TimeoutCancellationException) return error
        val backend = error as? BackendRequestException
        val resource = when {
            backend?.statusCode in listOf(401,403) -> com.jubayer.cheatlock.R.string.se_bulk_sign_in
            backend?.backendCode == "BULK_SESSION_EXPIRED" -> com.jubayer.cheatlock.R.string.se_bulk_expired
            backend?.backendCode in listOf("BULK_SCHEMA_UNAVAILABLE","BULK_DISABLED","BULK_QUESTION_INVALID") -> com.jubayer.cheatlock.R.string.se_bulk_configuration
            backend?.statusCode == 409 -> com.jubayer.cheatlock.R.string.se_bulk_conflict
            backend?.statusCode in listOf(400,404,413) -> com.jubayer.cheatlock.R.string.se_bulk_invalid
            else -> com.jubayer.cheatlock.R.string.se_bulk_saved_retry
        }
        return BulkSelfExamRequestException(resource, appContext.getString(resource))
    }

    suspend fun checkHealth(): Boolean {
        return runCatching {
            runBackendRequest { api.health() }.ok
        }.getOrDefault(false)
    }

    fun currentBaseUrl(): String = baseUrl

    suspend fun signup(account: UserAccount): UserAccount {
        val normalizedId = IdentifierNormalizer.normalize(account.identifier)
        val response = runBackendRequest(allowSessionRefresh = false) {
            api.signup(
                AuthRequest(
                    name = account.name.trim(),
                    identifier = normalizedId,
                    password = account.password,
                    role = account.role
                )
            )
        }

        saveAuthToken(response.token, response.user.toUserAccount(), response.refreshToken)
        return response.user.toUserAccount()
    }

    suspend fun login(identifier: String, password: String, role: UserRole): UserAccount {
        val normalizedId = IdentifierNormalizer.normalize(identifier)
        val response = runBackendRequest(allowSessionRefresh = false) {
            api.login(
                AuthRequest(
                    identifier = normalizedId,
                    password = password,
                    role = role
                )
            )
        }

        saveAuthToken(response.token, response.user.toUserAccount(), response.refreshToken)
        return response.user.toUserAccount()
    }

    private fun saveAuthToken(token: String, user: UserAccount, refreshToken: String?) {
        sessionManager.saveSession(token, user, refreshToken, baseUrl)
    }

    suspend fun createExam(exam: Exam): Exam {
        return runBackendRequest { api.createExam(bearerToken(), exam).exam }
    }

    suspend fun hasFaceProfile(): Boolean {
        return runBackendRequest { api.getFaceProfile(bearerToken()).hasFaceProfile }
    }

    suspend fun enrollFaceProfile(descriptor: List<Double>, previewBase64: String) {
        runBackendRequest {
            api.enrollFaceProfile(
                bearerToken(),
                FaceProfileRequest(descriptor = descriptor, previewBase64 = previewBase64)
            )
        }
    }

    suspend fun verifyFaceProfile(descriptor: List<Double>): Boolean {
        return runBackendRequest {
            api.verifyFaceProfile(
                bearerToken(),
                FaceProfileRequest(descriptor = descriptor)
            ).ok
        }
    }

    suspend fun getExams(): List<Exam> {
        return runBackendRequest { api.getExams(bearerToken()).exams }
    }

    suspend fun updateExamLifecycle(examId: String, action: String): Exam {
        return runBackendRequest {
            api.updateExamLifecycle(
                bearerToken(),
                examId,
                ExamLifecycleRequest(action = action)
            ).exam
        }
    }

    suspend fun assignStudentsToExam(examId: String, studentIds: List<String>): Exam {
        val normalized = studentIds
            .map { IdentifierNormalizer.normalize(it) }
            .filter { it.isNotBlank() }
            .distinct()
        return runBackendRequest {
            api.assignStudentsToExam(
                bearerToken(),
                examId,
                AssignStudentsRequest(studentIds = normalized)
            ).exam
        }
    }

    suspend fun getAssignedExam(): Exam {
        return runBackendRequest { api.getAssignedExam(bearerToken()).exam }
    }

    suspend fun getExamByCode(code: String): Exam {
        return runBackendRequest { api.getExamByCode(bearerToken(), code).exam }
    }

    suspend fun getCommunity(): List<String> {
        return runBackendRequest { api.getCommunity(bearerToken()).community.students }
    }

    suspend fun getClasses(): List<TeacherClass> {
        return runBackendRequest { api.getClasses(bearerToken()).classes }
    }

    suspend fun createClass(classRecord: TeacherClass): TeacherClass {
        return runBackendRequest { api.createClass(bearerToken(), classRecord).`class` }
    }

    suspend fun joinClass(inviteCode: String): String {
        return runBackendRequest {
            api.joinClass(bearerToken(), ClassJoinRequest(inviteCode)).status
        }
    }

    suspend fun updateClass(classRecord: TeacherClass): TeacherClass {
        val classId = classRecord.id ?: error("Class ID is required.")
        return runBackendRequest { api.updateClass(bearerToken(), classId, classRecord).`class` }
    }

    suspend fun deleteClass(classId: String) {
        runBackendRequest { api.deleteClass(bearerToken(), classId) }
    }

    suspend fun decideClassEnrollment(classId: String, studentId: String, decision: String): TeacherClass {
        return runBackendRequest {
            api.decideClassEnrollment(
                bearerToken(),
                classId,
                studentId,
                EnrollmentDecisionRequest(decision)
            ).`class`
        }
    }

    suspend fun updateCommunity(students: List<String>): List<String> {
        return runBackendRequest {
            api.updateCommunity(bearerToken(), CommunityRequest(students)).community.students
        }
    }

    suspend fun saveSubmission(submission: ExamSubmission) {
        runBackendRequest { api.saveSubmission(bearerToken(), submission.copy(deviceId = deviceId())) }
    }

    suspend fun getSubmissions(): List<ExamSubmission> {
        return runBackendRequest { api.getSubmissions(bearerToken()).submissions }
    }

    suspend fun clearSubmissions() {
        runBackendRequest { api.clearSubmissions(bearerToken()) }
    }

    suspend fun getMySession(examId: String? = null): ExamSession {
        return runBackendRequest { api.getMySession(bearerToken(), examId).session }
    }

    suspend fun startSession(examId: String? = null): ExamSession {
        return runBackendRequest {
            api.startSession(
                bearerToken(),
                SessionExamRequest(examId = examId, deviceId = deviceId())
            ).session.let { it.copy(timingAnchorElapsedRealtime = android.os.SystemClock.elapsedRealtime()) }
        }
    }

    suspend fun submitSession(examId: String? = null): ExamSession {
        return runBackendRequest {
            api.submitSession(bearerToken(), SessionExamRequest(examId)).session
        }
    }

    suspend fun lockSession(reason: String, examId: String? = null, suspicionScore: Int? = null, attemptStartedAt: Long? = null): ExamSession {
        return runBackendRequest {
            api.lockSession(bearerToken(), LockSessionRequest(reason, examId, suspicionScore, attemptStartedAt, deviceId())).session
        }
    }

    suspend fun getSubmissionGrade(studentId: String, examId: String): ExamSubmission {
        return runBackendRequest { api.getSubmissionGrade(bearerToken(), studentId, examId).submission }
    }

    suspend fun getPendingNotifications(studentId: String): List<StudentNotification> {
        return runBackendRequest {
            api.getStudentNotifications(bearerToken(), studentId, pending = true).notifications
        }
    }

    suspend fun markNotificationRead(studentId: String, notificationId: String) {
        runBackendRequest {
            api.markStudentNotificationRead(bearerToken(), studentId, notificationId)
        }
    }

    suspend fun getExamAttendanceOverview(examId: String): ExamAttendanceOverview {
        return runBackendRequest { api.getExamAttendanceOverview(bearerToken(), examId) }
    }

    suspend fun getExamSubmissions(examId: String): List<ExamSubmission> {
        return runBackendRequest { api.getExamSubmissions(bearerToken(), examId).submissions }
    }

    suspend fun gradeExamSubmission(
        examId: String,
        studentId: String,
        grade: Double,
        feedback: String
    ): ExamSubmission {
        return runBackendRequest {
            api.gradeExamSubmission(
                bearerToken(),
                examId,
                studentId,
                GradeSubmissionRequest(grade = grade, feedback = feedback)
            ).submission
        }
    }

    suspend fun getSessions(): List<ExamSession> {
        return runBackendRequest { api.getSessions(bearerToken()).sessions }
    }

    suspend fun getLiveProctoring(examId: String): LiveProctoringResponse {
        return runBackendRequest { api.getLiveProctoring(bearerToken(), examId) }
    }

    private suspend fun sendMonitoringRequest(request: ProctoringEventRequest): LiveStudent {
        val requestToken = sessionManager.getToken()
        return try {
            api.sendProctoringEvent(bearerToken(), request).student
        } catch (error: HttpException) {
            if (error.code() != 401 || requestToken == null || sessionManager.getRefreshToken(baseUrl) == null) throw error
            refreshSavedSession(requestToken)
            api.sendProctoringEvent(bearerToken(), request).student
        }
    }

    suspend fun sendProctoringEvent(request: ProctoringEventRequest): LiveStudent {
        require((request.attemptStartedAt ?: 0L) > 0L) { "Monitoring requires a server attempt timestamp." }
        val snapshotLock = when (request.eventName) {
            "camera_preview_updated" -> cameraSnapshotRequest
            "screen_telemetry_uploaded" -> screenSnapshotRequest
            else -> null
        }
        // Drop a new routine snapshot while another is pending; never queue frames.
        if (snapshotLock != null && !snapshotLock.tryLock()) throw IOException("Snapshot sender is busy.")
        try {
            return monitoringRequests.withPermit {
                var retries = 0
                while (true) {
                    try {
                        // Reuse the exact immutable request and identifiers for every retry.
                        return@withPermit sendMonitoringRequest(request)
                    } catch (error: Exception) {
                        if (error is CancellationException) throw error
                        val status = (error as? HttpException)?.code()
                        if (retries >= 2 || error !is IOException && status !in listOf(429, 502, 503, 504)) throw error
                        val retryAfter = (error as? HttpException)?.response()?.headers()?.get("Retry-After")?.toLongOrNull()?.times(1000L)
                        // Long rate-limit windows are not shortened by the client.
                        if (status == 429 && (retryAfter == null || retryAfter > 5_000L)) throw error
                        val backoff = retryAfter?.coerceAtLeast(500L) ?: (500L shl retries)
                        retries++
                        delay(backoff + kotlin.random.Random.nextLong(0L, 201L))
                    }
                }
                @Suppress("UNREACHABLE_CODE")
                error("Monitoring retry loop ended unexpectedly.")
            }
        } catch (error: HttpException) {
            throw readBackendFailure(error)
        } finally {
            snapshotLock?.unlock()
        }
    }

    suspend fun resetSession(studentId: String, examId: String? = null): ExamSession {
        return runBackendRequest {
            api.resetSession(bearerToken(), studentId, ResetSessionRequest(examId)).session
        }
    }

    suspend fun getSelfExamClasses(): List<SelfExamClass> {
        return runBackendRequest { api.getSelfExamClasses(bearerToken()).classes }
    }

    suspend fun getSelfExamSubjects(classId: String): List<SelfExamSubject> {
        return runBackendRequest { api.getSelfExamSubjects(bearerToken(), classId).subjects }
    }

    suspend fun getSelfExamChapters(subjectId: String): List<SelfExamChapter> {
        return runBackendRequest { api.getSelfExamChapters(bearerToken(), subjectId).chapters }
    }

    suspend fun getActiveSelfExamSession(): SelfExamSession? {
        return runBackendRequest { api.getActiveSelfExamSession(bearerToken()).session }
    }

    suspend fun createSelfExamSession(request: CreateSelfExamSessionRequest): SelfExamSession {
        return runBackendRequest { api.createSelfExamSession(bearerToken(), request.copy(checkpointVersion = if (com.jubayer.cheatlock.BuildConfig.SELF_EXAM_BULK_V1 && com.jubayer.cheatlock.BuildConfig.SELF_EXAM_CHECKPOINT_V1) 1 else null)).session }
            ?: error("Self exam session was not created.")
    }

    suspend fun startSelfExamSession(sessionId: String): SelfExamPayloadResponse {
        val requestStarted = android.os.SystemClock.elapsedRealtime()
        return runBackendRequest { api.startSelfExamSession(bearerToken(), sessionId) }
            .also { it.timingAnchorElapsedRealtime = requestStarted }
    }

    suspend fun getSelfExamSession(sessionId: String): SelfExamPayloadResponse {
        val requestStarted = android.os.SystemClock.elapsedRealtime()
        return runBackendRequest { api.getSelfExamSession(bearerToken(), sessionId) }
            .also { it.timingAnchorElapsedRealtime = requestStarted }
    }

    suspend fun saveSelfExamAnswer(
        sessionId: String,
        questionId: String,
        selectedOptionId: String?
    ): SelfExamAnswer {
        return runBackendRequest {
            api.saveSelfExamAnswer(
                bearerToken(),
                sessionId,
                SaveSelfExamAnswerRequest(
                    questionId = questionId,
                    selectedOptionId = selectedOptionId
                )
            ).answer
        }
    }

    suspend fun submitSelfExam(sessionId: String): SelfExamResultResponse {
        return runBackendRequest { api.submitSelfExam(bearerToken(), sessionId) }
    }

    suspend fun getSelfExamResult(sessionId: String): SelfExamResultResponse {
        return runBackendRequest { api.getSelfExamResult(bearerToken(), sessionId) }
    }

    suspend fun validateSession(): UserAccount? {
        if (!sessionManager.hasSession()) return null
        return try {
            val response = runBackendRequest { api.getMe(bearerToken()) }
            val user = response.user.toUserAccount()
            // Update local user data if it changed on server
            val token = sessionManager.getToken()
            if (token != null) {
                sessionManager.updateUser(user)
                // Existing installations can enroll without typing credentials
                // again while their original access token is still valid.
                if (sessionManager.getRefreshToken(baseUrl) == null) {
                    try {
                        val remembered = runBackendRequest { api.rememberSession(bearerToken()) }
                        sessionManager.replaceSessionIfCurrent(
                            token, null, token, user, remembered.refreshToken, baseUrl
                        )
                    } catch (error: Exception) {
                        if (error is CancellationException) throw error
                        // Older servers may not yet implement /auth/session.
                        // Keep the valid login; retry enrollment on next launch.
                        Log.w("CHEATLOCK_FLOW", "Persistent session enrollment unavailable.")
                    }
                }
            } else {
                Log.w("CHEATLOCK_FLOW", "validateSession: token was null, unable to save updated session locally.")
            }
            user
        } catch (e: Exception) {
            if (e is CancellationException) throw e
            // Only a rejected token ends the session. Network failures must remain
            // retryable and must not discard saved credentials.
            if (e is BackendRequestException && e.statusCode == 401) {
                logout()
                return null
            }
            throw e
        }
    }

    suspend fun updateProfile(name: String, identifier: String): UserAccount {
        val response = runBackendRequest {
            api.updateMe(
                bearerToken(),
                UpdateProfileRequest(
                    name = name.trim(),
                    identifier = IdentifierNormalizer.normalize(identifier)
                )
            )
        }
        val user = response.user.toUserAccount()
        sessionManager.updateUser(user)
        return user
    }

    fun getPersistedUser(): UserAccount? = sessionManager.getUser()

    fun hasAuthToken(): Boolean {
        return sessionManager.hasSession()
    }

    fun logout() {
        val refreshToken = sessionManager.getRefreshToken(baseUrl)
        sessionManager.logout()
        if (refreshToken != null) {
            api.revokeSession(RefreshSessionRequest(refreshToken)).enqueue(object : retrofit2.Callback<Void> {
                override fun onResponse(call: retrofit2.Call<Void>, response: retrofit2.Response<Void>) = Unit
                override fun onFailure(call: retrofit2.Call<Void>, error: Throwable) {
                    Log.w("CHEATLOCK_FLOW", "Device signed out locally; server revocation unavailable.")
                }
            })
        }
    }

    suspend fun deleteAccount(password: String) {
        runBackendRequest { api.deleteAccount(bearerToken(), DeleteAccountRequest(password)) }
        sessionManager.logout()
    }

    private fun bearerToken(): String {
        val token = sessionManager.getToken()
            ?: error("You need to log in again.")
        return "Bearer $token"
    }

    private fun deviceId(): String {
        return Settings.Secure.getString(
            appContext.contentResolver,
            Settings.Secure.ANDROID_ID
        ) ?: "unknown-device"
    }

    private fun AuthUserDto.toUserAccount(): UserAccount {
        return UserAccount(
            name = name,
            identifier = identifier,
            password = "",
            role = role
        )
    }

    private suspend fun refreshSavedSession(failedToken: String) = sessionRefreshMutex.withLock {
        val currentToken = sessionManager.getToken() ?: error("Please sign in again.")
        if (currentToken != failedToken) return@withLock
        val refreshToken = sessionManager.getRefreshToken(baseUrl) ?: error("Please sign in again.")
        val response = try {
            api.refreshSession(RefreshSessionRequest(refreshToken))
        } catch (error: HttpException) {
            if (error.code() == 401) {
                sessionManager.clearSessionIfCurrent(failedToken, refreshToken, baseUrl)
            }
            throw error
        }
        // A logout or a different login while the request was in flight wins.
        if (!sessionManager.replaceSessionIfCurrent(
            failedToken, refreshToken, response.token, response.user.toUserAccount(),
            response.refreshToken ?: refreshToken, baseUrl
        )) {
            error("The saved session changed. Please try again.")
        }
    }

    private suspend fun <T> runBackendRequest(allowSessionRefresh: Boolean = true, block: suspend () -> T): T {
        Log.d("CHEATLOCK_FLOW", "API Request initiated to: $baseUrl")
        val requestToken = sessionManager.getToken()
        return try {
            val result = try {
                block()
            } catch (error: HttpException) {
                if (!allowSessionRefresh || error.code() != 401 || requestToken == null ||
                    sessionManager.getRefreshToken(baseUrl) == null) throw error
                refreshSavedSession(requestToken)
                // Retry exactly once, using the newly saved access token.
                block()
            }
            Log.d("CHEATLOCK_FLOW", "API Request succeeded.")
            result
        } catch (error: Exception) {
            if (error is CancellationException) throw error
            val resolvedError = when (error) {
                is HttpException -> readBackendFailure(error)
                is IOException -> IllegalStateException(buildConnectionHelpMessage(error))
                is IllegalStateException -> error
                else -> IllegalStateException(error.message ?: "An unexpected backend error occurred.")
            }
            Log.e("CHEATLOCK_FLOW", "API Request failed: ${resolvedError.javaClass.simpleName}")
            throw resolvedError
        }
    }

    private fun buildConnectionHelpMessage(error: IOException): String {
        return buildString {
            appendLine("Cannot connect to CheatLock server.")
            appendLine("Trying: $baseUrl")
            appendLine("Reason: ${error.message ?: "connection failed"}")
            appendLine()
            appendLine("• Check your internet connection (Wi‑Fi or mobile data)")
            appendLine("• The server may be starting up — wait a moment and retry")
            appendLine("• Default server: https://cheatlock-backend.onrender.com/")
            if (BackendUrlResolver.isEmulator()) {
                appendLine("• Emulator local dev: use http://10.0.2.2:3000/")
            }
            appendLine("• Tap 'Server settings' below to change the server URL")
        }
    }

    private fun readBackendFailure(error: HttpException): BackendRequestException {
        val rawBody = runCatching { error.response()?.errorBody()?.string().orEmpty() }.getOrDefault("")
        return BackendRequestException.fromJson(error.code(), rawBody, baseUrl)
    }

    private companion object {
        val DEFAULT_BASE_URL: String = BuildConfig.CHEATLOCK_API_BASE_URL
        val sessionRefreshMutex = Mutex()
    }
}
