package com.jubayer.cheatlock.data

import android.content.Context
import com.jubayer.cheatlock.model.ExamSubmission
import com.jubayer.cheatlock.model.ExamAttemptKey
import com.jubayer.cheatlock.model.ExamSession
import com.jubayer.cheatlock.model.ExamSessionStatus
import com.jubayer.cheatlock.model.StudentAnswer
import com.jubayer.cheatlock.model.UserAccount
import com.jubayer.cheatlock.model.UserRole
import org.json.JSONArray
import org.json.JSONObject

class ExamStorage(context: Context) {

    private val prefs = context.getSharedPreferences(
        "cheatlock_exam_storage",
        Context.MODE_PRIVATE
    )

    internal fun saveAnswer(attempt: ExamAttemptKey?, questionIndex: Int, answer: String) {
        if (attempt == null) return
        prefs.edit().putString(attempt.answerKey(questionIndex), answer).apply()
    }

    internal fun getAnswer(attempt: ExamAttemptKey?, questionIndex: Int): String =
        attempt?.let { prefs.getString(it.answerKey(questionIndex), "") }.orEmpty()
    fun saveWarnings(appWarnings: Int, faceWarnings: Int) {
        prefs.edit()
            .putInt("app_warnings", appWarnings)
            .putInt("face_warnings", faceWarnings)
            .apply()
    }

    fun createAccount(account: UserAccount): Boolean {
        val accounts = getAccounts().toMutableList()
        val exists = accounts.any {
            it.identifier.equals(account.identifier, ignoreCase = true) &&
                it.role == account.role
        }

        if (exists) {
            return false
        }

        accounts.add(account)
        prefs.edit()
            .putString("accounts", encodeAccounts(accounts))
            .apply()
        return true
    }

    fun login(identifier: String, password: String, role: UserRole): UserAccount? {
        return getAccounts().firstOrNull { account ->
            account.identifier.equals(identifier.trim(), ignoreCase = true) &&
                account.password == password &&
                account.role == role
        }
    }

    fun getAccounts(): List<UserAccount> {
        val raw = prefs.getString("accounts", null) ?: return emptyList()
        return try {
            val json = JSONArray(raw)
            List(json.length()) { index ->
                val item = json.getJSONObject(index)
                val roleStr = item.optString("role", "STUDENT")
                val role = try {
                    UserRole.valueOf(roleStr)
                } catch (e: Exception) {
                    UserRole.STUDENT
                }
                UserAccount(
                    name = item.optString("name", ""),
                    identifier = item.optString("identifier", ""),
                    password = item.optString("password", ""),
                    role = role
                )
            }
        } catch (e: Exception) {
            android.util.Log.e("CHEATLOCK_FLOW", "Error parsing accounts JSON in ExamStorage", e)
            emptyList()
        }
    }

    fun saveSubmission(submission: ExamSubmission) {
        val submissions = getSubmissions().toMutableList()
        submissions.add(0, submission)

        prefs.edit()
            .putString("submissions", encodeSubmissions(submissions.take(50)))
            .apply()
    }

    fun getSubmissions(): List<ExamSubmission> {
        val raw = prefs.getString("submissions", null) ?: return emptyList()
        return try {
            SubmissionHistoryCodec.decode(raw)
        } catch (e: Exception) {
            android.util.Log.e("ExamStorage", "Error parsing submissions JSON", e)
            emptyList()
        }
    }

    fun clearSubmissions() {
        prefs.edit()
            .remove("submissions")
            .apply()
    }

    fun getSession(studentId: String): ExamSession {
        val raw = prefs.getString("session_$studentId", null)
            ?: return ExamSession(studentId = studentId, status = ExamSessionStatus.NOT_STARTED)
        return try {
            val json = JSONObject(raw)
            val statusStr = json.optString("status", "NOT_STARTED")
            val status = try {
                ExamSessionStatus.valueOf(statusStr)
            } catch (e: Exception) {
                ExamSessionStatus.NOT_STARTED
            }
            ExamSession(
                studentId = json.optString("studentId", studentId),
                status = status,
                startedAt = json.optLongOrNull("startedAt"),
                submittedAt = json.optLongOrNull("submittedAt"),
                lockedAt = json.optLongOrNull("lockedAt"),
                resetAt = json.optLongOrNull("resetAt"),
                resetBy = json.optStringOrNull("resetBy"),
                lockReason = json.optStringOrNull("lockReason"),
                suspicionScore = json.optInt("suspicionScore", 0),
                latestAlert = json.optString("latestAlert", ""),
                onlineStatus = json.optString("onlineStatus", "OFFLINE"),
                previewUrl = json.optString("previewUrl", ""),
                previewBase64 = json.optString("previewBase64", ""),
                lastSeenAt = json.optLongOrNull("lastSeenAt")
            )
        } catch (e: Exception) {
            android.util.Log.e("CHEATLOCK_FLOW", "Error parsing session JSON in ExamStorage for student: $studentId", e)
            ExamSession(studentId = studentId, status = ExamSessionStatus.NOT_STARTED)
        }
    }

    fun saveSession(session: ExamSession) {
        prefs.edit()
            .putString("session_${session.studentId}", encodeSession(session))
            .apply()
    }

    fun getSessions(): List<ExamSession> {
        return prefs.all.keys
            .filter { it.startsWith("session_") }
            .map { key -> getSession(key.removePrefix("session_")) }
            .sortedByDescending {
                it.submittedAt ?: it.lockedAt ?: it.startedAt ?: it.resetAt ?: 0L
            }
    }

    internal fun clearExam(attempt: ExamAttemptKey? = null) {
        prefs.edit().apply {
            remove("app_warnings")
            remove("face_warnings")
            prefs.all.keys.filter { key ->
                if (attempt == null) key.startsWith("answer_") else key.startsWith(attempt.prefix)
            }.forEach { remove(it) }
        }.apply()
    }
    private fun encodeSubmissions(submissions: List<ExamSubmission>): String {
        return SubmissionHistoryCodec.encode(submissions)
    }

    private fun encodeAccounts(accounts: List<UserAccount>): String {
        val json = JSONArray()

        accounts.forEach { account ->
            json.put(
                JSONObject()
                    .put("name", account.name)
                    .put("identifier", account.identifier)
                    .put("password", account.password)
                    .put("role", account.role.name)
            )
        }

        return json.toString()
    }

    private fun encodeSession(session: ExamSession): String {
        return JSONObject()
            .put("studentId", session.studentId)
            .put("status", session.status.name)
            .put("startedAt", session.startedAt)
            .put("submittedAt", session.submittedAt)
            .put("lockedAt", session.lockedAt)
            .put("resetAt", session.resetAt)
            .put("resetBy", session.resetBy)
            .put("lockReason", session.lockReason)
            .put("suspicionScore", session.suspicionScore)
            .put("latestAlert", session.latestAlert)
            .put("onlineStatus", session.onlineStatus)
            .put("previewUrl", session.previewUrl)
            .put("previewBase64", session.previewBase64)
            .put("lastSeenAt", session.lastSeenAt)
            .toString()
    }

    private fun JSONObject.optLongOrNull(name: String): Long? {
        return if (has(name) && !isNull(name)) optLong(name) else null
    }

    private fun JSONObject.optDoubleOrNull(name: String): Double? {
        return if (has(name) && !isNull(name)) optDouble(name) else null
    }

    private fun JSONObject.optStringOrNull(name: String): String? {
        return if (has(name) && !isNull(name)) optString(name) else null
    }
}
