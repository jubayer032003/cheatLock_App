import { beforeEach, describe, expect, it, vi } from "vitest";
import { TelemetryUploadQueue } from "./TelemetryUploadQueue";

const secureStore = new Map<string, string>();

vi.mock("./SecureStorageService", () => ({
  SecureStorageService: {
    set: vi.fn(async (key: string, value: string) => secureStore.set(key, value)),
    delete: vi.fn(async (key: string) => secureStore.delete(key)),
  },
}));

describe("TelemetryUploadQueue", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    secureStore.clear();
  });

  it("uses exponential retry backoff with bounded jitter", () => {
    const queue = new TelemetryUploadQueue(fakeSocket(), () => 0.5);
    queue.start({ retryBaseMs: 1000, retryMaxMs: 10000, jitterRatio: 0.2 });

    expect(queue.computeRetryDelay(0)).toBe(1100);
    expect(queue.computeRetryDelay(1)).toBe(2200);
    expect(queue.computeRetryDelay(4)).toBe(11000);
  });

  it("bounds offline queue size", async () => {
    const socket = fakeSocket(() => Promise.reject(new Error("offline")));
    const queue = new TelemetryUploadQueue(socket);
    queue.start({ maxOfflineEvents: 2, allowScreenEvidenceSnapshots: true });

    await queue.enqueue(screenItem("a"));
    await queue.enqueue(screenItem("b"));
    await queue.enqueue(screenItem("c"));

    expect(queue.status().queued).toBe(2);
  });

  it("bounds queued bytes and removes oldest routine evidence first", async () => {
    const socket = fakeSocket(() => Promise.reject(new Error("offline")));
    const queue = new TelemetryUploadQueue(socket);
    queue.start({
      allowScreenEvidenceSnapshots: true,
      maxQueueItems: 10,
      maxQueueBytes: 100,
      maxFrameBytes: 1000,
      maxAttempts: 10,
    });

    await queue.enqueue(screenItem("routine-old", { createdAt: 1000, sizeBytes: 60 }));
    await queue.enqueue(screenItem("suspicious", { createdAt: 2000, sizeBytes: 60, priority: "suspicious" }));
    await queue.enqueue(screenItem("routine-new", { createdAt: 3000, sizeBytes: 60 }));

    const status = queue.status();
    expect(status.queued).toBe(1);
    expect(status.queueBytes).toBe(60);
    expect(status.dropped).toBe(2);
  });

  it("uploads suspicious evidence before routine evidence", async () => {
    const uploaded: string[] = [];
    const socket = fakeSocket(async (_eventName, payload: any) => {
      uploaded.push(payload.evidenceId);
    });
    const queue = new TelemetryUploadQueue(socket, () => 0);
    queue.start({ allowScreenEvidenceSnapshots: true, retryBaseMs: 1, retryMaxMs: 1, jitterRatio: 0, maxConcurrentUploads: 1 });

    await queue.enqueue(screenItem("routine", { priority: "routine", createdAt: 1000 }));
    await queue.enqueue(screenItem("suspicious", { priority: "suspicious", createdAt: 2000 }));
    await vi.advanceTimersByTimeAsync(1);
    await vi.advanceTimersByTimeAsync(1);

    expect(uploaded[0]).toBe("suspicious");
  });

  it("protects against duplicate event ids", async () => {
    const queue = new TelemetryUploadQueue(fakeSocket());
    queue.start({ allowScreenEvidenceSnapshots: true });

    expect(await queue.enqueue(screenItem("same"))).toBe(true);
    expect(await queue.enqueue(screenItem("same"))).toBe(false);
    expect(queue.status().queued).toBe(1);
  });

  it("upgrades a duplicate queued routine frame when it becomes suspicious", async () => {
    const uploaded: string[] = [];
    const socket = fakeSocket(async (_eventName, payload: any) => {
      uploaded.push(`${payload.evidenceId}:${payload.priority}`);
    });
    const queue = new TelemetryUploadQueue(socket, () => 0);
    queue.start({ allowScreenEvidenceSnapshots: true, retryBaseMs: 1, retryMaxMs: 1, jitterRatio: 0 });

    expect(await queue.enqueue(screenItem("same", { priority: "routine" }))).toBe(true);
    expect(await queue.enqueue(screenItem("same", { priority: "suspicious" }))).toBe(true);
    await vi.advanceTimersByTimeAsync(1);

    expect(uploaded[0]).toBe("same:suspicious");
  });

  it("cancels pending retries during cleanup", async () => {
    const socket = fakeSocket(() => Promise.reject(new Error("offline")));
    const queue = new TelemetryUploadQueue(socket);
    queue.start({ allowScreenEvidenceSnapshots: true });
    await queue.enqueue(screenItem("one"));

    queue.stop();
    await vi.runOnlyPendingTimersAsync();

    expect(queue.status()).toMatchObject({ active: false, queued: 0 });
  });

  it("applies policy to routine camera snapshots", async () => {
    const queue = new TelemetryUploadQueue(fakeSocket());
    queue.start({ allowRoutineCameraSnapshots: false });

    expect(await queue.enqueue(cameraItem("blocked", 1000))).toBe(false);
    queue.start({ allowRoutineCameraSnapshots: true, cameraPreviewIntervalMs: 30000 });
    expect(await queue.enqueue(cameraItem("first", 1000))).toBe(true);
    expect(await queue.enqueue(cameraItem("too-soon", 2000))).toBe(false);
    expect(await queue.enqueue(cameraItem("later", 32000))).toBe(true);
  });

  it("uses a two second default camera cadence when routine snapshots are enabled", async () => {
    const queue = new TelemetryUploadQueue(fakeSocket());
    queue.start({ allowRoutineCameraSnapshots: true });

    expect(await queue.enqueue(cameraItem("first", 1000))).toBe(true);
    expect(await queue.enqueue(cameraItem("too-soon", 2500))).toBe(false);
    expect(await queue.enqueue(cameraItem("second", 3000))).toBe(true);
  });

  it("stops retrying after the configured maximum attempts", async () => {
    const socket = fakeSocket(() => Promise.reject(new Error("offline")));
    const queue = new TelemetryUploadQueue(socket, () => 0);
    queue.start({ allowScreenEvidenceSnapshots: true, maxAttempts: 1, retryBaseMs: 1, retryMaxMs: 1, jitterRatio: 0 });

    await queue.enqueue(screenItem("limited"));
    await vi.advanceTimersByTimeAsync(1);

    expect(queue.status().queued).toBe(0);
    expect(queue.status().failed).toBe(1);
    expect(queue.retryFailed()).toBe(1);
    expect(queue.status().queued).toBe(1);
  });

  it("does not enqueue telemetry before startup or after completion", async () => {
    const queue = new TelemetryUploadQueue(fakeSocket());

    expect(await queue.enqueue(screenItem("before"))).toBe(false);
    queue.start({ allowScreenEvidenceSnapshots: true });
    expect(await queue.enqueue(screenItem("during"))).toBe(true);
    queue.stop();
    expect(await queue.enqueue(screenItem("after"))).toBe(false);
  });

  it("slow upload does not prevent later captures from entering the bounded queue", async () => {
    let resolveUpload: any = null;
    const socket = fakeSocket(() => new Promise<void>((resolve) => {
      resolveUpload = resolve;
    }));
    const queue = new TelemetryUploadQueue(socket, () => 0);
    queue.start({ allowScreenEvidenceSnapshots: true, retryBaseMs: 1, retryMaxMs: 1, jitterRatio: 0, maxConcurrentUploads: 1 });

    await queue.enqueue(screenItem("first"));
    await vi.advanceTimersByTimeAsync(1);
    await queue.enqueue(screenItem("second"));

    expect(queue.status()).toMatchObject({ activeUploads: 1, queued: 1 });
    resolveUpload?.();
    await vi.advanceTimersByTimeAsync(1);
  });

  it("network recovery uploads pending evidence without duplication", async () => {
    let online = false;
    const uploaded: string[] = [];
    const socket = fakeSocket(async (_eventName, payload: any) => {
      if (!online) throw new Error("offline");
      uploaded.push(payload.evidenceId);
    });
    const queue = new TelemetryUploadQueue(socket, () => 0);
    queue.start({ allowScreenEvidenceSnapshots: true, retryBaseMs: 1, retryMaxMs: 1, jitterRatio: 0, maxAttempts: 3 });

    await queue.enqueue(screenItem("recover"));
    await vi.advanceTimersByTimeAsync(1);
    online = true;
    await vi.advanceTimersByTimeAsync(1);

    expect(uploaded).toEqual(["recover"]);
  });
});

function fakeSocket(emitImpl: (eventName: string, payload: Record<string, unknown>) => Promise<unknown> = () => Promise.resolve({ ok: true })) {
  return { emit: vi.fn(emitImpl) } as any;
}

function screenItem(id: string, overrides: Partial<Omit<ReturnType<typeof screenItemBase>, "priority">> & { priority?: "routine" | "suspicious" } = {}) {
  return { ...screenItemBase(id), ...overrides, payload: { ...screenItemBase(id).payload, ...(overrides as any).payload } };
}

function screenItemBase(id: string) {
  return {
    id,
    eventName: "screen_telemetry_uploaded" as const,
    sensitive: true,
    priority: "routine" as const,
    sizeBytes: 3,
    createdAt: Date.now(),
    payload: { examId: "exam", studentId: "student", evidenceId: id, base64: "data:image/jpeg;base64,abc" },
  };
}

function cameraItem(id: string, createdAt: number) {
  return {
    id,
    eventName: "camera_preview_updated" as const,
    sensitive: true,
    createdAt,
    payload: { examId: "exam", studentId: "student", previewBase64: "data:image/jpeg;base64,abc" },
  };
}
