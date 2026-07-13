import express from "express";
import mongoose from "mongoose";
import { requireAuth, requireRole } from "../middleware/auth.js";
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

submissionsRouter.post("/", requireAuth, async (req, res, next) => {
  try {
    const studentId = String(req.body.studentId || req.user.identifier).trim().toLowerCase();
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
  async (_req, res, next) => {
    try {
      const submissions = await Submission.find()
        .sort({ submittedAt: -1 })
        .limit(200)
        .lean();

      res.json({ submissions });
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
      await Submission.deleteMany({});
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }
);
