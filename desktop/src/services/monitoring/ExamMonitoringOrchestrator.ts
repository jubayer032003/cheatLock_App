import { EXAM_CONSENT_POLICY_VERSION } from "../../config/consentPolicy";
import { IDENTITY_VERIFICATION_POLICY_VERSION } from "../../config/identityVerification";
import { isReadinessReportFresh, type ReadinessScope } from "../readiness/DeviceReadinessOrchestrator";
import { ExamPreparationStateService, type PreparationScope } from "../ExamPreparationStateService";
import { IdentityVerificationService } from "../IdentityVerificationService";
import type {
  DeviceReadinessReport,
  ExamMonitoringPolicy,
  ExamMonitorName,
  HealthCheckResult,
  MonitorState,
  MonitorStatus,
} from "../../types";

export interface ExamMonitor {
  start(config: unknown): Promise<void>;
  stop(): Promise<void>;
  getStatus(): Promise<MonitorStatus>;
  healthCheck(): Promise<HealthCheckResult>;
}

export interface ExamMonitorRegistration {
  name: ExamMonitorName;
  monitor: ExamMonitor;
  required: boolean;
  allowDegraded?: boolean;
}

export interface ExamMonitoringStartupContext {
  studentId: string;
  examId: string;
  attemptId: string;
  deviceId: string;
  policy: ExamMonitoringPolicy;
  readinessReport: DeviceReadinessReport | null;
  policyVersion: string;
  consentPolicyVersion?: string;
  identityVerificationPolicyVersion?: string;
  requireIdentityVerification: boolean;
  rulesAcknowledged: boolean;
  monitorConfig?: unknown;
}

export interface ExamMonitoringBackendHooks {
  validateAuthentication?: (context: ExamMonitoringStartupContext) => Promise<void> | void;
  validateExamAccess?: (context: ExamMonitoringStartupContext) => Promise<void> | void;
  validateAttempt?: (context: ExamMonitoringStartupContext) => Promise<void> | void;
  createOrResumeSession?: (context: ExamMonitoringStartupContext) => Promise<void> | void;
  startHeartbeatAndEvents?: (context: ExamMonitoringStartupContext) => Promise<void> | void;
  notifyMonitoringReady?: (context: ExamMonitoringStartupContext, statuses: MonitorStatus[]) => Promise<void> | void;
  sendDiagnosticEvent?: (event: MonitoringDiagnosticEvent) => Promise<void> | void;
  returnToReadiness?: (context: ExamMonitoringStartupContext, error: ExamMonitoringStartupError) => Promise<void> | void;
}

export interface MonitoringDiagnosticEvent {
  examId: string;
  studentId: string;
  attemptId: string;
  deviceId: string;
  state: MonitorState;
  message: string;
  failedMonitor?: ExamMonitorName;
  errorCode?: string;
  cleanupErrors: string[];
}

export class ExamMonitoringStartupError extends Error {
  public constructor(
    message: string,
    public readonly code: string,
    public readonly failedMonitor?: ExamMonitorName
  ) {
    super(message);
    this.name = "ExamMonitoringStartupError";
  }
}

export interface ExamMonitoringStartupResult {
  state: MonitorState;
  canRenderQuestions: boolean;
  statuses: MonitorStatus[];
  cleanupErrors: string[];
  error?: ExamMonitoringStartupError;
}

export class ExamMonitoringOrchestrator {
  private state: MonitorState = "idle";
  private activeMonitors: ExamMonitorRegistration[] = [];
  private startupPromise: Promise<ExamMonitoringStartupResult> | null = null;
  private lastResult: ExamMonitoringStartupResult | null = null;

  public constructor(
    private readonly monitors: ExamMonitorRegistration[],
    private readonly hooks: ExamMonitoringBackendHooks = {}
  ) {}

  public getState(): MonitorState {
    return this.state;
  }

  public async start(context: ExamMonitoringStartupContext): Promise<ExamMonitoringStartupResult> {
    if (this.startupPromise) return this.startupPromise;
    if (this.state === "active" || this.state === "degraded") {
      return this.lastResult ?? this.snapshot(this.state, true, []);
    }

    this.startupPromise = this.startTransaction(context).finally(() => {
      this.startupPromise = null;
    });

    return this.startupPromise;
  }

  public async stop(): Promise<void> {
    if (this.state === "idle" || this.state === "stopping") return;

    this.state = "stopping";
    const monitorsToStop = [...this.activeMonitors].reverse();
    this.activeMonitors = [];

    for (const registration of monitorsToStop) {
      try {
        await registration.monitor.stop();
      } catch {
        // Stop is intentionally idempotent for callers. Cleanup failures are
        // captured during transactional startup where diagnostics can be sent.
      }
    }

    this.state = "idle";
    this.lastResult = null;
  }

  private async startTransaction(context: ExamMonitoringStartupContext): Promise<ExamMonitoringStartupResult> {
    this.state = "starting";
    this.activeMonitors = [];
    const statuses: MonitorStatus[] = [];
    const cleanupErrors: string[] = [];

    try {
      await this.validatePreconditions(context);
      await this.hooks.createOrResumeSession?.(context);

      let degraded = false;
      for (const registration of this.monitors) {
        this.activeMonitors.push(registration);
        await registration.monitor.start(context.monitorConfig ?? context);

        const health = await registration.monitor.healthCheck();
        const status = await this.statusFromHealth(registration, health);
        statuses.push(status);

        if (!health.healthy || health.state === "failed" || health.state === "idle") {
          if (registration.required) {
            throw new ExamMonitoringStartupError(
              health.message || `${registration.name} monitor failed to start.`,
              health.errorCode || "required_monitor_failed",
              registration.name
            );
          }
          if (registration.allowDegraded) degraded = true;
        }

        if (health.state === "degraded") {
          if (registration.required && !registration.allowDegraded) {
            throw new ExamMonitoringStartupError(
              health.message || `${registration.name} monitor is degraded.`,
              health.errorCode || "required_monitor_failed",
              registration.name
            );
          }
          degraded = true;
        }
      }

      await this.hooks.startHeartbeatAndEvents?.(context);
      await this.hooks.notifyMonitoringReady?.(context, statuses);

      this.state = degraded ? "degraded" : "active";
      this.lastResult = this.snapshot(this.state, true, statuses, cleanupErrors);
      return this.lastResult;
    } catch (error: any) {
      const startupError =
        error instanceof ExamMonitoringStartupError
          ? error
          : new ExamMonitoringStartupError(error?.message || "Monitoring startup failed.", error?.code || "start_failed");

      cleanupErrors.push(...(await this.rollback()));
      this.state = "failed";

      await this.safeDiagnostic(context, startupError, cleanupErrors);
      await this.safeReturnToReadiness(context, startupError);

      this.lastResult = this.snapshot("failed", false, statuses, cleanupErrors, startupError);
      return this.lastResult;
    }
  }

  private async validatePreconditions(context: ExamMonitoringStartupContext) {
    if (!context.studentId) throw new ExamMonitoringStartupError("Authentication is required.", "authentication_required");
    if (!context.examId) throw new ExamMonitoringStartupError("Exam access could not be validated.", "exam_access_required");
    if (!context.attemptId) throw new ExamMonitoringStartupError("A valid attempt is required.", "attempt_required");
    if (!context.deviceId) throw new ExamMonitoringStartupError("A valid device identity is required.", "device_required");

    await this.hooks.validateAuthentication?.(context);
    await this.hooks.validateExamAccess?.(context);
    await this.hooks.validateAttempt?.(context);

    const preparationScope: PreparationScope = {
      studentId: context.studentId,
      examId: context.examId,
      attemptId: context.attemptId,
      deviceId: context.deviceId,
      consentPolicyVersion: context.consentPolicyVersion ?? EXAM_CONSENT_POLICY_VERSION,
    };
    if (!ExamPreparationStateService.hasValidConsent(preparationScope)) {
      throw new ExamMonitoringStartupError("Exam consent must be accepted before monitoring starts.", "consent_required");
    }

    if (!context.readinessReport?.canStartExam) {
      throw new ExamMonitoringStartupError("Device readiness must pass before entering the exam.", "readiness_required");
    }

    const readinessScope: ReadinessScope = {
      studentId: context.studentId,
      examId: context.examId,
      attemptId: context.attemptId,
      deviceId: context.deviceId,
      policyVersion: context.policyVersion,
      policy: context.policy,
    };
    if (!isReadinessReportFresh(context.readinessReport, readinessScope)) {
      throw new ExamMonitoringStartupError("Device readiness is stale for this attempt or policy.", "readiness_stale");
    }

    if (context.requireIdentityVerification) {
      const verified = IdentityVerificationService.hasValidVerification({
        studentId: context.studentId,
        examId: context.examId,
        attemptId: context.attemptId,
        deviceId: context.deviceId,
        verificationPolicyVersion: context.identityVerificationPolicyVersion ?? IDENTITY_VERIFICATION_POLICY_VERSION,
      });
      if (!verified) {
        throw new ExamMonitoringStartupError("Identity verification is missing or expired.", "identity_verification_required");
      }
    }

    if (!context.rulesAcknowledged) {
      throw new ExamMonitoringStartupError("Exam rules must be acknowledged before starting.", "rules_acknowledgment_required");
    }
  }

  private async rollback(): Promise<string[]> {
    const cleanupErrors: string[] = [];
    const monitorsToStop = [...this.activeMonitors].reverse();
    this.activeMonitors = [];

    for (const registration of monitorsToStop) {
      try {
        await registration.monitor.stop();
      } catch (error: any) {
        cleanupErrors.push(`${registration.name}: ${error?.message || "cleanup failed"}`);
      }
    }

    return cleanupErrors;
  }

  private async statusFromHealth(registration: ExamMonitorRegistration, health: HealthCheckResult): Promise<MonitorStatus> {
    const current = await registration.monitor.getStatus().catch(() => null);
    return {
      name: registration.name,
      state: health.state,
      required: registration.required,
      checkedAt: health.checkedAt,
      message: health.message || current?.message || `${registration.name} status checked.`,
      errorCode: health.errorCode ?? current?.errorCode,
      metadata: { ...(current?.metadata ?? {}), ...(health.metadata ?? {}) },
    };
  }

  private async safeDiagnostic(
    context: ExamMonitoringStartupContext,
    error: ExamMonitoringStartupError,
    cleanupErrors: string[]
  ) {
    try {
      await this.hooks.sendDiagnosticEvent?.({
        examId: context.examId,
        studentId: context.studentId,
        attemptId: context.attemptId,
        deviceId: context.deviceId,
        state: "failed",
        message: error.message,
        failedMonitor: error.failedMonitor,
        errorCode: error.code,
        cleanupErrors,
      });
    } catch {}
  }

  private async safeReturnToReadiness(context: ExamMonitoringStartupContext, error: ExamMonitoringStartupError) {
    try {
      await this.hooks.returnToReadiness?.(context, error);
    } catch {}
  }

  private snapshot(
    state: MonitorState,
    canRenderQuestions: boolean,
    statuses: MonitorStatus[],
    cleanupErrors: string[] = [],
    error?: ExamMonitoringStartupError
  ): ExamMonitoringStartupResult {
    return { state, canRenderQuestions, statuses, cleanupErrors, error };
  }
}

export function unsupportedMonitorStatus(
  name: ExamMonitorName,
  required: boolean,
  message = "This monitor is not implemented in the current runtime."
): MonitorStatus {
  return {
    name,
    required,
    state: "failed",
    checkedAt: new Date().toISOString(),
    message,
    errorCode: "not_implemented",
  };
}
