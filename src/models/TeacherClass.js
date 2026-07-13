import mongoose from "mongoose";

const teacherClassSchema = new mongoose.Schema(
  {
    teacherId: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    section: {
      type: String,
      default: "",
      trim: true,
    },
    subject: {
      type: String,
      default: "",
      trim: true,
    },
    students: {
      type: [String],
      default: [],
    },
    inviteCode: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
    },
    enrollmentRequests: {
      type: [
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
          status: {
            type: String,
            enum: ["PENDING", "APPROVED", "REJECTED"],
            default: "PENDING",
          },
          requestedAt: {
            type: Date,
            default: Date.now,
          },
          decidedAt: Date,
        },
      ],
      default: [],
    },
  },
  { timestamps: true }
);

teacherClassSchema.index({ teacherId: 1, name: 1, section: 1 }, { unique: true });
teacherClassSchema.index({ inviteCode: 1 }, { unique: true });

export const TeacherClass = mongoose.model("TeacherClass", teacherClassSchema);
