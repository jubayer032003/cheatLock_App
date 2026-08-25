import type { AuthUser } from "../types";

const TOKEN_KEY = "cheatlock.teacher.token";
const USER_KEY = "cheatlock.teacher.user";

export function saveAuth(token: string, user: AuthUser) {
  sessionStorage.setItem(TOKEN_KEY, token);
  sessionStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function getAuthToken() {
  return sessionStorage.getItem(TOKEN_KEY);
}

export function getAuthUser(): AuthUser | null {
  const rawUser = sessionStorage.getItem(USER_KEY);
  if (!rawUser) return null;

  try {
    return JSON.parse(rawUser) as AuthUser;
  } catch {
    clearAuth();
    return null;
  }
}

export function clearAuth() {
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(USER_KEY);
}

export const ROLE_PERMISSIONS: Record<string, string[]> = {
  SUPER_ADMIN: ["manage_tenants", "view_audit_logs", "manage_settings", "manage_users", "manage_exams"],
  INSTITUTION_ADMIN: ["view_audit_logs", "manage_settings", "manage_users", "manage_exams", "manage_courses"],
  DEPARTMENT_ADMIN: ["manage_users", "manage_exams", "manage_courses"],
  TEACHER: ["manage_exams", "manage_courses", "view_reports", "proctor_exams"],
  PROCTOR: ["proctor_exams", "view_reports"],
  STUDENT: ["take_exams"],
  OBSERVER: ["view_reports"],
  AUDITOR: ["view_audit_logs", "view_reports"]
};

export function hasPermission(role: string, permission: string): boolean {
  if (role === "SUPER_ADMIN") return true;
  return (ROLE_PERMISSIONS[role] || []).includes(permission);
}

export function isTeacherAuthenticated() {
  const user = getAuthUser();
  if (!user) return false;
  const allowedDashboardRoles = [
    "SUPER_ADMIN",
    "INSTITUTION_ADMIN",
    "DEPARTMENT_ADMIN",
    "TEACHER"
  ];
  return Boolean(getAuthToken() && allowedDashboardRoles.includes(user.role));
}
