import { CompressedFrame } from "./ImageProcessor";

export type CaptureMode = "PERIODIC" | "MANUAL" | "EVENT_TRIGGERED";

export interface PipelineFrame {
  frame: CompressedFrame;
  mode: CaptureMode;
  timestamp: number;
  sequenceNumber: number;
  captureStartedAt: number;
  captureCompletedAt: number;
  expectedIntervalMs: number;
  actualIntervalMs: number | null;
  driftMs: number;
  suspicious: boolean;
  priority: "routine" | "suspicious";
  suspiciousEventId?: string;
}

export class CapturePipeline {
  private circularQueue: PipelineFrame[] = [];
  private readonly MAX_QUEUE_SIZE = 5;
  private captureListeners: ((frame: PipelineFrame) => void)[] = [];
  
  // Timer scheduling
  private periodicTimerId: number | null = null;
  private isCapturing = false;
  private periodicActive = false;
  private sequenceNumber = 0;
  private expectedIntervalMs = 2000;
  private lastCaptureStartedAt: number | null = null;
  private suspiciousUntil = 0;
  private activeSuspiciousEventId = "";

  /**
   * Initialize and start periodic capture scheduling.
   *
   * @param intervalSeconds Configurable capture frequency (default 30s)
   * @param onTriggerCapture Callback that triggers the canvas grab
   */
  public startPeriodic(intervalSeconds: number, onTriggerCapture: () => Promise<void>) {
    this.stopPeriodic();

    const intervalMs = intervalSeconds * 1000;
    this.expectedIntervalMs = intervalMs;
    this.lastCaptureStartedAt = null;
    this.periodicActive = true;
    const runLoop = async () => {
      if (!this.periodicActive) return;
      const startedAt = Date.now();
      if (this.isCapturing) {
        this.periodicTimerId = window.setTimeout(runLoop, intervalMs);
        return;
      }
      this.isCapturing = true;
      try {
        await onTriggerCapture();
      } catch (err) {
        console.warn("[CapturePipeline] Periodic screenshot capture failed:", err);
      } finally {
        this.isCapturing = false;
        if (!this.periodicActive) return;
        const elapsed = Date.now() - startedAt;
        this.periodicTimerId = window.setTimeout(runLoop, Math.max(0, intervalMs - elapsed));
      }
    };
    this.periodicTimerId = window.setTimeout(runLoop, 0);
  }

  /**
   * Stop periodic capture scheduling.
   */
  public stopPeriodic() {
    this.periodicActive = false;
    if (this.periodicTimerId) {
      clearTimeout(this.periodicTimerId);
      this.periodicTimerId = null;
    }
    this.isCapturing = false;
  }

  /**
   * Feed a newly compressed frame into the queue and notify listeners.
   */
  public pushFrame(
    frame: CompressedFrame,
    mode: CaptureMode,
    timing: { captureStartedAt?: number; captureCompletedAt?: number } = {}
  ) {
    const captureStartedAt = timing.captureStartedAt || Date.now();
    const captureCompletedAt = timing.captureCompletedAt || Date.now();
    const actualIntervalMs = this.lastCaptureStartedAt == null ? null : captureStartedAt - this.lastCaptureStartedAt;
    const driftMs = actualIntervalMs == null ? 0 : actualIntervalMs - this.expectedIntervalMs;
    this.lastCaptureStartedAt = captureStartedAt;
    const suspicious = mode === "EVENT_TRIGGERED" || captureStartedAt <= this.suspiciousUntil;
    const pipelineFrame: PipelineFrame = {
      frame,
      mode,
      timestamp: captureCompletedAt,
      sequenceNumber: this.sequenceNumber++,
      captureStartedAt,
      captureCompletedAt,
      expectedIntervalMs: this.expectedIntervalMs,
      actualIntervalMs,
      driftMs,
      suspicious,
      priority: suspicious ? "suspicious" : "routine",
      suspiciousEventId: suspicious ? this.activeSuspiciousEventId || undefined : undefined,
    };

    // Maintain circular queue of size 5
    this.circularQueue.push(pipelineFrame);
    if (this.circularQueue.length > this.MAX_QUEUE_SIZE) {
      this.circularQueue.shift();
    }

    // Notify listeners (e.g. contexts, future AI modules)
    this.captureListeners.forEach((cb) => cb(pipelineFrame));
  }

  public markSuspiciousEvent(eventId = `suspicious-${Date.now()}`, preserveAfterMs = 8000) {
    const now = Date.now();
    this.activeSuspiciousEventId = eventId;
    this.suspiciousUntil = Math.max(this.suspiciousUntil, now + preserveAfterMs);
    this.circularQueue = this.circularQueue.map((frame) => ({
      ...frame,
      suspicious: true,
      priority: "suspicious",
      suspiciousEventId: frame.suspiciousEventId || eventId,
    }));
    this.captureListeners.forEach((cb) => {
      this.circularQueue.forEach((frame) => cb(frame));
    });
  }

  public isPeriodicActive() {
    return this.periodicActive;
  }

  public isSuspiciousActive() {
    return Date.now() <= this.suspiciousUntil;
  }

  public registerCaptureListener(callback: (frame: PipelineFrame) => void) {
    this.captureListeners.push(callback);
  }

  public unregisterCaptureListener(callback: (frame: PipelineFrame) => void) {
    this.captureListeners = this.captureListeners.filter((l) => l !== callback);
  }

  public getLatestFrames(): PipelineFrame[] {
    return [...this.circularQueue];
  }

  public clearQueue() {
    this.circularQueue = [];
    this.suspiciousUntil = 0;
    this.activeSuspiciousEventId = "";
  }
}
