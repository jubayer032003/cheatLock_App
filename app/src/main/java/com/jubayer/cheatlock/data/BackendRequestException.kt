package com.jubayer.cheatlock.data

import com.google.gson.JsonParser

/** Keeps HTTP failures distinct from network and device-permission failures. */
class BackendRequestException private constructor(
    val statusCode: Int,
    val backendCode: String?,
    val serverUrl: String,
    val questionBankFailure: QuestionBankFailure?,
    message: String
) : IllegalStateException(message) {
    companion object {
        fun fromJson(statusCode: Int, rawBody: String, serverUrl: String): BackendRequestException {
            val body = runCatching { JsonParser.parseString(rawBody).asJsonObject }.getOrNull()
            fun text(name: String): String? = runCatching {
                body?.get(name)?.takeIf { it.isJsonPrimitive && it.asJsonPrimitive.isString }?.asString
            }.getOrNull()
            return fromResponse(statusCode, text("code"), text("message"), serverUrl)
        }

        fun fromResponse(statusCode: Int, code: String?, message: String?, serverUrl: String): BackendRequestException {
            val failure = when {
                code == "SUPABASE_NOT_CONFIGURED" -> QuestionBankFailure.CONFIGURATION
                code in setOf("PGRST205", "PGRST204", "42P01", "42703") -> QuestionBankFailure.SCHEMA
                code == "42501" -> QuestionBankFailure.ACCESS
                message.orEmpty().contains("supabase migration has not been applied", ignoreCase = true) -> QuestionBankFailure.SCHEMA
                else -> null
            }
            val safeMessage = when (failure) {
                QuestionBankFailure.CONFIGURATION -> "Question Bank is not configured on the server. Please contact the administrator."
                QuestionBankFailure.SCHEMA -> "Question Bank is unavailable on the server. The administrator needs to check its database connection, schema and access."
                QuestionBankFailure.ACCESS -> "The server cannot access Question Bank. Please contact the administrator."
                null -> if (statusCode >= 500) "The server could not complete this request. Please try again."
                    else message?.takeIf { it.isNotBlank() } ?: "Backend request failed ($statusCode)."
            }
            return BackendRequestException(statusCode, code, serverUrl, failure, safeMessage)
        }
    }
}

enum class QuestionBankFailure { CONFIGURATION, SCHEMA, ACCESS }
