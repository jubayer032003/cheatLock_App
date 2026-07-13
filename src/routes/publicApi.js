import express from "express";
import { Exam } from "../models/Exam.js";
import { User } from "../models/User.js";
import { Submission } from "../models/Submission.js";
import { requireAuth } from "../middleware/auth.js";

export const publicApiRouter = express.Router();

// Public OpenAPI Endpoint definitions

// 1. Sync Exams List
publicApiRouter.get("/v1/exams", requireAuth, async (req, res, next) => {
  try {
    const exams = await Exam.find().lean();
    res.json({
      object: "list",
      count: exams.length,
      data: exams.map((e) => ({
        id: e._id,
        title: e.title,
        durationMinutes: e.durationMinutes,
        createdAt: e.createdAt,
      })),
    });
  } catch (err) {
    next(err);
  }
});

// 2. Sync Students Directory
publicApiRouter.get("/v1/students", requireAuth, async (req, res, next) => {
  try {
    const students = await User.find({ role: "STUDENT" }).select("-passwordHash").lean();
    res.json({
      object: "list",
      count: students.length,
      data: students.map((s) => ({
        id: s._id,
        name: s.name,
        identifier: s.identifier,
        status: s.status,
      })),
    });
  } catch (err) {
    next(err);
  }
});

// 3. Sync Exam Grades & Submissions
publicApiRouter.get("/v1/submissions", requireAuth, async (req, res, next) => {
  try {
    const submissions = await Submission.find().lean();
    res.json({
      object: "list",
      count: submissions.length,
      data: submissions.map((sub) => ({
        id: sub._id,
        examId: sub.examId,
        studentId: sub.studentId,
        submittedAt: sub.createdAt,
      })),
    });
  } catch (err) {
    next(err);
  }
});
