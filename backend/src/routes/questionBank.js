import express from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { Exam } from "../models/Exam.js";
import {
  createChapter,
  createClass,
  createExamNode,
  createQuestion,
  createSubject,
  deleteClass,
  deleteExamNode,
  deleteQuestion,
  getChaptersBySubject,
  getClasses,
  getExamCategories,
  getExamNodes,
  getExamTree,
  getNodePath,
  getQuestionPreview,
  getSubjectsByClass,
  importChapterQuestions,
  previewChapterQuestionImport,
  searchQuestions,
  setChapterStatus,
  setClassStatus,
  setExamNodeStatus,
  setQuestionStatus,
  setSubjectStatus,
  updateChapter,
  updateClass,
  updateExamNode,
  updateQuestion,
  updateSubject,
} from "../services/questionBankService.js";

export const questionBankRouter = express.Router();

const ADMIN_ROLES = ["SUPER_ADMIN", "INSTITUTION_ADMIN", "DEPARTMENT_ADMIN"];
const STAFF_ROLES = [...ADMIN_ROLES, "TEACHER"];

questionBankRouter.get("/admin/tree", requireAuth, requireRole(ADMIN_ROLES), async (_req, res, next) => {
  try {
    res.json({ tree: await getExamTree({ includeInactive: true }) });
  } catch (error) {
    next(error);
  }
});

questionBankRouter.get("/admin/categories", requireAuth, requireRole(ADMIN_ROLES), async (_req, res, next) => {
  try {
    res.json({ categories: await getExamCategories({ includeInactive: true }) });
  } catch (error) {
    next(error);
  }
});

questionBankRouter.get("/admin/nodes", requireAuth, requireRole(ADMIN_ROLES), async (req, res, next) => {
  try {
    res.json({ nodes: await getExamNodes({ categoryId: req.query.categoryId, parentId: req.query.parentId, includeInactive: true }) });
  } catch (error) {
    next(error);
  }
});

questionBankRouter.post("/admin/nodes", requireAuth, requireRole(ADMIN_ROLES), async (req, res, next) => {
  try {
    res.status(201).json({ node: await createExamNode(req.body, req.user.identifier) });
  } catch (error) {
    next(error);
  }
});

questionBankRouter.put("/admin/nodes/:nodeId", requireAuth, requireRole(ADMIN_ROLES), async (req, res, next) => {
  try {
    res.json({ node: await updateExamNode(req.params.nodeId, req.body, req.user.identifier) });
  } catch (error) {
    next(error);
  }
});

questionBankRouter.patch("/admin/nodes/:nodeId/status", requireAuth, requireRole(ADMIN_ROLES), async (req, res, next) => {
  try {
    res.json({ node: await setExamNodeStatus(req.params.nodeId, req.body?.isActive, req.user.identifier) });
  } catch (error) {
    next(error);
  }
});

questionBankRouter.delete("/admin/nodes/:nodeId", requireAuth, requireRole(ADMIN_ROLES), async (req, res, next) => {
  try {
    res.json({ deleted: await deleteExamNode(req.params.nodeId, req.user.identifier) });
  } catch (error) {
    next(error);
  }
});

questionBankRouter.get("/categories", requireAuth, requireRole(STAFF_ROLES), async (_req, res, next) => {
  try {
    res.json({ categories: await getExamCategories() });
  } catch (error) {
    next(error);
  }
});

questionBankRouter.get("/nodes", requireAuth, requireRole(STAFF_ROLES), async (req, res, next) => {
  try {
    res.json({ nodes: await getExamNodes({ categoryId: req.query.categoryId, parentId: req.query.parentId }) });
  } catch (error) {
    next(error);
  }
});

questionBankRouter.get("/nodes/:nodeId/path", requireAuth, requireRole(STAFF_ROLES), async (req, res, next) => {
  try {
    res.json({ path: await getNodePath(req.params.nodeId) });
  } catch (error) {
    next(error);
  }
});

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

questionBankRouter.delete("/admin/classes/:classId", requireAuth, requireRole(ADMIN_ROLES), async (req, res, next) => {
  try {
    res.json({ deleted: await deleteClass(req.params.classId, req.user.identifier) });
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

questionBankRouter.delete("/admin/subjects/:subjectId", requireAuth, requireRole(ADMIN_ROLES), async (req, res, next) => {
  try {
    res.json({ deleted: await deleteExamNode(req.params.subjectId, req.user.identifier) });
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

questionBankRouter.delete("/admin/chapters/:chapterId", requireAuth, requireRole(ADMIN_ROLES), async (req, res, next) => {
  try {
    res.json({ deleted: await deleteExamNode(req.params.chapterId, req.user.identifier) });
  } catch (error) {
    next(error);
  }
});

questionBankRouter.post("/admin/chapters/:chapterId/import-preview", requireAuth, requireRole(ADMIN_ROLES), async (req, res, next) => {
  try {
    const preview = await previewChapterQuestionImport({
      chapterId: req.params.chapterId,
      fileContent: req.body?.fileContent,
      fileType: req.body?.fileType,
    });
    res.json(preview);
  } catch (error) {
    next(error);
  }
});

questionBankRouter.post("/admin/chapters/:chapterId/import", requireAuth, requireRole(ADMIN_ROLES), async (req, res, next) => {
  try {
    const result = await importChapterQuestions({
      chapterId: req.params.chapterId,
      questions: req.body?.questions,
      adminId: req.user.identifier,
    });
    res.status(201).json(result);
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

questionBankRouter.post("/teacher/questions/snapshots", requireAuth, requireRole("TEACHER"), async (req, res, next) => {
  try {
    const questionIds = normalizeQuestionIds(req.body?.questionIds);
    if (questionIds.length === 0) {
      const error = new Error("At least one question is required.");
      error.status = 400;
      throw error;
    }

    const snapshots = await buildActiveQuestionSnapshots(questionIds);
    if (snapshots.length === 0) {
      const error = new Error("No active Question Bank questions could be added.");
      error.status = 400;
      throw error;
    }

    res.json({ added: snapshots.length, questions: snapshots });
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

questionBankRouter.delete("/questions/:questionId", requireAuth, requireRole(ADMIN_ROLES), async (req, res, next) => {
  try {
    res.json({ deleted: await deleteQuestion(req.params.questionId, req.user.identifier) });
  } catch (error) {
    next(error);
  }
});

questionBankRouter.post("/teacher/exams/:examId/questions", requireAuth, requireRole("TEACHER"), async (req, res, next) => {
  try {
    const questionIds = normalizeQuestionIds(req.body?.questionIds);
    if (questionIds.length === 0) {
      const error = new Error("At least one question is required.");
      error.status = 400;
      throw error;
    }

    const exam = await Exam.findOne({ _id: req.params.examId, createdBy: req.user.identifier });
    if (!exam) {
      const error = new Error("Exam not found or not owned by this teacher.");
      error.status = 404;
      throw error;
    }
    if ((exam.status || "DRAFT") !== "DRAFT") {
      const error = new Error("Question Bank questions can only be imported into draft exams.");
      error.status = 409;
      error.code = "EXAM_NOT_EDITABLE";
      throw error;
    }

    const existingSourceIds = new Set(
      (exam.questions || [])
        .map((question) => question?.data?.sourceQuestionId)
        .filter(Boolean)
    );
    const snapshots = (await buildActiveQuestionSnapshots(questionIds))
      .filter((snapshot) => !existingSourceIds.has(snapshot?.data?.sourceQuestionId));

    if (snapshots.length === 0) {
      const error = new Error("No new active Question Bank questions could be added.");
      error.status = 409;
      error.code = "QUESTION_BANK_DUPLICATE_IMPORT";
      throw error;
    }

    exam.questions.push(...snapshots);
    await exam.save();
    res.json({
      added: snapshots.length,
      exam: {
        id: exam._id.toString(),
        title: exam.title,
        questions: exam.questions,
      },
    });
  } catch (error) {
    next(error);
  }
});

function normalizeQuestionIds(questionIds) {
  return Array.isArray(questionIds)
    ? [...new Set(questionIds.map((id) => String(id || "").trim()).filter(Boolean))].slice(0, 50)
    : [];
}

async function buildActiveQuestionSnapshots(questionIds) {
  const snapshots = [];
  for (const questionId of questionIds) {
    const question = await getQuestionPreview(questionId, { includeAnswers: true });
    if (question.status !== "active") continue;
    snapshots.push(toTeacherExamQuestionSnapshot(question));
  }
  return snapshots;
}

export function toTeacherExamQuestionSnapshot(question) {
  const correctIndex = question.options.findIndex((option) => option.isCorrect);
  return {
    id: `qb:${question.id}`,
    type: question.questionType === "mcq" ? "MCQ" : question.questionType.toUpperCase(),
    text: question.questionText,
    options: question.options.map((option) => option.text),
    correctAnswer: correctIndex >= 0 ? String(correctIndex) : "",
    marks: question.marks,
    difficulty: question.difficulty,
    subject: question.subjectId,
    chapter: question.chapterId || "",
    explanation: question.explanation || "",
    tags: [],
    data: {
      source: "central_question_bank",
      sourceQuestionId: question.id,
      snapshotCreatedAt: new Date().toISOString(),
    },
  };
}
