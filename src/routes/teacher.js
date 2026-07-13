import express from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { Exam } from "../models/Exam.js";
import { ExamSession } from "../models/ExamSession.js";
import { IntegrityReview } from "../models/IntegrityReview.js";
import { ProctoringEvent } from "../models/ProctoringEvent.js";
import { Submission } from "../models/Submission.js";
import { StudentNotification } from "../models/StudentNotification.js";
import {
  notifyGradeAssigned,
  serializeNotification,
} from "../services/studentNotifications.js";
import {
  buildLiveProctoringPayload,
  handleTeacherProctoringTestEvent,
} from "../socket/proctoring.js";

export const teacherRouter = express.Router();

teacherRouter.get(
  "/exams/:examId/live-proctoring",
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

      res.json(await buildLiveProctoringPayload(exam));
    } catch (error) {
      next(error);
    }
  }
);

teacherRouter.get(
  "/exams/:examId/students/:studentId/proctoring-timeline",
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

      const studentId = String(req.params.studentId || "").trim().toLowerCase();
      const [session, events] = await Promise.all([
        ExamSession.findOne({ examId: exam._id, studentId }).lean(),
        ProctoringEvent.find({ examId: exam._id, studentId }).sort({ createdAt: 1 }).lean(),
      ]);

      res.json({
        exam: {
          id: exam._id.toString(),
          title: exam.title,
        },
        student: {
          studentId,
          studentName: session?.studentName || events[0]?.studentName || studentId,
          onlineStatus: session?.onlineStatus || "OFFLINE",
          status: session?.status || "NOT_STARTED",
        },
        finalSuspicionScore: session?.suspicionScore || events.at(-1)?.suspicionScore || 0,
        timelineEvents: events.map((event) => ({
          id: event._id.toString(),
          eventType: event.eventType,
          timestamp: event.createdAt,
          alertMessage: event.alertMessage || "",
          suspicionScore: event.suspicionScore || 0,
          severity: event.severity || "low",
          previewUrl: event.previewUrl || "",
          previewBase64: event.previewBase64 || "",
        })),
      });
    } catch (error) {
      next(error);
    }
  }
);

teacherRouter.get(
  "/exams/:examId/integrity-report",
  requireAuth,
  requireRole("TEACHER"),
  async (req, res, next) => {
    try {
      const exam = await findTeacherExam(req.user.identifier, req.params.examId);
      res.json(await buildIntegrityReport(exam));
    } catch (error) {
      next(error);
    }
  }
);

teacherRouter.put(
  "/exams/:examId/students/:studentId/integrity-review",
  requireAuth,
  requireRole("TEACHER"),
  async (req, res, next) => {
    try {
      const exam = await findTeacherExam(req.user.identifier, req.params.examId);
      const studentId = String(req.params.studentId || "").trim().toLowerCase();
      const decision = String(req.body?.decision || "PENDING").trim().toUpperCase();
      const allowedDecisions = ["PENDING", "CLEAN", "REVIEW_NEEDED", "DISQUALIFIED"];

      if (!allowedDecisions.includes(decision)) {
        const error = new Error("Invalid integrity decision.");
        error.status = 400;
        throw error;
      }

      const review = await IntegrityReview.findOneAndUpdate(
        { examId: exam._id, studentId },
        {
          $set: {
            decision,
            notes: String(req.body?.notes || "").trim(),
            reviewedBy: req.user.identifier,
            reviewedAt: new Date(),
          },
        },
        { new: true, upsert: true }
      ).lean();

      res.json({ review: serializeReview(review) });
    } catch (error) {
      next(error);
    }
  }
);

teacherRouter.get(
  "/exams/:examId/overview",
  requireAuth,
  requireRole("TEACHER"),
  async (req, res, next) => {
    try {
      const exam = await findTeacherExam(req.user.identifier, req.params.examId);
      const examObjectId = exam._id;
      const sessions = await ExamSession.find({ examId: examObjectId }).lean();
      const sessionStudentIds = sessions
        .map((session) => session.studentId)
        .filter(Boolean);

      const [examSubmissions, legacySubmissions] = await Promise.all([
        Submission.find({ examId: examObjectId }).sort({ submittedAt: -1 }).lean(),
        Submission.find({
          studentId: { $in: sessionStudentIds },
          $or: [{ examId: null }, { examId: { $exists: false } }],
        })
          .sort({ submittedAt: -1 })
          .lean(),
      ]);

      const submissions = [...examSubmissions];
      const linkedStudentIds = new Set(examSubmissions.map((item) => item.studentId));
      for (const submission of legacySubmissions) {
        if (!linkedStudentIds.has(submission.studentId)) {
          await Submission.updateOne(
            { _id: submission._id },
            { $set: { examId: examObjectId } }
          );
          submission.examId = examObjectId;
          submissions.push(submission);
          linkedStudentIds.add(submission.studentId);
        }
      }

      const assignedStudents = new Set(
        (exam.assignedStudents || []).map((studentId) => studentId.toLowerCase())
      );
      for (const session of sessions) {
        if (session.studentId) assignedStudents.add(session.studentId);
      }
      for (const submission of submissions) {
        if (submission.studentId) assignedStudents.add(submission.studentId);
      }

      const submissionMap = new Map(
        submissions.map((submission) => [submission.studentId, submission])
      );
      const sessionMap = new Map(
        sessions.map((session) => [session.studentId, session])
      );

      const students = [...assignedStudents].map((studentId) => {
        const session = sessionMap.get(studentId);
        const submission = submissionMap.get(studentId);
        const attended =
          session?.status === "IN_PROGRESS" ||
          session?.status === "SUBMITTED" ||
          session?.status === "LOCKED";
        return {
          studentId,
          studentName: session?.studentName || studentId,
          sessionStatus: session?.status || "NOT_STARTED",
          onlineStatus: session?.onlineStatus || "OFFLINE",
          attended,
          submitted: Boolean(submission),
          grade: submission?.grade ?? null,
          feedback: submission?.feedback || "",
          gradedAt: submission?.gradedAt || null,
          submittedAt: submission?.submittedAt || null,
          totalWarnings: submission?.totalWarnings ?? session?.suspicionScore ?? 0,
          riskLevel: submission?.riskLevel || "Low Risk",
        };
      });

      const attendedCount = students.filter((student) => student.attended).length;
      const submittedCount = students.filter((student) => student.submitted).length;
      const gradedCount = students.filter((student) => student.grade != null).length;

      res.json({
        exam: {
          id: exam._id.toString(),
          title: exam.title,
          accessCode: exam.accessCode,
          status: exam.status,
        },
        summary: {
          totalAssigned: students.length,
          attended: attendedCount,
          submitted: submittedCount,
          graded: gradedCount,
        },
        students,
      });
    } catch (error) {
      next(error);
    }
  }
);

teacherRouter.get(
  "/exams/:examId/submissions",
  requireAuth,
  requireRole("TEACHER"),
  async (req, res, next) => {
    try {
      const exam = await findTeacherExam(req.user.identifier, req.params.examId);
      const examObjectId = exam._id;
      const sessions = await ExamSession.find({ examId: examObjectId }).lean();
      const sessionStudentIds = sessions
        .map((session) => session.studentId)
        .filter(Boolean);

      const [examSubmissions, legacySubmissions] = await Promise.all([
        Submission.find({ examId: examObjectId }).sort({ submittedAt: -1 }).lean(),
        Submission.find({
          studentId: { $in: sessionStudentIds },
          $or: [{ examId: null }, { examId: { $exists: false } }],
        })
          .sort({ submittedAt: -1 })
          .lean(),
      ]);

      const submissionByStudent = new Map();
      for (const submission of examSubmissions) {
        submissionByStudent.set(submission.studentId, submission);
      }
      for (const submission of legacySubmissions) {
        if (!submissionByStudent.has(submission.studentId)) {
          submissionByStudent.set(submission.studentId, submission);
        }
      }

      res.json({
        submissions: [...submissionByStudent.values()].map((submission) =>
          serializeSubmission(submission, exam)
        ),
      });
    } catch (error) {
      next(error);
    }
  }
);

teacherRouter.put(
  "/exams/:examId/students/:studentId/grade",
  requireAuth,
  requireRole("TEACHER"),
  async (req, res, next) => {
    try {
      const exam = await findTeacherExam(req.user.identifier, req.params.examId);
      const studentId = String(req.params.studentId || "").trim().toLowerCase();
      const grade = Number(req.body?.grade);
      const feedback = String(req.body?.feedback || "").trim();

      if (!Number.isFinite(grade)) {
        const error = new Error("A valid numeric grade is required.");
        error.status = 400;
        throw error;
      }

      const gradeUpdate = {
        grade,
        feedback,
        gradedAt: new Date(),
        examId: exam._id,
      };

      let submission = await Submission.findOneAndUpdate(
        { examId: exam._id, studentId },
        { $set: gradeUpdate },
        { new: true, sort: { submittedAt: -1 } }
      ).lean();

      if (!submission) {
        submission = await Submission.findOneAndUpdate(
          {
            studentId,
            $or: [{ examId: null }, { examId: { $exists: false } }],
          },
          { $set: gradeUpdate },
          { new: true, sort: { submittedAt: -1 } }
        ).lean();
      }

      if (!submission) {
        const error = new Error("No submission found for this student and exam.");
        error.status = 404;
        throw error;
      }

      await notifyGradeAssigned(studentId, exam, grade, feedback);

      const latestNotification = await StudentNotification.findOne({
        studentId,
        examId: exam._id,
        type: "GRADE_ASSIGNED",
      })
        .sort({ createdAt: -1 })
        .lean();

      res.json({
        submission: serializeSubmission(submission, exam),
        notification: latestNotification
          ? serializeNotification(latestNotification)
          : null,
      });
    } catch (error) {
      next(error);
    }
  }
);

teacherRouter.post(
  "/exams/:examId/live-proctoring/test-event",
  requireAuth,
  requireRole("TEACHER"),
  async (req, res, next) => {
    try {
      if (!isTestToolsEnabled()) {
        const error = new Error("Live proctoring test tools are disabled.");
        error.status = 403;
        throw error;
      }

      const exam = await Exam.findOne({
        _id: req.params.examId,
        createdBy: req.user.identifier,
      });

      if (!exam) {
        const error = new Error("Exam not found or not owned by this teacher.");
        error.status = 404;
        throw error;
      }

      const result = await handleTeacherProctoringTestEvent(
        req.app.get("io"),
        req.user,
        exam,
        req.body?.eventName,
        req.body
      );

      res.json({
        ok: true,
        student: result.student,
      });
    } catch (error) {
      next(error);
    }
  }
);

function isTestToolsEnabled() {
  return process.env.ENABLE_PROCTORING_TEST_TOOLS === "true" || process.env.NODE_ENV !== "production";
}

async function findTeacherExam(teacherId, examId) {
  const exam = await Exam.findOne({ _id: examId, createdBy: teacherId }).lean();
  if (!exam) {
    const error = new Error("Exam not found or not owned by this teacher.");
    error.status = 404;
    throw error;
  }
  return exam;
}

async function buildIntegrityReport(exam) {
  const [sessions, events, reviews] = await Promise.all([
    ExamSession.find({ examId: exam._id }).sort({ suspicionScore: -1, updatedAt: -1 }).lean(),
    ProctoringEvent.find({ examId: exam._id }).sort({ createdAt: 1 }).lean(),
    IntegrityReview.find({ examId: exam._id }).lean(),
  ]);

  const eventMap = groupByStudent(events);
  const reviewMap = new Map(reviews.map((review) => [review.studentId, serializeReview(review)]));
  const assignedStudents = new Set((exam.assignedStudents || []).map((student) => student.toLowerCase()));
  for (const session of sessions) assignedStudents.add(session.studentId);
  for (const event of events) assignedStudents.add(event.studentId);

  const students = [...assignedStudents].filter(Boolean).map((studentId) => {
    const session = sessions.find((item) => item.studentId === studentId);
    const studentEvents = eventMap.get(studentId) || [];
    const breakdown = buildBreakdown(session, studentEvents);
    const finalRiskScore = calculateFinalRiskScore(session, studentEvents, breakdown);
    return {
      studentId,
      studentName: session?.studentName || studentEvents[0]?.studentName || studentId,
      status: session?.status || "NOT_STARTED",
      onlineStatus: session?.onlineStatus || "OFFLINE",
      finalRiskScore,
      riskLevel: riskLevel(finalRiskScore),
      recommendation: recommendation(finalRiskScore, breakdown),
      latestAlert: session?.latestAlert || studentEvents.at(-1)?.alertMessage || "",
      lastUpdatedAt: session?.updatedAt || studentEvents.at(-1)?.createdAt || null,
      breakdown,
      review: reviewMap.get(studentId) || {
        decision: "PENDING",
        notes: "",
        reviewedBy: "",
        reviewedAt: null,
      },
    };
  });

  students.sort((first, second) => second.finalRiskScore - first.finalRiskScore);

  return {
    exam: {
      id: exam._id.toString(),
      title: exam.title,
      durationMinutes: exam.durationMinutes,
      accessCode: exam.accessCode,
    },
    summary: buildSummary(students),
    students,
    generatedAt: new Date(),
  };
}

function groupByStudent(events) {
  const map = new Map();
  for (const event of events) {
    const items = map.get(event.studentId) || [];
    items.push(event);
    map.set(event.studentId, items);
  }
  return map;
}

function buildBreakdown(session, events) {
  const highSeverityEvents = events.filter((event) => event.severity === "high");
  const suspiciousEvents = events.filter((event) => event.severity === "medium" || event.severity === "high");
  const previewEvents = events.filter((event) => event.eventType === "camera_preview_updated");
  const appSwitchCount = events.filter((event) =>
    String(event.alertMessage || "").toLowerCase().includes("switched away")
  ).length;
  const faceMissingCount = events.filter((event) =>
    String(event.alertMessage || "").toLowerCase().includes("face not detected")
  ).length;
  const leftEvents = events.filter((event) => event.eventType === "student_left_exam").length;

  return {
    faceMissingCount,
    appSwitchCount,
    suspiciousAlertCount: suspiciousEvents.length,
    highSeverityCount: highSeverityEvents.length,
    previewEventCount: previewEvents.length,
    offlineEventCount: leftEvents,
    wasLocked: session?.status === "LOCKED",
  };
}

function calculateFinalRiskScore(session, events, breakdown) {
  const eventMax = Math.max(0, ...events.map((event) => Number(event.suspicionScore || 0)));
  const base = Math.max(Number(session?.suspicionScore || 0), eventMax);
  const additions =
    breakdown.highSeverityCount * 8 +
    breakdown.appSwitchCount * 10 +
    breakdown.faceMissingCount * 6 +
    breakdown.offlineEventCount * 5 +
    (breakdown.wasLocked ? 25 : 0);
  return Math.max(0, Math.min(100, base + additions));
}

function riskLevel(score) {
  if (score >= 70) return "SUSPICIOUS";
  if (score >= 40) return "WARNING";
  return "SAFE";
}

function recommendation(score, breakdown) {
  if (score >= 80 || breakdown.wasLocked) return "DISQUALIFY_RECOMMENDED";
  if (score >= 40 || breakdown.highSeverityCount > 0) return "REVIEW_RECOMMENDED";
  return "CLEAN_RECOMMENDED";
}

function buildSummary(students) {
  return {
    totalStudents: students.length,
    safeStudents: students.filter((student) => student.riskLevel === "SAFE").length,
    warningStudents: students.filter((student) => student.riskLevel === "WARNING").length,
    suspiciousStudents: students.filter((student) => student.riskLevel === "SUSPICIOUS").length,
    highestRiskMoments: students
      .filter((student) => student.latestAlert)
      .slice(0, 5)
      .map((student) => ({
        studentId: student.studentId,
        studentName: student.studentName,
        score: student.finalRiskScore,
        alert: student.latestAlert,
      })),
  };
}

function serializeReview(review) {
  return {
    decision: review.decision || "PENDING",
    notes: review.notes || "",
    reviewedBy: review.reviewedBy || "",
    reviewedAt: review.reviewedAt || null,
  };
}

function serializeSubmission(submission, exam) {
  return {
    id: submission._id?.toString(),
    examId: exam._id.toString(),
    studentId: submission.studentId,
    answers: submission.answers || [],
    appSwitchWarnings: submission.appSwitchWarnings || 0,
    faceMissingWarnings: submission.faceMissingWarnings || 0,
    audioWarnings: submission.audioWarnings || 0,
    phoneWarnings: submission.phoneWarnings || 0,
    totalWarnings: submission.totalWarnings || 0,
    riskLevel: submission.riskLevel || "Low Risk",
    submittedAt: submission.submittedAt,
    grade: submission.grade ?? null,
    feedback: submission.feedback || "",
    gradedAt: submission.gradedAt || null,
  };
}
