import mongoose from "mongoose";
import { Exam } from "../models/Exam.js";
import { ExamSession } from "../models/ExamSession.js";
import { IntegrityReview } from "../models/IntegrityReview.js";
import { ProctoringEvent } from "../models/ProctoringEvent.js";
import { StudentNotification } from "../models/StudentNotification.js";
import { Submission } from "../models/Submission.js";
import { TeacherClass } from "../models/TeacherClass.js";
import { TeacherCommunity } from "../models/TeacherCommunity.js";
import { User } from "../models/User.js";
import { deleteFrameKeys } from "./s3.js";

export async function deleteStudentAccount(user) {
  const studentId = String(user.identifier || "").trim().toLowerCase();
  const evidence = await ProctoringEvent.find({ studentId })
    .select("previewUrl evidenceReference")
    .lean();
  const sessions = await ExamSession.find({ studentId }).select("previewUrl").lean();
  const objectKeys = [...evidence, ...sessions]
    .flatMap((item) => [item.previewUrl, item.evidenceReference])
    .filter(isObjectStorageKey);

  // External evidence is removed first. If this fails, no database data is
  // deleted and the authenticated user can safely retry the request.
  await deleteFrameKeys(objectKeys);

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      await Promise.all([
        ProctoringEvent.deleteMany({ studentId }).session(session),
        ExamSession.deleteMany({ studentId }).session(session),
        Submission.deleteMany({ studentId }).session(session),
        IntegrityReview.deleteMany({ studentId }).session(session),
        StudentNotification.deleteMany({ studentId }).session(session),
        Exam.updateMany(
          {},
          { $pull: { assignedStudents: studentId, communityStudents: studentId } },
          { session }
        ),
        TeacherCommunity.updateMany({}, { $pull: { students: studentId } }, { session }),
        TeacherClass.updateMany(
          {},
          { $pull: { students: studentId, enrollmentRequests: { studentId } } },
          { session }
        ),
      ]);
      const result = await User.deleteOne({ _id: user._id, role: "STUDENT" }).session(session);
      if (result.deletedCount !== 1) {
        const error = new Error("Account no longer exists.");
        error.status = 404;
        error.code = "ACCOUNT_NOT_FOUND";
        throw error;
      }
    });
  } finally {
    await session.endSession();
  }
}

function isObjectStorageKey(value) {
  const candidate = String(value || "").trim();
  return Boolean(candidate) && !candidate.startsWith("data:") && !/^https?:\/\//i.test(candidate);
}
