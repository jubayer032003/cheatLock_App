import { Exam } from "../models/Exam.js";
import { ExamSession } from "../models/ExamSession.js";
import { ProctoringEvent } from "../models/ProctoringEvent.js";
import { User } from "../models/User.js";
import { verifyToken } from "../middleware/auth.js";

const STUDENT_EVENTS = [
  "student_joined_exam",
  "student_left_exam",
  "suspicion_score_updated",
  "ai_alert_created",
  "camera_preview_updated",
];

export function isStudentProctoringEvent(eventName) {
  return STUDENT_EVENTS.includes(eventName);
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

    for (const eventName of STUDENT_EVENTS) {
      socket.on(eventName, async (payload, acknowledge) => {
        try {
          const result = await handleStudentProctoringEvent(io, socket.user, eventName, payload);
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
  const existingSession =
    eventName === "camera_preview_updated"
      ? await ExamSession.findOne({ examId: exam._id, studentId })
          .select("lastPreviewEventLoggedAt")
          .lean()
      : null;
  const shouldLogEvent =
    eventName !== "camera_preview_updated" ||
    !existingSession?.lastPreviewEventLoggedAt ||
    now - existingSession.lastPreviewEventLoggedAt >= PREVIEW_TIMELINE_INTERVAL_MS;
  const patch = buildEventPatch(eventName, payload);
  if (eventName === "camera_preview_updated" && shouldLogEvent) {
    patch.lastPreviewEventLoggedAt = now;
  }

  const session = await ExamSession.findOneAndUpdate(
    { examId: exam._id, studentId },
    {
      $set: {
        ...patch,
        examId: exam._id,
        studentId,
        lastSeenAt: now,
      },
      $setOnInsert: {
        studentName: await findStudentName(studentId),
      },
    },
    { new: true, upsert: true }
  ).lean();

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

  return {};
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
  const room = roomName(exam._id.toString());

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

  await ProctoringEvent.create({
    examId: exam._id,
    studentId: session.studentId,
    studentName: session.studentName || session.studentId,
    eventType: eventName,
    suspicionScore,
    alertMessage,
    severity: severityFor(eventName, suspicionScore),
    previewUrl: String(payload.previewUrl || session.previewUrl || ""),
    previewBase64: String(payload.previewBase64 || session.previewBase64 || ""),
  });
}

function eventLabel(eventName) {
  if (eventName === "student_joined_exam") return "Student joined exam";
  if (eventName === "student_left_exam") return "Student left exam";
  if (eventName === "suspicion_score_updated") return "Suspicion score updated";
  if (eventName === "ai_alert_created") return "AI alert created";
  if (eventName === "camera_preview_updated") return "Camera preview updated";
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
    assignedStudents: studentId,
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

function roomName(examId) {
  return `exam:${examId}`;
}

function clampScore(score) {
  const parsed = Number(score);
  if (Number.isNaN(parsed)) return 0;
  return Math.max(0, Math.min(100, parsed));
}

function scoreStatus(score) {
  if (score >= 70) return "SUSPICIOUS";
  if (score >= 40) return "WARNING";
  return "SAFE";
}

const PREVIEW_TIMELINE_INTERVAL_MS = 15_000;
