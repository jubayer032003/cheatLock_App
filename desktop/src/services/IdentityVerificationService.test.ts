import { beforeEach, describe, expect, it } from "vitest";
import { IDENTITY_VERIFICATION_POLICY_VERSION, IDENTITY_VERIFICATION_TTL_MS } from "../config/identityVerification";
import { IdentityVerificationService } from "./IdentityVerificationService";

const scope = {
  studentId: "stu-1",
  examId: "exam-1",
  attemptId: "attempt-1",
  deviceId: "device-1",
  verificationPolicyVersion: IDENTITY_VERIFICATION_POLICY_VERSION,
};

beforeEach(() => {
  IdentityVerificationService.clearAllForTests();
});

describe("IdentityVerificationService", () => {
  it("fails missing descriptors with FACE_NOT_REGISTERED", () => {
    const result = IdentityVerificationService.faceNotRegistered(scope);

    expect(result.matched).toBe(false);
    expect(result.code).toBe("FACE_NOT_REGISTERED");
    expect(result.message).toBe("No verified face profile is available for this student.");
  });

  it("accepts a valid production face match", () => {
    IdentityVerificationService.verified(scope);

    expect(IdentityVerificationService.hasValidVerification(scope)).toBe(true);
  });

  it("rejects failed matches", () => {
    const result = IdentityVerificationService.failure(scope, "FACE_MISMATCH", "Mismatch");

    expect(result.matched).toBe(false);
    expect(IdentityVerificationService.hasValidVerification(scope)).toBe(false);
  });

  it("expires verification after the configured period", () => {
    IdentityVerificationService.verified(scope);

    expect(IdentityVerificationService.hasValidVerification(scope, Date.now() + IDENTITY_VERIFICATION_TTL_MS + 1)).toBe(false);
  });

  it("invalidates verification when the attempt changes", () => {
    IdentityVerificationService.verified(scope);

    expect(IdentityVerificationService.hasValidVerification({ ...scope, attemptId: "attempt-2" })).toBe(false);
  });

  it("records camera, model, and liveness failures as non-matches", () => {
    expect(IdentityVerificationService.failure(scope, "CAMERA_UNAVAILABLE", "Camera failed").matched).toBe(false);
    expect(IdentityVerificationService.failure(scope, "MODEL_UNAVAILABLE", "Model failed").matched).toBe(false);
    expect(IdentityVerificationService.failure(scope, "LIVENESS_FAILED", "Liveness failed").matched).toBe(false);
  });

  it("does not accept development simulation as production verification", () => {
    const result = IdentityVerificationService.developmentSimulation(scope);

    expect(result.verificationMethod).toBe("development_simulation");
    expect(result.matched).toBe(false);
    expect(IdentityVerificationService.hasValidVerification(scope)).toBe(false);
  });
});
