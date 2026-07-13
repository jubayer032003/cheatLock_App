import express from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { Exam } from "../models/Exam.js";
import { ExamSession } from "../models/ExamSession.js";
import { User } from "../models/User.js";
import { broadcastSessionState } from "../socket/proctoring.js";
import { assertExamIsLive } from "./exams.js";

export const sessionsRouter = express.Router();

sessionsRouter.get("/me", requireAuth, requireRole("STUDENT"), async (req, res, next) => {
  try {
    const exam = req.query?.examId
      ? await Exam.findById(req.query.examId)
      : await findStudentExam(req.user.identifier);
    const session = await getOrCreateSession(req.user.identifier, exam?._id);
    res.json({ session: serializeSession(session) });
  } catch (error) {
    next(error);
  }
});

sessionsRouter.post("/start", requireAuth, requireRole("STUDENT"), async (req, res, next) => {
  try {
    const exam = req.body?.examId
      ? await Exam.findById(req.body.examId)
      : await findStudentExam(req.user.identifier);
    const user = await User.findOne({ identifier: req.user.identifier, role: "STUDENT" });
    assertExamIsLive(exam);
    const session = await getOrCreateSession(req.user.identifier, exam?._id);
    const deviceId = String(req.body?.deviceId || "").trim();

    if (session.status === "SUBMITTED" || session.status === "LOCKED") {
      const error = new Error(`Exam is ${session.status.toLowerCase()}.`);
      error.status = 409;
      throw error;
    }

    if (
      session.status === "IN_PROGRESS" &&
      session.deviceId &&
      deviceId &&
      session.deviceId !== deviceId
    ) {
      const error = new Error("This exam is already active on another device.");
      error.status = 409;
      throw error;
    }

    session.status = "IN_PROGRESS";
    session.examId = exam?._id;
    session.studentName = user?.name || "";
    session.onlineStatus = "ONLINE";
    session.lastSeenAt = Date.now();
    session.deviceId = deviceId || session.deviceId;
    session.startedAt = Date.now();
    session.submittedAt = undefined;
    session.lockedAt = undefined;
    session.resetAt = undefined;
    session.lockReason = undefined;
    await session.save();
    if (exam) {
      await broadcastSessionState(req.app.get("io"), "student_joined_exam", exam, session);
    }

    res.json({ session: serializeSession(session) });
  } catch (error) {
    next(error);
  }
});

sessionsRouter.post("/submit", requireAuth, requireRole("STUDENT"), async (req, res, next) => {
  try {
    const exam = req.body?.examId
      ? await Exam.findById(req.body.examId)
      : await findStudentExam(req.user.identifier);
    const session = await getOrCreateSession(req.user.identifier, exam?._id);
    session.status = "SUBMITTED";
    session.onlineStatus = "OFFLINE";
    session.submittedAt = Date.now();
    await session.save();
    if (exam) {
      await broadcastSessionState(req.app.get("io"), "student_left_exam", exam, session);
    }
    res.json({ session: serializeSession(session) });
  } catch (error) {
    next(error);
  }
});

sessionsRouter.post("/lock", requireAuth, requireRole("STUDENT"), async (req, res, next) => {
  try {
    const exam = req.body?.examId
      ? await Exam.findById(req.body.examId)
      : await findStudentExam(req.user.identifier);
    const session = await getOrCreateSession(req.user.identifier, exam?._id);
    session.status = "LOCKED";
    session.onlineStatus = "OFFLINE";
    session.lockedAt = Date.now();
    session.lockReason = req.body?.reason || "Too many warnings";
    await session.save();
    if (exam) {
      await broadcastSessionState(req.app.get("io"), "student_left_exam", exam, session);
    }
    res.json({ session: serializeSession(session) });
  } catch (error) {
    next(error);
  }
});

sessionsRouter.get("/", requireAuth, requireRole("TEACHER"), async (req, res, next) => {
  try {
    const examIds = await findTeacherExamIds(req.user.identifier);
    const sessions = await ExamSession.find({ examId: { $in: examIds } })
      .sort({ updatedAt: -1 })
      .limit(500)
      .lean();
    res.json({ sessions: sessions.map(serializeSession) });
  } catch (error) {
    next(error);
  }
});

sessionsRouter.post(
  "/:studentId/reset",
  requireAuth,
  requireRole("TEACHER"),
  async (req, res, next) => {
    try {
      const exam = await findTeacherExamForReset(
        req.user.identifier,
        req.params.studentId,
        req.body?.examId
      );
      const session = await getOrCreateSession(req.params.studentId, exam._id);
      session.status = "RESET_BY_TEACHER";
      session.onlineStatus = "OFFLINE";
      session.resetAt = Date.now();
      session.resetBy = req.user.identifier;
      session.startedAt = undefined;
      session.submittedAt = undefined;
      session.lockedAt = undefined;
      session.lockReason = undefined;
      session.suspicionScore = 0;
      session.latestAlert = "Attempt reset by teacher";
      session.deviceId = "";
      session.previewUrl = "";
      session.previewBase64 = "";
      session.lastPreviewEventLoggedAt = undefined;
      await session.save();
      await broadcastSessionState(req.app.get("io"), "student_left_exam", exam, session);
      res.json({ session: serializeSession(session) });
    } catch (error) {
      next(error);
    }
  }
);

async function findStudentExam(studentId) {
  return Exam.findOne({ assignedStudents: studentId }).sort({ createdAt: -1 });
}

async function findTeacherExamIds(teacherId) {
  const exams = await Exam.find({ createdBy: teacherId }).select("_id").lean();
  return exams.map((exam) => exam._id);
}

async function findTeacherExamForReset(teacherId, studentId, examId) {
  if (examId) {
    const exam = await Exam.findOne({
      _id: examId,
      createdBy: teacherId,
      assignedStudents: String(studentId).trim().toLowerCase(),
    });
    if (!exam) {
      const error = new Error("Exam not found or student is not assigned to this teacher exam.");
      error.status = 404;
      throw error;
    }
    return exam;
  }

  const teacherExamIds = await findTeacherExamIds(teacherId);
  const latestSession = await ExamSession.findOne({
    studentId: String(studentId).trim().toLowerCase(),
    examId: { $in: teacherExamIds },
  })
    .sort({ updatedAt: -1 })
    .lean();

  if (latestSession?.examId) {
    return Exam.findById(latestSession.examId);
  }

  const exam = await Exam.findOne({
    _id: { $in: teacherExamIds },
    assignedStudents: String(studentId).trim().toLowerCase(),
  }).sort({ createdAt: -1 });

  if (!exam) {
    const error = new Error("No teacher exam found for this student.");
    error.status = 404;
    throw error;
  }

  return exam;
}

async function getOrCreateSession(studentId, examId = null) {
  return ExamSession.findOneAndUpdate(
    { studentId, examId },
    { $setOnInsert: { studentId, examId, status: "NOT_STARTED" } },
    { new: true, upsert: true }
  );
}

function serializeSession(session) {
  const raw = typeof session.toObject === "function" ? session.toObject() : session;
  return {
    ...raw,
    id: raw._id?.toString?.() || raw.id,
    examId: raw.examId?.toString?.() || raw.examId || null,
  };
}
