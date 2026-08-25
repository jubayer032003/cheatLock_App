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

class MongoBackendRepository(
    context: Context,
    private val baseUrl: String = DEFAULT_BASE_URL
) {
    private val appContext = context.applicationContext
    private val sessionManager = SessionManager(context)

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

    suspend fun checkHealth(): Boolean {
        return runCatching {
            runBackendRequest { api.health() }.ok
        }.getOrDefault(false)
    }

    fun currentBaseUrl(): String = baseUrl

    suspend fun signup(account: UserAccount): UserAccount {
        val normalizedId = IdentifierNormalizer.normalize(account.identifier)
        val response = runBackendRequest {
            api.signup(
                AuthRequest(
                    name = account.name.trim(),
                    identifier = normalizedId,
                    password = account.password,
                    role = account.role
                )
            )
        }

        saveAuthToken(response.token, response.user.toUserAccount())
        return response.user.toUserAccount()
    }

    suspend fun login(identifier: String, password: String, role: UserRole): UserAccount {
        val normalizedId = IdentifierNormalizer.normalize(identifier)
        val response = runBackendRequest {
            api.login(
                AuthRequest(
                    identifier = normalizedId,
                    password = password,
                    role = role
                )
            )
        }

        saveAuthToken(response.token, response.user.toUserAccount())
        return response.user.toUserAccount()
    }

    private fun saveAuthToken(token: String, user: UserAccount) {
        sessionManager.saveSession(token, user)
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
        runBackendRequest { api.saveSubmission(bearerToken(), submission) }
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
            ).session
        }
    }

    suspend fun submitSession(examId: String? = null): ExamSession {
        return runBackendRequest {
            api.submitSession(bearerToken(), SessionExamRequest(examId)).session
        }
    }

    suspend fun lockSession(reason: String, examId: String? = null, suspicionScore: Int? = null): ExamSession {
        return runBackendRequest {
            api.lockSession(bearerToken(), LockSessionRequest(reason, examId, suspicionScore)).session
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

    suspend fun sendProctoringEvent(request: ProctoringEventRequest): LiveStudent {
        if (BuildConfig.ENABLE_RUNTIME_TRACING) {
            Log.d("RUNTIME_TRACE", "[Step 4] MongoBackendRepository: BEFORE Retrofit request. Event: ${request.eventName}, examId: ${request.examId}, studentId: ${request.studentId}, payload size: ${request.previewBase64?.length ?: 0}. Timestamp: ${System.currentTimeMillis()}")
        }
        return try {
            val result = api.sendProctoringEvent(bearerToken(), request).student
            if (BuildConfig.ENABLE_RUNTIME_TRACING) {
                Log.d("RUNTIME_TRACE", "[Step 5] MongoBackendRepository: AFTER Retrofit response (Success). Event: ${request.eventName}, studentId: ${result.studentId}. Timestamp: ${System.currentTimeMillis()}")
            }
            result
        } catch (e: Exception) {
            Log.e("RUNTIME_TRACE", "Proctoring event request failed.", e)
            throw e
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
        return runBackendRequest { api.createSelfExamSession(bearerToken(), request).session }
            ?: error("Self exam session was not created.")
    }

    suspend fun startSelfExamSession(sessionId: String): SelfExamPayloadResponse {
        return runBackendRequest { api.startSelfExamSession(bearerToken(), sessionId) }
    }

    suspend fun getSelfExamSession(sessionId: String): SelfExamPayloadResponse {
        return runBackendRequest { api.getSelfExamSession(bearerToken(), sessionId) }
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
                sessionManager.saveSession(token, user)
            } else {
                Log.w("CHEATLOCK_FLOW", "validateSession: token was null, unable to save updated session locally.")
            }
            user
        } catch (e: Exception) {
            // If token is invalid (401), clear session
            if (e.message?.contains("401") == true || e.message?.contains("Unauthorized") == true) {
                logout()
            }
            null
        }
    }

    fun getPersistedUser(): UserAccount? = sessionManager.getUser()

    fun hasAuthToken(): Boolean {
        return sessionManager.hasSession()
    }

    fun logout() {
        sessionManager.logout()
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

    private suspend fun <T> runBackendRequest(block: suspend () -> T): T {
        Log.d("CHEATLOCK_FLOW", "API Request initiated to: $baseUrl")
        return try {
            val result = block()
            Log.d("CHEATLOCK_FLOW", "API Request succeeded.")
            result
        } catch (error: Exception) {
            val resolvedError = when (error) {
                is HttpException -> IllegalStateException("${readBackendMessage(error)}\nServer: $baseUrl")
                is IOException -> IllegalStateException(buildConnectionHelpMessage(error))
                is IllegalStateException -> error
                else -> IllegalStateException(error.message ?: "An unexpected backend error occurred.")
            }
            Log.e("CHEATLOCK_FLOW", "API Request failed: ${resolvedError.message}", error)
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

    private fun readBackendMessage(error: HttpException): String {
        val raw = error.response()?.errorBody()?.string().orEmpty()
        val message = Regex("\"message\"\\s*:\\s*\"([^\"]+)\"")
            .find(raw)
            ?.groupValues
            ?.getOrNull(1)
        val plainText = raw
            .replace(Regex("<[^>]+>"), " ")
            .replace(Regex("\\s+"), " ")
            .trim()
            .takeIf { it.isNotEmpty() }
            ?.take(220)
        return message ?: plainText ?: "Backend request failed (${error.code()})."
    }

    private companion object {
        val DEFAULT_BASE_URL: String = BuildConfig.CHEATLOCK_API_BASE_URL
    }
}
