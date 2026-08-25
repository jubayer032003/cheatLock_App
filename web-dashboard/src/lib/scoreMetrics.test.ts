import test from "node:test";
import assert from "node:assert/strict";
import { mergeAuthoritativeStudent, scorePercentage } from "./scoreMetrics.ts";
import type { LiveStudent } from "../types.ts";

function student(score: number, updatedAt: string, overrides: Partial<LiveStudent> = {}): LiveStudent {
  return {
    studentId: "session-1",
    studentName: "Test Student",
    rollId: "R-1",
    status: "SAFE",
    suspicionScore: score,
    latestAlert: "",
    onlineStatus: "ONLINE",
    scoreMetrics: {
      rawScore: score,
      maximumScore: 100,
      percentage: score,
      trustScore: 100 - score,
      suspiciousActivityCount: 0,
      capturedFrameCount: 0,
      processedFrameCount: 0,
      updatedAt,
    },
    ...overrides,
  };
}

test("start 0 and event +20 renders authoritative total 20", () => {
  const result = mergeAuthoritativeStudent(student(0, "2026-08-15T00:00:00Z"), student(20, "2026-08-15T00:00:01Z"));
  assert.equal(scorePercentage(result), 20);
});

test("start 5 and event +20 renders authoritative total 25", () => {
  const result = mergeAuthoritativeStudent(student(5, "2026-08-15T00:00:00Z"), student(25, "2026-08-15T00:00:01Z"));
  assert.equal(scorePercentage(result), 25);
});

test("start 80 and event +20 renders authoritative capped total 100", () => {
  const result = mergeAuthoritativeStudent(student(80, "2026-08-15T00:00:00Z"), student(100, "2026-08-15T00:00:01Z"));
  assert.equal(scorePercentage(result), 100);
});

test("alert listener cannot increment an already applied score event", () => {
  const scoreEvent = mergeAuthoritativeStudent(student(0, "2026-08-15T00:00:00Z"), student(20, "2026-08-15T00:00:01Z"));
  const alertEvent = mergeAuthoritativeStudent(scoreEvent, student(20, "2026-08-15T00:00:02Z", { latestAlert: "Face missing" }));
  assert.equal(scorePercentage(alertEvent), 20);
});

test("reconnect snapshot converges to the newer authoritative backend score", () => {
  const result = mergeAuthoritativeStudent(student(60, "2026-08-15T00:00:00Z"), student(80, "2026-08-15T00:00:01Z"));
  assert.equal(scorePercentage(result), 80);
});

test("late older HTTP result cannot overwrite a newer socket score", () => {
  const result = mergeAuthoritativeStudent(student(80, "2026-08-15T00:00:02Z"), student(60, "2026-08-15T00:00:01Z"));
  assert.equal(scorePercentage(result), 80);
});

test("stale live student list snapshot cannot overwrite a newer score event", () => {
  const scoreEvent = student(60, "2026-08-15T00:00:02Z");
  const staleSnapshot = student(50, "2026-08-15T00:00:01Z");
  assert.equal(scorePercentage(mergeAuthoritativeStudent(scoreEvent, staleSnapshot)), 60);
});

test("new attempt reset to zero replaces an older attempt score", () => {
  const oldAttempt = student(60, "2026-08-15T00:00:01Z");
  const resetAttempt = student(0, "2026-08-15T00:00:02Z", { latestAlert: "Attempt reset by teacher" });
  assert.equal(scorePercentage(mergeAuthoritativeStudent(oldAttempt, resetAttempt)), 0);
});

test("top-level persisted score wins when derived metrics disagree", () => {
  const mismatch = student(20, "2026-08-15T00:00:01Z");
  mismatch.scoreMetrics = { ...mismatch.scoreMetrics!, rawScore: 25, percentage: 25, trustScore: 75 };
  assert.equal(scorePercentage(mismatch), 20);
});
