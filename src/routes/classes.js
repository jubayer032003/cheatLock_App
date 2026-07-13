import express from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { TeacherClass } from "../models/TeacherClass.js";
import { User } from "../models/User.js";

export const classesRouter = express.Router();

classesRouter.get("/", requireAuth, requireRole("TEACHER"), async (req, res, next) => {
  try {
    const classes = await TeacherClass.find({ teacherId: req.user.identifier })
      .sort({ updatedAt: -1 })
      .lean();
    res.json({ classes: classes.map(serializeClass) });
  } catch (error) {
    next(error);
  }
});

classesRouter.post("/", requireAuth, requireRole("TEACHER"), async (req, res, next) => {
  try {
    const payload = normalizeClassPayload(req.body);
    if (!payload.name) {
      const error = new Error("Class name is required.");
      error.status = 400;
      throw error;
    }

    const classRecord = await TeacherClass.create({
      ...payload,
      teacherId: req.user.identifier,
      inviteCode: await createUniqueInviteCode(),
    });
    res.status(201).json({ class: serializeClass(classRecord) });
  } catch (error) {
    if (error.code === 11000) {
      error.status = 409;
      error.message = "A class with this name and section already exists.";
    }
    next(error);
  }
});

classesRouter.put("/:classId", requireAuth, requireRole("TEACHER"), async (req, res, next) => {
  try {
    const payload = normalizeClassPayload(req.body);
    if (!payload.name) {
      const error = new Error("Class name is required.");
      error.status = 400;
      throw error;
    }

    const classRecord = await TeacherClass.findOneAndUpdate(
      { _id: req.params.classId, teacherId: req.user.identifier },
      { $set: payload },
      { new: true }
    );
    if (!classRecord) {
      const error = new Error("Class not found or not owned by this teacher.");
      error.status = 404;
      throw error;
    }

    res.json({ class: serializeClass(classRecord) });
  } catch (error) {
    if (error.code === 11000) {
      error.status = 409;
      error.message = "A class with this name and section already exists.";
    }
    next(error);
  }
});

classesRouter.delete("/:classId", requireAuth, requireRole("TEACHER"), async (req, res, next) => {
  try {
    const result = await TeacherClass.findOneAndDelete({
      _id: req.params.classId,
      teacherId: req.user.identifier,
    });
    if (!result) {
      const error = new Error("Class not found or not owned by this teacher.");
      error.status = 404;
      throw error;
    }
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

classesRouter.post("/join", requireAuth, requireRole("STUDENT"), async (req, res, next) => {
  try {
    const inviteCode = String(req.body?.inviteCode || "").trim().toUpperCase();
    if (!inviteCode) {
      const error = new Error("Class invite code is required.");
      error.status = 400;
      throw error;
    }

    const classRecord = await TeacherClass.findOne({ inviteCode });
    if (!classRecord) {
      const error = new Error("Invalid class invite code.");
      error.status = 404;
      throw error;
    }

    if (classRecord.students.includes(req.user.identifier)) {
      res.json({ class: serializeClass(classRecord), status: "APPROVED" });
      return;
    }

    const existingRequest = classRecord.enrollmentRequests.find(
      (request) => request.studentId === req.user.identifier && request.status === "PENDING"
    );
    if (!existingRequest) {
      const user = await User.findOne({ identifier: req.user.identifier, role: "STUDENT" }).lean();
      classRecord.enrollmentRequests.push({
        studentId: req.user.identifier,
        studentName: user?.name || req.user.identifier,
        status: "PENDING",
        requestedAt: new Date(),
      });
      await classRecord.save();
    }

    res.status(202).json({ class: serializeClass(classRecord), status: "PENDING" });
  } catch (error) {
    next(error);
  }
});

classesRouter.post("/:classId/enrollment/:studentId", requireAuth, requireRole("TEACHER"), async (req, res, next) => {
  try {
    const decision = String(req.body?.decision || "").trim().toUpperCase();
    if (!["APPROVED", "REJECTED"].includes(decision)) {
      const error = new Error("Enrollment decision must be APPROVED or REJECTED.");
      error.status = 400;
      throw error;
    }

    const studentId = String(req.params.studentId || "").trim().toLowerCase();
    const classRecord = await TeacherClass.findOne({
      _id: req.params.classId,
      teacherId: req.user.identifier,
    });
    if (!classRecord) {
      const error = new Error("Class not found or not owned by this teacher.");
      error.status = 404;
      throw error;
    }

    const request = classRecord.enrollmentRequests.find(
      (item) => item.studentId === studentId && item.status === "PENDING"
    );
    if (!request) {
      const error = new Error("Pending enrollment request not found.");
      error.status = 404;
      throw error;
    }

    request.status = decision;
    request.decidedAt = new Date();
    if (decision === "APPROVED" && !classRecord.students.includes(studentId)) {
      classRecord.students.push(studentId);
    }
    await classRecord.save();

    res.json({ class: serializeClass(classRecord) });
  } catch (error) {
    next(error);
  }
});

function normalizeClassPayload(body) {
  return {
    name: String(body?.name || "").trim(),
    section: String(body?.section || "").trim(),
    subject: String(body?.subject || "").trim(),
    students: normalizeStudentIds(body?.students || []),
  };
}

function normalizeStudentIds(students) {
  return [...new Set(
    students
      .map((student) => String(student).trim().toLowerCase())
      .filter(Boolean)
  )];
}

export function serializeClass(classRecord) {
  const raw = typeof classRecord.toObject === "function" ? classRecord.toObject() : classRecord;
  return {
    id: raw._id?.toString?.() || raw.id,
    teacherId: raw.teacherId,
    name: raw.name,
    section: raw.section || "",
    subject: raw.subject || "",
    students: raw.students || [],
    inviteCode: raw.inviteCode || "",
    enrollmentRequests: (raw.enrollmentRequests || []).map((request) => ({
      studentId: request.studentId,
      studentName: request.studentName || request.studentId,
      status: request.status || "PENDING",
      requestedAt: request.requestedAt || null,
      decidedAt: request.decidedAt || null,
    })),
    createdAt: raw.createdAt || null,
    updatedAt: raw.updatedAt || null,
  };
}

async function createUniqueInviteCode() {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = `CL-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    const exists = await TeacherClass.exists({ inviteCode: code });
    if (!exists) return code;
  }

  return `CL-${Date.now().toString(36).toUpperCase()}`;
}
