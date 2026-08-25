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
      enum: [
        "SUPER_ADMIN",
        "INSTITUTION_ADMIN",
        "DEPARTMENT_ADMIN",
        "TEACHER",
        "PROCTOR",
        "STUDENT",
        "OBSERVER",
        "AUDITOR"
      ],
      required: true,
    },
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      index: true,
    },
    status: {
      type: String,
      enum: ["ACTIVE", "SUSPENDED", "INACTIVE"],
      default: "ACTIVE",
    },
    department: {
      type: String,
      default: "",
    },
    program: {
      type: String,
      default: "",
    },
    batch: {
      type: String,
      default: "",
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
    passwordResetTokenHash: {
      type: String,
      default: "",
      select: false,
    },
    passwordResetExpiresAt: {
      type: Date,
      default: null,
      select: false,
    },
    passwordResetRequestedAt: {
      type: Date,
      default: null,
    },
    mustChangePassword: {
      type: Boolean,
      default: false,
    },
    passwordChangedAt: {
      type: Date,
      default: null,
    },
    tokenVersion: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  { timestamps: true }
);

userSchema.index({ identifier: 1, role: 1 }, { unique: true });
userSchema.index({ tenantId: 1, role: 1, status: 1 });
userSchema.index(
  { passwordResetTokenHash: 1, passwordResetExpiresAt: 1 },
  { partialFilterExpression: { passwordResetTokenHash: { $type: "string", $gt: "" } } }
);

export const User = mongoose.model("User", userSchema);
