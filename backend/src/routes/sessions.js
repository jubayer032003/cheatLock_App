import express from "express";
import mongoose from "mongoose";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { Exam } from "../models/Exam.js";
import { ExamSession } from "../models/ExamSession.js";
import { User } from "../models/User.js";
import { broadcastSessionState } from "../socket/proctoring.js";
import { assertExamIsLive, getEffectiveExamStatus } from "./exams.js";

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
    const reportedScore = Number(req.body?.suspicionScore);
    session.status = "LOCKED";
    session.onlineStatus = "OFFLINE";
    session.lockedAt = Date.now();
    session.lockReason = req.body?.reason || "Too many warnings";
    if (Number.isFinite(reportedScore)) {
      session.suspicionScore = Math.max(session.suspicionScore || 0, clampScore(reportedScore));
    }
    session.latestAlert = session.lockReason;
    await session.save();
    if (exam) {
      await broadcastSessionState(req.app.get("io"), "suspicion_score_updated", exam, session);
      await broadcastSessionState(req.app.get("io"), "student_left_exam", exam, session);
    }
    res.json({ session: serializeSession(session) });
  } catch (error) {
    next(error);
  }
});

sessionsRouter.patch("/answers", requireAuth, requireRole("STUDENT"), async (req, res, next) => {
  try {
    const studentId = req.user.identifier;
    const examId = String(req.body?.examId || "").trim();
    if (!mongoose.Types.ObjectId.isValid(examId)) {
      return res.status(400).json({ code: "INVALID_EXAM_ID", message: "Invalid exam." });
    }

    const exam = await Exam.findOne({ _id: examId, assignedStudents: studentId });
    if (!exam) {
      return res.status(404).json({ code: "SESSION_NOT_FOUND", message: "Session not found." });
    }

    const status = getEffectiveExamStatus(exam);
    if (status !== "LIVE") {
      return res.status(status === "ENDED" || status === "ARCHIVED" ? 410 : 403).json({
        code: status === "ENDED" || status === "ARCHIVED" ? "EXAM_EXPIRED" : "EXAM_NOT_LIVE",
        message: "Exam is not accepting answer updates.",
      });
    }

    const session = await ExamSession.findOne({ studentId, examId });
    if (!session) {
      return res.status(404).json({ code: "SESSION_NOT_FOUND", message: "Session not found." });
    }

    if (String(req.body?.attemptId || "").trim() !== session._id.toString()) {
      return res.status(409).json({ code: "ATTEMPT_MISMATCH", message: "Answer update conflicts with this session." });
    }

    const deviceId = String(req.body?.deviceId || "").trim();
    if (!deviceId || (session.deviceId && session.deviceId !== deviceId)) {
      return res.status(409).json({ code: "DEVICE_MISMATCH", message: "Answer update conflicts with this session." });
    }

    if (session.status !== "IN_PROGRESS") {
      return res.status(session.status === "SUBMITTED" ? 410 : 409).json({
        code: session.status === "SUBMITTED" ? "SESSION_FINALIZED" : "SESSION_NOT_ACTIVE",
        message: "Session is not accepting answer updates.",
      });
    }

    const expectedRevision = Number(req.body?.revision);
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
      return res.status(400).json({ code: "INVALID_REVISION", message: "Invalid answer revision." });
    }

    const validated = validateAnswerDraftPayload(req.body, exam.questions?.length || 0);
    if (!validated.ok) {
      return res.status(400).json({ code: validated.code, message: validated.message });
    }

    const currentRevision = Number(session.answerDraft?.revision || 0);
    const nextRevision = currentRevision + 1;
    if (expectedRevision !== currentRevision) {
      return res.status(409).json({
        code: "ANSWER_REVISION_CONFLICT",
        message: "Answer draft revision conflict.",
        currentRevision,
      });
    }

    const savedAt = new Date();
    const revisionCriteria = expectedRevision === 0
      ? { $or: [{ "answerDraft.revision": 0 }, { "answerDraft.revision": { $exists: false } }] }
      : { "answerDraft.revision": expectedRevision };
    const updatedSession = await ExamSession.findOneAndUpdate(
      {
        _id: session._id,
        studentId,
        examId,
        status: "IN_PROGRESS",
        ...revisionCriteria,
      },
      {
        $set: {
          "answerDraft.answers": validated.answers,
          "answerDraft.currentIndex": validated.currentIndex,
          "answerDraft.markedQuestions": validated.markedQuestions,
          "answerDraft.revision": nextRevision,
          "answerDraft.savedAt": savedAt,
          lastSeenAt: Date.now(),
          onlineStatus: "ONLINE",
        },
      },
      { new: true }
    );

    if (!updatedSession) {
      const latest = await ExamSession.findOne({ _id: session._id }).lean();
      return res.status(409).json({
        code: "ANSWER_REVISION_CONFLICT",
        message: "Answer draft revision conflict.",
        currentRevision: Number(latest?.answerDraft?.revision || currentRevision),
      });
    }

    res.json({
      success: true,
      revision: nextRevision,
      savedAt: savedAt.toISOString(),
      serverTime: savedAt.toISOString(),
      sessionStatus: updatedSession.status,
    });
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
      session.screenBase64 = "";
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
    answerDraftRevision: raw.answerDraft?.revision || 0,
    answerDraftSavedAt: raw.answerDraft?.savedAt || null,
  };
}

function clampScore(score) {
  const parsed = Number(score);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(100, parsed));
}

function validateAnswerDraftPayload(body, questionCount) {
  const serializedSize = Buffer.byteLength(JSON.stringify({
    answers: body?.answers,
    currentIndex: body?.currentIndex,
    markedQuestions: body?.markedQuestions,
  }));
  if (serializedSize > 128 * 1024) {
    return { ok: false, code: "ANSWER_PAYLOAD_TOO_LARGE", message: "Answer payload is too large." };
  }

  if (!Number.isSafeInteger(body?.currentIndex) || body.currentIndex < 0 || body.currentIndex >= questionCount) {
    return { ok: false, code: "INVALID_CURRENT_QUESTION", message: "Invalid current question." };
  }

  const answers = body?.answers;
  if (!answers || typeof answers !== "object" || Array.isArray(answers)) {
    return { ok: false, code: "INVALID_ANSWERS_PAYLOAD", message: "Invalid answers payload." };
  }

  const normalizedAnswers = {};
  for (const [rawIndex, rawAnswer] of Object.entries(answers)) {
    const index = Number(rawIndex);
    if (!Number.isSafeInteger(index) || index < 0 || index >= questionCount || String(index) !== rawIndex) {
      return { ok: false, code: "INVALID_QUESTION_REFERENCE", message: "Invalid question reference." };
    }
    if (typeof rawAnswer !== "string") {
      return { ok: false, code: "INVALID_ANSWERS_PAYLOAD", message: "Invalid answers payload." };
    }
    normalizedAnswers[rawIndex] = rawAnswer.slice(0, 20000);
  }

  if (!Array.isArray(body?.markedQuestions)) {
    return { ok: false, code: "INVALID_MARKED_QUESTIONS", message: "Invalid marked questions." };
  }

  const markedQuestions = [];
  for (const value of body.markedQuestions) {
    if (!Number.isSafeInteger(value) || value < 0 || value >= questionCount) {
      return { ok: false, code: "INVALID_MARKED_QUESTIONS", message: "Invalid marked questions." };
    }
    if (!markedQuestions.includes(value)) markedQuestions.push(value);
  }

  return {
    ok: true,
    answers: normalizedAnswers,
    currentIndex: body.currentIndex,
    markedQuestions,
  };
}
