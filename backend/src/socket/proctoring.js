import { Exam } from "../models/Exam.js";
import { ExamSession } from "../models/ExamSession.js";
import { ProctoringEvent } from "../models/ProctoringEvent.js";
import { User } from "../models/User.js";
import { verifyToken } from "../middleware/auth.js";
import { consumeSocketAuthRateLimit } from "../middleware/rateLimiter.js";
import { uploadFrame, getSignedFrameUrl, isS3Configured } from "../services/s3.js";
import { logger } from "../services/logger.js";
import {
  normalizeEvidencePriority,
  retentionClassForPriority,
  retentionExpiresAtForPriority,
  promoteEvidenceForArrivingFrame,
  promoteEvidenceForSuspiciousEvent,
  sanitizeEvidenceIds,
} from "../services/evidenceRetention.js";

const STUDENT_EVENTS = [
  "student_joined_exam",
  "student_left_exam",
  "suspicion_score_updated",
  "ai_alert_created",
  "camera_preview_updated",
  "screen_telemetry_uploaded",
  "student_heartbeat",
];
const TEACHER_COMMAND_ROLES = ["SUPER_ADMIN", "INSTITUTION_ADMIN", "DEPARTMENT_ADMIN", "TEACHER", "PROCTOR"];
const ALLOWED_TEACHER_COMMANDS = [
  "WARN_STUDENT",
  "REQUEST_LIVENESS",
  "REQUEST_ROOM_SCAN",
  "PAUSE_EXAM",
  "RESUME_EXAM",
  "LOCK_EXAM",
  "END_EXAM",
];
const MAX_COMMAND_MESSAGE_LENGTH = 1000;
const MAX_COMMAND_STUDENT_ID_LENGTH = 128;
const ALERT_SCORE_DELTA = 20;
const MAX_MEDIA_DATA_URL_BYTES = 2 * 1024 * 1024;
const SCORE_TRACE_ENABLED = process.env.SUSPICIOUS_SCORE_TRACE === "true";

export function isStudentProctoringEvent(eventName) {
  return STUDENT_EVENTS.includes(eventName);
}

export function normalizeScoreMetrics({
  score = 0,
  suspiciousActivityCount = 0,
  capturedFrameCount = 0,
  processedFrameCount = 0,
  updatedAt = null,
} = {}) {
  const rawScore = clampScore(score);
  const maximumScore = 100;
  const percentage = clampScore(rawScore);
  return {
    rawScore,
    maximumScore,
    percentage,
    trustScore: clampScore(maximumScore - percentage),
    suspiciousActivityCount: clampNonNegativeInteger(suspiciousActivityCount),
    capturedFrameCount: clampNonNegativeInteger(capturedFrameCount),
    processedFrameCount: clampNonNegativeInteger(processedFrameCount),
    updatedAt: normalizeDateString(updatedAt),
  };
}

function getWeightForAlert(alertText, weights) {
  const text = String(alertText || "").toLowerCase();
  if (text.includes("face not detected") || text.includes("looking away") || text.includes("face_missing") || text.includes("missing")) {
    return weights.faceMissingWeight ?? ALERT_SCORE_DELTA;
  }
  if (text.includes("multiple faces") || text.includes("multiple detected") || text.includes("multiple")) {
    return weights.multipleFacesWeight ?? ALERT_SCORE_DELTA;
  }
  if (text.includes("phone") || text.includes("mobile") || text.includes("device")) {
    return weights.phoneDetectedWeight ?? ALERT_SCORE_DELTA;
  }
  if (text.includes("ambient noise") || text.includes("voice") || text.includes("speech") || text.includes("sound") || text.includes("talking") || text.includes("whisper")) {
    return weights.speechDetectedWeight ?? ALERT_SCORE_DELTA;
  }
  if (text.includes("blurred") || text.includes("app switch") || text.includes("focus") || text.includes("tab")) {
    return weights.repeatedSwitchWeight ?? ALERT_SCORE_DELTA;
  }
  if (text.includes("fullscreen") || text.includes("exited")) {
    return weights.fullscreenExitWeight ?? ALERT_SCORE_DELTA;
  }
  if (text.includes("clipboard") || text.includes("copy") || text.includes("paste")) {
    return weights.clipboardUsageWeight ?? ALERT_SCORE_DELTA;
  }
  if (text.includes("monitor") || text.includes("display") || text.includes("screen")) {
    return weights.multiMonitorWeight ?? ALERT_SCORE_DELTA;
  }
  if (text.includes("liveness") || text.includes("fake")) {
    return weights.livenessFailureWeight ?? ALERT_SCORE_DELTA;
  }
  return ALERT_SCORE_DELTA;
}

export function configureProctoringSocket(io) {
  io.use(async (socket, next) => {
    try {
      const limit = await consumeSocketAuthRateLimit(socket.handshake.address || "unknown");
      if (!limit.allowed) {
        const error = new Error("Rate limited.");
        error.code = "RATE_LIMITED";
        next(error);
        return;
      }
      const token = socket.handshake.auth?.token;
      if (!token) throw new Error("Missing socket auth token.");
      const decoded = verifyToken(token);
      const user = await User.findById(decoded.sub)
        .select("identifier role tenantId status tokenVersion passwordChangedAt")
        .lean();
      if (!user || (user.status && user.status !== "ACTIVE")) {
        throw new Error("Socket account is unavailable.");
      }
      if (Number(decoded.tokenVersion || 0) !== Number(user.tokenVersion || 0)) {
        throw new Error("Socket token has been revoked.");
      }
      if (user.passwordChangedAt && decoded.iat && new Date(user.passwordChangedAt).getTime() > decoded.iat * 1000) {
        throw new Error("Socket token predates the current password.");
      }
      socket.user = {
        ...decoded,
        identifier: user.identifier,
        role: user.role,
        tenantId: user.tenantId?.toString?.() || decoded.tenantId || null,
        status: user.status || "ACTIVE",
      };
      next();
    } catch (error) {
      logger.warn("Socket authentication rejected.", { code: error.code || "SOCKET_AUTH_REJECTED" });
      next(new Error("Unauthorized socket connection."));
    }
  });

  io.on("connection", (socket) => {
    socket.on("join_exam_room", async ({ examId }, acknowledge) => {
      try {
        const exam = await assertTeacherCanAccessExam(socket.user, examId);
        const room = roomName(exam._id.toString());
        socket.join(room);
        acknowledge?.({ ok: true, room });
        socket.emit("live_student_list", await buildLiveStudentList(exam));
      } catch (error) {
        acknowledge?.({ ok: false, message: error.message });
      }
    });
    
    socket.on("teacher_command", async (payload, acknowledge) => {
      try {
        await emitTeacherCommand(io, socket.user, payload);
        acknowledge?.({ ok: true });
      } catch (error) {
        acknowledge?.({ ok: false, message: error.message });
      }
    });

    for (const eventName of STUDENT_EVENTS) {
      socket.on(eventName, async (payload, acknowledge) => {
        try {
          if (eventName === "camera_preview_updated") {
            logger.debug("Student proctoring event received.", {
              eventName,
              examId: String(payload?.examId || ""),
              studentId: String(payload?.studentId || socket.user?.identifier || ""),
              payloadBytes: safePayloadSize(payload),
            });
          }
          const result = await handleStudentProctoringEvent(io, socket.user, eventName, payload);
          const examRoom = roomName(result.exam._id.toString());
          socket.join(examRoom);
          socket.data.studentExamRooms = [
            ...new Set([...(socket.data.studentExamRooms || []), examRoom]),
          ];
          if (eventName === "camera_preview_updated") {
            logger.debug("Student proctoring event handled.", {
              eventName,
              studentId: result.student.studentId,
            });
          }
          acknowledge?.({ ok: true, student: result.student });
        } catch (error) {
          acknowledge?.({ ok: false, message: error.message });
        }
      });
    }

    socket.on("disconnect", async () => {
      if (socket.user?.role !== "STUDENT") return;

      for (const room of socket.data.studentExamRooms || []) {
        try {
          const remainingSockets = await io.in(room).fetchSockets();
          const studentStillConnected = remainingSockets.some(
            (candidate) => candidate.user?.identifier === socket.user.identifier
          );
          if (studentStillConnected) continue;

          const examId = room.replace(/^exam:/, "");
          const [exam, session] = await Promise.all([
            Exam.findById(examId),
            ExamSession.findOne({ examId, studentId: socket.user.identifier }),
          ]);
          if (!exam || !session || session.onlineStatus === "OFFLINE") continue;

          session.onlineStatus = "OFFLINE";
          session.lastSeenAt = Date.now();
          await session.save();
          await broadcastSessionState(io, "student_left_exam", exam, session);
        } catch (error) {
          logger.warn("Failed to reconcile disconnected student presence.", {
            errorName: error.name || "DisconnectReconciliationError",
          });
        }
      }
    });
  });
}

export async function emitTeacherCommand(io, user, payload = {}) {
  const sanitized = validateTeacherCommandPayload(payload);
  const exam = await assertTeacherCanAccessExam(user, sanitized.examId);
  const room = roomName(exam._id.toString());
  io.to(room).emit("teacher_command", {
    studentId: sanitized.studentId,
    examId: exam._id.toString(),
    command: sanitized.command,
    message: sanitized.message,
  });
}

export async function handleStudentProctoringEvent(io, user, eventName, payload = {}) {
  if (!isStudentProctoringEvent(eventName)) {
    throw new Error("Unsupported proctoring event.");
  }

  const examId = String(payload.examId || "").trim();
  const studentId = String(payload.studentId || user.identifier || "").trim().toLowerCase();

  if (!examId) {
    throw new Error("examId is required.");
  }
  validateStudentEventPayload(eventName, payload);

  const exam = await assertStudentCanSendEvent(user, examId, studentId);
  const now = Date.now();
  const existingSession = await ExamSession.findOne({ examId: exam._id, studentId }).lean();
  assertExamAcceptsProctoring(exam);
  assertSessionAcceptsProctoring(eventName, existingSession);
  assertAttemptMatches(eventName, payload, existingSession);

  const shouldLogEvent =
    eventName !== "camera_preview_updated" ||
    !existingSession?.lastPreviewEventLoggedAt ||
    now - existingSession.lastPreviewEventLoggedAt >= PREVIEW_TIMELINE_INTERVAL_MS;
  const patch = buildEventPatch(eventName, payload);
  const scoreDelta = resolveEventScoreDelta(eventName, payload);
  const eventId = String(payload.eventId || payload.mutationId || payload.idempotencyKey || "").trim();
  if (eventName === "suspicion_score_updated" || scoreDelta > 0) {
    traceScore("[SCORE UPDATE RECEIVED]", {
      eventId,
      studentId,
      examId: exam._id.toString(),
      sessionId: String(existingSession?._id || ""),
      eventType: eventName,
      observedScore: existingSession?.suspicionScore || 0,
      delta: scoreDelta,
      timestamp: new Date(now).toISOString(),
    });
  }
  if (eventName === "camera_preview_updated" && shouldLogEvent) {
    patch.lastPreviewEventLoggedAt = now;
  }

  // Upload snapshots to S3 bucket to avoid MongoDB bloat and oversized replay responses.
  if (isS3Configured() && eventName === "camera_preview_updated" && payload.previewBase64 && payload.previewBase64.length > 100) {
    const key = `exams/${exam._id}/students/${studentId}/camera_live.jpg`;
    try {
      const s3Key = await uploadFrame(key, payload.previewBase64, "image/jpeg");
      patch.previewBase64 = s3Key;
    } catch (err) {
      logger.error("S3 live camera frame upload failed.", { errorName: err.name || "UploadError" });
    }
  }
  if (isS3Configured() && eventName === "screen_telemetry_uploaded" && payload.base64 && payload.base64.length > 100) {
    const key = `exams/${exam._id}/students/${studentId}/screen_live.jpg`;
    try {
      const s3Key = await uploadFrame(key, payload.base64, "image/jpeg");
      patch.screenBase64 = s3Key;
    } catch (err) {
      logger.error("S3 screen frame upload failed.", { errorName: err.name || "UploadError" });
    }
  }

  const session = await incrementStudentScore({
    exam,
    studentId,
    amount: scoreDelta,
    mutationId: eventId,
    authoritativeScore: payload.totalSuspicionScore ?? payload.suspicionScore,
    patch,
    studentName: await findStudentName(studentId),
    now,
  });
  payload.totalSuspicionScore = session.suspicionScore || 0;
  if (eventName === "suspicion_score_updated" || scoreDelta > 0) {
    traceScore("[SCORE UPDATE COMMITTED]", {
      eventId,
      studentId,
      examId: exam._id.toString(),
      sessionId: String(session._id || ""),
      observedPreviousScore: existingSession?.suspicionScore || 0,
      delta: scoreDelta,
      newScore: session.suspicionScore || 0,
      timestamp: new Date().toISOString(),
    });
  }

  if (shouldLogEvent) {
    await logProctoringEvent(exam, session, eventName, payload);
  }
  const student = await broadcastSessionState(io, eventName, exam, session, {
    eventId,
    mutationId: String(payload.mutationId || "").trim(),
    scoreDelta,
  });

  return { exam, student };
}

function resolveEventScoreDelta(eventName, payload) {
  if (payload.scoreDelta != null) return payload.scoreDelta;
  const hasAuthoritativeScore = payload.totalSuspicionScore != null || payload.suspicionScore != null;
  if (!hasAuthoritativeScore && eventName === "ai_alert_created") {
    return ALERT_SCORE_DELTA;
  }
  return payload.scoreDelta;
}

export function assertAttemptMatches(eventName, payload, session) {
  if (!['suspicion_score_updated', 'ai_alert_created'].includes(eventName)) return;
  if (payload.attemptStartedAt == null) return;

  const expected = Number(payload.attemptStartedAt);
  const actual = Number(session?.startedAt);
  if (!Number.isFinite(expected) || !Number.isFinite(actual) || expected !== actual) {
    const error = new Error('This score event belongs to a stale exam attempt.');
    error.status = 409;
    error.code = 'STALE_EXAM_ATTEMPT';
    throw error;
  }
}

export async function handleTeacherProctoringTestEvent(io, teacher, exam, eventName, payload = {}) {
  if (!isStudentProctoringEvent(eventName)) {
    throw new Error("Unsupported proctoring event.");
  }

  const studentId = String(payload.studentId || "demo-student-01").trim().toLowerCase();
  if (!studentId) {
    throw new Error("studentId is required.");
  }

  const patch = buildEventPatch(eventName, payload);
  const session = await ExamSession.findOneAndUpdate(
    { examId: exam._id, studentId },
    {
      $set: {
        ...patch,
        examId: exam._id,
        studentId,
        studentName: String(payload.studentName || studentId).trim(),
        lastSeenAt: Date.now(),
        testUpdatedBy: teacher.identifier,
      },
    },
    { new: true, upsert: true }
  ).lean();

  await logProctoringEvent(exam, session, eventName, payload);
  const student = await broadcastSessionState(io, eventName, exam, session);
  return { exam, student };
}

function buildEventPatch(eventName, payload) {
  if (eventName === "student_joined_exam") {
    return {
      status: "IN_PROGRESS",
      onlineStatus: "ONLINE",
      latestAlert: "Student joined exam",
      startedAt: Date.now(),
    };
  }

  if (eventName === "student_left_exam") {
    return {
      onlineStatus: "OFFLINE",
      latestAlert: "Student left exam",
    };
  }

  if (eventName === "suspicion_score_updated") {
    return {
      status: "IN_PROGRESS",
      onlineStatus: "ONLINE",
      suspicionScore: clampScore(payload.totalSuspicionScore ?? payload.suspicionScore),
    };
  }

  if (eventName === "student_heartbeat") {
    return {
      status: "IN_PROGRESS",
      onlineStatus: "ONLINE",
      latestAlert: String(payload.latestAlert || "Student heartbeat"),
    };
  }

  if (eventName === "ai_alert_created") {
    return {
      status: "IN_PROGRESS",
      onlineStatus: "ONLINE",
      latestAlert: String(payload.latestAlert || payload.alert || "AI alert created"),
    };
  }

  if (eventName === "camera_preview_updated") {
    return {
      status: "IN_PROGRESS",
      onlineStatus: "ONLINE",
      previewUrl: String(payload.previewUrl || ""),
      previewBase64: String(payload.previewBase64 || ""),
    };
  }

  if (eventName === "screen_telemetry_uploaded") {
    return {
      status: "IN_PROGRESS",
      onlineStatus: "ONLINE",
      screenBase64: String(payload.base64 || ""),
      latestAlert: "Desktop screen snapshot uploaded",
    };
  }

  return {};
}

export async function incrementStudentScore({
  exam,
  studentId,
  amount,
  mutationId,
  authoritativeScore,
  patch = {},
  studentName,
  now = Date.now(),
}) {
  const scoreDelta = clampScoreDelta(amount);
  const normalizedMutationId = String(mutationId || "").trim();
  const fallbackScore = authoritativeScore == null ? null : clampScore(authoritativeScore);
  const nowDate = new Date(now);
  const baseSet = {
    ...Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined)),
    examId: exam._id,
    studentId,
    lastSeenAt: now,
    updatedAt: nowDate,
    createdAt: { $ifNull: ["$createdAt", nowDate] },
    studentName: { $ifNull: ["$studentName", studentName || studentId] },
  };
  delete baseSet.suspicionScore;

  const currentScore = { $ifNull: ["$suspicionScore", 0] };
  const appliedMutations = { $ifNull: ["$scoreMutationIds", []] };
  const hasMutation = normalizedMutationId
    ? { $in: [normalizedMutationId, appliedMutations] }
    : false;
  const incrementedScore = {
    $min: [100, { $max: [0, { $add: [currentScore, scoreDelta] }] }],
  };
  const scoreExpression = scoreDelta > 0
    ? normalizedMutationId
      ? { $cond: [hasMutation, currentScore, incrementedScore] }
      : incrementedScore
    : fallbackScore == null
      ? currentScore
      : { $max: [currentScore, fallbackScore] };
  const mutationsExpression = scoreDelta > 0 && normalizedMutationId
    ? {
        $cond: [
          hasMutation,
          appliedMutations,
          { $slice: [{ $concatArrays: [appliedMutations, [normalizedMutationId]] }, -100] },
        ],
      }
    : appliedMutations;

  return ExamSession.findOneAndUpdate(
    { examId: exam._id, studentId },
    [
      {
        $set: {
          ...baseSet,
          suspicionScore: scoreExpression,
          scoreMutationIds: mutationsExpression,
        },
      },
    ],
    { new: true, upsert: true }
  ).lean();
}

export async function buildLiveProctoringPayload(exam) {
  return {
    exam: {
      id: exam._id.toString(),
      title: exam.title,
    },
    activeStudents: await fetchLiveStudents(exam),
  };
}

export async function broadcastSessionState(io, eventName, exam, session, scoreContext = {}) {
  const student = serializeLiveStudent(session, scoreContext);
  
  // Sign S3 keys to temporary URLs if needed before broadcasting to the proctor console
  if (student.previewBase64 && !student.previewBase64.startsWith("data:") && !student.previewBase64.startsWith("http")) {
    try {
      student.previewUrl = await getSignedFrameUrl(student.previewBase64);
    } catch (err) {
      logger.error("Failed to sign frame URL for broadcast.", { errorName: err.name || "SigningError" });
    }
  }

  const room = roomName(exam._id.toString());

  logger.debug("Broadcasting proctoring event.", { eventName, examId: exam._id.toString() });
  io?.to(room).emit(eventName, student);
  if (eventName === "suspicion_score_updated" || eventName === "ai_alert_created") {
    traceScore("[REALTIME SCORE EVENT]", {
      studentId: student.studentId,
      examId: exam._id.toString(),
      sessionId: String(session._id || ""),
      eventId: scoreContext.eventId || "",
      mutationId: scoreContext.mutationId || "",
      scoreDelta: scoreContext.scoreDelta || 0,
      newScore: student.suspicionScore,
      timestamp: new Date().toISOString(),
    });
  }
  if (eventName !== "camera_preview_updated") {
    io?.to(room).emit("live_student_list", await buildLiveStudentList(exam));
  }

  return student;
}

async function logProctoringEvent(exam, session, eventName, payload) {
  const serverReceivedAt = new Date();
  const suspicionScore = clampScore(payload.totalSuspicionScore ?? payload.suspicionScore ?? session.suspicionScore ?? 0);
  const scoreDelta = clampScoreDelta(payload.scoreDelta ?? 0);
  const evidenceId = sanitizeToken(payload.evidenceId) || evidenceIdFor(exam._id, session.studentId, eventName, payload);
  const idempotencyKey = sanitizeToken(payload.idempotencyKey) || sanitizeToken(payload.mutationId) || evidenceId;
  const priority = eventName === "ai_alert_created"
    ? normalizeEvidencePriority(payload.priority || "suspicious")
    : normalizeEvidencePriority(payload.priority || (payload.suspicious ? "suspicious" : "routine"));
  const retentionClass = retentionClassForPriority(priority);
  const alertMessage = String(
    payload.latestAlert || payload.alert || session.latestAlert || eventLabel(eventName)
  );

  const dbBase64 = eventName === "screen_telemetry_uploaded"
    ? String(payload.base64 || "")
    : String(payload.previewBase64 || session.previewBase64 || "");

  let previewFieldVal = "";
  if (isS3Configured() && dbBase64 && dbBase64.length > 100) {
    const key = `exams/${exam._id}/students/${session.studentId}/${eventName}_${Date.now()}.jpg`;
    try {
      previewFieldVal = await uploadFrame(key, dbBase64, "image/jpeg");
    } catch (err) {
      logger.error("S3 telemetry event upload failed.", { errorName: err.name || "UploadError" });
      previewFieldVal = dbBase64;
    }
  } else {
    previewFieldVal = dbBase64;
  }

  const eventDocument = {
    examId: exam._id,
    studentId: session.studentId,
    studentName: session.studentName || session.studentId,
    eventType: eventName,
    sessionId: String(payload.sessionId || session._id || ""),
    idempotencyKey,
    evidenceId,
    evidenceIds: evidenceId ? [evidenceId] : [],
    priority,
    retentionClass,
    suspiciousEventIds: sanitizeEvidenceIds(payload.suspiciousEventIds || (payload.suspiciousEventId ? [payload.suspiciousEventId] : [])),
    promotedAt: priority === "routine" ? null : serverReceivedAt,
    promotedBy: priority === "routine" ? "" : String(payload.promotedBy || "client"),
    promotionReason: priority === "routine" ? "" : String(payload.promotionReason || "client_marked_suspicious"),
    serverReceivedAt,
    retentionExpiresAt: retentionExpiresAtForPriority(priority, serverReceivedAt),
    sequenceNumber: clampNonNegativeInteger(payload.sequenceNumber),
    suspicionScore,
    ruleId: String(payload.ruleId || payload.eventType || eventName),
    scoreDelta,
    totalSuspicionScore: suspicionScore,
    occurredAt: payload.occurredAt ? new Date(payload.occurredAt) : new Date(),
    evidenceReference: String(payload.evidenceReference || ""),
    alertMessage,
    severity: severityFor(eventName, suspicionScore),
    confidence: normalizeConfidence(payload.confidence),
    startedAt: payload.startedAt ? new Date(payload.startedAt) : null,
    endedAt: payload.endedAt ? new Date(payload.endedAt) : null,
    captureTiming: normalizeCaptureTiming(payload, session),
    metadata: sanitizeMetadata(payload.metadata),
    previewUrl: String(payload.previewUrl || session.previewUrl || ""),
    previewBase64: previewFieldVal,
  };

  if (idempotencyKey) {
    const stored = await ProctoringEvent.findOneAndUpdate(
      { examId: exam._id, studentId: session.studentId, idempotencyKey },
      { $setOnInsert: eventDocument },
      { upsert: true, new: true }
    ).lean();
    await runEvidencePromotionSideEffects({ exam, session, eventName, payload, stored, serverReceivedAt });
    return;
  }

  const stored = await ProctoringEvent.create(eventDocument);
  await runEvidencePromotionSideEffects({ exam, session, eventName, payload, stored, serverReceivedAt });
}

async function runEvidencePromotionSideEffects({ exam, session, eventName, payload, stored, serverReceivedAt }) {
  const sessionId = String(payload.sessionId || session._id || "");
  if (eventName === "ai_alert_created") {
    const suspiciousEventId = stored?.evidenceId || stored?.idempotencyKey || String(stored?._id || "");
    await promoteEvidenceForSuspiciousEvent({
      examId: exam._id,
      studentId: session.studentId,
      sessionId,
      suspiciousEventId,
      eventServerReceivedAt: stored?.serverReceivedAt || serverReceivedAt,
      evidenceIds: sanitizeEvidenceIds(payload.evidenceIds || []),
      requestedPriority: normalizeEvidencePriority(payload.priority || "suspicious"),
      promotedBy: "backend",
      promotionReason: "ai_alert_created",
    });
  }

  if (eventName === "camera_preview_updated" || eventName === "screen_telemetry_uploaded") {
    await promoteEvidenceForArrivingFrame({
      examId: exam._id,
      studentId: session.studentId,
      sessionId,
      evidenceId: stored?.evidenceId,
      evidenceServerReceivedAt: stored?.serverReceivedAt || serverReceivedAt,
    });
  }
}

function eventLabel(eventName) {
  if (eventName === "student_joined_exam") return "Student joined exam";
  if (eventName === "student_left_exam") return "Student left exam";
  if (eventName === "suspicion_score_updated") return "Suspicion score updated";
  if (eventName === "ai_alert_created") return "AI alert created";
  if (eventName === "camera_preview_updated") return "Camera preview updated";
  if (eventName === "screen_telemetry_uploaded") return "Desktop screen snapshot uploaded";
  if (eventName === "student_heartbeat") return "Student heartbeat";
  return "Proctoring event";
}

function severityFor(eventName, score) {
  if (score >= 70 || eventName === "ai_alert_created") return "high";
  if (score >= 40 || eventName === "camera_preview_updated") return "medium";
  return "low";
}

async function buildLiveStudentList(exam) {
  return {
    examId: exam._id.toString(),
    students: await fetchLiveStudents(exam),
  };
}

async function fetchLiveStudents(exam) {
  const sessions = await ExamSession.find({
    examId: exam._id,
    status: { $in: ["IN_PROGRESS", "LOCKED", "SUBMITTED", "RESET_BY_TEACHER"] },
  })
    .sort({ onlineStatus: -1, suspicionScore: -1, updatedAt: -1 })
    .lean();

  return sessions.map(serializeLiveStudent);
}

function serializeLiveStudent(session, scoreContext = {}) {
  const scoreMetrics = normalizeScoreMetrics({
    score: session.suspicionScore || 0,
    suspiciousActivityCount: Math.ceil((session.suspicionScore || 0) / ALERT_SCORE_DELTA),
    capturedFrameCount: session.previewBase64 || session.previewUrl || session.screenBase64 ? 1 : 0,
    processedFrameCount: session.previewBase64 || session.previewUrl || session.screenBase64 ? 1 : 0,
    updatedAt: session.updatedAt || session.lastSeenAt || null,
  });
  return {
    sessionId: String(session._id || ""),
    studentId: session.studentId,
    studentName: session.studentName || session.studentId,
    rollId: session.studentId,
    status: scoreStatus(scoreMetrics.percentage),
    suspicionScore: scoreMetrics.percentage,
    eventId: scoreContext.eventId || undefined,
    mutationId: scoreContext.mutationId || undefined,
    scoreDelta: scoreContext.scoreDelta || undefined,
    scoreMetrics,
    latestAlert: session.latestAlert || "",
    onlineStatus: session.onlineStatus || "OFFLINE",
    previewUrl: session.previewUrl || "",
    previewBase64: session.previewBase64 || "",
    screenBase64: session.screenBase64 || "",
    lastUpdatedAt: session.updatedAt || null,
    lastSeenAt: session.lastSeenAt || null,
  };
}

async function assertTeacherCanAccessExam(user, examId) {
  if (!user || !TEACHER_COMMAND_ROLES.includes(user.role)) {
    throw new Error("Only authorized staff can access proctoring rooms.");
  }

  const exam = await Exam.findById(examId).lean();
  if (!exam) {
    throw new Error("Exam not found or not accessible.");
  }

  if (user.role === "SUPER_ADMIN" || exam.createdBy === user.identifier) return exam;

  if (user.tenantId && ["INSTITUTION_ADMIN", "DEPARTMENT_ADMIN", "PROCTOR"].includes(user.role)) {
    const owner = await User.findOne({
      identifier: exam.createdBy,
      tenantId: user.tenantId,
    }).select("_id").lean();
    if (owner) return exam;
  }

  throw new Error("Exam not found or not accessible.");
}

function validateTeacherCommandPayload(payload) {
  const examId = String(payload?.examId || "").trim();
  const studentId = String(payload?.studentId || "").trim().toLowerCase();
  const command = String(payload?.command || "").trim().toUpperCase();
  const message = payload?.message == null ? "" : String(payload.message);

  if (!examId) throw new Error("examId is required.");
  if (!studentId || studentId.length > MAX_COMMAND_STUDENT_ID_LENGTH) {
    throw new Error("A valid studentId is required.");
  }
  if (!ALLOWED_TEACHER_COMMANDS.includes(command)) {
    throw new Error("Unsupported proctoring command.");
  }
  if (message.length > MAX_COMMAND_MESSAGE_LENGTH) {
    throw new Error("Proctoring command message is too large.");
  }

  return {
    examId,
    studentId,
    command,
    message,
  };
}

async function assertStudentCanSendEvent(user, examId, studentId) {
  if (user.role !== "STUDENT") {
    throw new Error("Only students can send proctoring events.");
  }

  if (user.identifier !== studentId) {
    throw new Error("Student token does not match event studentId.");
  }

  const exam = await Exam.findOne({
    _id: examId,
    assignedStudents: { $in: studentIdVariants(studentId) },
  });

  if (!exam) {
    throw new Error("Student is not assigned to this exam.");
  }

  return exam;
}

function assertExamAcceptsProctoring(exam) {
  if (exam.status !== "LIVE") {
    throw new Error("Exam is not accepting proctoring events.");
  }
}

function assertSessionAcceptsProctoring(eventName, session) {
  if (eventName === "student_joined_exam") return;
  if (!session || session.status !== "IN_PROGRESS") {
    throw new Error("Session is not accepting proctoring events.");
  }
}

async function findStudentName(studentId) {
  const student = await User.findOne({ identifier: studentId, role: "STUDENT" }).lean();
  return student?.name || studentId;
}

function studentIdVariants(studentId) {
  const normalized = String(studentId || "").trim().toLowerCase();
  const compact = normalized.replace(/[^a-z0-9]/g, "");
  return [...new Set([normalized, compact].filter(Boolean))];
}

function roomName(examId) {
  return `exam:${examId}`;
}

function clampScore(score) {
  const parsed = Number(score);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(100, parsed));
}

function clampNonNegativeInteger(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.floor(parsed);
}

function clampScoreDelta(amount) {
  const parsed = Number(amount);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.min(100, parsed);
}

function traceScore(message, metadata) {
  if (SCORE_TRACE_ENABLED) logger.info(message, metadata);
}

export function resolveScoreMutation({
  existingScore = 0,
  scoreDelta = 0,
  mutationId = "",
  appliedMutationIds = [],
  authoritativeScore,
}) {
  const currentScore = clampScore(existingScore);
  const delta = clampScoreDelta(scoreDelta);
  const normalizedMutationId = String(mutationId || "").trim();
  const hasMutation = normalizedMutationId && appliedMutationIds.includes(normalizedMutationId);

  if (delta > 0) {
    return {
      score: hasMutation ? currentScore : clampScore(currentScore + delta),
      mutationIds: hasMutation || !normalizedMutationId
        ? appliedMutationIds
        : [...appliedMutationIds, normalizedMutationId].slice(-100),
      duplicate: Boolean(hasMutation),
    };
  }

  if (authoritativeScore != null) {
    return {
      score: Math.max(currentScore, clampScore(authoritativeScore)),
      mutationIds: appliedMutationIds,
      duplicate: false,
    };
  }

  return {
    score: currentScore,
    mutationIds: appliedMutationIds,
    duplicate: false,
  };
}

export function resolveSuspicionScore({
  existingScore = 0,
  lastSeenAt,
  now,
  thresholds = {},
  eventName,
  payloadScore,
  alertText = "",
}) {
  let computedScore = clampScore(existingScore);
  const referenceTime = lastSeenAt || now;
  const elapsedSeconds = Math.max(0, (now - referenceTime) / 1000);
  if (elapsedSeconds > 5) {
    const decay = (thresholds.decayRate || 0.4) * (elapsedSeconds - 5);
    computedScore = Math.max(0, computedScore - decay);
  }

  if (eventName === "suspicion_score_updated") {
    return clampScore(payloadScore ?? computedScore);
  }

  if (eventName === "ai_alert_created") {
    if (payloadScore != null && !Number.isNaN(Number(payloadScore))) {
      return clampScore(payloadScore);
    }

    const weight = getWeightForAlert(alertText, thresholds);
    return clampScore(computedScore + weight);
  }

  return clampScore(computedScore);
}

function scoreStatus(score) {
  if (score >= 70) return "SUSPICIOUS";
  if (score >= 40) return "WARNING";
  return "SAFE";
}

const PREVIEW_TIMELINE_INTERVAL_MS = 15_000;

function safePayloadSize(payload) {
  try {
    return Buffer.byteLength(JSON.stringify(payload || {}));
  } catch {
    return 0;
  }
}

export function validateStudentEventPayload(eventName, payload) {
  if (clampScoreDelta(payload.scoreDelta) > 0) {
    const mutationId = String(payload.mutationId || payload.eventId || payload.idempotencyKey || "").trim();
    if (!mutationId) {
      const error = new Error("A stable mutation identifier is required for score updates.");
      error.status = 400;
      error.code = "SCORE_MUTATION_ID_REQUIRED";
      throw error;
    }
  }
  const mediaValue = eventName === "screen_telemetry_uploaded" ? payload.base64 : payload.previewBase64;
  if (mediaValue == null || mediaValue === "") return;
  const media = String(mediaValue);
  if (!media.startsWith("data:image/jpeg;base64,") && !media.startsWith("data:image/webp;base64,")) {
    throw new Error("Unsupported evidence media type.");
  }
  if (Buffer.byteLength(media) > MAX_MEDIA_DATA_URL_BYTES) {
    throw new Error("Evidence payload is too large.");
  }
}

function normalizeDateString(value) {
  if (!value) return new Date(0).toISOString();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date(0).toISOString() : date.toISOString();
}

function normalizeDate(value) {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function normalizeCaptureTiming(payload, session) {
  return {
    capturedAt: normalizeDate(payload.capturedAt || payload.occurredAt),
    captureStartedAt: normalizeDate(payload.captureStartedAt),
    captureCompletedAt: normalizeDate(payload.captureCompletedAt),
    uploadStartedAt: normalizeDate(payload.uploadStartedAt),
    uploadCompletedAt: normalizeDate(payload.uploadCompletedAt),
    processingCompletedAt: normalizeDate(payload.processingCompletedAt),
    sequenceNumber: clampNonNegativeInteger(payload.sequenceNumber),
    sessionId: String(payload.sessionId || session._id || ""),
    studentId: String(payload.studentId || session.studentId || ""),
  };
}

function normalizeConfidence(value) {
  if (value == null) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.min(1, parsed));
}

function sanitizeMetadata(metadata) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return {};
  const json = JSON.stringify(metadata);
  if (Buffer.byteLength(json) > 8192) return {};
  return JSON.parse(json);
}

function sanitizeToken(value) {
  return String(value || "").trim().replace(/[^a-zA-Z0-9._:-]/g, "").slice(0, 160);
}

function evidenceIdFor(examId, studentId, eventName, payload) {
  const sequence = clampNonNegativeInteger(payload.sequenceNumber);
  const occurred = normalizeDateString(payload.capturedAt || payload.occurredAt || Date.now());
  return sanitizeToken(`${examId}:${studentId}:${eventName}:${sequence}:${occurred}`);
}
