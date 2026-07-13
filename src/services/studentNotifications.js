import { StudentNotification } from "../models/StudentNotification.js";

const ALLOWED_TYPES = new Set([
  "EXAM_CREATED",
  "EXAM_LIVE",
  "EXAM_ASSIGNED",
  "GRADE_ASSIGNED",
]);

export async function notifyStudents(studentIds, examId, type, payload) {
  if (!ALLOWED_TYPES.has(type)) {
    throw new Error(`Unsupported notification type: ${type}`);
  }

  const normalizedIds = uniqueStudentIds(studentIds);
  if (normalizedIds.length === 0) return [];

  const docs = normalizedIds.map((studentId) => ({
    studentId,
    examId,
    type,
    payload: {
      ...payload,
      message: String(payload?.message || "").trim(),
    },
    notified: false,
  }));

  return StudentNotification.insertMany(docs, { ordered: false });
}

export async function notifyExamCreated(exam) {
  return notifyStudents(exam.assignedStudents || [], exam._id, "EXAM_CREATED", {
    title: exam.title,
    accessCode: exam.accessCode,
    message: `New exam "${exam.title}" was created. Join with code ${exam.accessCode}.`,
  });
}

export async function notifyExamLive(exam) {
  return notifyStudents(exam.assignedStudents || [], exam._id, "EXAM_LIVE", {
    title: exam.title,
    accessCode: exam.accessCode,
    message: `Exam "${exam.title}" is now live. Open CheatLock to start.`,
  });
}

export async function notifyStudentsAssigned(exam, studentIds) {
  return notifyStudents(studentIds, exam._id, "EXAM_ASSIGNED", {
    title: exam.title,
    accessCode: exam.accessCode,
    message: `You were added to exam "${exam.title}". Code: ${exam.accessCode}.`,
  });
}

export async function notifyGradeAssigned(studentId, exam, grade, feedback) {
  const [notification] = await notifyStudents([studentId], exam._id, "GRADE_ASSIGNED", {
    title: exam.title,
    grade,
    feedback: String(feedback || ""),
    gradedAt: new Date(),
    message: `Your exam "${exam.title}" was graded: ${grade}.`,
  });
  return notification;
}

export function serializeNotification(notification) {
  return {
    id: notification._id.toString(),
    studentId: notification.studentId,
    examId: notification.examId.toString(),
    type: notification.type,
    payload: notification.payload || {},
    notified: Boolean(notification.notified),
    createdAt: notification.createdAt,
    updatedAt: notification.updatedAt,
  };
}

function uniqueStudentIds(studentIds) {
  return [...new Set((studentIds || []).map((id) => String(id || "").trim().toLowerCase()).filter(Boolean))];
}
