import { CompressedFrame } from "./ImageProcessor";

export type CaptureMode = "PERIODIC" | "MANUAL" | "EVENT_TRIGGERED";

export interface PipelineFrame {
  frame: CompressedFrame;
  mode: CaptureMode;
  timestamp: number;
}

export class CapturePipeline {
  private circularQueue: PipelineFrame[] = [];
  private readonly MAX_QUEUE_SIZE = 5;
  private captureListeners: ((frame: PipelineFrame) => void)[] = [];
  
  // Timer scheduling
  private periodicIntervalId: number | null = null;
  private isCapturing = false;

  /**
   * Initialize and start periodic capture scheduling.
   *
   * @param intervalSeconds Configurable capture frequency (default 30s)
   * @param onTriggerCapture Callback that triggers the canvas grab
   */
  public startPeriodic(intervalSeconds: number, onTriggerCapture: () => Promise<void>) {
    this.stopPeriodic();

    const intervalMs = intervalSeconds * 1000;
    this.periodicIntervalId = window.setInterval(async () => {
      if (this.isCapturing) return;
      this.isCapturing = true;
      try {
        await onTriggerCapture();
      } catch (err) {
        console.warn("[CapturePipeline] Periodic screenshot capture failed:", err);
      } finally {
        this.isCapturing = false;
      }
    }, intervalMs);
  }

  /**
   * Stop periodic capture scheduling.
   */
  public stopPeriodic() {
    if (this.periodicIntervalId) {
      clearInterval(this.periodicIntervalId);
      this.periodicIntervalId = null;
    }
  }

  /**
   * Feed a newly compressed frame into the queue and notify listeners.
   */
  public pushFrame(frame: CompressedFrame, mode: CaptureMode) {
    const pipelineFrame: PipelineFrame = {
      frame,
      mode,
      timestamp: Date.now(),
    };

    // Maintain circular queue of size 5
    this.circularQueue.push(pipelineFrame);
    if (this.circularQueue.length > this.MAX_QUEUE_SIZE) {
      this.circularQueue.shift();
    }

    // Notify listeners (e.g. contexts, future AI modules)
    this.captureListeners.forEach((cb) => cb(pipelineFrame));
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
  }
}
