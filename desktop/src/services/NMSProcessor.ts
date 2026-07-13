export interface DetectionProposal {
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
  classLabel: string;
}

export class NMSProcessor {
  /**
   * Apply Non-Maximum Suppression (NMS) on a list of detection proposals.
   *
   * @param proposals List of candidates detected
   * @param iouThreshold Overlap ratio limit (default: 0.45)
   */
  public static process(proposals: DetectionProposal[], iouThreshold = 0.45): DetectionProposal[] {
    if (proposals.length === 0) return [];

    // Sort by confidence in descending order
    const sorted = [...proposals].sort((a, b) => b.confidence - a.confidence);
    const selected: DetectionProposal[] = [];
    const active = new Array(sorted.length).fill(true);

    for (let i = 0; i < sorted.length; i++) {
      if (!active[i]) continue;

      const current = sorted[i];
      selected.push(current);

      for (let j = i + 1; j < sorted.length; j++) {
        if (!active[j]) continue;

        // Ensure same class before suppressing (standard multiclass NMS)
        if (sorted[j].classLabel === current.classLabel) {
          const iou = this.calculateIoU(current, sorted[j]);
          if (iou > iouThreshold) {
            active[j] = false; // Suppress
          }
        }
      }
    }

    return selected;
  }

  /**
   * Calculate Intersection over Union (IoU).
   */
  private static calculateIoU(boxA: DetectionProposal, boxB: DetectionProposal): number {
    const xA = Math.max(boxA.x, boxB.x);
    const yA = Math.max(boxA.y, boxB.y);
    const xB = Math.min(boxA.x + boxA.width, boxB.x + boxB.width);
    const yB = Math.min(boxA.y + boxA.height, boxB.y + boxB.height);

    const interArea = Math.max(0, xB - xA) * Math.max(0, yB - yA);
    const areaA = boxA.width * boxA.height;
    const areaB = boxB.width * boxB.height;

    const unionArea = areaA + areaB - interArea;
    return unionArea > 0 ? interArea / unionArea : 0;
  }
}
