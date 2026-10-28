package com.jubayer.cheatlock.data

import android.content.Context
import android.util.Base64
import android.util.AtomicFile
import com.google.gson.GsonBuilder
import com.jubayer.cheatlock.model.PendingBulkSelfExamSubmission
import com.jubayer.cheatlock.selfexam.BulkSubmissionStore
import com.jubayer.cheatlock.selfexam.validatePendingBulkSubmission
import java.io.File
import com.jubayer.cheatlock.selfexam.SelfExamRecoveryScope
import org.json.JSONObject

class SelfExamStorage(context: Context) : BulkSubmissionStore, com.jubayer.cheatlock.selfexam.CheckpointStore {
    private val pendingDirectory = File(context.noBackupFilesDir, "self-exam-bulk-v1")
    private val pendingJson = GsonBuilder().serializeNulls().create()
    private val prefs = context.getSharedPreferences("cheatlock_self_exam_storage", Context.MODE_PRIVATE)
    private val sessions = SessionManager(context)

    // Token payload is used ONLY to namespace local pointers, never to authorize.
    // Backend still verifies the JWT and owns all access/scoring decisions.
    private fun pointerKey(): String? = runCatching {
        val token = sessions.getToken() ?: return null
        val parts = token.split('.')
        if (parts.size != 3) return null
        val json = String(Base64.decode(parts[1], Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING), Charsets.UTF_8)
        val subject = JSONObject(json).optString("sub")
        SelfExamRecoveryScope.accountPointerKey(subject)
    }.getOrNull()

    fun saveActiveSessionId(sessionId: String) {
        val key = pointerKey() ?: return
        prefs.edit().putString(key, sessionId).apply()
    }
    fun getActiveSessionId(): String? {
        val key = pointerKey() ?: return null
        // The old shared active_session_id is deliberately ignored, not migrated.
        return prefs.getString(key, null)?.takeIf { it.isNotBlank() }
    }
    fun clearActiveSessionId() {
        val key = pointerKey() ?: return
        prefs.edit().remove(key).apply()
    }

    private fun pendingFile(): AtomicFile {
        val key = checkNotNull(pointerKey()) { "Sign in again to recover your saved submission." }
        check(pendingDirectory.isDirectory || pendingDirectory.mkdirs()) { "Saved submission storage is unavailable." }
        return AtomicFile(File(pendingDirectory, "$key.json"))
    }
    override fun read(): PendingBulkSelfExamSubmission? {
        val file = pendingFile()
        val bytes = try { file.readFully() } catch (missing: java.io.FileNotFoundException) { return null }
        check(bytes.size <= 128 * 1024) { "Saved submission needs recovery review." }
        return validatePendingBulkSubmission(checkNotNull(pendingJson.fromJson(String(bytes, Charsets.UTF_8), PendingBulkSelfExamSubmission::class.java)))
    }
    override fun write(value: PendingBulkSelfExamSubmission) {
        validatePendingBulkSubmission(value)
        val file = pendingFile()
        val stream = file.startWrite()
        try {
            stream.write(pendingJson.toJson(value).toByteArray(Charsets.UTF_8))
            file.finishWrite(stream)
        } catch (error: Exception) { file.failWrite(stream); throw error }
    }
    override fun acknowledge(sessionId: String) {
        if (read()?.sessionId == sessionId) pendingFile().delete()
    }
    private fun checkpointFile(sessionId: String): AtomicFile {
        require(sessionId.matches(Regex("[a-f0-9-]{36}")))
        val key = checkNotNull(pointerKey())
        check(pendingDirectory.isDirectory || pendingDirectory.mkdirs())
        return AtomicFile(File(pendingDirectory, "$key-checkpoint-$sessionId.json"))
    }
    override fun readCheckpoint(sessionId: String): com.jubayer.cheatlock.selfexam.PendingCheckpoint? {
        val bytes = try { checkpointFile(sessionId).readFully() } catch (_: java.io.FileNotFoundException) { return null }
        check(bytes.size <= 128 * 1024)
        return checkNotNull(pendingJson.fromJson(String(bytes, Charsets.UTF_8), com.jubayer.cheatlock.selfexam.PendingCheckpoint::class.java)).also { check(it.sessionId == sessionId) }
    }
    override fun writeCheckpoint(value: com.jubayer.cheatlock.selfexam.PendingCheckpoint) {
        val file = checkpointFile(value.sessionId)
        val stream = file.startWrite()
        try { stream.write(pendingJson.toJson(value).toByteArray(Charsets.UTF_8)); file.finishWrite(stream) }
        catch (error: Exception) { file.failWrite(stream); throw error }
    }
    override fun clearCheckpoint(sessionId: String) { checkpointFile(sessionId).delete() }

}
