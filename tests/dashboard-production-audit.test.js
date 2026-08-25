import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("ordinary teachers do not receive tenant administration permissions", () => {
  for (const path of ["web-dashboard/src/lib/auth.ts", "backend/src/middleware/auth.js"]) {
    const source = read(path);
    const teacherPermissions = source.match(/TEACHER:\s*\[([^\]]*)\]/)?.[1] || "";
    assert.doesNotMatch(teacherPermissions, /manage_users|manage_settings|view_audit_logs/);
    assert.match(teacherPermissions, /manage_exams/);
    assert.match(teacherPermissions, /proctor_exams/);
  }
});

test("Socket.IO authentication revalidates account state and token revocation", () => {
  const source = read("backend/src/socket/proctoring.js");
  assert.match(source, /User\.findById\(decoded\.sub\)/);
  assert.match(source, /user\.status[^\n]*ACTIVE/);
  assert.match(source, /decoded\.tokenVersion/);
  assert.match(source, /user\.passwordChangedAt/);
});

test("teacher-facing production pages do not present fabricated readiness or verification claims", () => {
  assert.doesNotMatch(read("web-dashboard/src/pages/TeacherHomePage.tsx"), /Integrity readiness|Command readiness/);
  assert.doesNotMatch(read("web-dashboard/src/pages/ReportsPage.tsx"), /Tamper Audit Hash|Report Verification|signatureHash|verificationCode/);
  assert.doesNotMatch(read("web-dashboard/src/pages/ReplayTimelinePage.tsx"), /Concise AI behavior Summary|YOLOv8n Object Detector|Download PDF/);
});

test("experimental model analytics are hidden and QR generation stays local", () => {
  const shell = read("web-dashboard/src/components/AppShell.tsx");
  const app = read("web-dashboard/src/App.tsx");
  const qr = read("web-dashboard/src/components/QrCode.tsx");
  assert.match(shell, /VITE_ENABLE_MODEL_DATA_PAGE/);
  assert.match(app, /VITE_ENABLE_MODEL_DATA_PAGE/);
  assert.match(qr, /from "qrcode"/);
  assert.match(read("web-dashboard/src/pages/ExamListPage.tsx"), /<QrCode/);
  assert.match(read("web-dashboard/src/pages/ExamDetailsPage.tsx"), /<QrCode/);
  assert.doesNotMatch(qr, /https?:\/\//);
});

test("the read-only settings placeholder is hidden from V1 by default", () => {
  assert.match(read("web-dashboard/src/components/AppShell.tsx"), /VITE_ENABLE_SETTINGS_PAGE/);
  assert.match(read("web-dashboard/src/App.tsx"), /VITE_ENABLE_SETTINGS_PAGE/);
});

test("manual grades are constrained to the dashboard's 0 to 100 contract", () => {
  const source = read("backend/src/routes/teacher.js");
  assert.match(source, /grade < 0 \|\| grade > 100/);
});

test("partial V1 mutation controls have duplicate and failure guards", () => {
  const exams = read("web-dashboard/src/pages/ExamListPage.tsx");
  const details = read("web-dashboard/src/pages/ExamDetailsPage.tsx");
  const live = read("web-dashboard/src/pages/LiveProctoringPage.tsx");
  assert.match(exams, /deletingExamId/);
  assert.match(details, /Copy failed\. Select and copy the link manually/);
  assert.match(live, /\.timeout\(10_000\)\.emit/);
  assert.match(live, /pendingCommandKeyRef\.current/);
  assert.match(live, /if \(pendingCommandKeyRef\.current\) return/);
});

test("unsupported proctor and auditor roles cannot enter the teacher dashboard", () => {
  const source = read("web-dashboard/src/lib/auth.ts");
  const allowedRoles = source.match(/allowedDashboardRoles\s*=\s*\[([\s\S]*?)\]/)?.[1] || "";
  assert.doesNotMatch(allowedRoles, /PROCTOR|AUDITOR/);
  assert.match(allowedRoles, /TEACHER/);
});

test("exam lifecycle transitions are constrained in backend and UI", () => {
  const backend = read("backend/src/routes/exams.js");
  const dashboard = read("web-dashboard/src/pages/ExamDetailsPage.tsx");
  assert.match(backend, /INVALID_EXAM_LIFECYCLE_TRANSITION/);
  assert.match(backend, /LIVE:\s*new Set\(\["END"\]\)/);
  assert.match(dashboard, /lifecycleActions/);
});

test("question builder does not claim unsaved draft changes are persisted", () => {
  const source = read("web-dashboard/src/components/question-builder/QuestionBuilder.tsx");
  assert.doesNotMatch(source, /Autosave:/);
  assert.match(source, /Draft changes are saved when the exam is created/);
});

test("student proctoring sockets join exam rooms and reconcile disconnect presence", () => {
  const source = read("backend/src/socket/proctoring.js");
  assert.match(source, /socket\.join\(examRoom\)/);
  assert.match(source, /socket\.on\("disconnect"/);
  assert.match(source, /candidate\.user\?\.identifier === socket\.user\.identifier/);
  assert.match(source, /broadcastSessionState\(io, "student_left_exam"/);
});
