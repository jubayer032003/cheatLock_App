import mongoose from "mongoose";

const studentNotificationSchema = new mongoose.Schema(
  {
    studentId: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    examId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Exam",
      required: true,
    },
    type: {
      type: String,
      required: true,
      enum: ["EXAM_CREATED", "EXAM_LIVE", "EXAM_ASSIGNED", "GRADE_ASSIGNED"],
    },
    payload: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
      default: {},
    },
    notified: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

studentNotificationSchema.index({ studentId: 1, createdAt: -1 });
studentNotificationSchema.index({ studentId: 1, examId: 1, type: 1 });

export const StudentNotification = mongoose.model(
  "StudentNotification",
  studentNotificationSchema
);
