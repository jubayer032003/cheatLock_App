import { EXAM_CONSENT_POLICY_VERSION } from "../config/consentPolicy";
import type {
  DeviceReadinessReport,
  ExamPreparationConsentRecord,
  ExamPreparationState,
  ExamSession,
  PermissionCapability,
} from "../types";

export interface PreparationScope {
  studentId: string;
  examId: string;
  attemptId?: string | null;
  deviceId?: string | null;
  consentPolicyVersion?: string;
}

const preparationStore = new Map<string, ExamPreparationState>();

export class ExamPreparationStateService {
  public static createInitialState(scope: PreparationScope): ExamPreparationState {
    return {
      selectedExamId: scope.examId,
      studentId: scope.studentId,
      attemptId: scope.attemptId ?? null,
      deviceId: scope.deviceId ?? null,
      consent: null,
      readinessReport: {
        status: "not_checked",
        checkedAt: null,
        missingCapabilities: [],
        notes: [],
        deviceReport: null,
      },
      permissionStatus: {
        camera: "not_requested",
        microphone: "not_requested",
        screenCapture: "not_requested",
        faceVerification: "not_requested",
        applicationSecurity: "not_requested",
        networkTelemetry: "not_requested",
        aiAssistedMonitoring: "not_requested",
      },
      identityVerificationStatus: "not_started",
      rulesAcknowledged: false,
      monitoringStartupStatus: "not_started",
    };
  }

  public static getState(scope: PreparationScope): ExamPreparationState {
    return preparationStore.get(stateKey(scope)) ?? this.createInitialState(scope);
  }

  public static acceptConsent(scope: PreparationScope, now = new Date()): ExamPreparationConsentRecord {
    const policyVersion = scope.consentPolicyVersion ?? EXAM_CONSENT_POLICY_VERSION;
    const next = this.createInitialState(scope);
    next.consent = {
      status: "accepted",
      consentPolicyVersion: policyVersion,
      consentTimestamp: now.toISOString(),
      studentId: scope.studentId,
      examId: scope.examId,
      attemptId: scope.attemptId ?? null,
      deviceId: scope.deviceId ?? null,
    };
    preparationStore.set(stateKey(scope), next);
    return next.consent;
  }

  public static rejectConsent(scope: PreparationScope): ExamPreparationState {
    const next = this.createInitialState(scope);
    next.consent = {
      status: "rejected",
      consentPolicyVersion: scope.consentPolicyVersion ?? EXAM_CONSENT_POLICY_VERSION,
      consentTimestamp: new Date().toISOString(),
      studentId: scope.studentId,
      examId: scope.examId,
      attemptId: scope.attemptId ?? null,
      deviceId: scope.deviceId ?? null,
    };
    preparationStore.set(stateKey(scope), next);
    return next;
  }

  public static hasValidConsent(scope: PreparationScope): boolean {
    const state = preparationStore.get(stateKey(scope));
    if (!state?.consent || state.consent.status !== "accepted") return false;

    const expectedPolicyVersion = scope.consentPolicyVersion ?? EXAM_CONSENT_POLICY_VERSION;
    return (
      state.studentId === scope.studentId &&
      state.selectedExamId === scope.examId &&
      normalizeOptional(state.attemptId) === normalizeOptional(scope.attemptId) &&
      state.consent.studentId === scope.studentId &&
      state.consent.examId === scope.examId &&
      normalizeOptional(state.consent.attemptId) === normalizeOptional(scope.attemptId) &&
      state.consent.consentPolicyVersion === expectedPolicyVersion
    );
  }

  public static recordReadinessReport(scope: PreparationScope, report: DeviceReadinessReport): ExamPreparationState {
    const next = this.getState(scope);
    next.readinessReport = {
      status: report.canStartExam ? "ready" : "blocked",
      checkedAt: report.completedAt ?? report.startedAt,
      missingCapabilities: [],
      notes: report.results
        .filter((result) => result.state !== "passed")
        .map((result) => result.message),
      deviceReport: report,
    };
    preparationStore.set(stateKey(scope), next);
    return next;
  }

  public static acknowledgeRules(scope: PreparationScope): ExamPreparationState {
    const next = this.getState(scope);
    next.rulesAcknowledged = true;
    preparationStore.set(stateKey(scope), next);
    return next;
  }

  public static clearForScope(scope: PreparationScope) {
    preparationStore.delete(stateKey(scope));
  }

  public static clearAllForTests() {
    preparationStore.clear();
  }
}

export function attemptIdFromSession(session?: ExamSession | null): string | null {
  if (!session) return null;
  const raw = session as unknown as Record<string, unknown>;
  if (typeof raw.id === "string" && raw.id.trim()) return raw.id.trim();
  if (typeof raw._id === "string" && raw._id.trim()) return raw._id.trim();
  if (session.examId && session.studentId && session.status !== "NOT_STARTED") {
    return `${session.examId}:${session.studentId}:${session.status}:${session.startedAt ?? "pending"}`;
  }
  return null;
}

export function capabilityLabels(capabilities: PermissionCapability[]) {
  const labels: Record<PermissionCapability, string> = {
    camera: "Camera",
    microphone: "Microphone",
    screen_capture: "Screen capture",
    face_verification: "Face verification",
    application_security: "Application-security monitoring",
    network_telemetry: "Network telemetry",
    ai_assisted_monitoring: "AI-assisted monitoring",
  };
  return capabilities.map((capability) => labels[capability]);
}

function stateKey(scope: PreparationScope) {
  return [
    scope.studentId.trim().toLowerCase(),
    scope.examId,
    normalizeOptional(scope.attemptId),
    scope.consentPolicyVersion ?? EXAM_CONSENT_POLICY_VERSION,
  ].join("|");
}

function normalizeOptional(value?: string | null) {
  return value?.trim() || "none";
}
