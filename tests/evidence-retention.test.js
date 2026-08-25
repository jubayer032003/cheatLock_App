import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import mongoose from "mongoose";
import { ProctoringEvent } from "../backend/src/models/ProctoringEvent.js";
import {
  buildEvidenceEventWindow,
  buildPromotionQuery,
  buildPromotionUpdatePipeline,
  normalizeEvidencePriority,
  promoteEvidenceForArrivingFrame,
  promoteEvidenceForSuspiciousEvent,
  retentionClassForPriority,
  retentionExpiresAtForPriority,
  sanitizeEvidenceIds,
  shouldPromotePriority,
} from "../backend/src/services/evidenceRetention.js";

const originalUpdateMany = ProctoringEvent.updateMany;
const originalFind = ProctoringEvent.find;

afterEach(() => {
  ProctoringEvent.updateMany = originalUpdateMany;
  ProctoringEvent.find = originalFind;
});

test("routine evidence can be promoted to suspicious without duplicating media fields", () => {
  assert.equal(shouldPromotePriority("routine", "suspicious"), true);
  const pipeline = buildPromotionUpdatePipeline({
    requestedPriority: "suspicious",
    suspiciousEventId: "alert-1",
    promotedAt: new Date("2026-08-04T00:00:00.000Z"),
    promotedBy: "backend",
    promotionReason: "ai_alert_created",
  });

  assert.equal(pipeline.length, 1);
  assert.equal(pipeline[0].$set.retentionClass.$cond[2], "incident");
  assert.equal(pipeline[0].$set.suspiciousEventIds.$setUnion[1][0], "alert-1");
  assert.equal("previewBase64" in pipeline[0].$set, false);
  assert.equal("previewUrl" in pipeline[0].$set, false);
});

test("promotion is monotonic and critical evidence cannot be downgraded", () => {
  assert.equal(shouldPromotePriority("critical", "suspicious"), false);
  const pipeline = buildPromotionUpdatePipeline({
    requestedPriority: "suspicious",
    suspiciousEventId: "alert-2",
    promotedAt: new Date("2026-08-04T00:00:00.000Z"),
  });

  assert.deepEqual(pipeline[0].$set.priority.$cond[0], { $eq: ["$priority", "critical"] });
  assert.equal(pipeline[0].$set.priority.$cond[1], "critical");
});

test("evidence IDs are sanitized and deduplicated for idempotent repeated requests", () => {
  assert.deepEqual(sanitizeEvidenceIds(["a", "a", "", " b "]), ["a", "b"]);
});

test("promotion query scopes to exam, student, session, media events, and server event window", () => {
  const examId = new mongoose.Types.ObjectId();
  const window = buildEvidenceEventWindow(new Date("2026-08-04T10:00:00.000Z"));
  const query = buildPromotionQuery({
    examId,
    studentId: "student-a",
    sessionId: "session-a",
    window,
    evidenceIds: ["frame-1"],
  });

  assert.equal(query.examId, examId);
  assert.equal(query.studentId, "student-a");
  assert.equal(query.sessionId, "session-a");
  assert.deepEqual(query.eventType.$in, ["camera_preview_updated", "screen_telemetry_uploaded"]);
  assert.deepEqual(query.evidenceId.$in, ["frame-1"]);
  assert.equal(query.serverReceivedAt.$gte.toISOString(), "2026-08-04T09:59:50.000Z");
  assert.equal(query.serverReceivedAt.$lte.toISOString(), "2026-08-04T10:00:10.000Z");
});

test("pre-event and post-event retention windows include nearby evidence but exclude outside frames", () => {
  const window = buildEvidenceEventWindow(new Date("2026-08-04T10:00:00.000Z"));
  assert.equal(new Date("2026-08-04T09:59:51.000Z") >= window.start, true);
  assert.equal(new Date("2026-08-04T10:00:09.000Z") <= window.end, true);
  assert.equal(new Date("2026-08-04T09:59:40.000Z") >= window.start, false);
  assert.equal(new Date("2026-08-04T10:00:20.000Z") <= window.end, false);
});

test("promotion updates retention expiry and investigation evidence has no routine TTL", () => {
  const reference = new Date("2026-08-04T00:00:00.000Z");
  assert.equal(retentionClassForPriority("routine"), "routine");
  assert.equal(retentionClassForPriority("suspicious"), "incident");
  assert.equal(retentionClassForPriority("critical"), "investigation");
  assert.ok(retentionExpiresAtForPriority("suspicious", reference) > reference);
  assert.equal(retentionExpiresAtForPriority("critical", reference), null);
});

test("retention expiry is application-managed so object storage is cleaned before database rows", () => {
  const ttlIndexes = ProctoringEvent.schema.indexes().filter(([, options]) => options?.expireAfterSeconds === 0);
  const retentionIndexes = ProctoringEvent.schema.indexes().filter(([fields]) => Object.hasOwn(fields, "retentionExpiresAt"));
  assert.equal(ttlIndexes.some(([fields]) => Object.hasOwn(fields, "retentionExpiresAt")), false);
  assert.equal(retentionIndexes.length, 1);
});

test("automatic suspicious event promotion uses atomic updateMany and does not change score", async () => {
  let capturedQuery = null;
  let capturedPipeline = null;
  ProctoringEvent.updateMany = async (query, pipeline) => {
    capturedQuery = query;
    capturedPipeline = pipeline;
    return { matchedCount: 2, modifiedCount: 2 };
  };

  const result = await promoteEvidenceForSuspiciousEvent({
    examId: new mongoose.Types.ObjectId(),
    studentId: "student-a",
    sessionId: "session-a",
    suspiciousEventId: "alert-1",
    eventServerReceivedAt: new Date("2026-08-04T10:00:00.000Z"),
    evidenceIds: ["frame-1", "frame-2"],
  });

  assert.equal(result.modifiedCount, 2);
  assert.deepEqual(capturedQuery.evidenceId.$in, ["frame-1", "frame-2"]);
  assert.equal("suspicionScore" in capturedPipeline[0].$set, false);
  assert.equal("scoreDelta" in capturedPipeline[0].$set, false);
});

test("late arriving evidence is associated with existing suspicious events without duplication", async () => {
  const calls = [];
  ProctoringEvent.find = () => ({
    select() { return this; },
    sort() { return this; },
    limit() {
      return {
        lean: async () => [
          { _id: "event-a", evidenceId: "alert-a", serverReceivedAt: new Date("2026-08-04T10:00:00.000Z") },
          { _id: "event-b", evidenceId: "alert-b", serverReceivedAt: new Date("2026-08-04T10:00:04.000Z") },
        ],
      };
    },
  });
  ProctoringEvent.updateMany = async (query, pipeline) => {
    calls.push({ query, pipeline });
    return { matchedCount: 1, modifiedCount: 1 };
  };

  const result = await promoteEvidenceForArrivingFrame({
    examId: new mongoose.Types.ObjectId(),
    studentId: "student-a",
    sessionId: "session-a",
    evidenceId: "frame-late",
    evidenceServerReceivedAt: new Date("2026-08-04T10:00:03.000Z"),
  });

  assert.equal(result.matchedEvents, 2);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0].query.evidenceId.$in, ["frame-late"]);
  assert.equal(calls[0].pipeline[0].$set.suspiciousEventIds.$setUnion[1][0], "alert-a");
  assert.equal(calls[1].pipeline[0].$set.suspiciousEventIds.$setUnion[1][0], "alert-b");
});

test("invalid priorities normalize to routine and cannot trigger promotion", () => {
  assert.equal(normalizeEvidencePriority("owner"), "routine");
  assert.equal(shouldPromotePriority("routine", "owner"), false);
});
