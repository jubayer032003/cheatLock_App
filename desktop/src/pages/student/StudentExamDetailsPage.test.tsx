import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Exam, ExamSession } from "../../types";
import { studentExamReadinessRoute, studentExamSessionRoute, studentExamSubmittedRoute, studentExamVerificationRoute } from "../../routes/studentRoutes";
import { StudentExamDetailsPage, StudentExamDetailsView } from "./StudentExamDetailsPage";
import { buildStudentExamDetailsViewModel } from "./examDetailsViewModel";

const examId = "64f0c9b27d6f3f0a8b2c1234";

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
    createdBy: "Dr. Karim",
    scheduledStartAt: "2026-08-01T10:00:00.000Z",
    scheduledEndAt: "2026-08-01T10:45:00.000Z",
    course: "CSE 401",
    instructor: "Dr. Karim",
    allowedResources: ["Calculator", "Blank paper"],
    prohibitedResources: ["Phones", "Second monitor"],
    instructions: ["Read every question before answering.", "Submit before the timer ends."],
    supportInformation: "Call the exam desk.",
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
    deviceId: "desktop-device",
    suspicionScore: 0,
    latestAlert: "",
    onlineStatus: "ONLINE",
    ...overrides,
  };
}

function renderDetailsRoute(loadExamDetails: (id: string) => Promise<{ exam: Exam; session?: ExamSession | null }>) {
  return render(
    <MemoryRouter initialEntries={[`/student/exams/${examId}`]}>
      <Routes>
        <Route path="/student/exams/:examId" element={<StudentExamDetailsPage loadExamDetails={loadExamDetails} />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
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

describe("StudentExamDetailsPage", () => {
  it("renders a valid exam without requesting hardware", () => {
    render(
      <MemoryRouter>
        <StudentExamDetailsView exam={buildStudentExamDetailsViewModel(makeExam(), null)} />
      </MemoryRouter>
    );

    expect(screen.getByText("Secure Systems Midterm")).toBeTruthy();
    expect(screen.getByText("CSE 401")).toBeTruthy();
    expect(screen.getByText("Dr. Karim")).toBeTruthy();
    expect(screen.getByText("45 minutes")).toBeTruthy();
    expect(screen.getByText("Calculator")).toBeTruthy();
    expect(screen.getByText("Phones")).toBeTruthy();
    expect(screen.getByText("Camera access")).toBeTruthy();
    expect(screen.getByText("Call the exam desk.")).toBeTruthy();
    expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled();
    expect(navigator.mediaDevices.getDisplayMedia).not.toHaveBeenCalled();
    expect((window as any).__TAURI_INTERNALS__.invoke).not.toHaveBeenCalled();
  });

  it("handles a missing exam", async () => {
    renderDetailsRoute(() => Promise.reject({ status: 404, message: "Exam not found for this student account." }));

    await waitFor(() => expect(screen.getByText("Exam Not Found")).toBeTruthy());
    expect(screen.getByText("Exam not found for this student account.")).toBeTruthy();
  });

  it("handles an unauthorized exam", async () => {
    renderDetailsRoute(() => Promise.reject({ status: 403, message: "You are not assigned to this exam." }));

    await waitFor(() => expect(screen.getByText("Exam Access Denied")).toBeTruthy());
    expect(screen.getByText("You are not assigned to this exam.")).toBeTruthy();
  });

  it("renders an upcoming exam with a disabled action", () => {
    render(
      <MemoryRouter>
        <StudentExamDetailsView exam={buildStudentExamDetailsViewModel(makeExam({ status: "SCHEDULED" }), null)} />
      </MemoryRouter>
    );

    expect(screen.getAllByText("Upcoming").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Prepare for Exam" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByText("This exam is not open yet.")).toBeTruthy();
  });

  it("renders an active exam and routes to verification", () => {
    render(
      <MemoryRouter>
        <StudentExamDetailsView exam={buildStudentExamDetailsViewModel(makeExam(), null)} />
      </MemoryRouter>
    );

    const action = screen.getByRole("link", { name: /continue verification/i });
    expect(screen.getAllByText("Verification Required").length).toBeGreaterThan(0);
    expect(action.getAttribute("href")).toBe(studentExamVerificationRoute(examId));
  });

  it("renders an expired exam with a disabled explanation", () => {
    render(
      <MemoryRouter>
        <StudentExamDetailsView exam={buildStudentExamDetailsViewModel(makeExam({ status: "ENDED" }), null)} />
      </MemoryRouter>
    );

    expect(screen.getAllByText("Expired").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Prepare for Exam" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByText("This exam has expired.")).toBeTruthy();
  });

  it("renders an already-submitted attempt", () => {
    render(
      <MemoryRouter>
        <StudentExamDetailsView
          exam={buildStudentExamDetailsViewModel(makeExam(), makeSession({ status: "SUBMITTED" }))}
        />
      </MemoryRouter>
    );

    const action = screen.getByRole("link", { name: /view submission/i });
    expect(screen.getAllByText("Submitted").length).toBeGreaterThan(0);
    expect(action.getAttribute("href")).toBe(studentExamSubmittedRoute(examId));
  });

  it("handles backend errors", async () => {
    renderDetailsRoute(() => Promise.reject({ status: 500, message: "Database unavailable" }));

    await waitFor(() => expect(screen.getByText("Backend Failure")).toBeTruthy());
    expect(screen.getByText("Database unavailable")).toBeTruthy();
  });

  it("maps action routing for ready and in-progress states", () => {
    const ready = buildStudentExamDetailsViewModel(makeExam(), makeSession({ status: "RESET_BY_TEACHER" }));
    const inProgress = buildStudentExamDetailsViewModel(makeExam(), makeSession({ status: "IN_PROGRESS" }));

    expect(ready.action.label).toBe("Prepare for Exam");
    expect(ready.action.to).toBe(studentExamReadinessRoute(examId));
    expect(inProgress.action.label).toBe("Resume Exam");
    expect(inProgress.action.to).toBe(studentExamSessionRoute(examId));
  });
});
