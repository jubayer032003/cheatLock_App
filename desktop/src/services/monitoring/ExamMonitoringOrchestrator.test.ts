import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EXAM_CONSENT_POLICY_VERSION } from "../../config/consentPolicy";
import { IDENTITY_VERIFICATION_POLICY_VERSION } from "../../config/identityVerification";
import { ExamPreparationStateService } from "../ExamPreparationStateService";
import { IdentityVerificationService } from "../IdentityVerificationService";
import { fingerprintPolicy } from "../readiness/DeviceReadinessOrchestrator";
import {
  ExamMonitoringOrchestrator,
  type ExamMonitor,
  type ExamMonitorRegistration,
  type ExamMonitoringStartupContext,
} from "./ExamMonitoringOrchestrator";
import type {
  DeviceReadinessReport,
  ExamMonitorName,
  ExamMonitoringPolicy,
  HealthCheckResult,
  MonitorState,
  MonitorStatus,
} from "../../types";

const policy: ExamMonitoringPolicy = {
  requireCamera: true,
  requireMicrophone: true,
  requireScreenCapture: true,
  requireIdentityVerification: true,
  requireLivenessChecks: true,
  allowOfflineDrafts: true,
  allowMultipleDisplays: false,
  telemetryIntervalMs: 30000,
  screenSnapshotIntervalMs: 30000,
};

const scope = {
  studentId: "student-1",
  examId: "exam-1",
  attemptId: "attempt-1",
  deviceId: "device-1",
};

describe("ExamMonitoringOrchestrator", () => {
  beforeEach(() => {
    vi.useRealTimers();
    ExamPreparationStateService.clearAllForTests();
    IdentityVerificationService.clearAllForTests();
    ExamPreparationStateService.acceptConsent({ ...scope, consentPolicyVersion: EXAM_CONSENT_POLICY_VERSION });
    IdentityVerificationService.verified({
      ...scope,
      verificationPolicyVersion: IDENTITY_VERIFICATION_POLICY_VERSION,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts every required monitor and allows questions after backend readiness confirmation", async () => {
    const order: string[] = [];
    const monitors = registrations(["screen", "camera", "microphone"], order);
    const hooks = {
      createOrResumeSession: vi.fn(async () => {
        order.push("session");
      }),
      startHeartbeatAndEvents: vi.fn(async () => {
        order.push("heartbeat");
      }),
      notifyMonitoringReady: vi.fn(async () => {
        order.push("ready");
      }),
    };

    const result = await new ExamMonitoringOrchestrator(monitors, hooks).start(context());

    expect(result.state).toBe("active");
    expect(result.canRenderQuestions).toBe(true);
    expect(order).toEqual([
      "session",
      "start:screen",
      "health:screen",
      "status:screen",
      "start:camera",
      "health:camera",
      "status:camera",
      "start:microphone",
      "health:microphone",
      "status:microphone",
      "heartbeat",
      "ready",
    ]);
  });

  it("rolls back when the first required monitor fails", async () => {
    const order: string[] = [];
    const monitors = registrations(["screen", "camera"], order, { screen: failedHealth("screen") });

    const result = await new ExamMonitoringOrchestrator(monitors).start(context());

    expect(result.state).toBe("failed");
    expect(result.canRenderQuestions).toBe(false);
    expect(result.error?.failedMonitor).toBe("screen");
    expect(order).toEqual(["start:screen", "health:screen", "status:screen", "stop:screen"]);
  });

  it("rolls back in reverse order when a middle monitor fails", async () => {
    const order: string[] = [];
    const monitors = registrations(["screen", "camera", "microphone"], order, { camera: failedHealth("camera") });

    const result = await new ExamMonitoringOrchestrator(monitors).start(context());

    expect(result.error?.failedMonitor).toBe("camera");
    expect(order).toEqual([
      "start:screen",
      "health:screen",
      "status:screen",
      "start:camera",
      "health:camera",
      "status:camera",
      "stop:camera",
      "stop:screen",
    ]);
  });

  it("rolls back all started monitors when the final monitor fails", async () => {
    const order: string[] = [];
    const monitors = registrations(["screen", "camera", "microphone"], order, { microphone: failedHealth("microphone") });

    const result = await new ExamMonitoringOrchestrator(monitors).start(context());

    expect(result.error?.failedMonitor).toBe("microphone");
    expect(order.slice(-3)).toEqual(["stop:microphone", "stop:camera", "stop:screen"]);
  });

  it("records cleanup exceptions without hiding the startup failure", async () => {
    const order: string[] = [];
    const monitors = registrations(["screen", "camera"], order, { camera: failedHealth("camera") }, { screen: true });

    const result = await new ExamMonitoringOrchestrator(monitors).start(context());

    expect(result.error?.failedMonitor).toBe("camera");
    expect(result.cleanupErrors).toEqual(["screen: cleanup failed"]);
  });

  it("blocks unsupported required monitors", async () => {
    const order: string[] = [];
    const monitors = registrations(["ai_model"], order, { ai_model: unsupportedHealth("ai_model") });

    const result = await new ExamMonitoringOrchestrator(monitors).start(context());

    expect(result.state).toBe("failed");
    expect(result.error?.code).toBe("not_implemented");
    expect(result.canRenderQuestions).toBe(false);
  });

  it("allows an unsupported optional monitor only as degraded when policy permits it", async () => {
    const order: string[] = [];
    const monitor = makeMonitor("ai_model", order, unsupportedHealth("ai_model"));
    const monitors: ExamMonitorRegistration[] = [{ name: "ai_model", monitor, required: false, allowDegraded: true }];

    const result = await new ExamMonitoringOrchestrator(monitors).start(context({ requireIdentityVerification: false }));

    expect(result.state).toBe("degraded");
    expect(result.canRenderQuestions).toBe(true);
  });

  it("rejects stale readiness reports", async () => {
    const stale = readinessReport({ attemptId: "old-attempt" });

    const result = await new ExamMonitoringOrchestrator([]).start(context({ readinessReport: stale }));

    expect(result.state).toBe("failed");
    expect(result.error?.code).toBe("readiness_stale");
  });

  it("rejects expired identity verification", async () => {
    IdentityVerificationService.clearAllForTests();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    IdentityVerificationService.verified({
      ...scope,
      verificationPolicyVersion: IDENTITY_VERIFICATION_POLICY_VERSION,
    });
    vi.setSystemTime(new Date("2026-01-02T00:00:00.000Z"));

    const result = await new ExamMonitoringOrchestrator([]).start(context());

    expect(result.state).toBe("failed");
    expect(result.error?.code).toBe("identity_verification_required");
  });

  it("rejects direct session access before required preparation state is complete", async () => {
    ExamPreparationStateService.clearAllForTests();

    const result = await new ExamMonitoringOrchestrator([]).start(context());

    expect(result.state).toBe("failed");
    expect(result.error?.code).toBe("consent_required");
    expect(result.canRenderQuestions).toBe(false);
  });

  it("deduplicates concurrent start requests", async () => {
    const order: string[] = [];
    const gate = deferred<void>();
    const monitor = makeMonitor("screen", order, passedHealth("screen"), async () => {
      order.push("start:screen");
      await gate.promise;
    });
    const orchestrator = new ExamMonitoringOrchestrator([{ name: "screen", monitor, required: true }]);

    const first = orchestrator.start(context());
    const second = orchestrator.start(context());
    gate.resolve();
    const [firstResult, secondResult] = await Promise.all([first, second]);

    expect(firstResult).toBe(secondResult);
    expect(order.filter((entry) => entry === "start:screen")).toHaveLength(1);
  });

  it("allows stop to be called multiple times", async () => {
    const order: string[] = [];
    const orchestrator = new ExamMonitoringOrchestrator(registrations(["screen"], order));

    await orchestrator.start(context());
    await orchestrator.stop();
    await orchestrator.stop();

    expect(order.filter((entry) => entry === "stop:screen")).toHaveLength(1);
    expect(orchestrator.getState()).toBe("idle");
  });
});

function context(overrides: Partial<ExamMonitoringStartupContext> = {}): ExamMonitoringStartupContext {
  return {
    ...scope,
    policy,
    policyVersion: "policy-v1",
    consentPolicyVersion: EXAM_CONSENT_POLICY_VERSION,
    identityVerificationPolicyVersion: IDENTITY_VERIFICATION_POLICY_VERSION,
    requireIdentityVerification: true,
    rulesAcknowledged: true,
    readinessReport: readinessReport(),
    ...overrides,
  };
}

function readinessReport(overrides: Partial<DeviceReadinessReport> = {}): DeviceReadinessReport {
  return {
    ...scope,
    policyVersion: "policy-v1",
    configurationFingerprint: fingerprintPolicy(policy),
    status: "ready",
    canStartExam: true,
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    results: [],
    ...overrides,
  };
}

function registrations(
  names: ExamMonitorName[],
  order: string[],
  healthOverrides: Partial<Record<ExamMonitorName, HealthCheckResult>> = {},
  stopFailures: Partial<Record<ExamMonitorName, boolean>> = {}
): ExamMonitorRegistration[] {
  return names.map((name) => ({
    name,
    required: true,
    monitor: makeMonitor(name, order, healthOverrides[name] ?? passedHealth(name), undefined, stopFailures[name]),
  }));
}

function makeMonitor(
  name: ExamMonitorName,
  order: string[],
  health: HealthCheckResult,
  startOverride?: () => Promise<void>,
  stopFails = false
): ExamMonitor {
  return {
    start: startOverride ?? (async () => {
      order.push(`start:${name}`);
    }),
    stop: async () => {
      order.push(`stop:${name}`);
      if (stopFails) throw new Error("cleanup failed");
    },
    getStatus: async () => {
      order.push(`status:${name}`);
      return status(name, health.state, health.healthy, health.message);
    },
    healthCheck: async () => {
      order.push(`health:${name}`);
      return health;
    },
  };
}

function passedHealth(name: ExamMonitorName): HealthCheckResult {
  return {
    healthy: true,
    state: "active",
    checkedAt: new Date().toISOString(),
    message: `${name} active`,
  };
}

function failedHealth(name: ExamMonitorName): HealthCheckResult {
  return {
    healthy: false,
    state: "failed",
    checkedAt: new Date().toISOString(),
    message: `${name} failed`,
    errorCode: "start_failed",
  };
}

function unsupportedHealth(name: ExamMonitorName): HealthCheckResult {
  return {
    healthy: false,
    state: "failed",
    checkedAt: new Date().toISOString(),
    message: `${name} not implemented`,
    errorCode: "not_implemented",
  };
}

function status(name: ExamMonitorName, state: MonitorState, healthy: boolean, message: string): MonitorStatus {
  return {
    name,
    state,
    required: true,
    checkedAt: new Date().toISOString(),
    message,
    errorCode: healthy ? undefined : "start_failed",
  };
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((resolver) => {
    resolve = resolver;
  });
  return { promise, resolve };
}
