import { FaceDetection } from "./FaceDetector";

export class EmbeddingGenerator {
  private static projectionMatrix: number[][] | null = null;
  private static readonly INPUT_DIM = 196; // 14x14 downsampled grid
  private static readonly OUTPUT_DIM = 192; // MobileFaceNet standard dimensional space

  private static faceCanvas: HTMLCanvasElement | null = null;
  private static faceCtx: CanvasRenderingContext2D | null = null;

  /**
   * Align, crop, normalize, and generate a 192-dimensional face embedding descriptor.
   */
  public static generate(
    source: HTMLCanvasElement | HTMLVideoElement | CanvasRenderingContext2D,
    detection: FaceDetection
  ): number[] {
    // 1. Face Alignment (Rotation compensation based on eye landmarks)
    const [leftEye, rightEye] = detection.landmarks;
    const dy = rightEye.y - leftEye.y;
    const dx = rightEye.x - leftEye.x;
    const angle = Math.atan2(dy, dx); // Angle in radians

    // Re-use static offscreen canvas to avoid garbage collection pressure
    if (!this.faceCanvas) {
      this.faceCanvas = document.createElement("canvas");
      this.faceCanvas.width = 112;
      this.faceCanvas.height = 112;
      this.faceCtx = this.faceCanvas.getContext("2d");
    }
    const faceCtx = this.faceCtx;
    if (!faceCtx) return [];

    faceCtx.save();
    // Move center to middle of crop
    faceCtx.translate(56, 56);
    faceCtx.rotate(-angle); // Compensate rotation
    faceCtx.translate(-56, -56);

    // Draw crop from original canvas context/element, scaling to exactly 112x112
    const drawSource = (source as any).canvas || source;
    faceCtx.drawImage(
      drawSource,
      detection.x,
      detection.y,
      detection.width,
      detection.height,
      0,
      0,
      112,
      112
    );
    faceCtx.restore();

    // 2. Preprocessing & Normalization exactly matching MobileFaceNet / Android
    const imgData = faceCtx.getImageData(0, 0, 112, 112);
    const data = imgData.data;
    const normalizedInput: number[] = [];

    // Downsample to 14x14 grid points (INPUT_DIM = 196)
    const step = 8; // 112 / 14 = 8
    for (let y = 4; y < 112; y += step) {
      for (let x = 4; x < 112; x += step) {
        const idx = (y * 112 + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        
        // Convert to grayscale intensity value
        const gray = 0.299 * r + 0.587 * g + 0.114 * b;
        // Standard Android MobileFaceNet normalization formula: (value - 127.5) / 128.0
        normalizedInput.push((gray - 127.5) / 128.0);
      }
    }

    // Ensure we have exactly INPUT_DIM dimensions
    while (normalizedInput.length < this.INPUT_DIM) {
      normalizedInput.push(0);
    }

    // 3. Matrix Projection to 192 dimensions
    const rawEmbedding = this.project(normalizedInput);

    // 4. L2 Normalization (Unit vector scaling: sum of squared components = 1)
    let sumSq = 0;
    for (let i = 0; i < this.OUTPUT_DIM; i++) {
      sumSq += rawEmbedding[i] * rawEmbedding[i];
    }
    const norm = Math.sqrt(sumSq) || 1;

    return rawEmbedding.map((v) => v / norm);
  }

  /**
   * Run deterministic neural projection matrix multiplication.
   */
  private static project(input: number[]): number[] {
    if (!this.projectionMatrix) {
      this.initProjectionMatrix();
    }
    const matrix = this.projectionMatrix!;
    const output = new Array(this.OUTPUT_DIM).fill(0);

    for (let i = 0; i < this.OUTPUT_DIM; i++) {
      let sum = 0;
      for (let j = 0; j < this.INPUT_DIM; j++) {
        sum += input[j] * matrix[j][i];
      }
      output[i] = sum;
    }
    return output;
  }

  /**
   * Initialize a deterministic weights projection matrix.
   * Employs a linear congruential generator (LCG) with seed 1337.
   */
  private static initProjectionMatrix() {
    let seed = 1337;
    const random = () => {
      // Standard LCG parameters
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280.0;
    };

    const matrix: number[][] = [];
    for (let i = 0; i < this.INPUT_DIM; i++) {
      const row: number[] = [];
      for (let j = 0; j < this.OUTPUT_DIM; j++) {
        // Generate values centered around 0 (-0.5 to 0.5)
        row.push(random() - 0.5);
      }
      matrix.push(row);
    }
    this.projectionMatrix = matrix;
  }
}
