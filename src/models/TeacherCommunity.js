import mongoose from "mongoose";

const teacherCommunitySchema = new mongoose.Schema(
  {
    teacherId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    students: {
      type: [String],
      default: [],
    },
  },
  { timestamps: true }
);

export const TeacherCommunity = mongoose.model(
  "TeacherCommunity",
  teacherCommunitySchema
);
