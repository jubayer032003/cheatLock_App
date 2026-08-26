import express from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import {
  createChapter,
  createClass,
  createQuestion,
  createSubject,
  getChaptersBySubject,
  getClasses,
  getQuestionPreview,
  getSubjectsByClass,
  searchQuestions,
  setChapterStatus,
  setClassStatus,
  setQuestionStatus,
  setSubjectStatus,
  updateChapter,
  updateClass,
  updateQuestion,
  updateSubject,
} from "../../backend/src/services/questionBankService.js";

export const questionBankRouter = express.Router();

const ADMIN_ROLES = ["SUPER_ADMIN", "INSTITUTION_ADMIN", "DEPARTMENT_ADMIN"];
const STAFF_ROLES = [...ADMIN_ROLES, "TEACHER"];

questionBankRouter.get("/admin/classes", requireAuth, requireRole(ADMIN_ROLES), async (_req, res, next) => {
  try {
    res.json({ classes: await getClasses({ includeInactive: true }) });
  } catch (error) {
    next(error);
  }
});

questionBankRouter.post("/admin/classes", requireAuth, requireRole(ADMIN_ROLES), async (req, res, next) => {
  try {
    res.status(201).json({ class: await createClass(req.body, req.user.identifier) });
  } catch (error) {
    next(error);
  }
});

questionBankRouter.put("/admin/classes/:classId", requireAuth, requireRole(ADMIN_ROLES), async (req, res, next) => {
  try {
    res.json({ class: await updateClass(req.params.classId, req.body, req.user.identifier) });
  } catch (error) {
    next(error);
  }
});

questionBankRouter.patch("/admin/classes/:classId/status", requireAuth, requireRole(ADMIN_ROLES), async (req, res, next) => {
  try {
    res.json({ class: await setClassStatus(req.params.classId, req.body?.isActive, req.user.identifier) });
  } catch (error) {
    next(error);
  }
});

questionBankRouter.get("/admin/classes/:classId/subjects", requireAuth, requireRole(ADMIN_ROLES), async (req, res, next) => {
  try {
    res.json({ subjects: await getSubjectsByClass(req.params.classId, { includeInactive: true }) });
  } catch (error) {
    next(error);
  }
});

questionBankRouter.post("/admin/subjects", requireAuth, requireRole(ADMIN_ROLES), async (req, res, next) => {
  try {
    res.status(201).json({ subject: await createSubject(req.body, req.user.identifier) });
  } catch (error) {
    next(error);
  }
});

questionBankRouter.put("/admin/subjects/:subjectId", requireAuth, requireRole(ADMIN_ROLES), async (req, res, next) => {
  try {
    res.json({ subject: await updateSubject(req.params.subjectId, req.body, req.user.identifier) });
  } catch (error) {
    next(error);
  }
});

questionBankRouter.patch("/admin/subjects/:subjectId/status", requireAuth, requireRole(ADMIN_ROLES), async (req, res, next) => {
  try {
    res.json({ subject: await setSubjectStatus(req.params.subjectId, req.body?.isActive, req.user.identifier) });
  } catch (error) {
    next(error);
  }
});

questionBankRouter.get("/admin/subjects/:subjectId/chapters", requireAuth, requireRole(ADMIN_ROLES), async (req, res, next) => {
  try {
    res.json({ chapters: await getChaptersBySubject(req.params.subjectId, { includeInactive: true }) });
  } catch (error) {
    next(error);
  }
});

questionBankRouter.post("/admin/chapters", requireAuth, requireRole(ADMIN_ROLES), async (req, res, next) => {
  try {
    res.status(201).json({ chapter: await createChapter(req.body, req.user.identifier) });
  } catch (error) {
    next(error);
  }
});

questionBankRouter.put("/admin/chapters/:chapterId", requireAuth, requireRole(ADMIN_ROLES), async (req, res, next) => {
  try {
    res.json({ chapter: await updateChapter(req.params.chapterId, req.body, req.user.identifier) });
  } catch (error) {
    next(error);
  }
});

questionBankRouter.patch("/admin/chapters/:chapterId/status", requireAuth, requireRole(ADMIN_ROLES), async (req, res, next) => {
  try {
    res.json({ chapter: await setChapterStatus(req.params.chapterId, req.body?.isActive, req.user.identifier) });
  } catch (error) {
    next(error);
  }
});

questionBankRouter.get("/classes", requireAuth, requireRole(STAFF_ROLES), async (_req, res, next) => {
  try {
    res.json({ classes: await getClasses() });
  } catch (error) {
    next(error);
  }
});

questionBankRouter.get("/classes/:classId/subjects", requireAuth, requireRole(STAFF_ROLES), async (req, res, next) => {
  try {
    res.json({ subjects: await getSubjectsByClass(req.params.classId) });
  } catch (error) {
    next(error);
  }
});

questionBankRouter.get("/subjects/:subjectId/chapters", requireAuth, requireRole(STAFF_ROLES), async (req, res, next) => {
  try {
    res.json({ chapters: await getChaptersBySubject(req.params.subjectId) });
  } catch (error) {
    next(error);
  }
});

questionBankRouter.get("/questions", requireAuth, requireRole(STAFF_ROLES), async (req, res, next) => {
  try {
    const includeAnswers = req.user.role !== "TEACHER";
    const filters = req.user.role === "TEACHER" ? { ...req.query, status: "active" } : req.query;
    res.json(await searchQuestions(filters, { includeAnswers }));
  } catch (error) {
    next(error);
  }
});

questionBankRouter.get("/questions/:questionId", requireAuth, requireRole(STAFF_ROLES), async (req, res, next) => {
  try {
    const includeAnswers = req.user.role !== "TEACHER";
    const question = await getQuestionPreview(req.params.questionId, { includeAnswers });
    if (req.user.role === "TEACHER" && question.status !== "active") {
      const error = new Error("Question not found.");
      error.status = 404;
      throw error;
    }
    res.json({ question });
  } catch (error) {
    next(error);
  }
});

questionBankRouter.post("/questions", requireAuth, requireRole(ADMIN_ROLES), async (req, res, next) => {
  try {
    res.status(201).json({ question: await createQuestion(req.body, req.user.identifier) });
  } catch (error) {
    next(error);
  }
});

questionBankRouter.put("/questions/:questionId", requireAuth, requireRole(ADMIN_ROLES), async (req, res, next) => {
  try {
    res.json({ question: await updateQuestion(req.params.questionId, req.body, req.user.identifier) });
  } catch (error) {
    next(error);
  }
});

questionBankRouter.patch("/questions/:questionId/status", requireAuth, requireRole(ADMIN_ROLES), async (req, res, next) => {
  try {
    res.json({ question: await setQuestionStatus(req.params.questionId, req.body?.status, req.user.identifier) });
  } catch (error) {
    next(error);
  }
});
