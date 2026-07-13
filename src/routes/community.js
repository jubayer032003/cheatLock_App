import express from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { TeacherCommunity } from "../models/TeacherCommunity.js";

export const communityRouter = express.Router();

communityRouter.get("/", requireAuth, requireRole("TEACHER"), async (req, res, next) => {
  try {
    const community = await getOrCreateCommunity(req.user.identifier);
    res.json({ community: serializeCommunity(community) });
  } catch (error) {
    next(error);
  }
});

communityRouter.put("/", requireAuth, requireRole("TEACHER"), async (req, res, next) => {
  try {
    const students = normalizeStudentIds(req.body.students || []);
    const community = await TeacherCommunity.findOneAndUpdate(
      { teacherId: req.user.identifier },
      { teacherId: req.user.identifier, students },
      { new: true, upsert: true }
    );

    res.json({ community: serializeCommunity(community) });
  } catch (error) {
    next(error);
  }
});

async function getOrCreateCommunity(teacherId) {
  return TeacherCommunity.findOneAndUpdate(
    { teacherId },
    { $setOnInsert: { teacherId, students: [] } },
    { new: true, upsert: true }
  );
}

function serializeCommunity(community) {
  return {
    teacherId: community.teacherId,
    students: community.students,
  };
}

function normalizeStudentIds(students) {
  return students
    .map((student) => String(student).trim().toLowerCase())
    .filter(Boolean);
}
