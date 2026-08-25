import type { LiveStudent, ScoreMetrics, TimelineEvent } from "../types";

export function normalizePercentage(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(100, Math.round(parsed)));
}

export function scorePercentage(source: Pick<LiveStudent, "suspicionScore" | "scoreMetrics"> | Pick<TimelineEvent, "suspicionScore" | "scoreMetrics">): number {
  return normalizePercentage(source.suspicionScore ?? source.scoreMetrics?.percentage);
}

export function scoreUpdatedAt(source: { scoreMetrics?: ScoreMetrics; lastUpdatedAt?: number | string | null; updatedAt?: string | null }): number {
  const value = source.scoreMetrics?.updatedAt ?? source.lastUpdatedAt ?? source.updatedAt;
  const parsed = value ? new Date(value).getTime() : 0;
  return Number.isFinite(parsed) ? parsed : 0;
}

export function mergeAuthoritativeStudent(previous: LiveStudent | undefined, incoming: LiveStudent): LiveStudent {
  const incomingScore = scorePercentage(incoming);
  const canonicalIncoming: LiveStudent = {
    ...incoming,
    suspicionScore: incomingScore,
    scoreMetrics: incoming.scoreMetrics
      ? {
          ...incoming.scoreMetrics,
          rawScore: incomingScore,
          percentage: incomingScore,
          trustScore: Math.max(0, 100 - incomingScore),
        }
      : incoming.scoreMetrics,
  };

  if (!previous) return canonicalIncoming;

  const previousUpdatedAt = scoreUpdatedAt(previous);
  const incomingUpdatedAt = scoreUpdatedAt(canonicalIncoming);
  if (previousUpdatedAt > 0 && incomingUpdatedAt > 0 && previousUpdatedAt > incomingUpdatedAt) {
    return previous;
  }

  return canonicalIncoming;
}
