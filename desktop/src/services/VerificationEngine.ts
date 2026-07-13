export class VerificationEngine {
  /**
   * Calculate Euclidean distance between two unit-normalized embeddings.
   */
  public static calculateDistance(embA: number[], embB: number[]): number {
    const length = Math.min(embA.length, embB.length);
    if (length === 0) return Number.POSITIVE_INFINITY;

    let sum = 0;
    for (let i = 0; i < length; i++) {
      const delta = embA[i] - embB[i];
      sum += delta * delta;
    }
    return Math.sqrt(sum);
  }

  /**
   * Verify face matching using Euclidean Distance threshold checks.
   */
  public static verify(
    liveEmbedding: number[],
    registeredEmbedding: number[],
    threshold = 0.60
  ): { isMatch: boolean; distance: number; similarity: number } {
    const distance = this.calculateDistance(liveEmbedding, registeredEmbedding);
    const isMatch = distance <= threshold;

    // Convert Euclidean distance on unit sphere to 0-100 similarity score
    // Max distance on unit sphere is 2.0 (opposite vectors). Distance 0 is 100%.
    const similarity = Math.max(0, Math.min(100, Math.round((1 - distance / 2.0) * 100)));

    return {
      isMatch,
      distance,
      similarity,
    };
  }
}
