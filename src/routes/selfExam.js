import express from "express";
import { installBulkSelfExamRoutes } from '../../backend/src/routes/selfExamBulk.js';
import { requireAuth, requireRole } from "../middleware/auth.js";
import {
  createSelfExamSession,
  getActiveSelfExamSession,
  getSelfExamResult,
  getSelfExamSession,
  saveSelfExamAnswer,
  startSelfExamSession,
  submitSelfExam,
} from "../../backend/src/services/selfExamService.js";
import {
  getChaptersBySubject,
  getClasses,
  getSubjectsByClass,
} from "../../backend/src/services/questionBankService.js";

export const selfExamRouter = express.Router();
installBulkSelfExamRoutes(selfExamRouter, requireAuth, requireRole);

selfExamRouter.get("/classes", requireAuth, requireRole("STUDENT"), async (_req, res, next) => {
  try {
    res.json({ classes: await getClasses() });
  } catch (error) {
    next(error);
  }
});

selfExamRouter.get("/classes/:classId/subjects", requireAuth, requireRole("STUDENT"), async (req, res, next) => {
  try {
    res.json({ subjects: await getSubjectsByClass(req.params.classId) });
  } catch (error) {
    next(error);
  }
});

selfExamRouter.get("/subjects/:subjectId/chapters", requireAuth, requireRole("STUDENT"), async (req, res, next) => {
  try {
    res.json({ chapters: await getChaptersBySubject(req.params.subjectId) });
  } catch (error) {
    next(error);
  }
});

selfExamRouter.get("/sessions/active", requireAuth, requireRole("STUDENT"), async (req, res, next) => {
  try {
    res.json({ session: await getActiveSelfExamSession(req.user) });
  } catch (error) {
    next(error);
  }
});

selfExamRouter.post("/sessions", requireAuth, requireRole("STUDENT"), async (req, res, next) => {
  try {
    res.status(201).json({ session: await createSelfExamSession(req.user, req.body) });
  } catch (error) {
    next(error);
  }
});

selfExamRouter.post("/sessions/:sessionId/start", requireAuth, requireRole("STUDENT"), async (req, res, next) => {
  try {
    res.json(await startSelfExamSession(req.user, req.params.sessionId));
  } catch (error) {
    next(error);
  }
});

selfExamRouter.get("/sessions/:sessionId", requireAuth, requireRole("STUDENT"), async (req, res, next) => {
  try {
    res.json(await getSelfExamSession(req.user, req.params.sessionId));
  } catch (error) {
    next(error);
  }
});

selfExamRouter.post("/sessions/:sessionId/answers", requireAuth, requireRole("STUDENT"), async (req, res, next) => {
  try {
    res.json({ answer: await saveSelfExamAnswer(req.user, req.params.sessionId, req.body) });
  } catch (error) {
    next(error);
  }
});

selfExamRouter.post("/sessions/:sessionId/submit", requireAuth, requireRole("STUDENT"), async (req, res, next) => {
  try {
    res.json(await submitSelfExam(req.user, req.params.sessionId));
  } catch (error) {
    next(error);
  }
});

selfExamRouter.get("/sessions/:sessionId/result", requireAuth, requireRole("STUDENT"), async (req, res, next) => {
  try {
    res.json(await getSelfExamResult(req.user, req.params.sessionId));
  } catch (error) {
    next(error);
  }
});
