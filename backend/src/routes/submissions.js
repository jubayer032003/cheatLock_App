import express from "express";
import mongoose from "mongoose";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { Exam } from "../models/Exam.js";
import { ExamSession } from "../models/ExamSession.js";
import { Submission } from "../models/Submission.js";

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

submissionsRouter.post("/warnings", requireAuth, async (req, res, next) => {
  try {
    const studentId = req.user.role === "STUDENT"
      ? req.user.identifier.trim().toLowerCase()
      : String(req.body.studentId || req.user.identifier).trim().toLowerCase();
    const examId = await resolveSubmissionExamId(studentId, req.body.examId);

    if (!examId) {
      const error = new Error("No active exam session found for warning registration.");
      error.status = 400;
      throw error;
    }

    const appSwitchWarnings = Number(req.body.appSwitchWarnings || 0);
    const faceMissingWarnings = Number(req.body.faceMissingWarnings || 0);
    const audioWarnings = Number(req.body.audioWarnings || 0);
    const phoneWarnings = Number(req.body.phoneWarnings || 0);
    const totalWarnings = Number(req.body.totalWarnings || 0);

    const submission = await Submission.findOneAndUpdate(
      { studentId, examId },
      {
        $inc: {
          appSwitchWarnings,
          faceMissingWarnings,
          audioWarnings,
          phoneWarnings,
          totalWarnings,
        },
        $set: {
          riskLevel: req.body.riskLevel || "Low Risk",
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

submissionsRouter.post("/", requireAuth, async (req, res, next) => {
  try {
    const studentId = req.user.role === "STUDENT"
      ? req.user.identifier.trim().toLowerCase()
      : String(req.body.studentId || req.user.identifier).trim().toLowerCase();
    const examId = await resolveSubmissionExamId(studentId, req.body.examId);

    const totalWarnings =
      Number(req.body.appSwitchWarnings || 0) +
      Number(req.body.faceMissingWarnings || 0) +
      Number(req.body.audioWarnings || 0) +
      Number(req.body.phoneWarnings || 0);

    const submissionPayload = {
      studentId,
      answers: req.body.answers || [],
      appSwitchWarnings: Number(req.body.appSwitchWarnings || 0),
      faceMissingWarnings: Number(req.body.faceMissingWarnings || 0),
      audioWarnings: Number(req.body.audioWarnings || 0),
      phoneWarnings: Number(req.body.phoneWarnings || 0),
      totalWarnings,
      riskLevel: req.body.riskLevel || "Low Risk",
      submittedAt: Number(req.body.submittedAt) || Date.now(),
      examId: examId || undefined,
    };

    const submission = examId
      ? await Submission.findOneAndUpdate(
          { studentId, examId },
          { $set: submissionPayload },
          { new: true, upsert: true, setDefaultsOnInsert: true }
        )
      : await Submission.create(submissionPayload);

    await ExamSession.findOneAndUpdate(
      { studentId, ...(examId ? { examId } : {}) },
      {
        $set: {
          status: "SUBMITTED",
          submittedAt: Date.now(),
          onlineStatus: "OFFLINE",
        },
      },
      { upsert: true }
    );

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
      if (Object.prototype.hasOwnProperty.call(patch, "grade") && !Number.isFinite(patch.grade)) {
        const error = new Error("A valid numeric grade is required.");
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
