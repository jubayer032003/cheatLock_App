export interface ImageFrame {
  width: number;
  height: number;
  data: ImageData;
  timestamp: number;
}

export class FramePipeline {
  private videoEl: HTMLVideoElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;

  // Offscreen Downsampled Telemetry Canvas
  private telemetryCanvas: HTMLCanvasElement | null = null;
  private telemetryCtx: CanvasRenderingContext2D | null = null;

  // Circular Frame Queue
  private queue: ImageFrame[] = [];
  private readonly QUEUE_SIZE = 5;
  private writeIdx = 0;

  // Schedulers
  private captureIntervalId: number | null = null;
  private telemetryIntervalId: number | null = null;
  private telemetryTimerId: number | null = null;
  private telemetryActive = false;
  private telemetryCapturing = false;
  private telemetrySequenceNumber = 0;
  private lastCaptureTime = 0;
  private measuredFps = 0;
  private frameCount = 0;
  private fpsCalcIntervalId: number | null = null;

  // Listeners
  private aiListeners: ((frame: ImageFrame) => void)[] = [];
  private telemetryListeners: ((base64Jpeg: string, metadata: { capturedAt: number; sequenceNumber: number }) => void)[] = [];

  public start(videoEl: HTMLVideoElement, telemetryIntervalMs = 2000) {
    this.videoEl = videoEl;
    this.canvas = document.createElement("canvas");
    this.ctx = this.canvas.getContext("2d", { willReadFrequently: true });

    // Initialize telemetry downsampling canvas of size 320x240
    this.telemetryCanvas = document.createElement("canvas");
    this.telemetryCanvas.width = 320;
    this.telemetryCanvas.height = 240;
    this.telemetryCtx = this.telemetryCanvas.getContext("2d");

    this.queue = [];
    this.writeIdx = 0;
    this.lastCaptureTime = Date.now();
    this.frameCount = 0;
    this.measuredFps = 0;

    // Start FPS metrics loop
    this.fpsCalcIntervalId = window.setInterval(() => {
      this.measuredFps = this.frameCount;
      this.frameCount = 0;
    }, 1000);

    // AI Frame Capture Loop (10 FPS -> every 100ms)
    this.captureIntervalId = window.setInterval(() => {
      this.captureFrame();
    }, 100);

    // Telemetry Event Loop: low-frequency by default. Local analysis stays on
    // the high-frequency capture loop; media upload should be policy-controlled.
    this.startTelemetryLoop(telemetryIntervalMs);
  }

  public stop() {
    if (this.captureIntervalId) {
      clearInterval(this.captureIntervalId);
      this.captureIntervalId = null;
    }
    if (this.telemetryIntervalId) {
      clearInterval(this.telemetryIntervalId);
      this.telemetryIntervalId = null;
    }
    if (this.telemetryTimerId) {
      clearTimeout(this.telemetryTimerId);
      this.telemetryTimerId = null;
    }
    this.telemetryActive = false;
    this.telemetryCapturing = false;
    if (this.fpsCalcIntervalId) {
      clearInterval(this.fpsCalcIntervalId);
      this.fpsCalcIntervalId = null;
    }

    this.videoEl = null;
    this.canvas = null;
    this.ctx = null;
    this.telemetryCanvas = null;
    this.telemetryCtx = null;
    this.queue = [];
  }

  public registerAiListener(callback: (frame: ImageFrame) => void) {
    this.aiListeners.push(callback);
  }

  public unregisterAiListener(callback: (frame: ImageFrame) => void) {
    this.aiListeners = this.aiListeners.filter((l) => l !== callback);
  }

  public registerTelemetryListener(callback: (base64Jpeg: string, metadata: { capturedAt: number; sequenceNumber: number }) => void) {
    this.telemetryListeners.push(callback);
  }

  public unregisterTelemetryListener(callback: (base64Jpeg: string, metadata: { capturedAt: number; sequenceNumber: number }) => void) {
    this.telemetryListeners = this.telemetryListeners.filter((l) => l !== callback);
  }

  public getCanvas(): HTMLCanvasElement | null {
    return this.canvas;
  }

  public getFps(): number {
    return this.measuredFps;
  }

  public getResolution(): { width: number; height: number } {
    if (this.videoEl) {
      return {
        width: this.videoEl.videoWidth,
        height: this.videoEl.videoHeight,
      };
    }
    return { width: 0, height: 0 };
  }

  public getLatestFrame(): ImageFrame | null {
    if (this.queue.length === 0) return null;
    const readIdx = (this.writeIdx - 1 + this.QUEUE_SIZE) % this.QUEUE_SIZE;
    return this.queue[readIdx] || null;
  }

  private captureFrame() {
    if (!this.videoEl || !this.canvas || !this.ctx) return;
    if (this.videoEl.readyState < this.videoEl.HAVE_CURRENT_DATA) return;

    const width = this.videoEl.videoWidth;
    const height = this.videoEl.videoHeight;
    if (width === 0 || height === 0) return;

    this.canvas.width = width;
    this.canvas.height = height;

    this.ctx.drawImage(this.videoEl, 0, 0, width, height);
    this.frameCount++;
    this.lastCaptureTime = Date.now();

    try {
      const imgData = this.ctx.getImageData(0, 0, width, height);
      const frame: ImageFrame = {
        width,
        height,
        data: imgData,
        timestamp: this.lastCaptureTime,
      };

      if (this.queue.length < this.QUEUE_SIZE) {
        this.queue.push(frame);
      } else {
        this.queue[this.writeIdx] = frame;
      }
      this.writeIdx = (this.writeIdx + 1) % this.QUEUE_SIZE;

      this.aiListeners.forEach((l) => l(frame));
    } catch (err) {
      console.warn("[FramePipeline] Canvas capture aborted (secure container constraints):", err);
    }
  }

  private startTelemetryLoop(intervalMs: number) {
    this.telemetryActive = true;
    const runLoop = () => {
      if (!this.telemetryActive) return;
      const startedAt = Date.now();
      if (!this.telemetryCapturing) {
        this.telemetryCapturing = true;
        try {
          this.dispatchTelemetryFrame();
        } finally {
          this.telemetryCapturing = false;
        }
      }
      if (!this.telemetryActive) return;
      const elapsed = Date.now() - startedAt;
      this.telemetryTimerId = window.setTimeout(runLoop, Math.max(0, intervalMs - elapsed));
    };
    this.telemetryTimerId = window.setTimeout(runLoop, 0);
  }

  private dispatchTelemetryFrame() {
    if (!this.canvas || !this.telemetryCanvas || !this.telemetryCtx || !this.videoEl) return;
    if (this.videoEl.readyState < this.videoEl.HAVE_CURRENT_DATA) return;

    try {
      // Scale high-resolution frames to a reviewable 16:9 preview without upscaling.
      const targetWidth = Math.min(1280, this.canvas.width);
      const targetHeight = Math.min(720, Math.round((targetWidth * this.canvas.height) / this.canvas.width));
      this.telemetryCanvas.width = targetWidth;
      this.telemetryCanvas.height = targetHeight;
      this.telemetryCtx.drawImage(
        this.canvas,
        0,
        0,
        this.canvas.width,
        this.canvas.height,
        0,
        0,
        targetWidth,
        targetHeight
      );
      const capturedAt = Date.now();
      const base64 = this.telemetryCanvas.toDataURL("image/jpeg", 0.8);
      const metadata = { capturedAt, sequenceNumber: this.telemetrySequenceNumber++ };
      this.telemetryListeners.forEach((l) => l(base64, metadata));
    } catch {}
  }

  public getLastCaptureTime(): number {
    return this.lastCaptureTime;
  }
}
