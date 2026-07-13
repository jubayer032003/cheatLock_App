import mongoose from "mongoose";

const tenantSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    domain: {
      type: String,
      trim: true,
    },
    branding: {
      logoUrl: {
        type: String,
        default: "",
      },
      primaryColor: {
        type: String,
        default: "#8b5cf6", // Default violet color
      },
      theme: {
        type: String,
        enum: ["light", "dark", "system"],
        default: "dark",
      },
    },
    license: {
      type: {
        type: String,
        enum: ["trial", "basic", "professional", "enterprise"],
        default: "trial",
      },
      expiresAt: {
        type: Date,
        default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days trial
      },
      maxConcurrentStudents: {
        type: Number,
        default: 50,
      },
    },
    settings: {
      aiThresholds: {
        faceMissingWeight: { type: Number, default: 25 },
        multipleFacesWeight: { type: Number, default: 30 },
        phoneDetectedWeight: { type: Number, default: 20 },
        speechDetectedWeight: { type: Number, default: 10 },
        repeatedSwitchWeight: { type: Number, default: 15 },
        fullscreenExitWeight: { type: Number, default: 15 },
        clipboardUsageWeight: { type: Number, default: 10 },
        multiMonitorWeight: { type: Number, default: 25 },
        livenessFailureWeight: { type: Number, default: 40 },
        decayRate: { type: Number, default: 0.4 }, // score decay per second
      },
      securityPolicies: {
        allowClipboard: { type: Boolean, default: false },
        requireLiveness: { type: Boolean, default: true },
        requireVAD: { type: Boolean, default: true },
        enforceKiosk: { type: Boolean, default: true },
      },
    },
    departments: [
      {
        name: { type: String, required: true },
        code: { type: String, required: true },
        faculties: [String],
        programs: [String],
      },
    ],
  },
  { timestamps: true }
);

export const Tenant = mongoose.model("Tenant", tenantSchema);
