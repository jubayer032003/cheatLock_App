import { isTauriAvailable } from "../utils/tauri";

export class CameraManager {
  /**
    * Request permission to access the webcam.
    */
  public static async requestPermission(): Promise<boolean> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      // Stop all tracks immediately after checking
      stream.getTracks().forEach((track) => track.stop());
      return true;
    } catch (err) {
      console.warn("[CameraManager] Permission denied:", err);
      return false;
    }
  }

  /**
    * Retrieve a list of all active webcam video input devices.
    */
  public static async enumerateWebcams(): Promise<MediaDeviceInfo[]> {
    try {
      // Ensure permissions exist before enumerating labels
      await this.requestPermission();
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.filter((device) => device.kind === "videoinput");
    } catch (err) {
      console.error("[CameraManager] Failed to list devices:", err);
      return [];
    }
  }

  /**
   * Load a camera MediaStream using custom constraints.
   */
  public static async getStream(deviceId?: string): Promise<MediaStream> {
    const constraints: MediaStreamConstraints = {
      video: {
        deviceId: deviceId ? { exact: deviceId } : undefined,
        width: { ideal: 640, max: 1280 },
        height: { ideal: 480, max: 720 },
        frameRate: { ideal: 30 },
      },
      audio: false, // Ensure audio is disabled inside this camera manager
    };

    try {
      return await navigator.mediaDevices.getUserMedia(constraints);
    } catch (err: any) {
      if (!isTauriAvailable()) {
        console.warn("[CameraManager] getUserMedia failed, using simulated camera fallback in browser mode:", err.message);
        return this.getMockStream();
      } else {
        console.error("[CameraManager] getUserMedia failed in native Tauri app:", err.message);
        throw new Error(`Webcam access failed: ${err.message}`);
      }
    }
  }

  /**
   * Generates a mock video track using a canvas with a simulated face movement.
   */
  private static getMockStream(): MediaStream {
    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 480;
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;

    let angle = 0;
    const drawFrame = () => {
      // Background fill
      ctx.fillStyle = "#0b0f19";
      ctx.fillRect(0, 0, 640, 480);

      // Grid background pattern
      ctx.strokeStyle = "rgba(139, 92, 246, 0.12)";
      ctx.lineWidth = 1;
      for (let i = 0; i < 640; i += 40) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i, 480);
        ctx.stroke();
      }
      for (let j = 0; j < 480; j += 40) {
        ctx.beginPath();
        ctx.moveTo(0, j);
        ctx.lineTo(640, j);
        ctx.stroke();
      }

      // Simulated Face position calculations
      const x = 320 + Math.sin(angle) * 35;
      const y = 240 + Math.cos(angle) * 15;
      angle += 0.04;

      // Draw head shape
      ctx.fillStyle = "rgba(139, 92, 246, 0.25)";
      ctx.strokeStyle = "#8b5cf6";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(x, y, 70, 95, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Eyes
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(x - 22, y - 20, 8, 0, Math.PI * 2);
      ctx.arc(x + 22, y - 20, 8, 0, Math.PI * 2);
      ctx.fill();

      // Pupils
      ctx.fillStyle = "#0b0f19";
      ctx.beginPath();
      ctx.arc(x - 22, y - 20, 3.5, 0, Math.PI * 2);
      ctx.arc(x + 22, y - 20, 3.5, 0, Math.PI * 2);
      ctx.fill();

      // Smile mouth shape
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.arc(x, y + 20, 20, 0.1 * Math.PI, 0.9 * Math.PI);
      ctx.stroke();

      // Text status indicator
      ctx.fillStyle = "#8b5cf6";
      ctx.font = "bold 11px monospace";
      ctx.fillText("SIMULATED PROCTORING FEED [NO WEBCAM]", 20, 30);

      requestAnimationFrame(drawFrame);
    };

    drawFrame();

    // Check for standard browser captureStream APIs
    if ((canvas as any).captureStream) {
      return (canvas as any).captureStream(30);
    } else if ((canvas as any).mozCaptureStream) {
      return (canvas as any).mozCaptureStream(30);
    }
    return new MediaStream();
  }
}
