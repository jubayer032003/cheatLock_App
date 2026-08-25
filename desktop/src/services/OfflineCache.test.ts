import { beforeEach, describe, expect, it } from "vitest";
import { OfflineCache, type ExamDraftScope } from "./OfflineCache";
import { SecureStorageService } from "./SecureStorageService";

const scope: ExamDraftScope = {
  studentId: "stu-1",
  examId: "exam-1",
  attemptId: "attempt-1",
  deviceId: "device-1",
};

beforeEach(() => {
  localStorage.clear();
  SecureStorageService.setAdapterForTests(null);
  SecureStorageService.clearMemoryForTests();
});

describe("OfflineCache", () => {
  it("saves encrypted drafts without raw answer text", async () => {
    await OfflineCache.saveDraft(scope, {
      answers: { 0: "secret answer" },
      currentIndex: 0,
      markedQuestions: [],
    });

    const stored = Object.values(localStorage).join("\n");
    expect(stored).not.toContain("secret answer");
    expect(stored).toContain("ciphertext");
  });

  it("restores encrypted drafts for the same scope", async () => {
    await OfflineCache.saveDraft(scope, {
      answers: { 0: "answer" },
      currentIndex: 2,
      markedQuestions: [2],
    });

    const draft = await OfflineCache.getDraft(scope);

    expect(draft?.answers[0]).toBe("answer");
    expect(draft?.currentIndex).toBe(2);
    expect(draft?.markedQuestions).toEqual([2]);
  });

  it("isolates drafts by account", async () => {
    await OfflineCache.saveDraft(scope, {
      answers: { 0: "student one answer" },
      currentIndex: 0,
      markedQuestions: [],
    });

    expect(await OfflineCache.getDraft({ ...scope, studentId: "stu-2" })).toBeNull();
  });

  it("isolates drafts by attempt", async () => {
    await OfflineCache.saveDraft(scope, {
      answers: { 0: "attempt one answer" },
      currentIndex: 0,
      markedQuestions: [],
    });

    expect(await OfflineCache.getDraft({ ...scope, attemptId: "attempt-2" })).toBeNull();
  });

  it("handles corrupted encrypted records safely", async () => {
    await OfflineCache.saveDraft(scope, {
      answers: { 0: "answer" },
      currentIndex: 0,
      markedQuestions: [],
    });
    const key = Object.keys(localStorage).find((item) => item.startsWith("cheatlock_encrypted_draft_"))!;
    localStorage.setItem(key, "{bad-json");

    expect(await OfflineCache.getDraft(scope)).toBeNull();
    expect(localStorage.getItem(key)).toBeNull();
  });

  it("clears drafts after confirmed submission", async () => {
    await OfflineCache.saveDraft(scope, {
      answers: { 0: "answer" },
      currentIndex: 0,
      markedQuestions: [],
    });

    await OfflineCache.clearDraft(scope);

    expect(await OfflineCache.getDraft(scope)).toBeNull();
  });
});
