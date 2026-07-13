import mongoose from "mongoose";

const examSessionSchema = new mongoose.Schema(
  {
    studentId: {
      type: String,
      required: true,
      trim: true,
    },
    studentName: {
      type: String,
      default: "",
      trim: true,
    },
    examId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Exam",
      required: false,
    },
    status: {
      type: String,
      enum: [
        "NOT_STARTED",
        "IN_PROGRESS",
        "SUBMITTED",
        "LOCKED",
        "RESET_BY_TEACHER",
      ],
      default: "NOT_STARTED",
    },
    startedAt: Number,
    submittedAt: Number,
    lockedAt: Number,
    resetAt: Number,
    resetBy: String,
    lockReason: String,
    deviceId: {
      type: String,
      default: "",
      trim: true,
    },
    suspicionScore: {
      type: Number,
      min: 0,
      max: 100,
      default: 0,
    },
    latestAlert: {
      type: String,
      default: "",
    },
    onlineStatus: {
      type: String,
      enum: ["ONLINE", "OFFLINE"],
      default: "OFFLINE",
    },
    previewUrl: {
      type: String,
      default: "",
    },
    previewBase64: {
      type: String,
      default: "",
    },
    lastPreviewEventLoggedAt: Number,
    lastSeenAt: Number,
  },
  { timestamps: true }
);

examSessionSchema.index({ studentId: 1, examId: 1 }, { unique: true });
examSessionSchema.index({ examId: 1, status: 1 });
examSessionSchema.index({ status: 1 });

export const ExamSession = mongoose.model("ExamSession", examSessionSchema);
