import axios from "axios";
import { clearAuth, getAuthToken } from "./auth";
import type {
  ExamsResponse,
  ClassesResponse,
  CommunityResponse,
  Exam,
  ExamSession,
  ExamSubmission,
  IntegrityDecision,
  IntegrityReportResponse,
  ExamAttendanceOverview,
  LiveProctoringResponse,
  LoginResponse,
  ProctoringTestEventRequest,
  ProctoringTimelineResponse,
  SessionsResponse,
  SubmissionsResponse,
} from "../types";
import type { TeacherClass } from "../types";

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "https://cheatlock-backend.onrender.com";

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 60000,
});

api.interceptors.request.use((config) => {
  const token = getAuthToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      clearAuth();
    }
    return Promise.reject(error);
  }
);

export async function loginTeacher(identifier: string, password: string) {
  const { data } = await api.post<LoginResponse>("/auth/login", {
    identifier: identifier.trim(),
    password,
    role: "TEACHER",
  });
  return data;
}

export async function signupTeacher(name: string, identifier: string, password: string) {
  await api.post("/auth/signup", {
    name: name.trim(),
    identifier: identifier.trim(),
    password,
    role: "TEACHER",
  });
  return loginTeacher(identifier, password);
}

export async function fetchTeacherExams() {
  const { data } = await api.get<ExamsResponse>("/exams");
  return data.exams;
}

export async function fetchTeacherExam(examId: string) {
  const { data } = await api.get<{ exam: Exam }>(`/exams/${examId}`);
  return data.exam;
}

export async function createExam(exam: Exam) {
  const { data } = await api.post<{ exam: Exam }>("/exams", exam);
  return data.exam;
}

export async function deleteExam(examId: string) {
  await api.delete(`/exams/${examId}`);
}

export async function updateExamLifecycle(
  examId: string,
  request: {
    action: "DRAFT" | "SCHEDULE" | "START" | "END" | "ARCHIVE";
    scheduledStartAt?: string;
    scheduledEndAt?: string;
  }
) {
  const { data } = await api.patch<{ exam: Exam }>(`/exams/${examId}/lifecycle`, request);
  return data.exam;
}

export async function assignStudentsToExam(examId: string, studentIds: string[]) {
  const normalized = [...new Set(studentIds.map(normalizeStudentId).filter(Boolean))];
  const { data } = await api.patch<{ exam: Exam; addedStudents: string[] }>(
    `/exams/${examId}/assign-students`,
    { studentIds: normalized }
  );
  return data;
}

function normalizeStudentId(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, "");
}

export async function fetchCommunity() {
  const { data } = await api.get<CommunityResponse>("/community");
  return data.community;
}

export async function fetchClasses() {
  const { data } = await api.get<ClassesResponse>("/classes");
  return data.classes;
}

export async function createClass(payload: Pick<TeacherClass, "name" | "section" | "subject" | "students">) {
  const { data } = await api.post<{ class: TeacherClass }>("/classes", payload);
  return data.class;
}

export async function updateClass(
  classId: string,
  payload: Pick<TeacherClass, "name" | "section" | "subject" | "students">
) {
  const { data } = await api.put<{ class: TeacherClass }>(`/classes/${classId}`, payload);
  return data.class;
}

export async function deleteClass(classId: string) {
  await api.delete(`/classes/${classId}`);
}

export async function decideClassEnrollment(
  classId: string,
  studentId: string,
  decision: "APPROVED" | "REJECTED"
) {
  const { data } = await api.post<{ class: TeacherClass }>(
    `/classes/${classId}/enrollment/${encodeURIComponent(studentId)}`,
    { decision }
  );
  return data.class;
}

export async function updateCommunity(students: string[]) {
  const { data } = await api.put<CommunityResponse>("/community", { students });
  return data.community;
}

export async function fetchSessions() {
  const { data } = await api.get<SessionsResponse>("/sessions");
  return data.sessions;
}

export async function resetSession(studentId: string, examId?: string | null) {
  const { data } = await api.post<{ session: ExamSession }>(`/sessions/${studentId}/reset`, {
    examId,
  });
  return data.session;
}

export async function fetchSubmissions() {
  const { data } = await api.get<SubmissionsResponse>("/submissions");
  return data.submissions;
}

export async function fetchExamSubmissions(examId: string) {
  const { data } = await api.get<SubmissionsResponse>(`/teacher/exams/${examId}/submissions`);
  return data.submissions;
}

export async function fetchExamAttendanceOverview(examId: string) {
  const { data } = await api.get<ExamAttendanceOverview>(`/teacher/exams/${examId}/overview`);
  return data;
}

export async function gradeSubmission(
  examId: string,
  studentId: string,
  grade: number,
  feedback: string
) {
  const { data } = await api.put<{ submission: ExamSubmission }>(
    `/teacher/exams/${examId}/students/${encodeURIComponent(studentId)}/grade`,
    { grade, feedback }
  );
  return data.submission;
}

export async function clearSubmissions() {
  await api.delete("/submissions");
}

export async function fetchLiveProctoring(examId: string) {
  const { data } = await api.get<LiveProctoringResponse>(
    `/teacher/exams/${examId}/live-proctoring`
  );
  return data;
}

export async function sendProctoringTestEvent(examId: string, request: ProctoringTestEventRequest) {
  const { data } = await api.post<{ ok: boolean }>(
    `/teacher/exams/${examId}/live-proctoring/test-event`,
    request
  );
  return data;
}

export async function fetchProctoringTimeline(examId: string, studentId: string) {
  const { data } = await api.get<ProctoringTimelineResponse>(
    `/teacher/exams/${examId}/students/${encodeURIComponent(studentId)}/proctoring-timeline`
  );
  return data;
}

export async function fetchIntegrityReport(examId: string) {
  const { data } = await api.get<IntegrityReportResponse>(
    `/teacher/exams/${examId}/integrity-report`
  );
  return data;
}

export async function updateIntegrityReview(
  examId: string,
  studentId: string,
  decision: IntegrityDecision,
  notes: string,
  extra?: { bookmarks?: string[]; reviewedEvents?: string[] }
) {
  const { data } = await api.put(
    `/teacher/exams/${examId}/students/${encodeURIComponent(studentId)}/integrity-review`,
    { decision, notes, ...extra }
  );
  return data.review;
}

export async function fetchTenantSettings() {
  const { data } = await api.get("/tenants/my-tenant");
  return data.tenant;
}

export async function updateTenantSettings(payload: any) {
  const { data } = await api.put("/tenants/my-tenant", payload);
  return data.tenant;
}

export async function fetchTenantAuditLogs() {
  const { data } = await api.get("/tenants/my-tenant/audit-logs");
  return data.logs;
}

export async function fetchTenantUsers() {
  const { data } = await api.get("/tenants/my-tenant/users");
  return data.users;
}

export async function createTenantUser(payload: any) {
  const { data } = await api.post("/tenants/my-tenant/users", payload);
  return data.user;
}

export async function bulkImportTenantUsers(users: any[]) {
  const { data } = await api.post("/tenants/my-tenant/users/bulk-import", { users });
  return data;
}

export async function toggleUserSuspension(userId: string, status: string) {
  const { data } = await api.put(`/tenants/my-tenant/users/${userId}/status`, { status });
  return data;
}

export async function resetUserPassword(userId: string) {
  const { data } = await api.put(`/tenants/my-tenant/users/${userId}/reset-password`);
  return data;
}

export async function deleteTenantUser(userId: string) {
  const { data } = await api.delete(`/tenants/my-tenant/users/${userId}`);
  return data;
}

export async function downloadIntegrityReportPdf(examId: string) {
  const { data } = await api.get(`/teacher/exams/${examId}/integrity-report/pdf`, {
    responseType: "blob",
  });
  return data;
}
