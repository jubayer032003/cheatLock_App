import { describe, expect, it, vi } from "vitest";
import type { ExamMonitoringPolicy, ReadinessCheckResult } from "../../types";
import {
  createDefaultReadinessAdapters,
  DeviceReadinessOrchestrator,
  fingerprintPolicy,
  isReadinessReportFresh,
  type ReadinessAdapterContext,
  type ReadinessCheckAdapter,
  type ReadinessScope,
} from "./DeviceReadinessOrchestrator";
import type { NativeHardwareDiagnostics } from "../NativeDeviceService";

const basePolicy: ExamMonitoringPolicy = {
  requireCamera: true,
  requireMicrophone: true,
  requireScreenCapture: false,
  requireIdentityVerification: true,
  requireLivenessChecks: false,
  allowOfflineDrafts: true,
  allowMultipleDisplays: false,
  telemetryIntervalMs: 5000,
  screenSnapshotIntervalMs: 15000,
};

const baseScope: ReadinessScope = {
  studentId: "stu-001",
  examId: "64f0c9b27d6f3f0a8b2c1234",
  attemptId: "attempt-1",
  deviceId: "device-1",
  policyVersion: "policy-1",
  policy: basePolicy,
};

function adapter(
  checkId: ReadinessCheckAdapter["checkId"],
  state: ReadinessCheckResult["state"],
  options: Partial<Omit<ReadinessCheckResult, "checkId" | "label" | "checkedAt" | "required" | "state">> = {}
): ReadinessCheckAdapter {
  return {
    checkId,
    label: checkId,
    run: async () => ({
      state,
      message: `${checkId} ${state}`,
      remediation: "",
      retryable: state !== "passed",
      rawDiagnostic: {},
      ...options,
    }),
  };
}

describe("DeviceReadinessOrchestrator", () => {
  it("allows startup when all required checks passed", async () => {
    const report = await new DeviceReadinessOrchestrator([
      adapter("camera_availability", "passed"),
      adapter("camera_permission", "passed"),
      adapter("backend_availability", "passed"),
      adapter("device_id_availability", "passed"),
    ]).run(baseScope);

    expect(report.status).toBe("ready");
    expect(report.canStartExam).toBe(true);
    expect(report.configurationFingerprint).toBe(fingerprintPolicy(basePolicy));
  });

  it("blocks startup when a required check failed", async () => {
    const report = await new DeviceReadinessOrchestrator([
      adapter("camera_availability", "failed", { errorCode: "not_found" }),
    ]).run(baseScope);

    expect(report.status).toBe("blocked");
    expect(report.canStartExam).toBe(false);
  });

  it("blocks startup when a required check is unsupported", async () => {
    const report = await new DeviceReadinessOrchestrator([
      adapter("camera_permission", "unsupported", { errorCode: "not_implemented" }),
    ]).run(baseScope);

    expect(report.status).toBe("blocked");
    expect(report.canStartExam).toBe(false);
  });

  it("keeps optional failed checks as warnings", async () => {
    const scope = { ...baseScope, policy: { ...basePolicy, requireScreenCapture: false } };
    const report = await new DeviceReadinessOrchestrator([
      adapter("screen_capture_permission", "failed", { errorCode: "not_implemented" }),
      adapter("backend_availability", "passed"),
    ]).run(scope);

    expect(report.status).toBe("warning");
    expect(report.canStartExam).toBe(true);
  });

  it("supports retry by rerunning adapters", async () => {
    const run = vi.fn()
      .mockResolvedValueOnce({
        state: "failed",
        errorCode: "network_error",
        message: "offline",
        remediation: "retry",
        retryable: true,
        rawDiagnostic: {},
      })
      .mockResolvedValueOnce({
        state: "passed",
        message: "online",
        remediation: "",
        retryable: false,
        rawDiagnostic: {},
      });
    const orchestrator = new DeviceReadinessOrchestrator([{ checkId: "backend_availability", label: "Backend", run }]);

    expect((await orchestrator.run(baseScope)).canStartExam).toBe(false);
    expect((await orchestrator.run(baseScope)).canStartExam).toBe(true);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("detects stale readiness when attempt changes", async () => {
    const report = await new DeviceReadinessOrchestrator([adapter("backend_availability", "passed")]).run(baseScope);

    expect(isReadinessReportFresh(report, { ...baseScope, attemptId: "attempt-2" })).toBe(false);
  });

  it("detects stale readiness when exam policy changes", async () => {
    const report = await new DeviceReadinessOrchestrator([adapter("backend_availability", "passed")]).run(baseScope);

    expect(
      isReadinessReportFresh(report, {
        ...baseScope,
        policy: { ...basePolicy, requireScreenCapture: true },
      })
    ).toBe(false);
  });

  it("turns adapter exceptions into failed results", async () => {
    const report = await new DeviceReadinessOrchestrator([
      {
        checkId: "backend_availability",
        label: "Backend",
        run: async () => {
          throw new Error("boom");
        },
      },
    ]).run(baseScope);

    expect(report.status).toBe("blocked");
    expect(report.results[0].errorCode).toBe("adapter_exception");
  });

  it("emits partial completion snapshots", async () => {
    const snapshots: number[] = [];
    await new DeviceReadinessOrchestrator([
      adapter("backend_availability", "passed"),
      adapter("backend_latency", "passed"),
    ]).run(baseScope, ({ completed }) => snapshots.push(completed));

    expect(snapshots).toEqual([0, 1, 2]);
  });

  it("maps native camera availability to passed with device count", async () => {
    const result = await runDefaultAdapter("camera_availability", hardware({ cameraState: "available", cameras: 1 }));

    expect(result.state).toBe("passed");
    expect(result.rawDiagnostic.deviceCount).toBe(1);
  });

  it("maps no native camera to failed", async () => {
    const result = await runDefaultAdapter("camera_availability", hardware({ cameraState: "unavailable", cameras: 0 }));

    expect(result.state).toBe("failed");
    expect(result.errorCode).toBe("not_found");
  });

  it("maps permission denied to failed", async () => {
    const result = await runDefaultAdapter(
      "camera_permission",
      hardware({ cameraPermissionState: "permission_denied", cameraPermission: "denied" })
    );

    expect(result.state).toBe("failed");
    expect(result.errorCode).toBe("permission_denied");
    expect(result.rawDiagnostic.permissionState).toBe("denied");
  });

  it("blocks multiple displays when the exam policy disallows them", async () => {
    const result = await runDefaultAdapter("display_configuration", hardware({ displays: 2 }));

    expect(result.state).toBe("failed");
    expect(result.errorCode).toBe("multiple_displays");
    expect(result.rawDiagnostic.displayCount).toBe(2);
  });

  it("allows multiple displays when the exam policy permits them", async () => {
    const result = await runDefaultAdapter("display_configuration", hardware({ displays: 2 }), {
      scope: { ...baseScope, policy: { ...basePolicy, allowMultipleDisplays: true } },
    });

    expect(result.state).toBe("passed");
    expect(result.rawDiagnostic.displayCount).toBe(2);
  });

  it("blocks unsupported required native capability", async () => {
    const report = await new DeviceReadinessOrchestrator([
      {
        checkId: "camera_availability",
        label: "Camera availability",
        run: () => runDefaultAdapter("camera_availability", hardware({ cameraState: "unsupported" })),
      },
    ]).run(baseScope);

    expect(report.status).toBe("blocked");
    expect(report.canStartExam).toBe(false);
  });

  it("keeps unsupported optional native capability as a warning", async () => {
    const result = await runDefaultAdapter(
      "screen_capture_support",
      hardware({ screenState: "unsupported" }),
      { scope: { ...baseScope, policy: { ...basePolicy, requireScreenCapture: false } } }
    );

    expect(result.state).toBe("unsupported");
  });

  it("maps native command rejection to adapter failure", async () => {
    const defaultAdapter = createDefaultReadinessAdapters().find((item) => item.checkId === "camera_availability")!;
    const report = await new DeviceReadinessOrchestrator([
      {
        checkId: defaultAdapter.checkId,
        label: defaultAdapter.label,
        run: (context) => defaultAdapter.run({ ...context, getNativeHardwareDiagnostics: async () => { throw new Error("native failed"); } }),
      },
    ]).run(baseScope);

    expect(report.status).toBe("blocked");
    expect(report.results[0].errorCode).toBe("adapter_exception");
  });

  it("rejects browser fallback when native diagnostics are unavailable in protected readiness", async () => {
    const enumerateDevices = vi.fn(async () => [{ kind: "videoinput" }]);
    const result = await runDefaultAdapter("camera_availability", hardware({ cameraState: "unsupported" }), {
      allowBrowserHardwareFallback: false,
      navigatorLike: { mediaDevices: { enumerateDevices } } as unknown as Navigator,
    });

    expect(result.state).toBe("unsupported");
    expect(enumerateDevices).not.toHaveBeenCalled();
  });
});

function defaultAdapter(checkId: ReadinessCheckAdapter["checkId"]) {
  const adapter = createDefaultReadinessAdapters().find((item) => item.checkId === checkId);
  if (!adapter) throw new Error(`Missing default adapter ${checkId}`);
  return adapter;
}

function runDefaultAdapter(
  checkId: ReadinessCheckAdapter["checkId"],
  diagnostics: NativeHardwareDiagnostics,
  overrides: Partial<ReadinessAdapterContext> = {}
) {
  return defaultAdapter(checkId).run({
    scope: baseScope,
    now: () => new Date("2026-07-25T00:00:00.000Z"),
    navigatorLike: { mediaDevices: {}, permissions: {} } as Navigator,
    fetchBackendHealth: async () => ({ reachable: true, latencyMs: 10, checkedAt: "now" }),
    getNativeHardwareDiagnostics: async () => diagnostics,
    isTauriAvailable: () => true,
    allowBrowserHardwareFallback: false,
    ...overrides,
  });
}

function hardware(
  options: {
    cameras?: number;
    microphones?: number;
    cameraState?: NativeHardwareDiagnostics["camera"]["state"];
    microphoneState?: NativeHardwareDiagnostics["microphone"]["state"];
    screenState?: NativeHardwareDiagnostics["screenCapture"]["state"];
    displayState?: NativeHardwareDiagnostics["displayConfiguration"]["state"];
    displays?: number;
    cameraPermissionState?: NativeHardwareDiagnostics["cameraPermission"]["state"];
    cameraPermission?: NativeHardwareDiagnostics["cameraPermission"]["permissionState"];
  } = {}
): NativeHardwareDiagnostics {
  const cameraState = options.cameraState ?? "available";
  const microphoneState = options.microphoneState ?? "available";
  const screenState = options.screenState ?? "available";
  const displayState = options.displayState ?? "available";
  return {
    osName: "windows",
    cameras: Array.from({ length: options.cameras ?? (cameraState === "available" ? 1 : 0) }, (_, index) => ({
      id: `camera-${index}`,
      label: `Camera ${index + 1}`,
      isDefault: index === 0,
    })),
    microphones: Array.from({ length: options.microphones ?? (microphoneState === "available" ? 1 : 0) }, (_, index) => ({
      id: `microphone-${index}`,
      label: `Microphone ${index + 1}`,
      isDefault: index === 0,
    })),
    displays: Array.from({ length: options.displays ?? (displayState === "available" ? 1 : 0) }, (_, index) => ({
      id: `display-${index}`,
      label: `Display ${index + 1}`,
      isPrimary: index === 0,
      width: 1920,
      height: 1080,
      x: index * 1920,
      y: 0,
    })),
    camera: diagnostic(cameraState, cameraState === "unavailable" ? "not_found" : undefined),
    microphone: diagnostic(microphoneState, microphoneState === "unavailable" ? "not_found" : undefined),
    screenCapture: diagnostic(screenState, screenState === "unsupported" ? "unsupported_platform" : undefined),
    displayConfiguration: diagnostic(displayState, displayState === "unavailable" ? "not_found" : undefined),
    cameraPermission: {
      ...diagnostic(options.cameraPermissionState ?? "unknown", options.cameraPermissionState === "permission_denied" ? "permission_denied" : "permission_not_determined"),
      permissionState: options.cameraPermission ?? "unknown",
    },
    microphonePermission: { ...diagnostic("unknown", "permission_not_determined"), permissionState: "unknown" },
    screenCapturePermission: { ...diagnostic("unknown", "permission_not_queryable"), permissionState: "unknown" },
    checkedAt: "unix-ms:1",
  };
}

function diagnostic(state: NativeHardwareDiagnostics["camera"]["state"], errorCode?: string) {
  return {
    state,
    errorCode: errorCode ?? null,
    message: `${state} diagnostic`,
    permissionState: null,
  };
}
