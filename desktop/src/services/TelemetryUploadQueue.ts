import { SecureStorageService } from "./SecureStorageService";
import { SocketService } from "../socket/service";
import { FIXED_CAPTURE_POLICY } from "../config/capturePolicy";

export type TelemetryEventName =
  | "camera_preview_updated"
  | "screen_telemetry_uploaded"
  | "student_heartbeat";

export interface TelemetryPolicy {
  cameraPreviewIntervalMs: number;
  heartbeatIntervalMs: number;
  allowRoutineCameraSnapshots: boolean;
  allowScreenEvidenceSnapshots: boolean;
  maxOfflineEvents: number;
  maxQueueItems: number;
  maxQueueBytes: number;
  maxFrameBytes: number;
  maxConcurrentUploads: number;
  retryBaseMs: number;
  retryMaxMs: number;
  maxAttempts: number;
  jitterRatio: number;
}

export interface TelemetryQueueItem {
  id: string;
  eventName: TelemetryEventName;
  payload: Record<string, unknown>;
  sensitive: boolean;
  priority?: "routine" | "suspicious";
  sizeBytes?: number;
  createdAt: number;
  attempts: number;
  status: "pending" | "uploading" | "uploaded" | "failed";
}

const DEFAULT_POLICY: TelemetryPolicy = {
  cameraPreviewIntervalMs: 2000,
  heartbeatIntervalMs: 30000,
  allowRoutineCameraSnapshots: false,
  allowScreenEvidenceSnapshots: true,
  maxOfflineEvents: FIXED_CAPTURE_POLICY.maxQueueItems,
  maxQueueItems: FIXED_CAPTURE_POLICY.maxQueueItems,
  maxQueueBytes: FIXED_CAPTURE_POLICY.maxQueueBytes,
  maxFrameBytes: FIXED_CAPTURE_POLICY.maxFrameBytes,
  maxConcurrentUploads: FIXED_CAPTURE_POLICY.maxConcurrentUploads,
  retryBaseMs: 1000,
  retryMaxMs: 30000,
  maxAttempts: 5,
  jitterRatio: 0.25,
};

export class TelemetryUploadQueue {
  private active = false;
  private policy: TelemetryPolicy = DEFAULT_POLICY;
  private queue: TelemetryQueueItem[] = [];
  private seenIds = new Set<string>();
  private failedItems: TelemetryQueueItem[] = [];
  private retryTimer: number | null = null;
  private heartbeatTimer: number | null = null;
  private lastCameraUploadAt: number | null = null;
  private activeUploads = 0;
  private droppedEvidence: { id: string; reason: string; priority: "routine" | "suspicious"; sizeBytes: number }[] = [];

  public constructor(
    private readonly socket = SocketService.getInstance(),
    private readonly random = Math.random
  ) {}

  public start(policy: Partial<TelemetryPolicy> = {}) {
    this.policy = { ...DEFAULT_POLICY, ...policy };
    this.active = true;
    this.startHeartbeat();
  }

  public stop() {
    this.active = false;
    if (this.retryTimer) window.clearTimeout(this.retryTimer);
    if (this.heartbeatTimer) window.clearInterval(this.heartbeatTimer);
    this.retryTimer = null;
    this.heartbeatTimer = null;
    this.queue = [];
    this.seenIds.clear();
  }

  public status() {
    return {
      active: this.active,
      queued: this.queue.length,
      queueBytes: this.queueBytes(),
      failed: this.failedItems.length,
      dropped: this.droppedEvidence.length,
      activeUploads: this.activeUploads,
      degraded: this.queue.length > 0,
    };
  }

  public retryFailed() {
    if (!this.active || this.failedItems.length === 0) return 0;
    const retryable = this.failedItems.splice(0).map((item) => ({
      ...item,
      attempts: 0,
      status: "pending" as const,
    }));
    this.queue.push(...retryable);
    this.sortQueue();
    this.boundQueue();
    this.flush();
    return retryable.length;
  }

  public async enqueue(item: Omit<TelemetryQueueItem, "attempts" | "status">): Promise<boolean> {
    if (!this.active) return false;
    if (this.seenIds.has(item.id)) {
      return this.upgradeExistingItem(item);
    }
    if (!this.allowedByPolicy(item)) return false;

    this.seenIds.add(item.id);
    this.queue.push(this.normalizeItem({ ...item, attempts: 0, status: "pending" }));
    this.sortQueue();
    this.boundQueue();
    await this.persistSensitiveQueue();
    this.flush();
    return true;
  }

  public async flushPending(required = false): Promise<void> {
    if (!this.active) {
      if (required && this.queue.length > 0) throw new Error("Telemetry upload worker is not active.");
      return;
    }
    if (this.retryTimer) {
      window.clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    while (this.queue.length > 0) {
      const beforeAttempts = this.queue[0].attempts;
      await this.flushOne();
      if (this.queue.length > 0 && this.queue[0].attempts > beforeAttempts) {
        if (required) throw new Error("Required monitoring events could not be flushed.");
        return;
      }
    }
  }

  public computeRetryDelay(attempts: number) {
    const exponential = Math.min(this.policy.retryMaxMs, this.policy.retryBaseMs * 2 ** Math.max(0, attempts));
    const jitter = exponential * this.policy.jitterRatio * this.random();
    return Math.round(exponential + jitter);
  }

  private flush() {
    if (!this.active || this.retryTimer || this.queue.length === 0 || this.activeUploads >= this.policy.maxConcurrentUploads) return;
    this.retryTimer = window.setTimeout(async () => {
      this.retryTimer = null;
      while (this.active && this.activeUploads < this.policy.maxConcurrentUploads && this.queue.length > 0) {
        void this.flushOne();
      }
    }, this.computeRetryDelay(this.queue[0].attempts));
  }

  private async flushOne() {
    const item = this.queue.shift();
    if (!item) return;
    this.activeUploads += 1;
    try {
      item.status = "uploading";
      const uploadStartedAt = new Date().toISOString();
      await this.socket.emit(item.eventName, {
        ...item.payload,
        priority: item.priority,
        sizeBytes: item.sizeBytes,
        idempotencyKey: item.payload.idempotencyKey || item.id,
        uploadStartedAt,
        uploadCompletedAt: new Date().toISOString(),
      });
      item.status = "uploaded";
      await this.persistSensitiveQueue();
    } catch {
      item.attempts += 1;
      if (item.attempts >= this.policy.maxAttempts) {
        item.status = "failed";
        this.failedItems = [...this.failedItems, item].slice(-10);
        this.recordDrop(item, "max_attempts_exceeded");
      } else {
        item.status = "pending";
        this.queue.push(item);
        this.sortQueue();
      }
    } finally {
      this.activeUploads = Math.max(0, this.activeUploads - 1);
      if (this.queue.length > 0) this.flush();
    }
  }

  private allowedByPolicy(item: Omit<TelemetryQueueItem, "attempts" | "status">) {
    const sizeBytes = item.sizeBytes ?? this.estimateItemBytes(item);
    const priority = item.priority || (Boolean(item.payload.suspicious) ? "suspicious" : "routine");
    if (sizeBytes > this.policy.maxFrameBytes) {
      if (priority !== "suspicious") {
        this.recordDrop({ ...item, attempts: 0, status: "failed", priority, sizeBytes }, "routine_frame_too_large");
        return false;
      }
      console.warn("[TelemetryUploadQueue] Suspicious evidence exceeds maxFrameBytes and is retained.", {
        id: item.id,
        sizeBytes,
        maxFrameBytes: this.policy.maxFrameBytes,
      });
    }
    if (item.eventName === "camera_preview_updated") {
      if (!this.policy.allowRoutineCameraSnapshots) return false;
      if (this.lastCameraUploadAt !== null && item.createdAt - this.lastCameraUploadAt < this.policy.cameraPreviewIntervalMs) {
        return false;
      }
      this.lastCameraUploadAt = item.createdAt;
    }
    if (item.eventName === "screen_telemetry_uploaded" && !this.policy.allowScreenEvidenceSnapshots) {
      return false;
    }
    return true;
  }

  private boundQueue() {
    const maxItems = Math.min(this.policy.maxOfflineEvents, this.policy.maxQueueItems);
    while (this.queue.length > maxItems || this.queueBytes() > this.policy.maxQueueBytes) {
      const dropIndex = this.findOldestRoutineIndex();
      if (dropIndex === -1) {
        console.warn("[TelemetryUploadQueue] Queue limit exceeded with suspicious evidence retained.", {
          queued: this.queue.length,
          queueBytes: this.queueBytes(),
        });
        break;
      }
      const [dropped] = this.queue.splice(dropIndex, 1);
      if (dropped) this.recordDrop(dropped, "queue_limit_oldest_routine");
    }
  }

  private normalizeItem(item: TelemetryQueueItem): TelemetryQueueItem {
    const sizeBytes = item.sizeBytes ?? this.estimateItemBytes(item);
    return {
      ...item,
      priority: item.priority || (Boolean(item.payload.suspicious) ? "suspicious" : "routine"),
      sizeBytes,
    };
  }

  private upgradeExistingItem(item: Omit<TelemetryQueueItem, "attempts" | "status">) {
    const index = this.queue.findIndex((queued) => queued.id === item.id);
    if (index === -1) return false;
    const existing = this.queue[index];
    if (existing.priority === "suspicious" || item.priority !== "suspicious") return false;
    this.queue[index] = this.normalizeItem({
      ...existing,
      ...item,
      attempts: existing.attempts,
      status: existing.status,
      priority: "suspicious",
    });
    this.sortQueue();
    return true;
  }

  private sortQueue() {
    this.queue.sort((a, b) => {
      if (a.priority !== b.priority) return a.priority === "suspicious" ? -1 : 1;
      return a.createdAt - b.createdAt;
    });
  }

  private findOldestRoutineIndex() {
    let oldestIndex = -1;
    let oldestCreatedAt = Number.POSITIVE_INFINITY;
    this.queue.forEach((item, index) => {
      if (item.priority === "suspicious") return;
      if (item.createdAt < oldestCreatedAt) {
        oldestCreatedAt = item.createdAt;
        oldestIndex = index;
      }
    });
    return oldestIndex;
  }

  private queueBytes() {
    return this.queue.reduce((sum, item) => sum + (item.sizeBytes || 0), 0);
  }

  private estimateItemBytes(item: Pick<TelemetryQueueItem, "payload" | "sizeBytes">) {
    if (item.sizeBytes != null) return item.sizeBytes;
    const explicit = Number(item.payload.sizeBytes);
    if (Number.isFinite(explicit) && explicit > 0) return explicit;
    const media = String(item.payload.base64 || item.payload.previewBase64 || "");
    if (media) return Math.ceil((media.length * 3) / 4);
    return Math.max(256, JSON.stringify(item.payload).length);
  }

  private recordDrop(item: TelemetryQueueItem, reason: string) {
    const priority = item.priority || "routine";
    const entry = { id: item.id, reason, priority, sizeBytes: item.sizeBytes || 0 };
    this.droppedEvidence = [...this.droppedEvidence, entry].slice(-100);
    console.warn("[TelemetryUploadQueue] Evidence dropped.", entry);
  }

  private startHeartbeat() {
    if (this.heartbeatTimer) window.clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = window.setInterval(() => {
      if (!this.active) return;
      void this.enqueue({
        id: `heartbeat-${Date.now()}`,
        eventName: "student_heartbeat",
        payload: { occurredAt: new Date().toISOString() },
        sensitive: false,
        createdAt: Date.now(),
      });
    }, this.policy.heartbeatIntervalMs);
  }

  private async persistSensitiveQueue() {
    const sensitive = this.queue.filter((item) => item.sensitive);
    if (sensitive.length === 0) {
      await SecureStorageService.delete("cheatlock.telemetry.sensitive_queue");
      return;
    }
    await SecureStorageService.set("cheatlock.telemetry.sensitive_queue", JSON.stringify(sensitive));
  }
}

export const telemetryUploadQueue = new TelemetryUploadQueue();
