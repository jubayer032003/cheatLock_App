import { findAdmittedStudentExam } from "./examAdmission.js";
import { ExamSession } from "../models/ExamSession.js";

export async function admitSubmission(user, examId, body = {}, allowSubmitted = false) {
  const exam = await findAdmittedStudentExam(user, examId);
  const session = await ExamSession.findOne({ studentId: user.identifier, examId: exam._id }).lean();
  const allowed = session?.status === "IN_PROGRESS" || (allowSubmitted && session?.status === "SUBMITTED");
  if (!allowed || !Number.isFinite(session.startedAt) || session.startedAt <= 0) {
    throw submissionError("The exam attempt is not active.", 409, "SESSION_NOT_ACTIVE");
  }
  // Legacy clients may omit these; new Android requests bind both values.
  if (body.attemptStartedAt != null && Number(body.attemptStartedAt) !== session.startedAt) {
    throw submissionError("The exam attempt changed. Reload the exam.", 409, "STALE_EXAM_ATTEMPT");
  }
  if (body.deviceId != null && (!String(body.deviceId).trim() ||
      (session.deviceId && session.deviceId !== String(body.deviceId).trim()))) {
    throw submissionError("This attempt belongs to another device.", 409, "DEVICE_MISMATCH");
  }
  return { exam, session };
}

export function submissionWarningCounts(body = {}) {
  const result = {};
  for (const name of ["appSwitchWarnings", "faceMissingWarnings", "audioWarnings", "phoneWarnings"]) {
    const value = Number(body[name] ?? 0);
    if (!Number.isSafeInteger(value) || value < 0) throw submissionError("Invalid warning count.", 400, "INVALID_WARNING_COUNT");
    result[name] = value;
  }
  result.totalWarnings = Object.values(result).reduce((sum, value) => sum + value, 0);
  if (!Number.isSafeInteger(result.totalWarnings)) throw submissionError("Invalid warning count.", 400, "INVALID_WARNING_COUNT");
  return result;
}

export function submissionAnswers(answers, exam) {
  if (!Array.isArray(answers)) throw submissionError("Invalid answer data.", 400, "INVALID_ANSWERS");
  const seen = new Set();
  return answers.map((answer) => {
    const index = answer?.questionIndex;
    if (!Number.isInteger(index) || index < 0 || index >= exam.questions.length || seen.has(index) ||
        typeof answer.answerText !== "string" || answer.answerText.length > 20000) {
      throw submissionError("Invalid answer data.", 400, "INVALID_ANSWERS");
    }
    seen.add(index);
    return { questionIndex: index, questionText: exam.questions[index].text, answerText: answer.answerText };
  });
}

function submissionError(message, status, code) { return Object.assign(new Error(message), { status, code }); }