import { DESKTOP_APP_VERSION } from "../../config/appInfo";
import { isTauriAvailable } from "../../utils/tauri";
import { NetworkProbeService } from "../NetworkProbeService";
import { modelLoader } from "../ModelLoader";
import {
  mapNativeStateToReadinessState,
  NativeDeviceService,
  type NativeCapabilityDiagnostic,
  type NativeHardwareDiagnostics,
} from "../NativeDeviceService";
import type {
  DeviceReadinessReport,
  ExamMonitoringPolicy,
  ReadinessCheckId,
  ReadinessCheckResult,
  ReadinessCheckState,
  NetworkProbeResult,
} from "../../types";

export interface ReadinessScope {
  studentId: string;
  examId: string;
  attemptId?: string | null;
  deviceId?: string | null;
  policyVersion: string;
  policy: ExamMonitoringPolicy;
  minimumAppVersion?: string;
}

export interface ReadinessCheckAdapter {
  checkId: ReadinessCheckId;
  label: string;
  run: (context: ReadinessAdapterContext) => Promise<Omit<ReadinessCheckResult, "checkId" | "label" | "checkedAt" | "required">>;
}

export interface ReadinessAdapterContext {
  scope: ReadinessScope;
  now: () => Date;
  navigatorLike: Navigator;
  fetchBackendHealth: () => Promise<NetworkProbeResult & { serverTime?: string | null }>;
  getNativeHardwareDiagnostics: () => Promise<NativeHardwareDiagnostics>;
  isTauriAvailable: () => boolean;
  allowBrowserHardwareFallback: boolean;
}

export interface ReadinessProgressSnapshot {
  report: DeviceReadinessReport;
  completed: number;
  total: number;
}

export type ReadinessProgressHandler = (snapshot: ReadinessProgressSnapshot) => void;

export class DeviceReadinessOrchestrator {
  public constructor(private readonly adapters: ReadinessCheckAdapter[] = createDefaultReadinessAdapters()) {}

  public async run(scope: ReadinessScope, onProgress?: ReadinessProgressHandler): Promise<DeviceReadinessReport> {
    const startedAt = new Date().toISOString();
    const configurationFingerprint = fingerprintPolicy(scope.policy);
    const pending = this.adapters.map((adapter) =>
      makeResult(adapter.checkId, adapter.label, "pending", isRequiredCheck(adapter.checkId, scope.policy), "Waiting to run.", "")
    );
    let report: DeviceReadinessReport = {
      studentId: scope.studentId,
      examId: scope.examId,
      attemptId: scope.attemptId ?? null,
      deviceId: scope.deviceId ?? null,
      policyVersion: scope.policyVersion,
      configurationFingerprint,
      status: "pending",
      canStartExam: false,
      startedAt,
      completedAt: null,
      results: pending,
    };

    onProgress?.({ report, completed: 0, total: this.adapters.length });

    const context = defaultContext(scope);
    const results: ReadinessCheckResult[] = [];
    for (const adapter of this.adapters) {
      const required = isRequiredCheck(adapter.checkId, scope.policy);
      try {
        const partial = await adapter.run(context);
        results.push({
          checkId: adapter.checkId,
          label: adapter.label,
          required,
          checkedAt: context.now().toISOString(),
          ...partial,
        });
      } catch (error: any) {
        results.push({
          checkId: adapter.checkId,
          label: adapter.label,
          required,
          state: "failed",
          errorCode: "adapter_exception",
          message: "The readiness check could not complete.",
          remediation: "Retry the check. If it continues, contact support.",
          checkedAt: context.now().toISOString(),
          retryable: true,
          rawDiagnostic: { errorName: error?.name || "Error" },
        });
      }

      report = finalizeReport(scope, configurationFingerprint, startedAt, results, this.adapters);
      onProgress?.({ report, completed: results.length, total: this.adapters.length });
    }

    return report;
  }
}

export function isReadinessReportFresh(report: DeviceReadinessReport, scope: ReadinessScope): boolean {
  return (
    report.studentId === scope.studentId &&
    report.examId === scope.examId &&
    normalizeOptional(report.attemptId) === normalizeOptional(scope.attemptId) &&
    report.policyVersion === scope.policyVersion &&
    report.configurationFingerprint === fingerprintPolicy(scope.policy)
  );
}

export function createDefaultReadinessAdapters(): ReadinessCheckAdapter[] {
  return [
    mediaAvailabilityAdapter("camera_availability", "Camera availability", "videoinput"),
    mediaAvailabilityAdapter("microphone_availability", "Microphone availability", "audioinput"),
    displayConfigurationAdapter,
    screenCaptureSupportAdapter,
    permissionAdapter("camera_permission", "Camera permission", "camera"),
    permissionAdapter("microphone_permission", "Microphone permission", "microphone"),
    screenCapturePermissionAdapter,
    backendAvailabilityAdapter,
    backendLatencyAdapter,
    appVersionAdapter,
    deviceIdAdapter,
    encryptedDraftStorageAdapter,
    systemTimeDifferenceAdapter,
    aiModelAvailabilityAdapter,
  ];
}

export function isRequiredCheck(checkId: ReadinessCheckId, policy: ExamMonitoringPolicy): boolean {
  if (checkId === "camera_availability" || checkId === "camera_permission") return policy.requireCamera;
  if (checkId === "microphone_availability" || checkId === "microphone_permission") return policy.requireMicrophone;
  if (checkId === "display_configuration") return !policy.allowMultipleDisplays;
  if (checkId === "screen_capture_support" || checkId === "screen_capture_permission") return policy.requireScreenCapture;
  if (checkId === "required_ai_model_availability") return policy.requireLivenessChecks;
  if (checkId === "system_time_difference") return false;
  return true;
}

export function fingerprintPolicy(policy: ExamMonitoringPolicy): string {
  const stable = Object.keys(policy)
    .sort()
    .map((key) => `${key}:${String(policy[key as keyof ExamMonitoringPolicy])}`)
    .join("|");
  let hash = 0;
  for (let index = 0; index < stable.length; index += 1) {
    hash = (hash * 31 + stable.charCodeAt(index)) >>> 0;
  }
  return `policy-${hash.toString(16)}`;
}

function finalizeReport(
  scope: ReadinessScope,
  configurationFingerprint: string,
  startedAt: string,
  completedResults: ReadinessCheckResult[],
  adapters: ReadinessCheckAdapter[]
): DeviceReadinessReport {
  const completedIds = new Set(completedResults.map((result) => result.checkId));
  const remaining = adapters
    .filter((adapter) => !completedIds.has(adapter.checkId))
    .map((adapter) =>
      makeResult(adapter.checkId, adapter.label, "pending", isRequiredCheck(adapter.checkId, scope.policy), "Waiting to run.", "")
    );
  const results = [...completedResults, ...remaining];
  const requiredBlocked = results.some(
    (result) => result.required && (result.state === "failed" || result.state === "unsupported")
  );
  const pending = results.some((result) => result.state === "pending" || result.state === "checking");
  const warnings = results.some((result) => result.state === "warning" || (!result.required && result.state === "failed"));

  return {
    studentId: scope.studentId,
    examId: scope.examId,
    attemptId: scope.attemptId ?? null,
    deviceId: scope.deviceId ?? null,
    policyVersion: scope.policyVersion,
    configurationFingerprint,
    status: pending ? "checking" : requiredBlocked ? "blocked" : warnings ? "warning" : "ready",
    canStartExam: !pending && !requiredBlocked,
    startedAt,
    completedAt: pending ? null : new Date().toISOString(),
    results,
  };
}

function makeResult(
  checkId: ReadinessCheckId,
  label: string,
  state: ReadinessCheckState,
  required: boolean,
  message: string,
  remediation: string
): ReadinessCheckResult {
  return {
    checkId,
    label,
    state,
    required,
    message,
    remediation,
    checkedAt: new Date().toISOString(),
    retryable: state !== "passed",
    rawDiagnostic: {},
  };
}

function defaultContext(scope: ReadinessScope): ReadinessAdapterContext {
  return {
    scope,
    now: () => new Date(),
    navigatorLike: navigator,
    fetchBackendHealth: () => NetworkProbeService.probeBackendHealth(),
    getNativeHardwareDiagnostics: () => NativeDeviceService.getNativeHardwareDiagnostics(),
    isTauriAvailable,
    allowBrowserHardwareFallback: import.meta.env.DEV && !isTauriAvailable(),
  };
}

function mediaAvailabilityAdapter(
  checkId: ReadinessCheckId,
  label: string,
  kind: MediaDeviceKind
): ReadinessCheckAdapter {
  return {
    checkId,
    label,
    run: async ({ navigatorLike, getNativeHardwareDiagnostics, allowBrowserHardwareFallback, scope }) => {
      const native = await getNativeHardwareDiagnostics();
      const diagnostic = kind === "videoinput" ? native.camera : native.microphone;
      const nativeDevices = kind === "videoinput" ? native.cameras : native.microphones;
      if (diagnostic.state !== "unsupported") {
        const state = readinessStateForNativeDiagnostic(diagnostic, isRequiredCheck(checkId, scope.policy));
        return {
          state,
          errorCode: diagnostic.errorCode as ReadinessCheckResult["errorCode"],
          message: diagnostic.message || label,
          remediation: state === "passed" ? "" : `Connect a supported ${kind === "videoinput" ? "camera" : "microphone"} and retry.`,
          retryable: state !== "passed",
          rawDiagnostic: {
            source: "native",
            deviceCount: nativeDevices.length,
            errorCode: diagnostic.errorCode ?? null,
            checkedAt: native.checkedAt,
          },
        };
      }
      if (!allowBrowserHardwareFallback) {
        return unsupported(
          diagnostic.message || `${label} could not be verified by native diagnostics.`,
          "Use the CheatLock desktop runtime with supported native hardware diagnostics."
        );
      }
      if (!navigatorLike.mediaDevices?.enumerateDevices) {
        return unsupported("Media device enumeration is not supported.", "Use a supported desktop runtime.");
      }
      const browserDevices = await navigatorLike.mediaDevices.enumerateDevices();
      const count = browserDevices.filter((device) => device.kind === kind).length;
      return count > 0
        ? passed(`${label} passed.`, { count })
        : failed("not_found", `${label} failed.`, "Connect a supported device and retry.", { count });
    },
  };
}

function permissionAdapter(checkId: ReadinessCheckId, label: string, permissionName: PermissionName): ReadinessCheckAdapter {
  return {
    checkId,
    label,
    run: async ({ navigatorLike, getNativeHardwareDiagnostics, allowBrowserHardwareFallback, scope }) => {
      const native = await getNativeHardwareDiagnostics();
      const diagnostic = checkId === "camera_permission" ? native.cameraPermission : native.microphonePermission;
      if (diagnostic.state !== "unsupported") {
        const state = readinessStateForNativeDiagnostic(diagnostic, isRequiredCheck(checkId, scope.policy));
        return {
          state,
          errorCode: diagnostic.errorCode as ReadinessCheckResult["errorCode"],
          message: diagnostic.message || label,
          remediation: state === "passed" ? "" : "Enable the permission in system settings and retry.",
          retryable: state !== "passed",
          rawDiagnostic: {
            source: "native",
            permissionState: diagnostic.permissionState ?? null,
            errorCode: diagnostic.errorCode ?? null,
            checkedAt: native.checkedAt,
          },
        };
      }
      if (!allowBrowserHardwareFallback) {
        return unsupported(
          diagnostic.message || `${label} could not be verified by native diagnostics.`,
          "Use the CheatLock desktop runtime with supported native permission diagnostics."
        );
      }
      if (!navigatorLike.permissions?.query) {
        return unsupported("Permission query is not supported.", "Continue on a runtime that supports permission status checks.");
      }
      const status = await navigatorLike.permissions.query({ name: permissionName } as PermissionDescriptor);
      if (status.state === "granted") return passed(`${label} passed.`, { permissionState: status.state });
      if (status.state === "prompt") {
        return warning("permission_prompt_required", `${label} still needs approval.`, "You will be asked in the permission step.", {
          permissionState: status.state,
        });
      }
      return failed("permission_denied", `${label} denied.`, "Enable the permission in system settings and retry.", {
        permissionState: status.state,
      });
    },
  };
}

const displayConfigurationAdapter: ReadinessCheckAdapter = {
  checkId: "display_configuration",
  label: "Display configuration",
  run: async ({ getNativeHardwareDiagnostics, scope }) => {
    const native = await getNativeHardwareDiagnostics();
    if (native.displayConfiguration.state === "unsupported") {
      return unsupported(
        native.displayConfiguration.message || "Display configuration could not be verified by native diagnostics.",
        "Use the CheatLock desktop runtime with supported native display diagnostics."
      );
    }

    const state = readinessStateForNativeDiagnostic(
      native.displayConfiguration,
      isRequiredCheck("display_configuration", scope.policy)
    );
    if (state !== "passed") {
      return {
        state,
        errorCode: native.displayConfiguration.errorCode as ReadinessCheckResult["errorCode"],
        message: native.displayConfiguration.message || "Display configuration could not be verified.",
        remediation: "Reconnect displays if needed, then retry the readiness check.",
        retryable: true,
        rawDiagnostic: {
          source: "native",
          displayCount: native.displays.length,
          displays: native.displays,
          checkedAt: native.checkedAt,
        },
      };
    }

    if (!scope.policy.allowMultipleDisplays && native.displays.length > 1) {
      return failed(
        "multiple_displays",
        `${native.displays.length} active displays were detected.`,
        "Disconnect additional displays before starting this exam.",
        { source: "native", displayCount: native.displays.length, displays: native.displays, checkedAt: native.checkedAt }
      );
    }

    return passed(
      native.displays.length === 1 ? "One active display detected." : `${native.displays.length} active displays detected.`,
      { source: "native", displayCount: native.displays.length, displays: native.displays, checkedAt: native.checkedAt }
    );
  },
};

const screenCaptureSupportAdapter: ReadinessCheckAdapter = {
  checkId: "screen_capture_support",
  label: "Screen-capture support",
  run: async ({ navigatorLike, getNativeHardwareDiagnostics, allowBrowserHardwareFallback, scope }) => {
    const native = await getNativeHardwareDiagnostics();
    if (native.screenCapture.state !== "unsupported") {
      const state = readinessStateForNativeDiagnostic(native.screenCapture, isRequiredCheck("screen_capture_support", scope.policy));
      return {
        state,
        errorCode: native.screenCapture.errorCode as ReadinessCheckResult["errorCode"],
        message: native.screenCapture.message || "Screen-capture support checked.",
        remediation: state === "passed" ? "" : "Use a supported desktop runtime.",
        retryable: state !== "passed",
        rawDiagnostic: { source: "native", errorCode: native.screenCapture.errorCode ?? null, checkedAt: native.checkedAt },
      };
    }
    if (!allowBrowserHardwareFallback) {
      return unsupported(
        native.screenCapture.message || "Screen capture could not be verified by native diagnostics.",
        "Use the CheatLock desktop runtime with native screen-capture support."
      );
    }
    return typeof navigatorLike.mediaDevices?.getDisplayMedia === "function"
      ? passed("Screen capture is supported.", { source: "browser", hasGetDisplayMedia: true })
      : unsupported("Screen capture is not supported.", "Use the CheatLock desktop runtime with screen capture support.");
  },
};

const screenCapturePermissionAdapter: ReadinessCheckAdapter = {
  checkId: "screen_capture_permission",
  label: "Screen-capture permission",
  run: async ({ getNativeHardwareDiagnostics, scope }) => {
    const native = await getNativeHardwareDiagnostics();
    if (native.screenCapturePermission.state !== "unsupported") {
      const state = readinessStateForNativeDiagnostic(
        native.screenCapturePermission,
        isRequiredCheck("screen_capture_permission", scope.policy)
      );
      return {
        state,
        errorCode: native.screenCapturePermission.errorCode as ReadinessCheckResult["errorCode"],
        message: native.screenCapturePermission.message || "Screen-capture permission checked.",
        remediation: state === "passed" ? "" : "Grant screen-capture permission in system settings and retry.",
        retryable: state !== "passed",
        rawDiagnostic: {
          source: "native",
          permissionState: native.screenCapturePermission.permissionState ?? null,
          checkedAt: native.checkedAt,
        },
      };
    }
    return unsupported(
      "Screen-capture permission cannot be verified without requesting capture.",
      "Continue to the permission step to grant screen capture."
    );
  },
};

const backendAvailabilityAdapter: ReadinessCheckAdapter = {
  checkId: "backend_availability",
  label: "Backend availability",
  run: async ({ fetchBackendHealth }) => {
    const diagnostic = await fetchBackendHealth();
    return diagnostic.reachable
      ? passed("Backend is reachable.", {
          latencyMs: diagnostic.latencyMs,
          statusCode: diagnostic.statusCode,
          checkedAt: diagnostic.checkedAt,
        })
      : failed(
          diagnostic.errorCode as ReadinessCheckResult["errorCode"],
          diagnostic.message || "Backend is unreachable.",
          "Check your network connection and backend configuration, then retry.",
          { statusCode: diagnostic.statusCode, checkedAt: diagnostic.checkedAt }
        );
  },
};

const backendLatencyAdapter: ReadinessCheckAdapter = {
  checkId: "backend_latency",
  label: "Backend latency",
  run: async ({ fetchBackendHealth }) => {
    const result = await fetchBackendHealth();
    if (!result.reachable || typeof result.latencyMs !== "number") {
      return failed(
        result.errorCode as ReadinessCheckResult["errorCode"],
        result.message || "Backend latency could not be measured.",
        "Restore backend connectivity and retry.",
        { statusCode: result.statusCode, checkedAt: result.checkedAt }
      );
    }
    const { latencyMs } = result;
    return latencyMs <= 1500
      ? passed("Backend latency is acceptable.", { latencyMs })
      : warning("latency_high", "Backend latency is high.", "Move to a more stable network and retry.", { latencyMs });
  },
};

const appVersionAdapter: ReadinessCheckAdapter = {
  checkId: "application_version_compatibility",
  label: "Application version compatibility",
  run: async ({ scope }) => {
    const minimum = scope.minimumAppVersion || DESKTOP_APP_VERSION;
    return compareVersions(DESKTOP_APP_VERSION, minimum) >= 0
      ? passed("Application version is compatible.", { currentVersion: DESKTOP_APP_VERSION, minimumVersion: minimum })
      : failed("version_incompatible", "Application version is too old.", "Update CheatLock Desktop and retry.", {
          currentVersion: DESKTOP_APP_VERSION,
          minimumVersion: minimum,
        });
  },
};

const deviceIdAdapter: ReadinessCheckAdapter = {
  checkId: "device_id_availability",
  label: "Device ID availability",
  run: async ({ scope }) =>
    scope.deviceId
      ? passed("Device ID is available.", { hasDeviceId: true })
      : failed("missing_device_id", "Device ID is not available.", "Complete device registration before starting the exam.", {
          hasDeviceId: false,
        }),
};

const encryptedDraftStorageAdapter: ReadinessCheckAdapter = {
  checkId: "encrypted_draft_storage_availability",
  label: "Encrypted draft storage availability",
  run: async ({ isTauriAvailable }) =>
    isTauriAvailable()
      ? unsupported("Encrypted draft storage is not implemented yet.", "Use online submission until encrypted storage is added.")
      : unsupported("Encrypted draft storage requires native support.", "Use the CheatLock desktop application."),
};

const systemTimeDifferenceAdapter: ReadinessCheckAdapter = {
  checkId: "system_time_difference",
  label: "System-time difference",
  run: async ({ fetchBackendHealth }) => {
    const { serverTime } = await fetchBackendHealth();
    if (!serverTime) return unsupported("Server time was not provided.", "Retry when the backend exposes a Date header.");
    const serverMs = new Date(serverTime).getTime();
    if (Number.isNaN(serverMs)) return unsupported("Server time could not be parsed.", "Contact support.");
    const differenceMs = Math.abs(Date.now() - serverMs);
    return differenceMs <= 120_000
      ? passed("System clock is close to server time.", { differenceMs })
      : warning("latency_high", "System clock differs from server time.", "Correct your system clock and retry.", { differenceMs });
  },
};

const aiModelAvailabilityAdapter: ReadinessCheckAdapter = {
  checkId: "required_ai_model_availability",
  label: "Required AI model availability",
  run: async () => {
    const readiness = await modelLoader.checkReadiness();
    if (readiness.state === "ready") {
      return passed(readiness.message, readiness.metadata);
    }
    return {
      state: readiness.state === "not_implemented" ? "unsupported" : "failed",
      errorCode: (readiness.errorCode || "not_implemented") as ReadinessCheckResult["errorCode"],
      message: readiness.message,
      remediation: "Install a verified model bundle with manifest, checksum, runtime metadata, and test inference support.",
      retryable: true,
      rawDiagnostic: readiness.metadata,
    };
  },
};

function passed(message: string, rawDiagnostic: Record<string, unknown>): Omit<ReadinessCheckResult, "checkId" | "label" | "checkedAt" | "required"> {
  return { state: "passed", message, remediation: "", retryable: false, rawDiagnostic };
}

function readinessStateForNativeDiagnostic(
  diagnostic: NativeCapabilityDiagnostic,
  required: boolean
): ReadinessCheckState {
  const state = mapNativeStateToReadinessState(diagnostic.state);
  if (required && state === "warning") return "failed";
  return state;
}

function warning(
  errorCode: ReadinessCheckResult["errorCode"],
  message: string,
  remediation: string,
  rawDiagnostic: Record<string, unknown>
): Omit<ReadinessCheckResult, "checkId" | "label" | "checkedAt" | "required"> {
  return { state: "warning", errorCode, message, remediation, retryable: true, rawDiagnostic };
}

function failed(
  errorCode: ReadinessCheckResult["errorCode"],
  message: string,
  remediation: string,
  rawDiagnostic: Record<string, unknown>
): Omit<ReadinessCheckResult, "checkId" | "label" | "checkedAt" | "required"> {
  return { state: "failed", errorCode, message, remediation, retryable: true, rawDiagnostic };
}

function unsupported(
  message: string,
  remediation: string
): Omit<ReadinessCheckResult, "checkId" | "label" | "checkedAt" | "required"> {
  return { state: "unsupported", errorCode: "not_implemented", message, remediation, retryable: false, rawDiagnostic: {} };
}

function compareVersions(left: string, right: string) {
  const a = left.split(".").map(Number);
  const b = right.split(".").map(Number);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const diff = (a[index] || 0) - (b[index] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function normalizeOptional(value?: string | null) {
  return value?.trim() || "none";
}
