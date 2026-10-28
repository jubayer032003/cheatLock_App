import mongoose from "mongoose";
import { Exam } from "../models/Exam.js";

export function assertStudentAdmission(user, exam, studentId = user?.identifier) {
  if (user?.role !== "STUDENT" || studentId !== user.identifier) {
    throw admissionError("Student identity does not match this request.", 403, "STUDENT_IDENTITY_MISMATCH");
  }
  // Match authenticated identifiers exactly. Removing punctuation can alias two accounts.
  if (!exam || !exam.assignedStudents?.includes(user.identifier)) {
    throw admissionError("Student is not assigned to this exam.", 403, "EXAM_ADMISSION_DENIED");
  }
  return exam;
}

export async function findAdmittedStudentExam(user, rawExamId) {
  if (user?.role !== "STUDENT") {
    throw admissionError("Only students can access student sessions.", 403, "STUDENT_ROLE_REQUIRED");
  }
  const examId = rawExamId == null ? "" : String(rawExamId).trim();
  if (examId && !mongoose.isObjectIdOrHexString(examId)) {
    throw admissionError("Invalid examId.", 400, "INVALID_EXAM_ID");
  }
  const exam = examId
    ? await Exam.findById(examId)
    : await Exam.findOne({ assignedStudents: user.identifier }).sort({ createdAt: -1 });
  return assertStudentAdmission(user, exam);
}

function admissionError(message, status, code) {
  return Object.assign(new Error(message), { status, code });
}
