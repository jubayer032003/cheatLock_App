package com.jubayer.cheatlock.util

/** A shareable location code: no exception messages, account data or file paths. */
internal object CrashSupportCode {
    private const val FALLBACK = "CL-APP-OTHER-0"
    private val format = Regex("CL-(EXAM|CAMERA|SCREEN|STARTUP|APP)-(NPE|QTYPE|QTEXT|QOPTIONS|QIDS|SECURITY|STATE|ARG|OOM|OTHER)-[0-9]{1,5}")

    fun sanitize(value: String?): String = value?.takeIf { format.matches(it) } ?: FALLBACK

    fun from(error: Throwable): String {
        // Bounded traversal also handles malformed/cyclic cause chains.
        val causes = generateSequence(error) { it.cause }.take(8).toList()
        val failure = causes.lastOrNull { cause ->
            cause.stackTrace.any { it.className.startsWith("com.jubayer.cheatlock.") }
        } ?: causes.last()
        val frame = failure.stackTrace.firstOrNull {
            it.className.startsWith("com.jubayer.cheatlock.")
        }
        val stage = when {
            frame == null -> "APP"
            frame.className.startsWith("com.jubayer.cheatlock.ui.ExamScreenKt") ||
                frame.className == "com.jubayer.cheatlock.ui.IndexedQuestion" ||
                frame.className == "com.jubayer.cheatlock.ui.IndexedOption" -> "EXAM"
            frame.className.startsWith("com.jubayer.cheatlock.ui.CameraPreviewKt") -> "CAMERA"
            frame.className.startsWith("com.jubayer.cheatlock.proctoring.ScreenCapture") -> "SCREEN"
            frame.className.startsWith("com.jubayer.cheatlock.MainActivity") -> "STARTUP"
            else -> "APP"
        }
        // Only fixed, known parameter labels are retained; never expose the raw message.
        val questionParameter = if (failure is NullPointerException &&
            frame?.methodName == "<init>" && frame.className in setOf(
                "com.jubayer.cheatlock.ui.IndexedQuestion", "com.jubayer.cheatlock.ui.IndexedOption")) {
            failure.message.orEmpty().substringAfterLast(", parameter ", "")
        } else ""
        val type = when (questionParameter) {
            "type" -> "QTYPE"
            "text" -> "QTEXT"
            "options" -> "QOPTIONS"
            "optionIds" -> "QIDS"
            else -> when (failure) {
            is NullPointerException -> "NPE"
            is SecurityException -> "SECURITY"
            is IllegalStateException -> "STATE"
            is IllegalArgumentException -> "ARG"
            is OutOfMemoryError -> "OOM"
            else -> "OTHER"
            }
        }
        return "CL-$stage-$type-${(frame?.lineNumber ?: 0).coerceIn(0, 99999)}"
    }
}