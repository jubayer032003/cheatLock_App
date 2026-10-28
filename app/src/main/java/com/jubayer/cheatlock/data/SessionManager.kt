package com.jubayer.cheatlock.data

import android.content.Context
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import com.google.gson.Gson
import com.jubayer.cheatlock.model.UserAccount

/**
 * Manages persistent user sessions using EncryptedSharedPreferences.
 */
class SessionManager(context: Context) {
    private val gson = Gson()
    private val appContext = context.applicationContext
    
    private val prefs = try {
        val masterKey = MasterKey.Builder(appContext)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()
        EncryptedSharedPreferences.create(
            appContext,
            "cheatlock_secure_session",
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        )
    } catch (e: Exception) {
        android.util.Log.e("CHEATLOCK_FLOW", "Secure session storage is unavailable; credentials will not be persisted.", e)
        null
    }.also {
        // Remove credentials written by older builds that silently downgraded to
        // unencrypted SharedPreferences when Android Keystore initialization failed.
        appContext.getSharedPreferences(LEGACY_INSECURE_PREFS, Context.MODE_PRIVATE)
            .edit()
            .clear()
            .apply()
    }

    fun saveSession(token: String, user: UserAccount, refreshToken: String? = null, serverUrl: String? = null) = synchronized(sessionLock) {
        prefs?.edit()?.apply {
            putString(KEY_TOKEN, token)
            putString(KEY_USER_JSON, gson.toJson(user))
            putString(KEY_REFRESH_TOKEN, refreshToken)
            putString(KEY_SERVER_URL, serverUrl?.trimEnd('/'))
            apply()
        }
    }

    fun updateUser(user: UserAccount) {
        prefs?.edit()?.apply {
            putString(KEY_USER_JSON, gson.toJson(user))
            apply()
        }
    }

    fun getToken(): String? = prefs?.getString(KEY_TOKEN, null)

    // A device secret issued by one server must never be sent to another server.
    fun getRefreshToken(serverUrl: String): String? {
        if (prefs?.getString(KEY_SERVER_URL, null) != serverUrl.trimEnd('/')) return null
        return prefs.getString(KEY_REFRESH_TOKEN, null)?.takeIf { it.isNotBlank() }
    }

    fun replaceSessionIfCurrent(
        expectedToken: String, expectedRefreshToken: String?, token: String,
        user: UserAccount, refreshToken: String, serverUrl: String
    ): Boolean = synchronized(sessionLock) {
        if (getToken() != expectedToken || getRefreshToken(serverUrl) != expectedRefreshToken) {
            return@synchronized false
        }
        saveSession(token, user, refreshToken, serverUrl)
        true
    }

    fun clearSessionIfCurrent(expectedToken: String, expectedRefreshToken: String, serverUrl: String) = synchronized(sessionLock) {
        if (getToken() == expectedToken && getRefreshToken(serverUrl) == expectedRefreshToken) logout()
    }

    fun getUser(): UserAccount? {
        val userJson = prefs?.getString(KEY_USER_JSON, null) ?: return null
        return try {
            gson.fromJson(userJson, UserAccount::class.java)
        } catch (e: Exception) {
            null
        }
    }

    fun hasSession(): Boolean = !getToken().isNullOrBlank() && getUser() != null

    fun logout() = synchronized(sessionLock) {
        prefs?.edit()?.clear()?.apply()
        appContext.getSharedPreferences(LEGACY_INSECURE_PREFS, Context.MODE_PRIVATE)
            .edit()
            .clear()
            .apply()
    }

    companion object {
        private val sessionLock = Any()
        private const val KEY_TOKEN = "auth_token"
        private const val KEY_USER_JSON = "user_account"
        private const val KEY_REFRESH_TOKEN = "refresh_token"
        private const val KEY_SERVER_URL = "session_server_url"
        private const val LEGACY_INSECURE_PREFS = "cheatlock_backup_session"
    }
}
