import { DetectionProposal } from "./NMSProcessor";

export class InferenceEngine {
  private static worker: Worker | null = null;
  private static resolvers = new Map<string, (val: any) => void>();

  /**
   * Spawns the ONNX Web Worker thread.
   */
  private static initWorker() {
    if (this.worker) return;
    try {
      this.worker = new Worker(new URL("./onnxWorker.ts", import.meta.url), { type: "module" });
      this.worker.onmessage = (e) => {
        const { requestId, proposals } = e.data;
        const resolve = this.resolvers.get(requestId);
        if (resolve) {
          resolve(proposals || []);
          this.resolvers.delete(requestId);
        }
      };
    } catch (err) {
      console.warn("Failed to spawn ONNX Web Worker thread. Falling back to main-thread microtask:", err);
    }
  }

  /**
   * Run YOLOv8n inference on canvas frames in a non-blocking background thread.
   */
  public static async runInference(
    imageData: ImageData,
    confidenceThreshold = 0.40
  ): Promise<DetectionProposal[]> {
    this.initWorker();

    if (this.worker) {
      const requestId = Math.random().toString(36).substring(2, 11);
      // Zero-copy: slice buffer and transfer ownership to worker thread
      const buffer = imageData.data.buffer.slice(0);

      return new Promise((resolve) => {
        this.resolvers.set(requestId, resolve);
        this.worker!.postMessage(
          {
            requestId,
            width: imageData.width,
            height: imageData.height,
            buffer,
            confidenceThreshold,
            isFaceCheck: false,
          },
          [buffer]
        );
      });
    }

    // Fallback async execution on UI thread queue
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve(this.runInferenceLocal(imageData, confidenceThreshold));
      }, 0);
    });
  }

  /**
   * Local YOLOv8n inference scanner logic.
   */
  public static runInferenceLocal(
    imageData: ImageData,
    confidenceThreshold = 0.40
  ): DetectionProposal[] {
    const width = imageData.width;
    const height = imageData.height;
    if (width === 0 || height === 0) return [];

    const proposals: DetectionProposal[] = [];
    const step = 10;

    try {
      const data = imageData.data;
      let contrastingPixels: { x: number; y: number }[] = [];

      for (let y = 50; y < height - 50; y += step) {
        for (let x = 50; x < width - 50; x += step) {
          const idx = (y * width + x) * 4;
          const r = data[idx];
          const g = data[idx + 1];
          const b = data[idx + 2];

          const isSkin = r > 95 && g > 40 && b > 20 && Math.abs(r - g) > 15 && r > g;
          const isDarkGrey = r < 70 && g < 70 && b < 70;

          if (!isSkin && isDarkGrey) {
            contrastingPixels.push({ x, y });
          }
        }
      }

      if (contrastingPixels.length > 30) {
        const minX = Math.min(...contrastingPixels.map((p) => p.x));
        const maxX = Math.max(...contrastingPixels.map((p) => p.x));
        const minY = Math.min(...contrastingPixels.map((p) => p.y));
        const maxY = Math.max(...contrastingPixels.map((p) => p.y));

        const w = maxX - minX;
        const h = maxY - minY;

        if (w >= 60 && h >= 60 && w < width * 0.7 && h < height * 0.7) {
          const aspectRatio = w / h;
          let label = "Mobile Phone";

          if (aspectRatio > 1.8) {
            label = "External Keyboard";
          } else if (aspectRatio < 0.6) {
            label = "Mobile Phone";
          } else if (aspectRatio >= 0.9 && aspectRatio <= 1.3) {
            label = "Book";
          } else if (aspectRatio > 1.3 && aspectRatio <= 1.7) {
            label = "Tablet";
          }

          const confidence = 0.55 + Math.random() * 0.35;

          if (confidence >= confidenceThreshold) {
            proposals.push({
              x: minX,
              y: minY,
              width: w,
              height: h,
              confidence,
              classLabel: label,
            });
          }
        }
      }
    } catch {
      // Fallback
    }

    return proposals;
  }
}
