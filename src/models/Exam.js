import mongoose from "mongoose";

const questionSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["MCQ", "CQ"],
      default: "CQ",
    },
    text: {
      type: String,
      required: true,
      trim: true,
    },
    options: {
      type: [String],
      default: [],
    },
    correctAnswer: {
      type: String,
      default: "",
    },
  },
  { _id: false }
);

const examSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    durationMinutes: {
      type: Number,
      default: 10,
      min: 1,
    },
    lockAnswers: {
      type: Boolean,
      default: true,
    },
    status: {
      type: String,
      enum: ["DRAFT", "SCHEDULED", "LIVE", "ENDED", "ARCHIVED"],
      default: "DRAFT",
      index: true,
    },
    scheduledStartAt: Date,
    scheduledEndAt: Date,
    startedAt: Date,
    endedAt: Date,
    archivedAt: Date,
    questions: {
      type: [questionSchema],
      validate: {
        validator: (questions) => questions.length > 0,
        message: "At least one question is required.",
      },
    },
    assignedStudents: {
      type: [String],
      default: [],
    },
    communityStudents: {
      type: [String],
      default: [],
    },
    classIds: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: "TeacherClass",
      default: [],
    },
    accessCode: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
    },
    accessLink: {
      type: String,
      required: true,
    },
    createdBy: {
      type: String,
      required: true,
    },
  },
  { timestamps: true }
);

examSchema.index({ createdAt: -1 });
examSchema.index({ status: 1, scheduledStartAt: 1, scheduledEndAt: 1 });
examSchema.index({ assignedStudents: 1 });
examSchema.index({ classIds: 1 });
examSchema.index({ accessCode: 1 }, { unique: true });

export const Exam = mongoose.model("Exam", examSchema);
