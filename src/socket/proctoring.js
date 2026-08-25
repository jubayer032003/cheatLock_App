import { Exam } from "../models/Exam.js";
import { ExamSession } from "../models/ExamSession.js";
import { ProctoringEvent } from "../models/ProctoringEvent.js";
import { User } from "../models/User.js";
import { verifyToken } from "../middleware/auth.js";
import { uploadFrame, getSignedFrameUrl, isS3Configured } from "../services/s3.js";

const STUDENT_EVENTS = [
  "student_joined_exam",
  "student_left_exam",
  "suspicion_score_updated",
  "ai_alert_created",
  "camera_preview_updated",
  "screen_telemetry_uploaded",
];

export function isStudentProctoringEvent(eventName) {
  return STUDENT_EVENTS.includes(eventName);
}

function getWeightForAlert(alertText, weights) {
  const text = String(alertText || "").toLowerCase();
  if (text.includes("face not detected") || text.includes("looking away") || text.includes("face_missing") || text.includes("missing")) {
    return weights.faceMissingWeight ?? 25;
  }
  if (text.includes("multiple faces") || text.includes("multiple detected") || text.includes("multiple")) {
    return weights.multipleFacesWeight ?? 30;
  }
  if (text.includes("phone") || text.includes("mobile") || text.includes("device")) {
    return weights.phoneDetectedWeight ?? 20;
  }
  if (text.includes("ambient noise") || text.includes("voice") || text.includes("speech") || text.includes("sound") || text.includes("talking") || text.includes("whisper")) {
    return weights.speechDetectedWeight ?? 10;
  }
  if (text.includes("blurred") || text.includes("app switch") || text.includes("focus") || text.includes("tab")) {
    return weights.repeatedSwitchWeight ?? 15;
  }
  if (text.includes("fullscreen") || text.includes("exited")) {
    return weights.fullscreenExitWeight ?? 15;
  }
  if (text.includes("clipboard") || text.includes("copy") || text.includes("paste")) {
    return weights.clipboardUsageWeight ?? 10;
  }
  if (text.includes("monitor") || text.includes("display") || text.includes("screen")) {
    return weights.multiMonitorWeight ?? 25;
  }
  if (text.includes("liveness") || text.includes("fake")) {
    return weights.livenessFailureWeight ?? 40;
  }
  return 5; // default minor infraction weight
}

export function configureProctoringSocket(io) {
  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) throw new Error("Missing socket auth token.");
      socket.user = verifyToken(token);
      next();
    } catch {
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
    
    socket.on("teacher_command", async ({ studentId, examId, command, message }, acknowledge) => {
      try {
        if (socket.user.role !== "TEACHER") {
          throw new Error("Only teachers can send proctoring commands.");
        }
        const room = roomName(examId);
        io.to(room).emit("teacher_command", { studentId, examId, command, message });

        if (command === "LOCK_EXAM") {
          const session = await ExamSession.findOneAndUpdate(
            { examId, studentId: studentId.trim().toLowerCase() },
            {
              $set: {
                status: "LOCKED",
                lockedAt: Date.now(),
                lockReason: message || "Locked by teacher",
                onlineStatus: "OFFLINE",
              }
            },
            { new: true }
          ).lean();
          if (session) {
            const exam = await Exam.findById(examId);
            if (exam) {
              await broadcastSessionState(io, "student_left_exam", exam, session);
            }
          }
        }

        acknowledge?.({ ok: true });
      } catch (error) {
        acknowledge?.({ ok: false, message: error.message });
      }
    });

    for (const eventName of STUDENT_EVENTS) {
      socket.on(eventName, async (payload, acknowledge) => {
        try {
          if (eventName === "camera_preview_updated") {
            console.log(`[Step 6] Backend: BEFORE socket emit (received from student). Event: ${eventName}, examId: ${payload.examId}, studentId: ${payload.studentId || socket.user?.identifier}, payload size: ${JSON.stringify(payload).length}. Timestamp: ${Date.now()}`);
          }
          const result = await handleStudentProctoringEvent(io, socket.user, eventName, payload);
          if (eventName === "camera_preview_updated") {
            console.log(`[Step 7] Backend: AFTER socket emit (handled). Event: ${eventName}, studentId: ${result.student.studentId}. Timestamp: ${Date.now()}`);
          }
          acknowledge?.({ ok: true, student: result.student });
        } catch (error) {
          acknowledge?.({ ok: false, message: error.message });
        }
      });
    }
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

  const exam = await assertStudentCanSendEvent(user, examId, studentId);
  const now = Date.now();
  const existingSession = await ExamSession.findOne({ examId: exam._id, studentId }).lean();

  const shouldLogEvent =
    eventName !== "camera_preview_updated" ||
    !existingSession?.lastPreviewEventLoggedAt ||
    now - existingSession.lastPreviewEventLoggedAt >= PREVIEW_TIMELINE_INTERVAL_MS;
  const patch = buildEventPatch(eventName, payload);
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
      console.error(`S3 live camera frame upload failed: ${err.name || "UploadError"}`);
    }
  }
  if (isS3Configured() && eventName === "screen_telemetry_uploaded" && payload.base64 && payload.base64.length > 100) {
    const key = `exams/${exam._id}/students/${studentId}/screen_live.jpg`;
    try {
      const s3Key = await uploadFrame(key, payload.base64, "image/jpeg");
      patch.screenBase64 = s3Key;
    } catch (err) {
      console.error(`S3 screen frame upload failed: ${err.name || "UploadError"}`);
    }
  }

  const session = await incrementStudentScore({
    exam,
    studentId,
    amount: payload.scoreDelta,
    mutationId: payload.mutationId,
    authoritativeScore: payload.suspicionScore,
    patch,
    studentName: await findStudentName(studentId),
    now,
  });
  payload.suspicionScore = session.suspicionScore || 0;

  if (shouldLogEvent) {
    await logProctoringEvent(exam, session, eventName, payload);
  }
  const student = await broadcastSessionState(io, eventName, exam, session);

  return { exam, student };
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
      suspicionScore: clampScore(payload.suspicionScore),
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

export async function broadcastSessionState(io, eventName, exam, session) {
  const student = serializeLiveStudent(session);
  
  // Sign S3 keys to temporary URLs if needed before broadcasting to the proctor console
  if (student.previewBase64 && !student.previewBase64.startsWith("data:") && !student.previewBase64.startsWith("http")) {
    try {
      student.previewUrl = await getSignedFrameUrl(student.previewBase64);
    } catch (err) {
      console.error("Failed to sign frame URL for broadcast:", err);
    }
  }

  const room = roomName(exam._id.toString());

  console.log(`[Step 9] Backend: Broadcasting event: ${eventName} to room: ${room}. Time: ${Date.now()}`);
  io?.to(room).emit(eventName, student);
  if (eventName !== "camera_preview_updated") {
    io?.to(room).emit("live_student_list", await buildLiveStudentList(exam));
  }

  return student;
}

async function logProctoringEvent(exam, session, eventName, payload) {
  const suspicionScore = clampScore(payload.suspicionScore ?? session.suspicionScore ?? 0);
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
      console.error(`S3 telemetry event upload failed: ${err.name || "UploadError"}`);
      previewFieldVal = dbBase64;
    }
  } else {
    previewFieldVal = dbBase64;
  }

  await ProctoringEvent.create({
    examId: exam._id,
    studentId: session.studentId,
    studentName: session.studentName || session.studentId,
    eventType: eventName,
    suspicionScore,
    alertMessage,
    severity: severityFor(eventName, suspicionScore),
    previewUrl: String(payload.previewUrl || session.previewUrl || ""),
    previewBase64: previewFieldVal,
  });
}

function eventLabel(eventName) {
  if (eventName === "student_joined_exam") return "Student joined exam";
  if (eventName === "student_left_exam") return "Student left exam";
  if (eventName === "suspicion_score_updated") return "Suspicion score updated";
  if (eventName === "ai_alert_created") return "AI alert created";
  if (eventName === "camera_preview_updated") return "Camera preview updated";
  if (eventName === "screen_telemetry_uploaded") return "Desktop screen snapshot uploaded";
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

function serializeLiveStudent(session) {
  return {
    studentId: session.studentId,
    studentName: session.studentName || session.studentId,
    rollId: session.studentId,
    status: scoreStatus(session.suspicionScore || 0),
    suspicionScore: session.suspicionScore || 0,
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
  if (user.role !== "TEACHER") {
    throw new Error("Only teachers can join proctoring rooms.");
  }

  const exam = await Exam.findOne({ _id: examId, createdBy: user.identifier });
  if (!exam) {
    throw new Error("Exam not found or not owned by this teacher.");
  }
  return exam;
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
  if (Number.isNaN(parsed)) return 0;
  return Math.max(0, Math.min(100, parsed));
}

function clampScoreDelta(amount) {
  const parsed = Number(amount);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.min(100, parsed);
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

  if (eventName === "ai_alert_created" || eventName === "screen_telemetry_uploaded") {
    if (payloadScore != null && !Number.isNaN(Number(payloadScore))) {
      return clampScore(payloadScore);
    }

    const text = String(alertText || "").toLowerCase();
    const weight = getWeightForAlert(text, thresholds);
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
