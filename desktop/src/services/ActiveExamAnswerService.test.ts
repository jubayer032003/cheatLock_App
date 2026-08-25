import { beforeEach, describe, expect, it, vi } from "vitest";
import { ActiveExamAnswerService } from "./ActiveExamAnswerService";

const secureStore = new Map<string, string>();

vi.mock("./SecureStorageService", () => ({
  SecureStorageService: {
    get: vi.fn(async (key: string) => secureStore.get(key) ?? null),
    set: vi.fn(async (key: string, value: string) => {
      secureStore.set(key, value);
    }),
    delete: vi.fn(async (key: string) => {
      secureStore.delete(key);
    }),
  },
}));

const scope = {
  studentId: "stu-1",
  examId: "exam-1",
  attemptId: "attempt-1",
  deviceId: "device-1",
};

describe("ActiveExamAnswerService", () => {
  beforeEach(() => {
    localStorage.clear();
    secureStore.clear();
    Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
  });

  it("autosaves encrypted drafts and synchronizes with a backend revision", async () => {
    const syncToBackend = vi.fn(async () => ({ revision: 1, serverTime: "2026-07-25T00:00:00.000Z" }));
    const service = new ActiveExamAnswerService(scope, { syncToBackend });

    const result = await service.save({ answers: { 0: "answer" }, currentIndex: 0, markedQuestions: [] });
    const recovered = await service.recover();

    expect(result.backendSyncState).toBe("synchronized");
    expect(result.localSaveState).toBe("saved");
    expect(recovered?.answers[0]).toBe("answer");
    expect(result.serverRevision).toBe(1);
    expect(syncToBackend).toHaveBeenCalledWith(scope, { answers: { 0: "answer" }, currentIndex: 0, markedQuestions: [] }, 0);
  });

  it("keeps local save when synchronization fails", async () => {
    const service = new ActiveExamAnswerService(scope, {
      syncToBackend: vi.fn(async () => {
        throw new Error("server down");
      }),
    });

    const result = await service.save({ answers: { 0: "draft" }, currentIndex: 0, markedQuestions: [] });

    expect(result.localSaveState).toBe("saved");
    expect(result.backendSyncState).toBe("failed");
    expect((await service.recover())?.answers[0]).toBe("draft");
  });

  it("does not report backend synchronization when synchronization fails", async () => {
    const service = new ActiveExamAnswerService(scope, {
      syncToBackend: vi.fn(async () => {
        throw Object.assign(new Error("server down"), { status: 503 });
      }),
    });

    await expect(service.save({ answers: { 0: "draft" }, currentIndex: 0, markedQuestions: [] }))
      .resolves.toMatchObject({ localSaveState: "saved", backendSyncState: "failed" });
  });

  it("does not sync while offline", async () => {
    const syncToBackend = vi.fn();
    const service = new ActiveExamAnswerService(scope, { syncToBackend, isOnline: () => false });

    const result = await service.save({ answers: { 1: "offline" }, currentIndex: 1, markedQuestions: [1] });

    expect(result.backendSyncState).toBe("offline");
    expect(syncToBackend).not.toHaveBeenCalled();
  });

  it("recovers only for the same student exam attempt and device", async () => {
    const service = new ActiveExamAnswerService(scope, { syncToBackend: vi.fn(async () => ({ revision: 1 })) });
    await service.save({ answers: { 0: "mine" }, currentIndex: 0, markedQuestions: [] });

    const otherStudent = new ActiveExamAnswerService({ ...scope, studentId: "stu-2" });
    const otherAttempt = new ActiveExamAnswerService({ ...scope, attemptId: "attempt-2" });

    expect(await otherStudent.recover()).toBeNull();
    expect(await otherAttempt.recover()).toBeNull();
  });

  it("serializes backend writes and lets the newest queued snapshot win", async () => {
    let resolveFirst!: (value: { revision: number }) => void;
    const first = new Promise<{ revision: number }>((resolve) => {
      resolveFirst = resolve;
    });
    const syncToBackend = vi
      .fn()
      .mockReturnValueOnce(first)
      .mockResolvedValueOnce({ revision: 2 });
    const service = new ActiveExamAnswerService(scope, { syncToBackend });

    const firstSave = service.save({ answers: { 0: "old" }, currentIndex: 0, markedQuestions: [] });
    const secondSave = service.save({ answers: { 0: "new" }, currentIndex: 0, markedQuestions: [] });
    await waitForCalls(syncToBackend, 1);
    expect(syncToBackend).toHaveBeenCalledTimes(1);
    resolveFirst({ revision: 1 });

    await expect(firstSave).resolves.toMatchObject({ backendSyncState: "stale_ignored", revision: 1 });
    await expect(secondSave).resolves.toMatchObject({ backendSyncState: "synchronized", revision: 2, serverRevision: 2 });
    expect(syncToBackend).toHaveBeenCalledTimes(2);
    expect(syncToBackend).toHaveBeenNthCalledWith(2, scope, { answers: { 0: "new" }, currentIndex: 0, markedQuestions: [] }, 1);
  });

  it("supersedes unsent queued saves instead of starting unbounded parallel saves", async () => {
    let resolveFirst!: (value: { revision: number }) => void;
    const first = new Promise<{ revision: number }>((resolve) => {
      resolveFirst = resolve;
    });
    const syncToBackend = vi
      .fn()
      .mockReturnValueOnce(first)
      .mockResolvedValueOnce({ revision: 2 });
    const service = new ActiveExamAnswerService(scope, { syncToBackend });

    const firstSave = service.save({ answers: { 0: "first" }, currentIndex: 0, markedQuestions: [] });
    const secondSave = service.save({ answers: { 0: "second" }, currentIndex: 0, markedQuestions: [] });
    const thirdSave = service.save({ answers: { 0: "third" }, currentIndex: 0, markedQuestions: [] });

    await expect(secondSave).resolves.toMatchObject({ backendSyncState: "stale_ignored", revision: 2 });
    await waitForCalls(syncToBackend, 1);
    expect(syncToBackend).toHaveBeenCalledTimes(1);
    resolveFirst({ revision: 1 });
    await firstSave;
    await expect(thirdSave).resolves.toMatchObject({ backendSyncState: "synchronized", revision: 3 });
    expect(syncToBackend).toHaveBeenCalledTimes(2);
    expect(syncToBackend).toHaveBeenLastCalledWith(scope, { answers: { 0: "third" }, currentIndex: 0, markedQuestions: [] }, 1);
  });

  it("reports revision conflicts without clearing the encrypted local draft", async () => {
    const conflictError = Object.assign(new Error("conflict"), { status: 409, code: "ANSWER_REVISION_CONFLICT" });
    const service = new ActiveExamAnswerService(scope, {
      syncToBackend: vi.fn(async () => {
        throw conflictError;
      }),
    });

    const result = await service.save({ answers: { 0: "local latest" }, currentIndex: 0, markedQuestions: [] });

    expect(result.backendSyncState).toBe("conflict");
    expect((await service.recover())?.answers[0]).toBe("local latest");
  });

  it("maps session revocation and expiration separately", async () => {
    const revokedError = Object.assign(new Error("revoked"), { status: 403, code: "SESSION_REVOKED" });
    const expiredError = Object.assign(new Error("expired"), { status: 410, code: "SESSION_EXPIRED" });

    await expect(
      new ActiveExamAnswerService(scope, { syncToBackend: vi.fn(async () => { throw revokedError; }) })
        .save({ answers: {}, currentIndex: 0, markedQuestions: [] })
    ).resolves.toMatchObject({ backendSyncState: "revoked" });
    await expect(
      new ActiveExamAnswerService(scope, { syncToBackend: vi.fn(async () => { throw expiredError; }) })
        .save({ answers: {}, currentIndex: 0, markedQuestions: [] })
    ).resolves.toMatchObject({ backendSyncState: "expired" });
  });
});

async function waitForCalls(mock: ReturnType<typeof vi.fn>, count: number) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (mock.mock.calls.length >= count) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}
