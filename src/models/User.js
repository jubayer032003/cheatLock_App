import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    identifier: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: {
      type: String,
      required: true,
    },
    role: {
      type: String,
      enum: ["STUDENT", "TEACHER"],
      required: true,
    },
    faceProfile: {
      descriptor: {
        type: [Number],
        default: [],
      },
      previewBase64: {
        type: String,
        default: "",
      },
      updatedAt: {
        type: Date,
        default: null,
      },
    },
  },
  { timestamps: true }
);

userSchema.index({ identifier: 1, role: 1 }, { unique: true });

export const User = mongoose.model("User", userSchema);
