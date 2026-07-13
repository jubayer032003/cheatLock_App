import { FramePipeline, ImageFrame } from "./FramePipeline";
import { InferenceEngine } from "./InferenceEngine";
import { NMSProcessor, DetectionProposal } from "./NMSProcessor";
import { objectViolationManager } from "./ObjectViolationManager";
import { modelLoader } from "./ModelLoader";

export class ObjectDetectionManager {
  private pipeline: FramePipeline | null = null;
  private isProcessing = false;
  
  // Scheduling configs
  private confidenceThreshold = 0.40;
  private inferenceInterval = 8; // Process 1 out of N frames (default 8)
  private frameCount = 0;

  private listeners: ((detections: DetectionProposal[]) => void)[] = [];

  /**
   * Load YOLO model and register pipeline listener.
   */
  public async start(pipeline: FramePipeline, confidence = 0.40, interval = 8) {
    this.pipeline = pipeline;
    this.confidenceThreshold = confidence;
    this.inferenceInterval = interval;
    this.frameCount = 0;
    this.isProcessing = false;

    // Load YOLOv8n weights
    await modelLoader.loadModel();

    // Hook FramePipeline scheduler
    this.pipeline.registerAiListener(this.handleAiFrame);
  }

  /**
   * Unregister listeners and release loaded models resources.
   */
  public stop() {
    if (this.pipeline) {
      this.pipeline.unregisterAiListener(this.handleAiFrame);
    }
    this.pipeline = null;
    modelLoader.unloadModel();
    this.listeners = [];
  }

  public registerDetectionsListener(callback: (detections: DetectionProposal[]) => void) {
    this.listeners.push(callback);
  }

  public unregisterDetectionsListener(callback: (detections: DetectionProposal[]) => void) {
    this.listeners = this.listeners.filter((l) => l !== callback);
  }

  private handleAiFrame = async (frame: ImageFrame) => {
    if (this.isProcessing) return;

    this.frameCount++;
    // Inference throttling: runs every N frames
    if (this.frameCount % this.inferenceInterval !== 0) return;

    this.isProcessing = true;

    try {
      // 1. Run YOLOv8n core inference directly on frame.data
      const rawDetections = await InferenceEngine.runInference(frame.data, this.confidenceThreshold);

      // 2. Apply Non-Maximum Suppression (IoU: 0.45)
      const nmsDetections = NMSProcessor.process(rawDetections, 0.45);

      // 3. Notify real-time visual overlay subscribers
      this.listeners.forEach((cb) => cb(nmsDetections));

      // 4. Tick temporal validation logic
      objectViolationManager.tick(nmsDetections);
    } catch (err) {
      console.warn("[ObjectDetectionManager] YOLOv8n inference failed:", err);
    } finally {
      this.isProcessing = false;
    }
  };
}

export const objectDetectionManager = new ObjectDetectionManager();
