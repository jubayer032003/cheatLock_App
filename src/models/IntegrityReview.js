import mongoose from "mongoose";

const integrityReviewSchema = new mongoose.Schema(
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
    decision: {
      type: String,
      enum: ["PENDING", "CLEAN", "REVIEW_NEEDED", "DISQUALIFIED"],
      default: "PENDING",
    },
    notes: {
      type: String,
      default: "",
      trim: true,
    },
    reviewedBy: {
      type: String,
      default: "",
      trim: true,
    },
    reviewedAt: Date,
  },
  { timestamps: true }
);

integrityReviewSchema.index({ examId: 1, studentId: 1 }, { unique: true });

export const IntegrityReview = mongoose.model("IntegrityReview", integrityReviewSchema);
