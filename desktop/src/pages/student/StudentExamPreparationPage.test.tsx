import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EXAM_CONSENT_POLICY_VERSION } from "../../config/consentPolicy";
import {
  attemptIdFromSession,
  ExamPreparationStateService,
} from "../../services/ExamPreparationStateService";
import type { Exam, ExamSession } from "../../types";
import { StudentExamPreparationPage } from "./StudentExamPreparationPage";

const examId = "64f0c9b27d6f3f0a8b2c1234";
const otherExamId = "64f0c9b27d6f3f0a8b2c9999";

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
}));

vi.mock("../../contexts/AuthContext", () => ({
  useAuth: mocks.useAuth,
}));

function makeExam(overrides: Partial<Exam> & Record<string, unknown> = {}): Exam {
  return {
    id: examId,
    title: "Secure Systems Midterm",
    durationMinutes: 45,
    lockAnswers: true,
    status: "LIVE",
    questions: [{ type: "CQ", text: "Explain secure storage.", options: [] }],
    accessCode: "ABC123",
    accessLink: "https://cheatlock.local/exam?code=ABC123",
    createdBy: "teacher-1",
    monitoringPolicy: {
      requireCamera: true,
      requireMicrophone: true,
      requireScreenCapture: true,
      requireIdentityVerification: true,
      requireLivenessChecks: true,
      allowOfflineDrafts: true,
      allowMultipleDisplays: false,
      telemetryIntervalMs: 5000,
      screenSnapshotIntervalMs: 15000,
    },
    ...overrides,
  } as Exam;
}

function makeSession(overrides: Partial<ExamSession> = {}): ExamSession {
  return {
    studentId: "stu-001",
    studentName: "Amina Rahman",
    examId,
    status: "IN_PROGRESS",
    startedAt: 111,
    deviceId: "desktop-device",
    suspicionScore: 0,
    latestAlert: "",
    onlineStatus: "ONLINE",
    ...overrides,
  };
}

function renderPreparation({
  exam = makeExam(),
  session = null,
}: {
  exam?: Exam;
  session?: ExamSession | null;
} = {}) {
  return render(
    <MemoryRouter initialEntries={[`/student/exams/${exam.id}/readiness`]}>
      <Routes>
        <Route
          path="/student/exams/:examId/readiness"
          element={<StudentExamPreparationPage loadPreparationRecord={() => Promise.resolve({ exam, session })} />}
        />
        <Route path="/student/exams/:examId/rules" element={<div>Rules Route</div>} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  ExamPreparationStateService.clearAllForTests();
  mocks.useAuth.mockReturnValue({
    user: {
      name: "Amina Rahman",
      identifier: "stu-001",
      role: "STUDENT",
    },
  });
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: {
      getUserMedia: vi.fn(),
      getDisplayMedia: vi.fn(),
      enumerateDevices: vi.fn(),
    },
  });
  (window as any).__TAURI_INTERNALS__ = { invoke: vi.fn() };
});

afterEach(() => {
  cleanup();
});

describe("StudentExamPreparationPage", () => {
  it("requires consent before continuing", async () => {
    renderPreparation();

    await waitFor(() => expect(screen.getByText("Secure Systems Midterm")).toBeTruthy());
    expect(screen.queryByRole("link", { name: /continue/i })).toBeNull();
    expect(screen.getByText("Camera")).toBeTruthy();
    expect(screen.getByText("Microphone")).toBeTruthy();
    expect(screen.getByText("Screen capture")).toBeTruthy();
    expect(screen.getByText("Face verification")).toBeTruthy();
    expect(screen.getByText("Application-security monitoring")).toBeTruthy();
    expect(screen.getByText("Network telemetry")).toBeTruthy();
    expect(screen.getByText("AI-assisted monitoring")).toBeTruthy();
  });

  it("records accepted consent without requesting permissions", async () => {
    const session = makeSession();
    renderPreparation({ session });

    await waitFor(() => expect(screen.getByText("Secure Systems Midterm")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /i acknowledge and consent/i }));

    const attemptId = attemptIdFromSession(session);
    expect(
      ExamPreparationStateService.hasValidConsent({
        studentId: "stu-001",
        examId,
        attemptId,
        consentPolicyVersion: EXAM_CONSENT_POLICY_VERSION,
      })
    ).toBe(true);
    expect(screen.getByRole("link", { name: /continue/i }).getAttribute("href")).toBe(`/student/exams/${examId}/rules`);
    expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled();
    expect(navigator.mediaDevices.getDisplayMedia).not.toHaveBeenCalled();
    expect((window as any).__TAURI_INTERNALS__.invoke).not.toHaveBeenCalledWith(
      "start_exam_monitoring",
      expect.anything(),
      expect.anything()
    );
  });

  it("records rejected consent and keeps later steps blocked", async () => {
    renderPreparation();

    await waitFor(() => expect(screen.getByText("Secure Systems Midterm")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /i do not consent/i }));

    expect(screen.getByText(/you rejected the consent notice/i)).toBeTruthy();
    expect(screen.queryByRole("link", { name: /continue/i })).toBeNull();
    expect(ExamPreparationStateService.hasValidConsent({ studentId: "stu-001", examId })).toBe(false);
  });

  it("requires new consent when the policy version changes", () => {
    ExamPreparationStateService.acceptConsent({
      studentId: "stu-001",
      examId,
      consentPolicyVersion: "old-policy",
    });

    expect(
      ExamPreparationStateService.hasValidConsent({
        studentId: "stu-001",
        examId,
        consentPolicyVersion: EXAM_CONSENT_POLICY_VERSION,
      })
    ).toBe(false);
  });

  it("does not let consent from one exam unlock another exam", () => {
    ExamPreparationStateService.acceptConsent({ studentId: "stu-001", examId });

    expect(ExamPreparationStateService.hasValidConsent({ studentId: "stu-001", examId: otherExamId })).toBe(false);
  });

  it("invalidates consent when the attempt changes", () => {
    ExamPreparationStateService.acceptConsent({ studentId: "stu-001", examId, attemptId: "attempt-a" });

    expect(
      ExamPreparationStateService.hasValidConsent({ studentId: "stu-001", examId, attemptId: "attempt-b" })
    ).toBe(false);
  });
});
