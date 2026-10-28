import express from "express";
import mongoose from "mongoose";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { Exam } from "../models/Exam.js";
import { ExamSession } from "../models/ExamSession.js";
import { Submission } from "../models/Submission.js";
import { admitSubmission, submissionWarningCounts, submissionAnswers } from "../services/submissionAdmission.js";

export const submissionsRouter = express.Router();

async function resolveSubmissionExamId(studentId, rawExamId) {
  let examId = rawExamId ? String(rawExamId).trim() : null;

  if (examId && !mongoose.isValidObjectId(examId)) {
    const error = new Error("Invalid examId.");
    error.status = 400;
    throw error;
  }

  if (!examId) {
    const session = await ExamSession.findOne({
      studentId,
      examId: { $ne: null },
      status: { $in: ["IN_PROGRESS", "SUBMITTED", "LOCKED"] },
    })
      .sort({ updatedAt: -1 })
      .lean();

    examId = session?.examId?.toString() || null;
  }

  return examId;
}

submissionsRouter.post("/warnings", requireAuth, requireRole("STUDENT"), async (req, res, next) => {
  try {
    const studentId = req.user.identifier;
    const examId = await resolveSubmissionExamId(studentId, req.body.examId);

    const { exam } = await admitSubmission(req.user, examId, req.body);
    const { appSwitchWarnings, faceMissingWarnings, audioWarnings, phoneWarnings, totalWarnings } = submissionWarningCounts(req.body);
    const submission = await Submission.findOneAndUpdate(
      { studentId, examId: exam._id },
      {
        $inc: {
          appSwitchWarnings,
          faceMissingWarnings,
          audioWarnings,
          phoneWarnings,
          totalWarnings,
        },
        $set: {
          riskLevel: ["Low Risk", "Medium Risk", "High Risk"].includes(req.body.riskLevel) ? req.body.riskLevel : "Low Risk",
          submittedAt: Number(req.body.submittedAt) || Date.now(),
        }
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    res.status(200).json({
      ok: true,
      submission,
    });
  } catch (error) {
    next(error);
  }
});

submissionsRouter.post("/", requireAuth, requireRole("STUDENT"), async (req, res, next) => {
  try {
    const studentId = req.user.identifier;
    const examId = await resolveSubmissionExamId(studentId, req.body.examId);

    const { exam, session } = await admitSubmission(req.user, examId, req.body, true);
    if (session.status === "SUBMITTED") {
      const existing = await Submission.findOne({ studentId, examId: exam._id }).lean();
      if (!existing) throw Object.assign(new Error("Submission recovery is required."), { status: 409, code: "SUBMISSION_RECOVERY_REQUIRED" });
      return res.status(200).json({ submission: existing });
    }
    const counts = submissionWarningCounts(req.body);
    const answers = submissionAnswers(req.body.answers ?? [], exam);
    const submissionPayload = {
      studentId, examId: exam._id, answers, ...counts,
      riskLevel: ["Low Risk", "Medium Risk", "High Risk"].includes(req.body.riskLevel) ? req.body.riskLevel : "Low Risk",
      submittedAt: Date.now(),
      grade: null, feedback: "", gradedAt: null,
    };
    const submission = await Submission.findOneAndUpdate(
      { studentId, examId: exam._id },
      { $set: submissionPayload },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    const finalized = await ExamSession.findOneAndUpdate(
      { _id: session._id, studentId, examId: exam._id, status: "IN_PROGRESS", startedAt: session.startedAt },
      { $set: { status: "SUBMITTED", submittedAt: submissionPayload.submittedAt, onlineStatus: "OFFLINE" } },
      { new: true }
    );
    if (!finalized) throw Object.assign(new Error("The exam attempt changed while submitting."), { status: 409, code: "STALE_EXAM_ATTEMPT" });
    res.status(201).json({
      submission,
    });
  } catch (error) {
    next(error);
  }
});

submissionsRouter.get(
  "/",
  requireAuth,
  requireRole("TEACHER"),
  async (req, res, next) => {
    try {
      const examIds = await findTeacherExamIds(req.user.identifier);
      const submissions = await Submission.find({ examId: { $in: examIds } })
        .sort({ submittedAt: -1 })
        .limit(200)
        .lean();

      res.json({ submissions });
    } catch (error) {
      next(error);
    }
  }
);

submissionsRouter.get(
  "/:submissionId",
  requireAuth,
  requireRole("TEACHER"),
  async (req, res, next) => {
    try {
      const submission = await findTeacherSubmission(req.user.identifier, req.params.submissionId);
      res.json({ submission });
    } catch (error) {
      next(error);
    }
  }
);

submissionsRouter.patch(
  "/:submissionId",
  requireAuth,
  requireRole("TEACHER"),
  async (req, res, next) => {
    try {
      const existing = await findTeacherSubmission(req.user.identifier, req.params.submissionId);
      const patch = {};
      if (req.body.grade !== undefined) patch.grade = Number(req.body.grade);
      if (req.body.feedback !== undefined) patch.feedback = String(req.body.feedback || "").trim();
      if (Object.prototype.hasOwnProperty.call(patch, "grade") && (!Number.isFinite(patch.grade) || patch.grade < 0 || patch.grade > 100)) {
        const error = new Error("A grade between 0 and 100 is required.");
        error.status = 400;
        throw error;
      }
      if (Object.prototype.hasOwnProperty.call(patch, "grade")) {
        patch.gradedAt = new Date();
      }

      const submission = await Submission.findOneAndUpdate(
        { _id: existing._id, examId: existing.examId },
        { $set: patch },
        { new: true }
      ).lean();

      res.json({ submission });
    } catch (error) {
      next(error);
    }
  }
);

submissionsRouter.delete(
  "/:submissionId",
  requireAuth,
  requireRole("TEACHER"),
  async (req, res, next) => {
    try {
      const existing = await findTeacherSubmission(req.user.identifier, req.params.submissionId);
      await Submission.deleteOne({ _id: existing._id, examId: existing.examId });
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }
);

submissionsRouter.delete(
  "/",
  requireAuth,
  requireRole("TEACHER"),
  async (_req, res, next) => {
    try {
      const error = new Error("Global submission deletion is not allowed.");
      error.status = 403;
      throw error;
    } catch (error) {
      next(error);
    }
  }
);

async function findTeacherExamIds(teacherId) {
  const exams = await Exam.find({ createdBy: teacherId }).select("_id").lean();
  return exams.map((exam) => exam._id);
}

async function findTeacherSubmission(teacherId, submissionId) {
  if (!mongoose.isValidObjectId(submissionId)) {
    const error = new Error("Submission not found.");
    error.status = 404;
    throw error;
  }

  const examIds = await findTeacherExamIds(teacherId);
  const submission = await Submission.findOne({
    _id: submissionId,
    examId: { $in: examIds },
  }).lean();

  if (!submission) {
    const error = new Error("Submission not found.");
    error.status = 404;
    throw error;
  }

  return submission;
}
