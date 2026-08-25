import express from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import {
  handleStudentProctoringEvent,
  isStudentProctoringEvent,
} from "../socket/proctoring.js";
import { logger } from "../services/logger.js";

export const proctoringRouter = express.Router();

proctoringRouter.post(
  "/events",
  requireAuth,
  requireRole("STUDENT"),
  async (req, res, next) => {
    try {
      const eventName = String(req.body?.eventName || "").trim();
      logger.debug("Student proctoring HTTP event received.", {
        eventName,
        studentId: req.user?.identifier,
        payloadBytes: Buffer.byteLength(JSON.stringify(req.body || {})),
      });
      if (!isStudentProctoringEvent(eventName)) {
        const error = new Error("Unsupported proctoring event.");
        error.status = 400;
        throw error;
      }

      const result = await handleStudentProctoringEvent(
        req.app.get("io"),
        req.user,
        eventName,
        req.body
      );

      res.json({
        ok: true,
        eventName,
        student: result.student,
      });
    } catch (error) {
      next(error);
    }
  }
);
