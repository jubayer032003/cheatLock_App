import { describe, expect, it } from "vitest";
import {
  LOGIN_ROUTE,
  STUDENT_HOME_ROUTE,
  TEACHER_HOME_ROUTE,
  getDefaultRouteForRole,
  resolveAuthenticatedRouteAccess,
  resolveStudentConsentRouteAccess,
  resolveStudentExamRouteAccess,
  resolveStudentRouteAccess,
  resolveStudentSessionRouteAccess,
  resolveTeacherRouteAccess,
  studentExamReadinessRoute,
} from "./studentRoutes";
import type { RouteAuthState } from "../types";

const validExamId = "64f0c9b27d6f3f0a8b2c1234";
const studentAuth: RouteAuthState = {
  status: "authenticated",
  role: "STUDENT",
  studentId: "stu-001",
  activeExamId: validExamId,
};
const teacherAuth: RouteAuthState = {
  status: "authenticated",
  role: "TEACHER",
  activeExamId: null,
};

describe("student route decisions", () => {
  it("redirects unauthenticated users to login", () => {
    expect(resolveAuthenticatedRouteAccess({ status: "anonymous" })).toEqual({
      type: "redirect",
      to: LOGIN_ROUTE,
    });
  });

  it("uses the new student home as the student login redirect destination", () => {
    expect(getDefaultRouteForRole("STUDENT")).toBe(STUDENT_HOME_ROUTE);
  });

  it("prevents teachers from entering student-only routes", () => {
    expect(resolveStudentRouteAccess(teacherAuth)).toEqual({
      type: "redirect",
      to: TEACHER_HOME_ROUTE,
    });
  });

  it("preserves teacher route access for teachers and blocks students from teacher-only routes", () => {
    expect(resolveTeacherRouteAccess(teacherAuth)).toEqual({ type: "allow" });
    expect(resolveTeacherRouteAccess(studentAuth)).toEqual({
      type: "redirect",
      to: STUDENT_HOME_ROUTE,
    });
  });

  it("preserves teacher dashboard access for staff roles returned by the shared backend", () => {
    expect(getDefaultRouteForRole("PROCTOR")).toBe(TEACHER_HOME_ROUTE);
    expect(resolveTeacherRouteAccess({ status: "authenticated", role: "SUPER_ADMIN" })).toEqual({ type: "allow" });
    expect(resolveTeacherRouteAccess({ status: "authenticated", role: "AUDITOR" })).toEqual({ type: "allow" });
  });

  it("redirects invalid exam route parameters to student home", () => {
    expect(resolveStudentExamRouteAccess(studentAuth, { examId: "not-a-valid-exam-id" })).toEqual({
      type: "redirect",
      to: STUDENT_HOME_ROUTE,
    });
  });

  it("redirects direct protected session navigation to readiness when the exam is not active", () => {
    const otherExamId = "64f0c9b27d6f3f0a8b2c9999";
    expect(resolveStudentSessionRouteAccess(studentAuth, { examId: otherExamId })).toEqual({
      type: "redirect",
      to: studentExamReadinessRoute(otherExamId),
    });
  });

  it("allows protected session navigation when the active exam matches the typed route parameter", () => {
    expect(resolveStudentSessionRouteAccess(studentAuth, { examId: validExamId })).toEqual({ type: "allow" });
  });

  it("redirects direct preparation-step navigation when consent is missing", () => {
    expect(resolveStudentConsentRouteAccess(studentAuth, { examId: validExamId }, () => false)).toEqual({
      type: "redirect",
      to: studentExamReadinessRoute(validExamId),
    });
  });

  it("allows direct preparation-step navigation when scoped consent exists", () => {
    expect(resolveStudentConsentRouteAccess(studentAuth, { examId: validExamId }, () => true)).toEqual({
      type: "allow",
    });
  });
});
