import express from "express";
import mongoose from "mongoose";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { Exam } from "../models/Exam.js";
import { Submission } from "../models/Submission.js";
import { StudentNotification } from "../models/StudentNotification.js";
import { serializeNotification } from "../services/studentNotifications.js";

export const studentsRouter = express.Router();

studentsRouter.get(
  "/:studentId/exams/:examId/grade",
  requireAuth,
  requireRole("STUDENT"),
  async (req, res, next) => {
    try {
      const studentId = normalizeStudentId(req.params.studentId);
      verifyStudentAccess(req.user, studentId);

      const examId = String(req.params.examId || "").trim();
      if (!mongoose.isValidObjectId(examId)) {
        const error = new Error("Invalid examId.");
        error.status = 400;
        throw error;
      }

      const [submission, notification] = await Promise.all([
        Submission.findOne({ studentId, examId }).sort({ submittedAt: -1 }).lean(),
        StudentNotification.findOne({
          studentId,
          examId,
          type: "GRADE_ASSIGNED",
        })
          .sort({ createdAt: -1 })
          .lean(),
      ]);

      const gradeValue =
        submission?.grade ??
        notification?.payload?.grade ??
        null;

      res.json({
        submission: {
          studentId,
          examId,
          grade: gradeValue != null ? String(gradeValue) : null,
          feedback:
            submission?.feedback ||
            String(notification?.payload?.feedback || ""),
          gradedAt:
            submission?.gradedAt ||
            notification?.payload?.gradedAt ||
            null,
          submittedAt: submission?.submittedAt || null,
          totalWarnings: submission?.totalWarnings || 0,
          riskLevel: submission?.riskLevel || "Low Risk",
          answers: submission?.answers || [],
          appSwitchWarnings: submission?.appSwitchWarnings || 0,
          faceMissingWarnings: submission?.faceMissingWarnings || 0,
          audioWarnings: submission?.audioWarnings || 0,
          phoneWarnings: submission?.phoneWarnings || 0,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

studentsRouter.get(
  "/:studentId/notifications",
  requireAuth,
  requireRole("STUDENT"),
  async (req, res, next) => {
    try {
      const studentId = normalizeStudentId(req.params.studentId);
      verifyStudentAccess(req.user, studentId);

      const onlyPending = String(req.query.pending || "").toLowerCase() === "true";
      const query = { studentId };
      if (onlyPending) {
        query.notified = false;
      }

      const notifications = await StudentNotification.find(query)
        .sort({ createdAt: -1 })
        .limit(100)
        .lean();

      res.json({
        notifications: notifications.map(serializeNotification),
      });
    } catch (error) {
      next(error);
    }
  }
);

studentsRouter.patch(
  "/:studentId/notifications/:notificationId/read",
  requireAuth,
  requireRole("STUDENT"),
  async (req, res, next) => {
    try {
      const studentId = normalizeStudentId(req.params.studentId);
      verifyStudentAccess(req.user, studentId);

      const notificationId = String(req.params.notificationId || "").trim();
      if (!mongoose.isValidObjectId(notificationId)) {
        const error = new Error("Invalid notification id.");
        error.status = 400;
        throw error;
      }

      const notification = await StudentNotification.findOneAndUpdate(
        { _id: notificationId, studentId },
        { $set: { notified: true } },
        { new: true }
      ).lean();

      if (!notification) {
        const error = new Error("Notification not found.");
        error.status = 404;
        throw error;
      }

      res.json({ notification: serializeNotification(notification) });
    } catch (error) {
      next(error);
    }
  }
);

function normalizeStudentId(studentId) {
  return String(studentId || "").trim().toLowerCase();
}

function verifyStudentAccess(user, studentId) {
  const normalizedUserId = normalizeStudentId(user.identifier);
  if (normalizedUserId !== studentId) {
    const error = new Error("Access denied to this student resource.");
    error.status = 403;
    throw error;
  }
}
