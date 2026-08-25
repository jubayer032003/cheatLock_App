import mongoose from "mongoose";

const proctoringEventSchema = new mongoose.Schema(
  {
    examId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Exam",
      required: true,
      index: true,
    },
    studentId: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    studentName: {
      type: String,
      default: "",
      trim: true,
    },
    eventType: {
      type: String,
      required: true,
      enum: [
        "student_joined_exam",
        "student_left_exam",
        "suspicion_score_updated",
        "ai_alert_created",
        "camera_preview_updated",
        "screen_telemetry_uploaded",
        "student_heartbeat",
      ],
    },
    sessionId: {
      type: String,
      default: "",
      trim: true,
      index: true,
    },
    idempotencyKey: {
      type: String,
      default: "",
      trim: true,
    },
    evidenceId: {
      type: String,
      default: "",
      trim: true,
      index: true,
    },
    evidenceIds: {
      type: [String],
      default: [],
    },
    priority: {
      type: String,
      enum: ["routine", "suspicious", "critical"],
      default: "routine",
      index: true,
    },
    retentionClass: {
      type: String,
      enum: ["routine", "incident", "investigation"],
      default: "routine",
      index: true,
    },
    suspiciousEventIds: {
      type: [String],
      default: [],
    },
    promotedAt: {
      type: Date,
      default: null,
    },
    promotedBy: {
      type: String,
      default: "",
      trim: true,
    },
    promotionReason: {
      type: String,
      default: "",
      trim: true,
    },
    serverReceivedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    retentionExpiresAt: {
      type: Date,
      default: null,
    },
    sequenceNumber: {
      type: Number,
      min: 0,
      default: 0,
    },
    ruleId: {
      type: String,
      default: "",
      trim: true,
    },
    scoreDelta: {
      type: Number,
      min: 0,
      max: 100,
      default: 0,
    },
    totalSuspicionScore: {
      type: Number,
      min: 0,
      max: 100,
      default: 0,
    },
    suspicionScore: {
      type: Number,
      min: 0,
      max: 100,
      default: 0,
    },
    occurredAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    evidenceReference: {
      type: String,
      default: "",
      trim: true,
    },
    alertMessage: {
      type: String,
      default: "",
    },
    severity: {
      type: String,
      enum: ["low", "medium", "high"],
      default: "low",
      index: true,
    },
    confidence: {
      type: Number,
      min: 0,
      max: 1,
      default: null,
    },
    startedAt: {
      type: Date,
      default: null,
    },
    endedAt: {
      type: Date,
      default: null,
    },
    captureTiming: {
      capturedAt: Date,
      captureStartedAt: Date,
      captureCompletedAt: Date,
      uploadStartedAt: Date,
      uploadCompletedAt: Date,
      processingCompletedAt: Date,
      sequenceNumber: Number,
      sessionId: String,
      studentId: String,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    previewUrl: {
      type: String,
      default: "",
    },
    previewBase64: {
      type: String,
      default: "",
    },
  },
  { timestamps: true }
);

proctoringEventSchema.index({ examId: 1, studentId: 1, createdAt: 1 });
proctoringEventSchema.index({ examId: 1, occurredAt: -1 });
proctoringEventSchema.index({ examId: 1, studentId: 1, sessionId: 1, serverReceivedAt: 1 });
proctoringEventSchema.index({ examId: 1, studentId: 1, suspiciousEventIds: 1 });
proctoringEventSchema.index(
  { examId: 1, studentId: 1, idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $type: "string", $gt: "" } } }
);
// Application-managed cleanup removes object-storage evidence before deleting
// the database row; a MongoDB TTL index would bypass that cleanup.
proctoringEventSchema.index({ retentionExpiresAt: 1 });

export const ProctoringEvent = mongoose.model("ProctoringEvent", proctoringEventSchema);
