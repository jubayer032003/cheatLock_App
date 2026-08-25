import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Exam, ExamSession } from "../../types";
import { StudentAppShell } from "../../layouts/StudentAppShell";
import { buildStudentExamCard } from "./examCards";
import { StudentExamCard, StudentHomePage, StudentHomeView } from "./StudentHomePage";

const mocks = vi.hoisted(() => ({
  logout: vi.fn(),
  useAuth: vi.fn(),
  useSocket: vi.fn(),
}));

vi.mock("../../contexts/AuthContext", () => ({
  useAuth: mocks.useAuth,
}));

vi.mock("../../contexts/SocketContext", () => ({
  useSocket: mocks.useSocket,
}));

function makeExam(overrides: Partial<Exam> = {}): Exam {
  return {
    id: "64f0c9b27d6f3f0a8b2c1234",
    title: "Secure Systems Midterm",
    durationMinutes: 45,
    lockAnswers: true,
    status: "LIVE",
    questions: [{ type: "CQ", text: "Explain secure storage.", options: [] }],
    accessCode: "ABC123",
    accessLink: "https://cheatlock.local/exam?code=ABC123",
    createdBy: "teacher-1",
    ...overrides,
  };
}

function makeSession(overrides: Partial<ExamSession> = {}): ExamSession {
  return {
    studentId: "stu-001",
    studentName: "Amina Rahman",
    examId: "64f0c9b27d6f3f0a8b2c1234",
    status: "IN_PROGRESS",
    deviceId: "desktop-device",
    suspicionScore: 0,
    latestAlert: "",
    onlineStatus: "ONLINE",
    ...overrides,
  };
}

beforeEach(() => {
  mocks.logout.mockReset();
  mocks.useAuth.mockReturnValue({
    user: {
      name: "Amina Rahman",
      identifier: "stu-001",
      role: "STUDENT",
      institutionName: "North Campus",
    },
    serverUrl: "https://api.cheatlock.test",
    logout: mocks.logout,
  });
  mocks.useSocket.mockReturnValue({ status: "Connected" });

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

describe("StudentHomePage", () => {
  it("renders student information", () => {
    render(
      <MemoryRouter>
        <StudentHomeView
          studentName="Amina Rahman"
          studentId="stu-001"
          institutionName="North Campus"
          serverUrl="https://api.cheatlock.test"
          connectionStatus="Connected"
          appVersion="1.0.0"
          loading={false}
          error={null}
          groups={{
            upcoming: [],
            available: [buildStudentExamCard(makeExam(), null)],
            inProgress: [],
            completed: [],
            unavailable: [],
          }}
          onRetry={vi.fn()}
        />
      </MemoryRouter>
    );

    expect(screen.getByText("Welcome, Amina Rahman")).toBeTruthy();
    expect(screen.getByText("stu-001")).toBeTruthy();
    expect(screen.getByText("North Campus")).toBeTruthy();
    expect(screen.getByText("Connected")).toBeTruthy();
    expect(screen.getByText("v1.0.0")).toBeTruthy();
  });

  it("maps exam states to the correct labels and actions", () => {
    const cards = [
      buildStudentExamCard(makeExam({ status: "SCHEDULED", title: "Upcoming Exam" }), null),
      buildStudentExamCard(makeExam({ title: "Ready Exam" }), makeSession({ status: "RESET_BY_TEACHER" })),
      buildStudentExamCard(makeExam({ title: "Verification Exam" }), null),
      buildStudentExamCard(makeExam({ title: "Active Exam" }), makeSession({ status: "IN_PROGRESS" })),
      buildStudentExamCard(makeExam({ title: "Submitted Exam" }), makeSession({ status: "SUBMITTED" })),
      buildStudentExamCard(makeExam({ status: "DRAFT", title: "Unavailable Exam" }), null),
      buildStudentExamCard(makeExam({ status: "ENDED", title: "Expired Exam" }), null),
      buildStudentExamCard(makeExam({ title: "Blocked Exam" }), makeSession({ status: "LOCKED" })),
    ];

    render(
      <MemoryRouter>
        <div>
          {cards.map((card) => (
            <StudentExamCard key={card.exam.title} card={card} />
          ))}
        </div>
      </MemoryRouter>
    );

    expect(screen.getByText("Upcoming")).toBeTruthy();
    expect(screen.getByText("Ready to Join")).toBeTruthy();
    expect(screen.getAllByText("Verification Required").length).toBeGreaterThan(0);
    expect(screen.getByText("In Progress")).toBeTruthy();
    expect(screen.getByText("Submitted")).toBeTruthy();
    expect(screen.getByText("Unavailable")).toBeTruthy();
    expect(screen.getByText("Expired")).toBeTruthy();
    expect(screen.getByText("Blocked")).toBeTruthy();
    expect(screen.getAllByText("View Instructions").length).toBeGreaterThan(0);
    expect(screen.getByText("Prepare for Exam")).toBeTruthy();
    expect(screen.getAllByText("Continue Verification").length).toBeGreaterThan(0);
    expect(screen.getByText("Resume Exam")).toBeTruthy();
    expect(screen.getByText("View Submission")).toBeTruthy();
  });

  it("renders loading and API error states", async () => {
    const { rerender } = render(
      <MemoryRouter>
        <StudentHomePage loadExamRecords={() => new Promise(() => {})} />
      </MemoryRouter>
    );

    expect(screen.getByLabelText("Loading exams")).toBeTruthy();

    rerender(
      <MemoryRouter>
        <StudentHomePage loadExamRecords={() => Promise.reject(new Error("Backend unavailable"))} />
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByText("Unable to Load Exams")).toBeTruthy());
    expect(screen.getByText("Backend unavailable")).toBeTruthy();
    expect(screen.getByRole("button", { name: /retry/i })).toBeTruthy();
  });

  it("does not call hardware permission functions or native monitoring commands", async () => {
    render(
      <MemoryRouter>
        <StudentHomePage loadExamRecords={() => Promise.resolve([])} />
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByText("No Exams Assigned")).toBeTruthy());
    expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled();
    expect(navigator.mediaDevices.getDisplayMedia).not.toHaveBeenCalled();
    expect((window as any).__TAURI_INTERNALS__.invoke).not.toHaveBeenCalled();
  });

  it("logout performs session cleanup and redirects to login", async () => {
    render(
      <MemoryRouter initialEntries={["/student/home"]}>
        <Routes>
          <Route path="/student" element={<StudentAppShell />}>
            <Route path="home" element={<div>Student Home Route</div>} />
          </Route>
          <Route path="/login" element={<div>Login Route</div>} />
        </Routes>
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole("button", { name: /amina rahman/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: /logout/i }));

    expect(mocks.logout).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByText("Login Route")).toBeTruthy());
  });
});
