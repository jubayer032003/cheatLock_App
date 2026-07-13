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
      ],
    },
    suspicionScore: {
      type: Number,
      min: 0,
      max: 100,
      default: 0,
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

export const ProctoringEvent = mongoose.model("ProctoringEvent", proctoringEventSchema);

