import express from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { Exam } from "../models/Exam.js";
import { ExamSession } from "../models/ExamSession.js";
import { IntegrityReview } from "../models/IntegrityReview.js";
import { ProctoringEvent } from "../models/ProctoringEvent.js";
import { StudentNotification } from "../models/StudentNotification.js";
import { TeacherClass } from "../models/TeacherClass.js";
import { TeacherCommunity } from "../models/TeacherCommunity.js";
import {
  notifyExamCreated,
  notifyExamLive,
  notifyStudentsAssigned,
} from "../services/studentNotifications.js";

export const examsRouter = express.Router();

examsRouter.post("/", requireAuth, requireRole("TEACHER"), async (req, res, next) => {
  try {
    const accessCode = await createUniqueAccessCode();
    const community = await TeacherCommunity.findOne({ teacherId: req.user.identifier });
    const communityStudents = req.body.useCommunity ? community?.students || [] : [];
    const selectedClasses = await findTeacherClasses(req.user.identifier, req.body.classIds || []);
    const classStudents = selectedClasses.flatMap((classRecord) => classRecord.students || []);
    const assignedStudents = uniqueStudentIds([
      ...normalizeStudentIds(req.body.assignedStudents || []),
      ...communityStudents,
      ...classStudents,
    ]);
    const questions = normalizeQuestions(req.body.questions || []);

    if (!req.body.title || !String(req.body.title).trim()) {
      const error = new Error("Exam title is required.");
      error.status = 400;
      throw error;
    }

    if (questions.length === 0) {
      const error = new Error("At least one question is required.");
      error.status = 400;
      throw error;
    }

    const exam = await Exam.create({
      title: req.body.title,
      durationMinutes: req.body.durationMinutes,
      lockAnswers: req.body.lockAnswers ?? true,
      status: normalizeExamStatus(req.body.status) || initialExamStatus(req.body),
      scheduledStartAt: parseDateOrNull(req.body.scheduledStartAt),
      scheduledEndAt: parseDateOrNull(req.body.scheduledEndAt),
      questions,
      assignedStudents,
      communityStudents,
      classIds: selectedClasses.map((classRecord) => classRecord._id),
      accessCode,
      accessLink: buildAccessLink(accessCode),
      createdBy: req.user.identifier,
    });

    if (assignedStudents.length > 0) {
      await notifyExamCreated(exam);
    }

    res.status(201).json({ exam: serializeExam(exam) });
  } catch (error) {
    next(error);
  }
});

examsRouter.patch("/:examId/lifecycle", requireAuth, requireRole("TEACHER"), async (req, res, next) => {
  try {
    const exam = await Exam.findOne({ _id: req.params.examId, createdBy: req.user.identifier });
    if (!exam) {
      const error = new Error("Exam not found or not owned by this teacher.");
      error.status = 404;
      throw error;
    }

    const action = String(req.body?.action || "").trim().toUpperCase();
    if (action === "SCHEDULE") {
      const startAt = parseDateOrNull(req.body?.scheduledStartAt);
      const endAt = parseDateOrNull(req.body?.scheduledEndAt);
      if (!startAt || !endAt || endAt <= startAt) {
        const error = new Error("Valid scheduled start and end time are required.");
        error.status = 400;
        throw error;
      }
      exam.status = "SCHEDULED";
      exam.scheduledStartAt = startAt;
      exam.scheduledEndAt = endAt;
      exam.startedAt = undefined;
      exam.endedAt = undefined;
      exam.archivedAt = undefined;
    } else if (action === "START") {
      const now = new Date();
      exam.status = "LIVE";
      exam.startedAt = now;
      exam.endedAt = undefined;
      exam.archivedAt = undefined;
      exam.scheduledStartAt = exam.scheduledStartAt || now;
      exam.scheduledEndAt = exam.scheduledEndAt || new Date(now.getTime() + exam.durationMinutes * 60_000);
    } else if (action === "END") {
      exam.status = "ENDED";
      exam.endedAt = new Date();
      exam.scheduledEndAt = exam.scheduledEndAt || exam.endedAt;
    } else if (action === "ARCHIVE") {
      exam.status = "ARCHIVED";
      exam.archivedAt = new Date();
      exam.endedAt = exam.endedAt || exam.archivedAt;
    } else if (action === "DRAFT") {
      exam.status = "DRAFT";
      exam.scheduledStartAt = undefined;
      exam.scheduledEndAt = undefined;
      exam.startedAt = undefined;
      exam.endedAt = undefined;
      exam.archivedAt = undefined;
    } else {
      const error = new Error("Unsupported lifecycle action.");
      error.status = 400;
      throw error;
    }

    await exam.save();
    if (action === "START") {
      await notifyExamLive(exam);
    }
    res.json({ exam: serializeExam(exam) });
  } catch (error) {
    next(error);
  }
});

examsRouter.get("/", requireAuth, requireRole("TEACHER"), async (req, res, next) => {
  try {
    const exams = await Exam.find({ createdBy: req.user.identifier })
      .sort({ createdAt: -1 })
      .limit(100)
    res.json({ exams: exams.map(serializeExam) });
  } catch (error) {
    next(error);
  }
});

examsRouter.get("/assigned", requireAuth, requireRole("STUDENT"), async (req, res, next) => {
  try {
    const exam = await Exam.findOne({
      assignedStudents: req.user.identifier,
    })
      .sort({ createdAt: -1 });

    if (!exam) {
      const error = new Error("No exam assigned to this student.");
      error.status = 404;
      throw error;
    }

    res.json({ exam: serializeExam(exam) });
  } catch (error) {
    next(error);
  }
});

examsRouter.get("/access/:code", requireAuth, requireRole("STUDENT"), async (req, res, next) => {
  try {
    const exam = await Exam.findOne({
      accessCode: req.params.code.toUpperCase(),
    });

    if (!exam) {
      const error = new Error("Invalid exam code.");
      error.status = 404;
      throw error;
    }

    const assignedStudents = exam.assignedStudents || [];
    const isOpenAccessExam = assignedStudents.length === 0;

    if (!isOpenAccessExam && !assignedStudents.includes(req.user.identifier)) {
      const error = new Error("This exam code is valid, but this student is not assigned to the exam.");
      error.status = 403;
      throw error;
    }

    if (isOpenAccessExam && !assignedStudents.includes(req.user.identifier)) {
      exam.assignedStudents.push(req.user.identifier);
      await exam.save();
    }

    res.json({ exam: serializeExam(exam) });
  } catch (error) {
    next(error);
  }
});

examsRouter.patch(
  "/:examId/assign-students",
  requireAuth,
  requireRole("TEACHER"),
  async (req, res, next) => {
    try {
      const exam = await Exam.findOne({
        _id: req.params.examId,
        createdBy: req.user.identifier,
      });

      if (!exam) {
        const error = new Error("Exam not found or not owned by this teacher.");
        error.status = 404;
        throw error;
      }

      const status = getEffectiveExamStatus(exam);
      if (!["DRAFT", "SCHEDULED", "LIVE"].includes(status)) {
        const error = new Error(
          "Students can only be added while the exam is draft, scheduled, or live."
        );
        error.status = 400;
        throw error;
      }

      const studentIds = uniqueStudentIds(
        normalizeStudentIds(req.body.studentIds || req.body.addStudents || [])
      );

      if (studentIds.length === 0) {
        const error = new Error("At least one student ID is required.");
        error.status = 400;
        throw error;
      }

      const assigned = new Set(exam.assignedStudents || []);
      const addedStudents = [];

      for (const studentId of studentIds) {
        if (!assigned.has(studentId)) {
          assigned.add(studentId);
          addedStudents.push(studentId);
        }
      }

      exam.assignedStudents = [...assigned];
      await exam.save();

      if (addedStudents.length > 0) {
        await notifyStudentsAssigned(exam, addedStudents);
      }

      res.json({
        exam: serializeExam(exam),
        addedStudents,
      });
    } catch (error) {
      next(error);
    }
  }
);

examsRouter.get("/:examId", requireAuth, requireRole("TEACHER"), async (req, res, next) => {
  try {
    const exam = await Exam.findOne({
      _id: req.params.examId,
      createdBy: req.user.identifier,
    });

    if (!exam) {
      const error = new Error("Exam not found or not owned by this teacher.");
      error.status = 404;
      throw error;
    }

    res.json({ exam: serializeExam(exam) });
  } catch (error) {
    next(error);
  }
});

examsRouter.delete("/:examId", requireAuth, requireRole("TEACHER"), async (req, res, next) => {
  try {
    const exam = await Exam.findById(req.params.examId).lean();
    if (!exam) {
      const error = new Error("Exam not found.");
      error.status = 404;
      throw error;
    }

    if (String(exam.createdBy) !== String(req.user.identifier)) {
      const error = new Error("Unauthorized: not the exam owner.");
      error.status = 403;
      throw error;
    }

    await Promise.all([
      Exam.deleteOne({ _id: exam._id }),
      ExamSession.deleteMany({ examId: exam._id }),
      IntegrityReview.deleteMany({ examId: exam._id }),
      ProctoringEvent.deleteMany({ examId: exam._id }),
      StudentNotification.deleteMany({ examId: exam._id }),
    ]);

    res.status(200).json({ message: "Exam deleted successfully" });
  } catch (error) {
    next(error);
  }
});

function normalizeStudentIds(students) {
  return students
    .map((student) => String(student).trim().toLowerCase())
    .filter(Boolean);
}

function uniqueStudentIds(students) {
  return [...new Set(students)];
}

function normalizeQuestions(questions) {
  return questions
    .map((question) => ({
      type: question.type === "MCQ" ? "MCQ" : "CQ",
      text: String(question.text || "").trim(),
      options: Array.isArray(question.options)
        ? question.options.map((option) => String(option).trim()).filter(Boolean)
        : [],
      correctAnswer: String(question.correctAnswer || "").trim(),
    }))
    .filter((question) => question.text);
}

function normalizeExamStatus(status) {
  const normalized = String(status || "").trim().toUpperCase();
  return ["DRAFT", "SCHEDULED", "LIVE", "ENDED", "ARCHIVED"].includes(normalized)
    ? normalized
    : null;
}

function initialExamStatus(body) {
  return body?.scheduledStartAt && body?.scheduledEndAt ? "SCHEDULED" : "DRAFT";
}

function parseDateOrNull(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

async function createUniqueAccessCode() {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = Math.random().toString(36).slice(2, 8).toUpperCase();
    const exists = await Exam.exists({ accessCode: code });
    if (!exists) return code;
  }

  return `${Date.now().toString(36).toUpperCase()}`;
}

function buildAccessLink(accessCode) {
  const baseUrl = process.env.PUBLIC_EXAM_BASE_URL || "https://cheatlock.local/exam";
  return `${baseUrl}?code=${accessCode}`;
}

function serializeExam(exam) {
  const status = getEffectiveExamStatus(exam);
  return {
    id: exam._id.toString(),
    title: exam.title,
    durationMinutes: exam.durationMinutes,
    lockAnswers: exam.lockAnswers,
    status,
    scheduledStartAt: exam.scheduledStartAt || null,
    scheduledEndAt: exam.scheduledEndAt || null,
    startedAt: exam.startedAt || null,
    endedAt: exam.endedAt || null,
    archivedAt: exam.archivedAt || null,
    questions: exam.questions.map((question) => ({
      type: question.type,
      text: question.text,
      options: question.options,
      correctAnswer: question.correctAnswer,
    })),
    assignedStudents: exam.assignedStudents,
    communityStudents: exam.communityStudents,
    classIds: (exam.classIds || []).map((classId) => classId.toString()),
    accessCode: exam.accessCode,
    accessLink: exam.accessLink,
  };
}

async function findTeacherClasses(teacherId, rawClassIds) {
  const classIds = Array.isArray(rawClassIds)
    ? rawClassIds.map((id) => String(id || "").trim()).filter(Boolean)
    : [];
  if (classIds.length === 0) return [];

  const classes = await TeacherClass.find({
    _id: { $in: classIds },
    teacherId,
  });

  if (classes.length !== classIds.length) {
    const error = new Error("One or more selected classes were not found for this teacher.");
    error.status = 400;
    throw error;
  }

  return classes;
}

export function getEffectiveExamStatus(exam) {
  if (exam.status === "ARCHIVED") return "ARCHIVED";
  if (exam.status === "ENDED") return "ENDED";

  const now = Date.now();
  const startAt = exam.scheduledStartAt ? new Date(exam.scheduledStartAt).getTime() : null;
  const endAt = exam.scheduledEndAt ? new Date(exam.scheduledEndAt).getTime() : null;

  if (endAt && now >= endAt) return "ENDED";
  if (exam.status === "LIVE") return "LIVE";
  if (startAt && endAt && now >= startAt && now < endAt) return "LIVE";
  if (exam.status === "SCHEDULED") return "SCHEDULED";
  return "DRAFT";
}

export function assertExamIsLive(exam) {
  if (!exam) {
    const error = new Error("Exam not found.");
    error.status = 404;
    throw error;
  }
  const status = getEffectiveExamStatus(exam);
  if (status !== "LIVE") {
    const error = new Error(statusMessage(status, exam));
    error.status = 403;
    throw error;
  }
}

function statusMessage(status, exam) {
  if (status === "DRAFT") return "This exam is not live yet. Wait for your teacher to start it.";
  if (status === "SCHEDULED") {
    const start = exam.scheduledStartAt ? new Date(exam.scheduledStartAt).toLocaleString() : "the scheduled time";
    return `This exam is scheduled and will open at ${start}.`;
  }
  if (status === "ENDED") return "This exam has ended.";
  if (status === "ARCHIVED") return "This exam is archived.";
  return "This exam is not available.";
}
