package com.jubayer.cheatlock.util

import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import java.util.concurrent.TimeUnit

object BackendConnectionProbe {

    private val client = OkHttpClient.Builder()
        .connectTimeout(50, TimeUnit.SECONDS)
        .readTimeout(50, TimeUnit.SECONDS)
        .build()

    suspend fun findWorkingUrl(context: Context): String? = withContext(Dispatchers.IO) {
        val configured = BackendUrlStore.configuredUrl(context)
        for (candidate in BackendUrlResolver.connectionCandidates(configured)) {
            if (ping(candidate)) return@withContext candidate
        }
        null
    }

    suspend fun ping(url: String): Boolean = withContext(Dispatchers.IO) {
        runCatching {
            val base = url.trimEnd('/')
            val healthOk = client.newCall(
                Request.Builder()
                    .url("$base/health")
                    .get()
                    .build()
            ).execute().use { response ->
                response.isSuccessful &&
                    response.peekBody(256).string().contains("ok", ignoreCase = true)
            }

            val selfExamRouteMounted = client.newCall(
                Request.Builder()
                    .url("$base/self-exam/classes")
                    .get()
                    .build()
            ).execute().use { response ->
                response.code() in setOf(200, 401, 403)
            }

            healthOk && selfExamRouteMounted
        }.getOrDefault(false)
    }

    suspend fun testUrl(url: String): Result<String> = withContext(Dispatchers.IO) {
        val resolved = BackendUrlResolver.resolve(url)
        if (ping(resolved)) {
            Result.success(resolved)
        } else {
            Result.failure(
                IllegalStateException("No compatible response from $resolved — check backend, firewall, and self-exam routes.")
            )
        }
    }
}
