import { beforeEach, describe, expect, it, vi } from "vitest";
import { ActiveExamAnswerService } from "./ActiveExamAnswerService";
import { ExamSubmissionLifecycleService } from "./ExamSubmissionLifecycleService";
import { SubmissionReceiptService } from "./SubmissionReceiptService";
import type { Exam } from "../types";

vi.mock("./TelemetryUploadQueue", () => ({
  telemetryUploadQueue: {
    flushPending: vi.fn(async () => {}),
    stop: vi.fn(),
  },
}));

const exam: Exam = {
  id: "507f1f77bcf86cd799439011",
  title: "Final Exam",
  durationMinutes: 60,
  lockAnswers: true,
  status: "LIVE",
  questions: [
    { type: "CQ", text: "First?", options: [] },
    { type: "MCQ", text: "Second?", options: ["A", "B"] },
  ],
  accessCode: "ABC",
  accessLink: "",
  createdBy: "teacher",
};

const scope = {
  studentId: "stu-1",
  examId: exam.id,
  attemptId: "attempt-1",
  deviceId: "device-1",
};

describe("ExamSubmissionLifecycleService", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("submits successfully in the required order and saves a receipt", async () => {
    const order: string[] = [];
    const answerService = fakeAnswerService(order);
    const lifecycle = makeLifecycle(order);

    const receipt = await lifecycle.submit(context(answerService));

    expect(receipt.status).toBe("confirmed");
    expect(SubmissionReceiptService.get(exam.id, scope.studentId)?.receiptReference).toBe(receipt.receiptReference);
    expect(order).toEqual([
      "answer-save",
      "answer-flush",
      "telemetry-flush",
      "save-submission",
      "submit-session",
      "queue-stop",
      "stop-monitoring",
      "clear-session",
      "draft-clear",
      "navigate",
    ]);
  });

  it("reports unanswered question indexes before confirmation", () => {
    const lifecycle = makeLifecycle([]);

    expect(lifecycle.getUnansweredQuestionIndexes(exam, { 0: "answered" })).toEqual([1]);
  });

  it("submits the latest in-memory answers as the final authoritative payload", async () => {
    const order: string[] = [];
    const saveSubmission = vi.fn(async () => {
      order.push("save-submission");
    });
    const lifecycle = makeLifecycle(order, { saveSubmission });

    await lifecycle.submit({
      ...context(fakeAnswerService(order)),
      snapshot: { answers: { 0: "latest local answer", 1: "B" }, currentIndex: 0, markedQuestions: [] },
    });

    expect(saveSubmission).toHaveBeenCalledWith(expect.objectContaining({
      answers: [
        expect.objectContaining({ questionIndex: 0, answerText: "latest local answer" }),
        expect.objectContaining({ questionIndex: 1, answerText: "B" }),
      ],
    }));
  });

  it("does not cleanup monitoring when backend submission fails", async () => {
    const order: string[] = [];
    const lifecycle = makeLifecycle(order, {
      saveSubmission: async () => {
        order.push("save-submission");
        throw new Error("backend failed");
      },
    });

    await expect(lifecycle.submit(context(fakeAnswerService(order)))).rejects.toThrow("backend failed");
    expect(order).not.toContain("stop-monitoring");
    expect(SubmissionReceiptService.get(exam.id, scope.studentId)).toBeNull();
  });

  it("deduplicates duplicate submission requests", async () => {
    const order: string[] = [];
    let resolveSubmit!: () => void;
    const lifecycle = makeLifecycle(order, {
      submitSession: async () => {
        order.push("submit-session");
        await new Promise<void>((resolve) => {
          resolveSubmit = resolve;
        });
        return { receiptReference: "receipt-delayed" };
      },
    });

    const first = lifecycle.submit(context(fakeAnswerService(order)));
    const second = lifecycle.submit(context(fakeAnswerService(order)));
    await waitForOrder(order, "submit-session");
    resolveSubmit();
    const [a, b] = await Promise.all([first, second]);

    expect(a).toBe(b);
    expect(order.filter((item) => item === "submit-session")).toHaveLength(1);
  });

  it("waits for delayed server confirmation before cleanup", async () => {
    const order: string[] = [];
    let resolveSubmit!: () => void;
    const lifecycle = makeLifecycle(order, {
      submitSession: async () => {
        order.push("submit-session");
        await new Promise<void>((resolve) => {
          resolveSubmit = resolve;
        });
        return { receiptReference: "confirmed" };
      },
    });

    const pending = lifecycle.submit(context(fakeAnswerService(order)));
    await waitForOrder(order, "submit-session");
    expect(order).not.toContain("stop-monitoring");
    resolveSubmit();
    await pending;
    expect(order).toContain("stop-monitoring");
  });

  it("cleanup is idempotent", async () => {
    const order: string[] = [];
    const lifecycle = makeLifecycle(order);

    await lifecycle.cleanup("route_exit");
    await lifecycle.cleanup("route_exit");

    expect(order.filter((item) => item === "stop-monitoring")).toHaveLength(1);
  });

  it("supports cleanup reasons for logout restart revocation and expiration", async () => {
    const reasons = ["logout", "recoverable_restart", "backend_revocation", "session_expiration"] as const;
    for (const reason of reasons) {
      const order: string[] = [];
      await makeLifecycle(order).cleanup(reason);
      expect(order).toContain("clear-session");
    }
  });
});

function context(answerService: ActiveExamAnswerService) {
  return {
    exam,
    studentId: scope.studentId,
    attemptId: scope.attemptId,
    snapshot: { answers: { 0: "A", 1: "B" }, currentIndex: 1, markedQuestions: [] },
    answerService,
    warnings: { appSwitch: 0, faceMissing: 0, audio: 0, phone: 0 },
  };
}

async function waitForOrder(order: string[], item: string) {
  for (let index = 0; index < 10; index += 1) {
    if (order.includes(item)) return;
    await Promise.resolve();
  }
  throw new Error(`Timed out waiting for ${item}`);
}

function fakeAnswerService(order: string[]) {
  return {
    save: vi.fn(async () => {
      order.push("answer-save");
      return { revision: 1, localSaveState: "saved", backendSyncState: "synchronized", message: "saved" };
    }),
    flush: vi.fn(async () => {
      order.push("answer-flush");
    }),
    clear: vi.fn(async () => {
      order.push("draft-clear");
    }),
  } as unknown as ActiveExamAnswerService;
}

function makeLifecycle(
  order: string[],
  overrides: Partial<ConstructorParameters<typeof ExamSubmissionLifecycleService>[0]> = {}
) {
  return new ExamSubmissionLifecycleService({
    saveSubmission: vi.fn(async () => {
      order.push("save-submission");
    }),
    submitSession: vi.fn(async () => {
      order.push("submit-session");
      return { receiptReference: "receipt-1" };
    }),
    flushTelemetry: vi.fn(async () => {
      order.push("telemetry-flush");
    }),
    stopMonitoring: vi.fn(async () => {
      order.push("stop-monitoring");
    }),
    disconnectSocket: vi.fn(() => {
      order.push("queue-stop");
    }),
    clearSessionCredentials: vi.fn(async () => {
      order.push("clear-session");
    }),
    navigateSubmitted: vi.fn(() => {
      order.push("navigate");
    }),
    now: () => new Date("2026-07-25T00:00:00.000Z"),
    ...overrides,
  });
}
