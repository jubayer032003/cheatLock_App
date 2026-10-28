import type { LiveStudent } from "../types";
import { scoreUpdatedAt } from "./scoreMetrics.ts";

export function snapshotFor(student: LiveStudent, source: "camera" | "screen"): string {
  return source === "camera" ? student.previewUrl || student.previewBase64 || "" : student.screenPreviewUrl || student.screenBase64 || "";
}

export function sensorStatus(value: string | undefined): string {
  return value?.trim() || "Unknown";
}

export function isOlderAttempt(previous: LiveStudent | undefined, incoming: LiveStudent): boolean {
  return Boolean(previous?.attemptStartedAt && incoming.attemptStartedAt && incoming.attemptStartedAt < previous.attemptStartedAt);
}

export function sameMonitoringAttempt(previous: LiveStudent | undefined, incoming: LiveStudent): boolean {
  return Boolean(previous && previous.sessionId === incoming.sessionId && previous.attemptStartedAt === incoming.attemptStartedAt);
}

export function monitoringFreshness(student: LiveStudent, now = Date.now()): string {
  if (student.onlineStatus === "OFFLINE") return "Offline";
  const seen = student.lastSeenAt ? new Date(student.lastSeenAt).getTime() : 0;
  if (!seen || !Number.isFinite(seen)) return "Unknown";
  return now - seen <= 30_000 && seen <= now + 5_000 ? "Receiving telemetry" : "Telemetry stale";
}

export function shouldAcceptMonitoringUpdate(previous: LiveStudent | undefined, incoming: LiveStudent): boolean {
  if (!previous) return true;
  if (previous.attemptStartedAt && incoming.attemptStartedAt && previous.attemptStartedAt !== incoming.attemptStartedAt) {
    return incoming.attemptStartedAt > previous.attemptStartedAt;
  }
  return scoreUpdatedAt(incoming) >= scoreUpdatedAt(previous);
}

export function monitoringAlertId(student: LiveStudent): string {
  return `${student.studentId}:${student.attemptStartedAt || "unknown"}:${student.eventId || student.mutationId || student.latestAlert}`;
}