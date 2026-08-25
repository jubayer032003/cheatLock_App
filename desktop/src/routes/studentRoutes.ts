import type { RouteAuthState, StudentExamRouteParams } from "../types/examDomain";

export const LOGIN_ROUTE = "/login";
export const TEACHER_HOME_ROUTE = "/teacher";
export const STUDENT_HOME_ROUTE = "/student/home";
export const STUDENT_HISTORY_ROUTE = "/student/history";
export const STUDENT_PROFILE_ROUTE = "/student/profile";
export const STUDENT_SUPPORT_ROUTE = "/student/support";

export const LEGACY_STUDENT_HOME_ROUTE = "/dashboard";
export const LEGACY_STUDENT_VERIFICATION_ROUTE = "/face-verification";
export const LEGACY_STUDENT_SESSION_ROUTE = "/exam";

const TEACHER_DASHBOARD_ROLES = new Set([
  "SUPER_ADMIN",
  "INSTITUTION_ADMIN",
  "DEPARTMENT_ADMIN",
  "TEACHER",
  "PROCTOR",
  "AUDITOR",
]);

export function isTeacherDashboardRole(role?: string | null) {
  return Boolean(role && TEACHER_DASHBOARD_ROLES.has(role));
}

export function studentExamRoute(examId: string) {
  return `/student/exams/${encodeURIComponent(examId)}`;
}

export function studentExamReadinessRoute(examId: string) {
  return `${studentExamRoute(examId)}/readiness`;
}

export function studentExamVerificationRoute(examId: string) {
  return `${studentExamRoute(examId)}/verification`;
}

export function studentExamRulesRoute(examId: string) {
  return `${studentExamRoute(examId)}/rules`;
}

export function studentExamSessionRoute(examId: string) {
  return `${studentExamRoute(examId)}/session`;
}

export function studentExamSubmittedRoute(examId: string) {
  return `${studentExamRoute(examId)}/submitted`;
}

export function getDefaultRouteForRole(role?: string | null) {
  return isTeacherDashboardRole(role) ? TEACHER_HOME_ROUTE : STUDENT_HOME_ROUTE;
}

export function isValidExamIdParam(examId?: string | null): examId is string {
  return Boolean(examId && /^[a-f0-9]{24}$/i.test(examId));
}

export function parseStudentExamRouteParams(params: Partial<StudentExamRouteParams>) {
  return isValidExamIdParam(params.examId) ? { ok: true as const, examId: params.examId } : { ok: false as const };
}

export type RouteAccessDecision =
  | { type: "allow" }
  | { type: "loading" }
  | { type: "redirect"; to: string };

export function resolveAuthenticatedRouteAccess(auth: RouteAuthState): RouteAccessDecision {
  if (auth.status === "loading") return { type: "loading" };
  if (auth.status === "anonymous") return { type: "redirect", to: LOGIN_ROUTE };
  return { type: "allow" };
}

export function resolveStudentRouteAccess(auth: RouteAuthState): RouteAccessDecision {
  const authenticated = resolveAuthenticatedRouteAccess(auth);
  if (authenticated.type !== "allow") return authenticated;
  if (auth.status !== "authenticated") return { type: "redirect", to: LOGIN_ROUTE };
  return auth.role === "STUDENT" ? { type: "allow" } : { type: "redirect", to: TEACHER_HOME_ROUTE };
}

export function resolveTeacherRouteAccess(auth: RouteAuthState): RouteAccessDecision {
  const authenticated = resolveAuthenticatedRouteAccess(auth);
  if (authenticated.type !== "allow") return authenticated;
  if (auth.status !== "authenticated") return { type: "redirect", to: LOGIN_ROUTE };
  return isTeacherDashboardRole(auth.role) ? { type: "allow" } : { type: "redirect", to: STUDENT_HOME_ROUTE };
}

export function resolveStudentExamRouteAccess(
  auth: RouteAuthState,
  params: Partial<StudentExamRouteParams>
): RouteAccessDecision {
  const studentAccess = resolveStudentRouteAccess(auth);
  if (studentAccess.type !== "allow") return studentAccess;
  const parsed = parseStudentExamRouteParams(params);
  return parsed.ok ? { type: "allow" } : { type: "redirect", to: STUDENT_HOME_ROUTE };
}

export function resolveStudentSessionRouteAccess(
  auth: RouteAuthState,
  params: Partial<StudentExamRouteParams>
): RouteAccessDecision {
  const examAccess = resolveStudentExamRouteAccess(auth, params);
  if (examAccess.type !== "allow") return examAccess;

  const examId = params.examId!;
  return auth.status === "authenticated" && auth.activeExamId === examId
    ? { type: "allow" }
    : { type: "redirect", to: studentExamReadinessRoute(examId) };
}

export function resolveStudentConsentRouteAccess(
  auth: RouteAuthState,
  params: Partial<StudentExamRouteParams>,
  hasConsent: (scope: { studentId: string; examId: string }) => boolean
): RouteAccessDecision {
  const examAccess = resolveStudentExamRouteAccess(auth, params);
  if (examAccess.type !== "allow") return examAccess;
  if (auth.status !== "authenticated" || !auth.studentId) return { type: "redirect", to: LOGIN_ROUTE };

  const examId = params.examId!;
  return hasConsent({ studentId: auth.studentId, examId })
    ? { type: "allow" }
    : { type: "redirect", to: studentExamReadinessRoute(examId) };
}
