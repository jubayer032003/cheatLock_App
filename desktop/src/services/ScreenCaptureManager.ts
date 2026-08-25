import { CapturePipeline } from "./CapturePipeline";
import { ImageProcessor } from "./ImageProcessor";
import { FIXED_CAPTURE_POLICY } from "../config/capturePolicy";
import { isTauriAvailable } from "../utils/tauri";
import { NativeDeviceService, type NativeCompressedScreenSample } from "./NativeDeviceService";

export type ScreenHealthStatus = "idle" | "capturing" | "permission_denied" | "disconnected" | "failed";

export class ScreenCaptureManager {
  private stream: MediaStream | null = null;
  private videoElement: HTMLVideoElement | null = null;
  private pipeline = new CapturePipeline();
  private nativeHealthIntervalId: number | null = null;
  private usingNativeCapture = false;
  
  private onHealthChange: ((status: ScreenHealthStatus) => void) | null = null;

  /**
   * Initialize screen capture stream and start periodic snapshot schedule.
   *
   * @param intervalSeconds Snapshot frequency in seconds
   * @param preferredFormat Image mime type format (image/webp or image/jpeg)
   */
  public async startCapture(
    intervalSeconds = FIXED_CAPTURE_POLICY.captureIntervalMs / 1000,
    preferredFormat = FIXED_CAPTURE_POLICY.preferredFormat
  ): Promise<boolean> {
    if (isTauriAvailable()) {
      return this.startNativeCapture(Math.round(intervalSeconds * 1000));
    }

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

      // Force play and confirm the stream produced readable video data.
      await this.videoElement.play();
      await waitForVideoFrame(this.videoElement, 1500);

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
    this.stopNativeHealthPolling();
    if (this.usingNativeCapture) {
      void NativeDeviceService.stopNativeScreenCapture();
      this.usingNativeCapture = false;
    }

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
    format = FIXED_CAPTURE_POLICY.preferredFormat
  ): Promise<void> {
    if (this.usingNativeCapture) {
      const sample = await NativeDeviceService.captureNativeScreenSample();
      if (!sample) {
        throw new Error("Native screen capture has not produced a sample yet.");
      }
      console.log(
        `[ScreenCaptureManager] Native screen sample (${mode}) seq=${sample.sequenceNumber} ${sample.width}x${sample.height} ${sample.encoding} bytes=${sample.sizeBytes}`
      );
      return;
    }

    if (!this.videoElement || !this.stream || !this.stream.active) {
      throw new Error("Screen capture stream is not active.");
    }

    const captureStartedAt = Date.now();
    await waitForVideoFrame(this.videoElement, 1500);

    const suspicious = mode === "EVENT_TRIGGERED" || this.pipeline.isSuspiciousActive();
    const compressed = await ImageProcessor.compress(
      this.videoElement,
      FIXED_CAPTURE_POLICY.maxFrameDimension,
      suspicious ? FIXED_CAPTURE_POLICY.suspiciousQuality : FIXED_CAPTURE_POLICY.normalQuality,
      format
    );
    this.pipeline.pushFrame(compressed, mode, { captureStartedAt, captureCompletedAt: Date.now() });
  }

  public getPipeline(): CapturePipeline {
    return this.pipeline;
  }

  public markSuspiciousEvidence(eventId?: string) {
    this.pipeline.markSuspiciousEvent(eventId, FIXED_CAPTURE_POLICY.suspiciousPostEventMs);
    if (this.usingNativeCapture) {
      void this.triggerSnapshot("EVENT_TRIGGERED").catch((error) => {
        console.warn("[ScreenCaptureManager] Native event snapshot failed:", error);
      });
    }
  }

  public setHealthCallback(callback: (status: ScreenHealthStatus) => void) {
    this.onHealthChange = callback;
  }

  public async captureNativeSample(): Promise<NativeCompressedScreenSample | null> {
    if (!this.usingNativeCapture) return null;
    return NativeDeviceService.captureNativeScreenSample();
  }

  private async startNativeCapture(sampleIntervalMs: number): Promise<boolean> {
    if (this.usingNativeCapture) {
      const status = await NativeDeviceService.getNativeScreenCaptureStatus();
      return status.state === "active";
    }

    try {
      this.stopCapture();
      await NativeDeviceService.startNativeScreenCapture({ sampleIntervalMs });
      const status = await NativeDeviceService.getNativeScreenCaptureStatus();
      if (status.state !== "active") {
        this.notifyHealth(status.state === "failed" ? "failed" : "disconnected");
        return false;
      }
      this.usingNativeCapture = true;
      this.startNativeHealthPolling();
      this.notifyHealth("capturing");
      return true;
    } catch (error) {
      console.error("[ScreenCaptureManager] Native screen capture failed:", error);
      this.usingNativeCapture = false;
      this.notifyHealth("failed");
      return false;
    }
  }

  private startNativeHealthPolling() {
    this.stopNativeHealthPolling();
    this.nativeHealthIntervalId = window.setInterval(async () => {
      try {
        const status = await NativeDeviceService.getNativeScreenCaptureStatus();
        if (status.state === "active") {
          this.notifyHealth("capturing");
        } else if (status.state === "idle" || status.state === "stopping") {
          this.notifyHealth("idle");
        } else {
          this.notifyHealth(status.state === "failed" ? "failed" : "disconnected");
        }
      } catch (error) {
        console.warn("[ScreenCaptureManager] Native screen status polling failed:", error);
        this.notifyHealth("failed");
      }
    }, 2000);
  }

  private stopNativeHealthPolling() {
    if (this.nativeHealthIntervalId) {
      clearInterval(this.nativeHealthIntervalId);
      this.nativeHealthIntervalId = null;
    }
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

function waitForVideoFrame(videoElement: HTMLVideoElement, timeoutMs: number): Promise<void> {
  if (videoElement.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error("Screen capture did not produce a readable frame."));
    }, timeoutMs);

    const onLoadedData = () => {
      cleanup();
      resolve();
    };

    const onError = () => {
      cleanup();
      reject(new Error("Screen capture video element failed."));
    };

    const cleanup = () => {
      window.clearTimeout(timeout);
      videoElement.removeEventListener("loadeddata", onLoadedData);
      videoElement.removeEventListener("error", onError);
    };

    videoElement.addEventListener("loadeddata", onLoadedData, { once: true });
    videoElement.addEventListener("error", onError, { once: true });
  });
}
