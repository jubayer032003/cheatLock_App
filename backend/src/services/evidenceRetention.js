import { ProctoringEvent } from "../models/ProctoringEvent.js";
import { logger } from "./logger.js";
import { deleteFrameKeys } from "./s3.js";

export const EVIDENCE_RETENTION_POLICY = {
  preEventWindowMs: Number(process.env.EVIDENCE_PRE_EVENT_WINDOW_MS || "10000"),
  postEventWindowMs: Number(process.env.EVIDENCE_POST_EVENT_WINDOW_MS || "10000"),
  maxEvidenceIdsPerPromotion: Number(process.env.EVIDENCE_PROMOTION_MAX_IDS || "50"),
  maxClockSkewMs: Number(process.env.EVIDENCE_PROMOTION_MAX_CLOCK_SKEW_MS || "300000"),
  routineRetentionMs: Number(process.env.EVIDENCE_ROUTINE_RETENTION_MS || String(30 * 24 * 60 * 60 * 1000)),
  incidentRetentionMs: Number(process.env.EVIDENCE_INCIDENT_RETENTION_MS || String(180 * 24 * 60 * 60 * 1000)),
};

export async function configureEvidenceRetentionCleanup() {
  await ProctoringEvent.createCollection();
  const indexes = await ProctoringEvent.collection.indexes();
  const legacyTtl = indexes.find((index) => index.name === "retentionExpiresAt_1" && index.expireAfterSeconds !== undefined);
  if (legacyTtl) {
    await ProctoringEvent.collection.dropIndex(legacyTtl.name);
    await ProctoringEvent.collection.createIndex({ retentionExpiresAt: 1 }, { name: "retentionExpiresAt_1" });
  }

  await purgeExpiredEvidence();
  const timer = setInterval(() => {
    purgeExpiredEvidence().catch((error) => {
      logger.error("evidence_retention_cleanup_failed", { errorName: error.name || "CleanupError" });
    });
  }, 60 * 60 * 1000);
  timer.unref();
}

export async function purgeExpiredEvidence(now = new Date(), batchSize = 100) {
  let deletedCount = 0;
  while (true) {
    const expired = await ProctoringEvent.find({ retentionExpiresAt: { $ne: null, $lte: now } })
      .select("previewUrl evidenceReference")
      .limit(batchSize)
      .lean();
    if (!expired.length) break;

    const objectKeys = expired
      .flatMap((event) => [event.previewUrl, event.evidenceReference])
      .filter((value) => value && !String(value).startsWith("data:") && !/^https?:\/\//i.test(String(value)));
    await deleteFrameKeys(objectKeys);
    const result = await ProctoringEvent.deleteMany({ _id: { $in: expired.map((event) => event._id) } });
    deletedCount += result.deletedCount || 0;
    if (expired.length < batchSize) break;
  }
  if (deletedCount) logger.info("evidence_retention_cleanup_completed", { deletedCount });
  return deletedCount;
}

const PRIORITY_RANK = {
  routine: 0,
  suspicious: 1,
  critical: 2,
};

const PRIORITY_RETENTION_CLASS = {
  routine: "routine",
  suspicious: "incident",
  critical: "investigation",
};

export function normalizeEvidencePriority(priority = "routine") {
  const normalized = String(priority || "").trim().toLowerCase();
  return Object.hasOwn(PRIORITY_RANK, normalized) ? normalized : "routine";
}

export function retentionClassForPriority(priority = "routine") {
  return PRIORITY_RETENTION_CLASS[normalizeEvidencePriority(priority)];
}

export function retentionExpiresAtForPriority(priority = "routine", referenceDate = new Date()) {
  const normalized = normalizeEvidencePriority(priority);
  if (normalized === "critical") return null;
  const duration = normalized === "suspicious"
    ? EVIDENCE_RETENTION_POLICY.incidentRetentionMs
    : EVIDENCE_RETENTION_POLICY.routineRetentionMs;
  return new Date(referenceDate.getTime() + duration);
}

export function shouldPromotePriority(currentPriority = "routine", requestedPriority = "suspicious") {
  return PRIORITY_RANK[normalizeEvidencePriority(requestedPriority)] > PRIORITY_RANK[normalizeEvidencePriority(currentPriority)];
}

export function sanitizeEvidenceIds(evidenceIds = []) {
  return [...new Set(
    evidenceIds
      .map((id) => String(id || "").trim())
      .filter(Boolean)
      .slice(0, EVIDENCE_RETENTION_POLICY.maxEvidenceIdsPerPromotion)
  )];
}

export function buildEvidenceEventWindow(eventDate = new Date(), {
  preEventWindowMs = EVIDENCE_RETENTION_POLICY.preEventWindowMs,
  postEventWindowMs = EVIDENCE_RETENTION_POLICY.postEventWindowMs,
} = {}) {
  const timestamp = eventDate instanceof Date && !Number.isNaN(eventDate.getTime()) ? eventDate.getTime() : Date.now();
  return {
    start: new Date(timestamp - preEventWindowMs),
    end: new Date(timestamp + postEventWindowMs),
  };
}

export async function promoteEvidenceForSuspiciousEvent({
  examId,
  studentId,
  sessionId,
  suspiciousEventId,
  eventServerReceivedAt = new Date(),
  evidenceIds = [],
  requestedPriority = "suspicious",
  promotedBy = "backend",
  promotionReason = "suspicious_event_window",
} = {}) {
  const normalizedPriority = normalizeEvidencePriority(requestedPriority);
  if (normalizedPriority === "routine") {
    return { matchedCount: 0, modifiedCount: 0, skipped: true };
  }
  const ids = sanitizeEvidenceIds(evidenceIds);
  const window = buildEvidenceEventWindow(eventServerReceivedAt);
  const query = buildPromotionQuery({
    examId,
    studentId,
    sessionId,
    window,
    evidenceIds: ids,
  });

  logger.info("evidence_promotion_requested", {
    examId: String(examId || ""),
    studentId,
    sessionId,
    suspiciousEventId,
    requestedPriority: normalizedPriority,
    evidenceIdCount: ids.length,
  });

  try {
    const result = await ProctoringEvent.updateMany(
      query,
      buildPromotionUpdatePipeline({
        requestedPriority: normalizedPriority,
        suspiciousEventId,
        promotedAt: new Date(),
        promotedBy,
        promotionReason,
      })
    );
    const matchedCount = result.matchedCount ?? result.n ?? 0;
    const modifiedCount = result.modifiedCount ?? result.nModified ?? 0;
    logger.info(modifiedCount > 0 ? "evidence_promotion_succeeded" : "evidence_promotion_skipped", {
      examId: String(examId || ""),
      studentId,
      sessionId,
      suspiciousEventId,
      matchedCount,
      modifiedCount,
    });
    return { matchedCount, modifiedCount, skipped: matchedCount === 0 };
  } catch (error) {
    logger.error("evidence_promotion_failed", {
      examId: String(examId || ""),
      studentId,
      sessionId,
      suspiciousEventId,
      errorName: error.name || "PromotionError",
    });
    throw error;
  }
}

export async function promoteEvidenceForArrivingFrame({
  examId,
  studentId,
  sessionId,
  evidenceId,
  evidenceServerReceivedAt = new Date(),
} = {}) {
  const window = buildEvidenceEventWindow(evidenceServerReceivedAt);
  const suspiciousEvents = await ProctoringEvent.find({
    examId,
    studentId,
    sessionId,
    eventType: "ai_alert_created",
    serverReceivedAt: { $gte: window.start, $lte: window.end },
  })
    .select("evidenceId idempotencyKey serverReceivedAt")
    .sort({ serverReceivedAt: -1 })
    .limit(10)
    .lean();

  let modifiedCount = 0;
  for (const event of suspiciousEvents) {
    const suspiciousEventId = event.evidenceId || event.idempotencyKey || String(event._id);
    const result = await promoteEvidenceForSuspiciousEvent({
      examId,
      studentId,
      sessionId,
      suspiciousEventId,
      eventServerReceivedAt: event.serverReceivedAt || evidenceServerReceivedAt,
      evidenceIds: evidenceId ? [evidenceId] : [],
      requestedPriority: "suspicious",
      promotedBy: "backend",
      promotionReason: "late_arriving_evidence",
    });
    modifiedCount += result.modifiedCount || 0;
  }

  return { matchedEvents: suspiciousEvents.length, modifiedCount };
}

export function buildPromotionQuery({ examId, studentId, sessionId, window, evidenceIds = [] }) {
  const query = {
    examId,
    studentId,
    sessionId: String(sessionId || ""),
    eventType: { $in: ["camera_preview_updated", "screen_telemetry_uploaded"] },
    serverReceivedAt: { $gte: window.start, $lte: window.end },
  };
  if (evidenceIds.length > 0) {
    query.evidenceId = { $in: sanitizeEvidenceIds(evidenceIds) };
  }
  return query;
}

export function buildPromotionUpdatePipeline({
  requestedPriority,
  suspiciousEventId,
  promotedAt,
  promotedBy,
  promotionReason,
}) {
  const normalizedPriority = normalizeEvidencePriority(requestedPriority);
  const eventId = String(suspiciousEventId || "").trim();
  const promotedAtDate = promotedAt instanceof Date ? promotedAt : new Date(promotedAt || Date.now());
  const incidentExpiry = retentionExpiresAtForPriority("suspicious", promotedAtDate);

  return [
    {
      $set: {
        priority: priorityExpression(normalizedPriority),
        retentionClass: retentionClassExpression(normalizedPriority),
        retentionExpiresAt: retentionExpiryExpression(normalizedPriority, incidentExpiry),
        suspiciousEventIds: eventId
          ? { $setUnion: [{ $ifNull: ["$suspiciousEventIds", []] }, [eventId]] }
          : { $ifNull: ["$suspiciousEventIds", []] },
        promotedAt: promotedAtDate,
        promotedBy,
        promotionReason,
        updatedAt: promotedAtDate,
      },
    },
  ];
}

function priorityExpression(requestedPriority) {
  if (requestedPriority === "critical") return "critical";
  return {
    $cond: [
      { $eq: ["$priority", "critical"] },
      "critical",
      requestedPriority === "suspicious" ? "suspicious" : { $ifNull: ["$priority", "routine"] },
    ],
  };
}

function retentionClassExpression(requestedPriority) {
  if (requestedPriority === "critical") return "investigation";
  return {
    $cond: [
      { $eq: ["$priority", "critical"] },
      "investigation",
      requestedPriority === "suspicious" ? "incident" : { $ifNull: ["$retentionClass", "routine"] },
    ],
  };
}

function retentionExpiryExpression(requestedPriority, incidentExpiry) {
  if (requestedPriority === "critical") return null;
  return {
    $cond: [
      { $eq: ["$priority", "critical"] },
      "$retentionExpiresAt",
      requestedPriority === "suspicious" ? incidentExpiry : "$retentionExpiresAt",
    ],
  };
}
