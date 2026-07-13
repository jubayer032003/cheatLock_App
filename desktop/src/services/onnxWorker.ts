// Web Worker for CPU-intensive ONNX Runtime and Image Inference calculations.
// Runs off the main UI thread to avoid interface stutter.

import { InferenceEngine } from "./InferenceEngine";
import { FaceDetector } from "./FaceDetector";

self.onmessage = async (e) => {
  const { requestId, width, height, buffer, confidenceThreshold, isFaceCheck } = e.data;
  
  try {
    const dataArray = new Uint8ClampedArray(buffer);
    const imageData = new ImageData(dataArray, width, height);

    if (isFaceCheck) {
      // Run Face Detection in background thread
      const detections = FaceDetector.detect(imageData);
      self.postMessage({ requestId, detections });
    } else {
      // Run YOLOv8 Object Detection in background thread
      const proposals = InferenceEngine.runInferenceLocal(imageData, confidenceThreshold);
      self.postMessage({ requestId, proposals });
    }
  } catch (err: any) {
    self.postMessage({ requestId, error: err.message, proposals: [], detections: [] });
  }
};
