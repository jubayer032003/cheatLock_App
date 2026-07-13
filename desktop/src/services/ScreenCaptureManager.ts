import { CapturePipeline } from "./CapturePipeline";
import { ImageProcessor } from "./ImageProcessor";

export type ScreenHealthStatus = "idle" | "capturing" | "permission_denied" | "disconnected";

export class ScreenCaptureManager {
  private stream: MediaStream | null = null;
  private videoElement: HTMLVideoElement | null = null;
  private pipeline = new CapturePipeline();
  
  private onHealthChange: ((status: ScreenHealthStatus) => void) | null = null;

  /**
   * Initialize screen capture stream and start periodic snapshot schedule.
   *
   * @param intervalSeconds Snapshot frequency in seconds
   * @param preferredFormat Image mime type format (image/webp or image/jpeg)
   */
  public async startCapture(
    intervalSeconds = 30,
    preferredFormat = "image/jpeg"
  ): Promise<boolean> {
    // Guard: if already capturing with an active stream, skip re-requesting permission
    if (this.stream?.active) {
      return true;
    }

    try {
      this.stopCapture();

      // Native browser display stream selection
      this.stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          displaySurface: "monitor", // Ask browser/OS to prioritize monitor select
        },
        audio: false,
      });

      // Register listener for user cancelling stream at OS level
      const videoTrack = this.stream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.onended = () => {
          this.handleDisconnect();
        };
      }

      // Construct offscreen video receiver tag
      this.videoElement = document.createElement("video");
      this.videoElement.autoplay = true;
      this.videoElement.playsInline = true;
      this.videoElement.muted = true;
      this.videoElement.srcObject = this.stream;

      // Force play to ensure browser starts pulling frames
      this.videoElement.play().catch((e) => {
        console.warn("[ScreenCapture] Offscreen play initialization failed:", e);
      });

      // Start capture timer loop
      this.pipeline.startPeriodic(intervalSeconds, async () => {
        await this.triggerSnapshot("PERIODIC", preferredFormat);
      });

      this.notifyHealth("capturing");
      return true;
    } catch (err) {
      this.notifyHealth("permission_denied");
      return false;
    }
  }

  /**
   * Stop monitoring loops and release video tags and media streams.
   */
  public stopCapture() {
    this.pipeline.stopPeriodic();
    this.pipeline.clearQueue();

    if (this.videoElement) {
      this.videoElement.srcObject = null;
      this.videoElement.remove();
      this.videoElement = null;
    }

    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }

    this.notifyHealth("idle");
  }

  /**
   * Force capture a frame immediately.
   */
  public async triggerSnapshot(
    mode: "PERIODIC" | "MANUAL" | "EVENT_TRIGGERED",
    format = "image/jpeg"
  ): Promise<void> {
    if (!this.videoElement || !this.stream || !this.stream.active) {
      throw new Error("Screen capture stream is not active.");
    }

    // Wait until video has loaded frames with a 1.5s timeout safety race to prevent infinite loading hangs
    if (this.videoElement.readyState < 2) {
      await Promise.race([
        new Promise<void>((resolve) => {
          if (this.videoElement) {
            this.videoElement.onloadeddata = () => resolve();
          }
        }),
        new Promise<void>((resolve) => setTimeout(resolve, 1500))
      ]);
    }

    const compressed = await ImageProcessor.compress(this.videoElement, 1280, 0.6, format);
    this.pipeline.pushFrame(compressed, mode);
  }

  public getPipeline(): CapturePipeline {
    return this.pipeline;
  }

  public setHealthCallback(callback: (status: ScreenHealthStatus) => void) {
    this.onHealthChange = callback;
  }

  private handleDisconnect() {
    this.notifyHealth("disconnected");
    this.stopCapture();
  }

  private notifyHealth(status: ScreenHealthStatus) {
    if (this.onHealthChange) {
      this.onHealthChange(status);
    }
  }
}

export const screenCaptureManager = new ScreenCaptureManager();
