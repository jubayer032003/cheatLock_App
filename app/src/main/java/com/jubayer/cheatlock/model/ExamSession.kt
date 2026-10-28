package com.jubayer.cheatlock.model

enum class ExamSessionStatus {
    NOT_STARTED,
    IN_PROGRESS,
    SUBMITTED,
    LOCKED,
    RESET_BY_TEACHER,
    UNKNOWN
}

data class ExamSession(
    val studentId: String,
    val status: ExamSessionStatus,
    val examId: String? = null,
    val studentName: String? = null,
    val startedAt: Long? = null,
    val submittedAt: Long? = null,
    val lockedAt: Long? = null,
    val resetAt: Long? = null,
    val resetBy: String? = null,
    val lockReason: String? = null,
    val suspicionScore: Int = 0,
    val latestAlert: String = "",
    val onlineStatus: String = "OFFLINE",
    val previewUrl: String = "",
    val previewBase64: String = "",
    val lastSeenAt: Long? = null,
    val serverTime: Long? = null,
    @Transient val timingAnchorElapsedRealtime: Long? = null
)
