import { DetectionProposal } from "./NMSProcessor";

export class DetectionFilter {
  /**
   * Filter proposals based on a minimum confidence threshold.
   *
   * @param proposals List of proposals to inspect
   * @param confidenceThreshold Minimum threshold (default: 0.40)
   */
  public static filter(proposals: DetectionProposal[], confidenceThreshold = 0.40): DetectionProposal[] {
    return proposals.filter((p) => p.confidence >= confidenceThreshold);
  }
}
