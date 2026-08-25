import { invoke, isTauriAvailable } from "../utils/tauri";
import type { ReadinessCheckState } from "../types";

export interface InstallationDeviceIdentity {
  deviceId: string;
  wasCreated: boolean;
  recoveredFromCorruption: boolean;
}

export interface NativeCapabilityDiagnostic {
  state: "available" | "unavailable" | "permission_denied" | "unsupported" | "failed" | "unknown";
  errorCode?: string | null;
  message?: string | null;
  permissionState?: "allowed" | "denied" | "restricted" | "not_determined" | "unsupported" | "unknown" | null;
}

export interface NativeMediaDevice {
  id: string;
  label: string;
  isDefault: boolean;
}

export interface NativeDisplayDevice {
  id: string;
  label: string;
  isPrimary: boolean;
  width: number;
  height: number;
  x: number;
  y: number;
}

export interface NativeHardwareDiagnostics {
  osName: string;
  cameras: NativeMediaDevice[];
  microphones: NativeMediaDevice[];
  displays: NativeDisplayDevice[];
  camera: NativeCapabilityDiagnostic;
  microphone: NativeCapabilityDiagnostic;
  screenCapture: NativeCapabilityDiagnostic;
  displayConfiguration: NativeCapabilityDiagnostic;
  cameraPermission: NativeCapabilityDiagnostic;
  microphonePermission: NativeCapabilityDiagnostic;
  screenCapturePermission: NativeCapabilityDiagnostic;
  checkedAt: string;
}

export interface NativeMonitorStatus {
  module: "screen" | "camera" | "audio" | "ai" | string;
  state: "idle" | "starting" | "active" | "degraded" | "failed" | "stopping" | "unsupported";
  errorCode?: string | null;
  message: string;
  activeExamId?: string | null;
}

export interface NativeMonitoringStatus {
  screen: NativeMonitorStatus;
  camera: NativeMonitorStatus;
  audio: NativeMonitorStatus;
  ai: NativeMonitorStatus;
  applicationSecurityActive: boolean;
}

export interface NativeScreenCaptureConfig {
  displayId?: string | null;
  sampleIntervalMs?: number | null;
  activeExamId?: string | null;
}

export interface NativeScreenCaptureStatus {
  module: "screen";
  state: NativeMonitorStatus["state"];
  errorCode?: string | null;
  message: string;
  activeExamId?: string | null;
  selectedDisplayId?: string | null;
  selectedDisplayLabel?: string | null;
  width?: number | null;
  height?: number | null;
  frameCount: number;
  captureStartedAt?: string | null;
  latestFrameTimestamp?: string | null;
  latestFrameSequence?: number | null;
  sampleIntervalMs: number;
  lastError?: string | null;
}

export interface NativeCompressedScreenSample {
  displayId: string;
  width: number;
  height: number;
  encoding: "image/png" | string;
  pixelSourceFormat: "bgra8" | string;
  sequenceNumber: number;
  capturedAt: string;
  sizeBytes: number;
  data: number[];
}

export interface NativeScreenCaptureSmokeResult {
  started: boolean;
  sampleReceived: boolean;
  width: number;
  height: number;
  encoding: string;
  sizeBytes: number;
  sequenceNumber: number;
  stopped: boolean;
  cleanupState: string;
}

export interface NativeScreenCaptureDiagnostic {
  displayId?: string | null;
  displayLabel?: string | null;
  displayX: number;
  displayY: number;
  width: number;
  height: number;
  expectedBgraSize: number;
  attempts: NativeGdiCaptureAttemptDiagnostic[];
}

export interface NativeScreenSessionDiagnostics {
  processId: number;
  currentSessionId?: number | null;
  currentSessionError?: string | null;
  activeConsoleSessionId?: number | null;
  sessionMatchesActiveConsole?: boolean | null;
  interactiveDesktopOpened: boolean;
  interactiveDesktopError?: string | null;
  elevated?: boolean | null;
  elevationError?: string | null;
  integrityLevel?: string | null;
  integrityError?: string | null;
}

export interface NativeGdiCaptureAttemptDiagnostic {
  sourceStrategy: string;
  sourceDcAcquired: boolean;
  sourceDcHandle: number;
  sourceObjectType: number;
  sourceRasterCaps: number;
  sourceSupportsBitblt: boolean;
  memoryDcCreated: boolean;
  memoryDcHandle: number;
  memoryObjectType: number;
  bitmapCreated: boolean;
  bitmapHandle: number;
  objectSelected: boolean;
  previousObjectHandle: number;
  captureBltSucceeded: boolean;
  captureBltError?: number | null;
  srccopySucceeded: boolean;
  srccopyError?: number | null;
  frameByteLength?: number | null;
  pngByteLength?: number | null;
  errorStage?: string | null;
  win32Error?: number | null;
}

export class NativeDeviceService {
  public static async getInstallationDeviceIdentity(): Promise<InstallationDeviceIdentity> {
    if (!isTauriAvailable()) {
      throw new Error("Native device identity is unavailable outside the Tauri desktop runtime.");
    }
    return invoke<InstallationDeviceIdentity>("get_installation_device_identity");
  }

  public static async getNativeHardwareDiagnostics(): Promise<NativeHardwareDiagnostics> {
    if (!isTauriAvailable()) {
      return {
        osName: "browser",
        cameras: [],
        microphones: [],
        displays: [],
        camera: unsupported("Native camera diagnostics require the Tauri desktop runtime."),
        microphone: unsupported("Native microphone diagnostics require the Tauri desktop runtime."),
        screenCapture: unsupported("Native screen-capture diagnostics require the Tauri desktop runtime."),
        displayConfiguration: unsupported("Native display diagnostics require the Tauri desktop runtime."),
        cameraPermission: unsupported("Native camera permission diagnostics require the Tauri desktop runtime."),
        microphonePermission: unsupported("Native microphone permission diagnostics require the Tauri desktop runtime."),
        screenCapturePermission: unsupported("Native screen-capture permission diagnostics require the Tauri desktop runtime."),
        checkedAt: new Date().toISOString(),
      };
    }
    return invoke<NativeHardwareDiagnostics>("get_native_hardware_diagnostics");
  }

  public static async getNativeMonitoringStatus(): Promise<NativeMonitoringStatus> {
    if (!isTauriAvailable()) {
      return {
        screen: nativeMonitorUnsupported("screen", "Native screen monitoring requires the Tauri desktop runtime."),
        camera: nativeMonitorUnsupported("camera", "Native camera monitoring requires the Tauri desktop runtime."),
        audio: nativeMonitorUnsupported("audio", "Native audio monitoring requires the Tauri desktop runtime."),
        ai: nativeMonitorUnsupported("ai", "Native AI monitoring requires the Tauri desktop runtime."),
        applicationSecurityActive: false,
      };
    }
    return invoke<NativeMonitoringStatus>("get_native_monitoring_status");
  }

  public static async startNativeScreenCapture(config: NativeScreenCaptureConfig = {}): Promise<void> {
    if (!isTauriAvailable()) {
      throw new Error("Native screen capture requires the Tauri desktop runtime.");
    }
    return invoke<void>("start_native_screen_capture", { config });
  }

  public static async stopNativeScreenCapture(): Promise<void> {
    if (!isTauriAvailable()) return;
    return invoke<void>("stop_native_screen_capture");
  }

  public static async getNativeScreenCaptureStatus(): Promise<NativeScreenCaptureStatus> {
    if (!isTauriAvailable()) {
      return {
        module: "screen",
        state: "unsupported",
        errorCode: "unsupported_platform",
        message: "Native screen capture requires the Tauri desktop runtime.",
        activeExamId: null,
        selectedDisplayId: null,
        selectedDisplayLabel: null,
        width: null,
        height: null,
        frameCount: 0,
        captureStartedAt: null,
        latestFrameTimestamp: null,
        latestFrameSequence: null,
        sampleIntervalMs: 0,
        lastError: "Native screen capture requires the Tauri desktop runtime.",
      };
    }
    return invoke<NativeScreenCaptureStatus>("get_native_screen_capture_status");
  }

  public static async captureNativeScreenSample(): Promise<NativeCompressedScreenSample | null> {
    if (!isTauriAvailable()) {
      throw new Error("Native screen samples require the Tauri desktop runtime.");
    }
    return invoke<NativeCompressedScreenSample | null>("capture_native_screen_sample");
  }

  public static async runNativeScreenCaptureSmokeTest(): Promise<NativeScreenCaptureSmokeResult> {
    if (!isTauriAvailable()) {
      throw new Error("Native screen capture smoke test requires the Tauri desktop runtime.");
    }
    return invoke<NativeScreenCaptureSmokeResult>("run_native_screen_capture_smoke_test");
  }

  public static async diagnoseNativeScreenCapture(): Promise<NativeScreenCaptureDiagnostic> {
    if (!isTauriAvailable()) {
      throw new Error("Native screen capture diagnostics require the Tauri desktop runtime.");
    }
    return invoke<NativeScreenCaptureDiagnostic>("diagnose_native_screen_capture");
  }

  public static async getNativeScreenSessionDiagnostics(): Promise<NativeScreenSessionDiagnostics> {
    if (!isTauriAvailable()) {
      return {
        processId: 0,
        currentSessionId: null,
        currentSessionError: "Native screen session diagnostics require the Tauri desktop runtime.",
        activeConsoleSessionId: null,
        sessionMatchesActiveConsole: null,
        interactiveDesktopOpened: false,
        interactiveDesktopError: "Native screen session diagnostics require the Tauri desktop runtime.",
        elevated: null,
        elevationError: "Native screen session diagnostics require the Tauri desktop runtime.",
        integrityLevel: null,
        integrityError: "Native screen session diagnostics require the Tauri desktop runtime.",
      };
    }
    return invoke<NativeScreenSessionDiagnostics>("get_native_screen_session_diagnostics");
  }
}

export function mapNativeStateToReadinessState(state: NativeCapabilityDiagnostic["state"]): ReadinessCheckState {
  if (state === "available") return "passed";
  if (state === "unavailable" || state === "permission_denied" || state === "failed") return "failed";
  if (state === "unknown") return "warning";
  return "unsupported";
}

function unsupported(message: string): NativeCapabilityDiagnostic {
  return {
    state: "unsupported",
    errorCode: "unsupported_platform",
    message,
    permissionState: "unsupported",
  };
}

function nativeMonitorUnsupported(module: NativeMonitorStatus["module"], message: string): NativeMonitorStatus {
  return {
    module,
    state: "unsupported",
    errorCode: "unsupported_platform",
    message,
    activeExamId: null,
  };
}
