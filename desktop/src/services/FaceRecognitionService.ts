import { FramePipeline, ImageFrame } from "./FramePipeline";
import { FaceDetector, FaceDetection } from "./FaceDetector";
import { FaceTracker, TrackedFace } from "./FaceTracker";
import { EmbeddingGenerator } from "./EmbeddingGenerator";
import { VerificationEngine } from "./VerificationEngine";

export type FaceResultStatus = "FACE_MATCH" | "FACE_MISMATCH" | "FACE_MISSING" | "MULTIPLE_FACES";

export interface FaceResultEvent {
  status: FaceResultStatus;
  primaryFaceBox: { x: number; y: number; width: number; height: number; id: number } | null;
  allFaceBoxes: { x: number; y: number; width: number; height: number; id: number }[];
  distance: number;
  similarity: number;
  message: string;
}

export class FaceRecognitionService {
  private pipeline: FramePipeline | null = null;
  private tracker = new FaceTracker();
  private registeredDescriptor: number[] | null = null;
  private matchThreshold = 0.60;

  // Frame inference throttling
  private isProcessing = false;
  private lastInferenceTime = 0;
  private readonly INFERENCE_THROTTLE_MS = 200; // Run AI evaluation at max 5 FPS

  // Identity state caching
  private lastVerifyResult: { distance: number; similarity: number; isMatch: boolean } | null = null;
  private cachedTrackingId = -1;
  private cachedBoundingBox: FaceDetection | null = null;

  private listeners: ((event: FaceResultEvent) => void)[] = [];

  public start(pipeline: FramePipeline, registeredDescriptor: number[] | null, threshold = 0.60) {
    this.pipeline = pipeline;
    this.registeredDescriptor = registeredDescriptor;
    this.matchThreshold = threshold;
    this.tracker.clear();
    this.isProcessing = false;
    this.lastVerifyResult = null;
    this.cachedTrackingId = -1;
    this.cachedBoundingBox = null;

    // Hook to 10 FPS AI Frame queue
    this.pipeline.registerAiListener(this.handleAiFrame);
  }

  public stop() {
    if (this.pipeline) {
      this.pipeline.unregisterAiListener(this.handleAiFrame);
    }
    this.pipeline = null;
    this.tracker.clear();
    this.listeners = [];
  }

  public setThreshold(threshold: number) {
    this.matchThreshold = threshold;
  }

  public registerListener(callback: (event: FaceResultEvent) => void) {
    this.listeners.push(callback);
  }

  public unregisterListener(callback: (event: FaceResultEvent) => void) {
    this.listeners = this.listeners.filter((l) => l !== callback);
  }

  private handleAiFrame = async (frame: ImageFrame) => {
    // Avoid overlapping inference tasks
    if (this.isProcessing) return;

    const now = Date.now();
    if (now - this.lastInferenceTime < this.INFERENCE_THROTTLE_MS) return;

    this.isProcessing = true;
    this.lastInferenceTime = now;

    // 1. Run Face Detection directly on frame.data in background Web Worker
    const detections = await FaceDetector.detectAsync(frame.data);

    // 2. Feed detections to Identity Tracker
    const tracked = this.tracker.update(detections);

    // 3. Evaluate results using the pipeline's active canvas element as a drawing source
    const canvas = this.pipeline?.getCanvas();
    if (!canvas) {
      this.isProcessing = false;
      return;
    }
    const event = this.evaluateSecurityAlerts(canvas, tracked);

    // 4. Publish results to React subscribers
    this.listeners.forEach((l) => l(event));

    this.isProcessing = false;
  };

  private evaluateSecurityAlerts(source: HTMLCanvasElement, tracked: TrackedFace[]): FaceResultEvent {
    const allBoxes = tracked.map((t) => ({
      x: t.detection.x,
      y: t.detection.y,
      width: t.detection.width,
      height: t.detection.height,
      id: t.id,
    }));

    // Situation A: No faces detected
    if (tracked.length === 0) {
      this.lastVerifyResult = null;
      this.cachedTrackingId = -1;
      this.cachedBoundingBox = null;
      return {
        status: "FACE_MISSING",
        primaryFaceBox: null,
        allFaceBoxes: [],
        distance: Number.POSITIVE_INFINITY,
        similarity: 0,
        message: "No faces detected in webcam frame.",
      };
    }

    // Situation B: Multiple faces detected
    if (tracked.length > 1) {
      this.lastVerifyResult = null;
      this.cachedTrackingId = -1;
      this.cachedBoundingBox = null;
      return {
        status: "MULTIPLE_FACES",
        primaryFaceBox: null,
        allFaceBoxes: allBoxes,
        distance: 0,
        similarity: 0,
        message: "Multiple faces detected in workspace.",
      };
    }

    // Situation C: Exactly one face. Verify identity
    const primaryTrack = tracked[0];
    const primaryBox = {
      x: primaryTrack.detection.x,
      y: primaryTrack.detection.y,
      width: primaryTrack.detection.width,
      height: primaryTrack.detection.height,
      id: primaryTrack.id,
    };

    // Optimization: Skip inference if the face tracking ID is unchanged and position remains stable
    if (
      this.lastVerifyResult &&
      this.cachedTrackingId === primaryTrack.id &&
      this.cachedBoundingBox &&
      this.calculateOverlap(this.cachedBoundingBox, primaryTrack.detection) > 0.90
    ) {
      return {
        status: this.lastVerifyResult.isMatch ? "FACE_MATCH" : "FACE_MISMATCH",
        primaryFaceBox: primaryBox,
        allFaceBoxes: allBoxes,
        distance: this.lastVerifyResult.distance,
        similarity: this.lastVerifyResult.similarity,
        message: this.lastVerifyResult.isMatch 
          ? "Identity matches registered profile (cached)." 
          : "Biometric identity verification mismatch (cached).",
      };
    }

    // If no registered face descriptor is active (e.g. before login checkouts), skip comparison
    if (!this.registeredDescriptor) {
      return {
        status: "FACE_MATCH", // Treat as match for verification setup pages
        primaryFaceBox: primaryBox,
        allFaceBoxes: allBoxes,
        distance: 0,
        similarity: 100,
        message: "Webcam active (biometric profile setup mode).",
      };
    }

    // 4. Generate 192-dim MobileFaceNet embedding descriptor using the source canvas
    const embedding = EmbeddingGenerator.generate(source, primaryTrack.detection);
    if (embedding.length === 0) {
      return {
        status: "FACE_MISSING",
        primaryFaceBox: null,
        allFaceBoxes: [],
        distance: Number.POSITIVE_INFINITY,
        similarity: 0,
        message: "Failed to extract face alignment embeddings.",
      };
    }

    // 5. Compare with registered profile
    const verify = VerificationEngine.verify(
      embedding,
      this.registeredDescriptor,
      this.matchThreshold
    );

    // Cache verification outcomes to minimize CPU overhead on stable frames
    this.lastVerifyResult = verify;
    this.cachedTrackingId = primaryTrack.id;
    this.cachedBoundingBox = primaryTrack.detection;

    return {
      status: verify.isMatch ? "FACE_MATCH" : "FACE_MISMATCH",
      primaryFaceBox: primaryBox,
      allFaceBoxes: allBoxes,
      distance: verify.distance,
      similarity: verify.similarity,
      message: verify.isMatch 
        ? "Identity matches registered profile." 
        : "Biometric identity verification mismatch.",
    };
  }

  private calculateOverlap(boxA: FaceDetection, boxB: FaceDetection): number {
    const xA = Math.max(boxA.x, boxB.x);
    const yA = Math.max(boxA.y, boxB.y);
    const xB = Math.min(boxA.x + boxA.width, boxB.x + boxB.width);
    const yB = Math.min(boxA.y + boxA.height, boxB.y + boxB.height);

    const interArea = Math.max(0, xB - xA) * Math.max(0, yB - yA);
    const areaA = boxA.width * boxA.height;
    return areaA > 0 ? interArea / areaA : 0;
  }
}
export const faceRecognitionService = new FaceRecognitionService();
