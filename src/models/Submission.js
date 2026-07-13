import mongoose from "mongoose";

const answerSchema = new mongoose.Schema(
  {
    questionIndex: Number,
    questionText: String,
    answerText: String,
  },
  { _id: false }
);

const submissionSchema = new mongoose.Schema(
  {
    examId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Exam",
      index: true,
    },
    studentId: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    answers: [answerSchema],
    appSwitchWarnings: {
      type: Number,
      default: 0,
    },
    faceMissingWarnings: {
      type: Number,
      default: 0,
    },
    audioWarnings: {
      type: Number,
      default: 0,
    },
    phoneWarnings: {
      type: Number,
      default: 0,
    },
    totalWarnings: {
      type: Number,
      default: 0,
    },
    riskLevel: {
      type: String,
      enum: ["Low Risk", "Medium Risk", "High Risk"],
      default: "Low Risk",
    },
    grade: {
      type: Number,
      default: null,
    },
    feedback: {
      type: String,
      default: "",
    },
    gradedAt: {
      type: Date,
      default: null,
    },
    submittedAt: {
      type: Number,
      required: true,
    },
  },
  { timestamps: true }
);

submissionSchema.index({ submittedAt: -1 });
submissionSchema.index({ studentId: 1, examId: 1 });

export const Submission = mongoose.model("Submission", submissionSchema);
