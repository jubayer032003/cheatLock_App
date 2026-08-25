import {
  IDENTITY_VERIFICATION_POLICY_VERSION,
  IDENTITY_VERIFICATION_TTL_MS,
} from "../config/identityVerification";
import type {
  IdentityVerificationCode,
  IdentityVerificationMethod,
  IdentityVerificationResultRecord,
} from "../types";

export interface IdentityVerificationScope {
  studentId: string;
  examId: string;
  attemptId: string;
  deviceId: string;
  verificationPolicyVersion?: string;
}

const records = new Map<string, IdentityVerificationResultRecord>();

export class IdentityVerificationService {
  public static faceNotRegistered(scope: IdentityVerificationScope): IdentityVerificationResultRecord {
    return this.failure(scope, "FACE_NOT_REGISTERED", "No verified face profile is available for this student.");
  }

  public static failure(
    scope: IdentityVerificationScope,
    code: Exclude<IdentityVerificationCode, "VERIFIED">,
    message: string,
    method: IdentityVerificationMethod = "face_match"
  ): IdentityVerificationResultRecord {
    return makeRecord(scope, false, code, message, method);
  }

  public static verified(scope: IdentityVerificationScope): IdentityVerificationResultRecord {
    const record = makeRecord(scope, true, "VERIFIED", "Identity verified successfully.", "face_match");
    records.set(key(scope), record);
    return record;
  }

  public static developmentSimulation(scope: IdentityVerificationScope): IdentityVerificationResultRecord {
    return makeRecord(
      scope,
      false,
      "LIVENESS_FAILED",
      "Development simulation is not accepted as production identity verification.",
      "development_simulation"
    );
  }

  public static hasValidVerification(scope: IdentityVerificationScope, now = Date.now()): boolean {
    const record = records.get(key(scope));
    if (!record || !record.matched) return false;
    if (record.verificationMethod !== "face_match") return false;
    if (record.verificationPolicyVersion !== (scope.verificationPolicyVersion ?? IDENTITY_VERIFICATION_POLICY_VERSION)) return false;
    if (record.studentId !== scope.studentId || record.examId !== scope.examId) return false;
    if (record.attemptId !== scope.attemptId || record.deviceId !== scope.deviceId) return false;
    return Date.parse(record.expiresAt) > now;
  }

  public static clear(scope: IdentityVerificationScope) {
    records.delete(key(scope));
  }

  public static clearAllForTests() {
    records.clear();
  }
}

function makeRecord(
  scope: IdentityVerificationScope,
  matched: boolean,
  code: IdentityVerificationCode,
  message: string,
  verificationMethod: IdentityVerificationMethod
): IdentityVerificationResultRecord {
  const now = new Date();
  return {
    matched,
    code,
    message,
    studentId: scope.studentId,
    examId: scope.examId,
    attemptId: scope.attemptId,
    deviceId: scope.deviceId,
    verificationTimestamp: now.toISOString(),
    verificationMethod,
    verificationPolicyVersion: scope.verificationPolicyVersion ?? IDENTITY_VERIFICATION_POLICY_VERSION,
    expiresAt: new Date(now.getTime() + IDENTITY_VERIFICATION_TTL_MS).toISOString(),
  };
}

function key(scope: IdentityVerificationScope) {
  return [
    scope.studentId.trim().toLowerCase(),
    scope.examId,
    scope.attemptId,
    scope.deviceId,
    scope.verificationPolicyVersion ?? IDENTITY_VERIFICATION_POLICY_VERSION,
  ].join("|");
}
