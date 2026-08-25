package com.jubayer.cheatlock.data

import android.content.Context

class SelfExamStorage(context: Context) {
    private val prefs = context.getSharedPreferences(
        "cheatlock_self_exam_storage",
        Context.MODE_PRIVATE
    )

    fun saveActiveSessionId(sessionId: String) {
        prefs.edit().putString(KEY_ACTIVE_SESSION_ID, sessionId).apply()
    }

    fun getActiveSessionId(): String? {
        return prefs.getString(KEY_ACTIVE_SESSION_ID, null)?.takeIf { it.isNotBlank() }
    }

    fun clearActiveSessionId() {
        prefs.edit().remove(KEY_ACTIVE_SESSION_ID).apply()
    }

    private companion object {
        const val KEY_ACTIVE_SESSION_ID = "active_session_id"
    }
}
