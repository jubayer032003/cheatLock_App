import { FaceDetection } from "./FaceDetector";

export interface TrackedFace {
  id: number;
  detection: FaceDetection;
  lastSeen: number;
}

export class FaceTracker {
  private trackedFaces: TrackedFace[] = [];
  private nextId = 1;
  private readonly MAX_AGE_MS = 1500; // Face is purged if not seen for 1.5 seconds

  /**
   * Update the tracker state with new frame detections.
   */
  public update(detections: FaceDetection[]): TrackedFace[] {
    const now = Date.now();

    // Match new detections with existing tracked faces using Intersection over Union (IoU)
    const updated: TrackedFace[] = [];
    const usedDetections = new Set<number>();

    // 1. Attempt to match existing tracks first
    this.trackedFaces.forEach((track) => {
      let bestIdx = -1;
      let bestIoU = 0.4; // Minimum overlap threshold

      detections.forEach((det, idx) => {
        if (usedDetections.has(idx)) return;
        const iou = this.calculateIoU(track.detection, det);
        if (iou > bestIoU) {
          bestIoU = iou;
          bestIdx = idx;
        }
      });

      if (bestIdx !== -1) {
        usedDetections.add(bestIdx);
        updated.push({
          id: track.id,
          detection: detections[bestIdx],
          lastSeen: now,
        });
      } else if (now - track.lastSeen < this.MAX_AGE_MS) {
        // Keep track alive for a short time if frame dropped
        updated.push(track);
      }
    });

    // 2. Spawn new tracks for remaining unmatched detections
    detections.forEach((det, idx) => {
      if (usedDetections.has(idx)) return;
      updated.push({
        id: this.nextId++,
        detection: det,
        lastSeen: now,
      });
    });

    this.trackedFaces = updated;
    return this.trackedFaces;
  }

  public clear() {
    this.trackedFaces = [];
    this.nextId = 1;
  }

  /**
   * Compute Intersection over Union overlap score.
   */
  private calculateIoU(boxA: FaceDetection, boxB: FaceDetection): number {
    const xA = Math.max(boxA.x, boxB.x);
    const yA = Math.max(boxA.y, boxB.y);
    const xB = Math.min(boxA.x + boxA.width, boxB.x + boxB.width);
    const yB = Math.min(boxA.y + boxA.height, boxB.y + boxB.height);

    const interArea = Math.max(0, xB - xA) * Math.max(0, yB - yA);
    const boxAArea = boxA.width * boxA.height;
    const boxBArea = boxB.width * boxB.height;

    const unionArea = boxAArea + boxBArea - interArea;
    return unionArea > 0 ? interArea / unionArea : 0;
  }
}
