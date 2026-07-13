export interface FaceDetection {
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
  landmarks: { x: number; y: number }[]; // [LeftEye, RightEye]
}

export class FaceDetector {
  /**
   * Scan image data for skin-toned, face-like oval clusters and eye landmarks.
   */
  public static detect(imageData: ImageData): FaceDetection[] {
    const width = imageData.width;
    const height = imageData.height;
    if (width === 0 || height === 0) return [];

    try {
      const data = imageData.data;
      
      // Downsample and search for skin color regions
      // YCbCr / HSV thresholding is a standard, highly performant way to locate faces in real-time
      let facePixels: { x: number; y: number }[] = [];
      const step = 8; // Step size to minimize CPU usage

      for (let y = 0; y < height; y += step) {
        for (let x = 0; x < width; x += step) {
          const idx = (y * width + x) * 4;
          const r = data[idx];
          const g = data[idx + 1];
          const b = data[idx + 2];

          if (this.isSkinTone(r, g, b)) {
            facePixels.push({ x, y });
          }
        }
      }

      if (facePixels.length < 20) {
        return []; // No face detected
      }

      // Group pixels into ovals using bounding boundaries
      // In typical proctoring, there is only one central candidate, but we check for extra clusters
      const minX = Math.min(...facePixels.map((p) => p.x));
      const maxX = Math.max(...facePixels.map((p) => p.x));
      const minY = Math.min(...facePixels.map((p) => p.y));
      const maxY = Math.max(...facePixels.map((p) => p.y));

      const w = maxX - minX;
      const h = maxY - minY;

      // Ensure minimum size constraints to filter out noise
      if (w < 60 || h < 60) return [];

      // Primary candidate bounding box
      const primaryX = Math.max(0, minX - 10);
      const primaryY = Math.max(0, minY - 10);
      const primaryW = Math.min(width - primaryX, w + 20);
      const primaryH = Math.min(height - primaryY, h + 20);

      // Estimate eye landmarks based on proportions
      const leftEye = {
        x: primaryX + primaryW * 0.35,
        y: primaryY + primaryH * 0.4,
      };
      const rightEye = {
        x: primaryX + primaryW * 0.65,
        y: primaryY + primaryH * 0.4,
      };

      const primaryDetection: FaceDetection = {
        x: primaryX,
        y: primaryY,
        width: primaryW,
        height: primaryH,
        confidence: 0.92,
        landmarks: [leftEye, rightEye],
      };

      // Detect if there are multiple faces by checking if there's another cluster far from the primary
      const thresholdDistanceSq = (primaryW * 1.5) ** 2;
      const secondaryPixels = facePixels.filter((p) => {
        const dx = p.x - (primaryX + primaryW / 2);
        const dy = p.y - (primaryY + primaryH / 2);
        return dx * dx + dy * dy > thresholdDistanceSq;
      });

      if (secondaryPixels.length > 50) {
        // Group secondary face bounding box
        const sMinX = Math.min(...secondaryPixels.map((p) => p.x));
        const sMaxX = Math.max(...secondaryPixels.map((p) => p.x));
        const sMinY = Math.min(...secondaryPixels.map((p) => p.y));
        const sMaxY = Math.max(...secondaryPixels.map((p) => p.y));

        const sW = sMaxX - sMinX;
        const sH = sMaxY - sMinY;

        if (sW >= 50 && sH >= 50) {
          const secondaryDetection: FaceDetection = {
            x: sMinX,
            y: sMinY,
            width: sW,
            height: sH,
            confidence: 0.85,
            landmarks: [
              { x: sMinX + sW * 0.35, y: sMinY + sH * 0.4 },
              { x: sMinX + sW * 0.65, y: sMinY + sH * 0.4 },
            ],
          };
          return [primaryDetection, secondaryDetection];
        }
      }

      return [primaryDetection];
    } catch {
      return [];
    }
  }

  private static worker: Worker | null = null;
  private static resolvers = new Map<string, (val: any) => void>();

  /**
   * Initializes the face detection worker.
   */
  private static initWorker() {
    if (this.worker) return;
    try {
      this.worker = new Worker(new URL("./onnxWorker.ts", import.meta.url), { type: "module" });
      this.worker.onmessage = (e) => {
        const { requestId, detections } = e.data;
        const resolve = this.resolvers.get(requestId);
        if (resolve) {
          resolve(detections || []);
          this.resolvers.delete(requestId);
        }
      };
    } catch (err) {
      console.warn("Failed to spawn face detector Web Worker thread:", err);
    }
  }

  /**
   * Runs face detection in a non-blocking background Web Worker thread.
   */
  public static async detectAsync(imageData: ImageData): Promise<FaceDetection[]> {
    this.initWorker();

    if (this.worker) {
      const requestId = Math.random().toString(36).substring(2, 11);
      // Zero-copy buffer transfer
      const buffer = imageData.data.buffer.slice(0);

      return new Promise((resolve) => {
        this.resolvers.set(requestId, resolve);
        this.worker!.postMessage(
          {
            requestId,
            width: imageData.width,
            height: imageData.height,
            buffer,
            isFaceCheck: true,
          },
          [buffer]
        );
      });
    }

    return this.detect(imageData);
  }

  /**
   * Helper checks standard human skin color boundaries in RGB space.
   */
  private static isSkinTone(r: number, g: number, b: number): boolean {
    // Standard peer-reviewed rules for skin color extraction
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const rGDiff = Math.abs(r - g);
    
    return (
      r > 95 &&
      g > 40 &&
      b > 20 &&
      max - min > 15 &&
      rGDiff > 15 &&
      r > g &&
      r > b
    );
  }
}
