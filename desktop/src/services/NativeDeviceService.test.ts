import { beforeEach, describe, expect, it, vi } from "vitest";
import { mapNativeStateToReadinessState, NativeDeviceService } from "./NativeDeviceService";

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  isTauriAvailable: vi.fn(),
}));

vi.mock("../utils/tauri", () => ({
  invoke: mocks.invoke,
  isTauriAvailable: mocks.isTauriAvailable,
}));

beforeEach(() => {
  mocks.invoke.mockReset();
  mocks.isTauriAvailable.mockReset();
});

describe("NativeDeviceService", () => {
  it("maps frontend native diagnostic states to readiness states", () => {
    expect(mapNativeStateToReadinessState("available")).toBe("passed");
    expect(mapNativeStateToReadinessState("unavailable")).toBe("failed");
    expect(mapNativeStateToReadinessState("permission_denied")).toBe("failed");
    expect(mapNativeStateToReadinessState("failed")).toBe("failed");
    expect(mapNativeStateToReadinessState("unknown")).toBe("warning");
    expect(mapNativeStateToReadinessState("unsupported")).toBe("unsupported");
  });

  it("returns unsupported diagnostics outside Tauri", async () => {
    mocks.isTauriAvailable.mockReturnValue(false);

    const diagnostics = await NativeDeviceService.getNativeHardwareDiagnostics();

    expect(diagnostics.camera.state).toBe("unsupported");
    expect(diagnostics.microphone.state).toBe("unsupported");
    expect(diagnostics.cameras).toEqual([]);
    expect(diagnostics.microphones).toEqual([]);
    expect(diagnostics.displays).toEqual([]);
    expect(diagnostics.displayConfiguration.state).toBe("unsupported");
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it("delegates native hardware diagnostics to Tauri when available", async () => {
    mocks.isTauriAvailable.mockReturnValue(true);
    mocks.invoke.mockResolvedValue({
      osName: "windows",
      cameras: [{ id: "device-a", label: "Integrated Camera", isDefault: true }],
      microphones: [],
      displays: [{ id: "display-a", label: "\\\\.\\DISPLAY1", isPrimary: true, width: 1920, height: 1080, x: 0, y: 0 }],
      camera: { state: "available", message: "camera found" },
      microphone: { state: "unavailable", errorCode: "not_found", message: "no microphone" },
      screenCapture: { state: "available", message: "screen supported" },
      displayConfiguration: { state: "available", message: "one display" },
      cameraPermission: { state: "unknown", permissionState: "unknown" },
      microphonePermission: { state: "permission_denied", permissionState: "denied" },
      screenCapturePermission: { state: "unknown", permissionState: "unknown" },
      checkedAt: "unix-ms:1",
    });

    const diagnostics = await NativeDeviceService.getNativeHardwareDiagnostics();

    expect(diagnostics.cameras).toHaveLength(1);
    expect(diagnostics.displays).toHaveLength(1);
    expect(diagnostics.microphone.state).toBe("unavailable");
    expect(mocks.invoke).toHaveBeenCalledWith("get_native_hardware_diagnostics");
  });

  it("returns unsupported monitor status outside Tauri", async () => {
    mocks.isTauriAvailable.mockReturnValue(false);

    const status = await NativeDeviceService.getNativeMonitoringStatus();

    expect(status.screen.state).toBe("unsupported");
    expect(status.camera.state).toBe("unsupported");
    expect(status.audio.state).toBe("unsupported");
    expect(status.ai.state).toBe("unsupported");
    expect(status.applicationSecurityActive).toBe(false);
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it("delegates native monitoring status to Tauri when available", async () => {
    mocks.isTauriAvailable.mockReturnValue(true);
    mocks.invoke.mockResolvedValue({
      screen: { module: "screen", state: "idle", message: "idle" },
      camera: { module: "camera", state: "idle", message: "idle" },
      audio: { module: "audio", state: "idle", message: "idle" },
      ai: { module: "ai", state: "idle", message: "idle" },
      applicationSecurityActive: false,
    });

    await NativeDeviceService.getNativeMonitoringStatus();

    expect(mocks.invoke).toHaveBeenCalledWith("get_native_monitoring_status");
  });

  it("delegates native screen capture lifecycle commands to Tauri", async () => {
    mocks.isTauriAvailable.mockReturnValue(true);
    mocks.invoke.mockResolvedValue(undefined);

    await NativeDeviceService.startNativeScreenCapture({ displayId: "display-1", sampleIntervalMs: 1000, activeExamId: "exam-1" });
    await NativeDeviceService.stopNativeScreenCapture();

    expect(mocks.invoke).toHaveBeenNthCalledWith(1, "start_native_screen_capture", {
      config: { displayId: "display-1", sampleIntervalMs: 1000, activeExamId: "exam-1" },
    });
    expect(mocks.invoke).toHaveBeenNthCalledWith(2, "stop_native_screen_capture");
  });

  it("returns unsupported native screen capture status outside Tauri", async () => {
    mocks.isTauriAvailable.mockReturnValue(false);

    const status = await NativeDeviceService.getNativeScreenCaptureStatus();

    expect(status.state).toBe("unsupported");
    expect(status.frameCount).toBe(0);
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it("delegates native screen sample requests to Tauri", async () => {
    mocks.isTauriAvailable.mockReturnValue(true);
    mocks.invoke.mockResolvedValue({
      displayId: "display-1",
      width: 2,
      height: 2,
      encoding: "image/png",
      pixelSourceFormat: "bgra8",
      sequenceNumber: 3,
      capturedAt: "unix-ms:3",
      sizeBytes: 12,
      data: [137, 80, 78, 71],
    });

    const sample = await NativeDeviceService.captureNativeScreenSample();

    expect(sample?.sequenceNumber).toBe(3);
    expect(sample?.encoding).toBe("image/png");
    expect(mocks.invoke).toHaveBeenCalledWith("capture_native_screen_sample");
  });

  it("delegates native screen smoke test to Tauri", async () => {
    mocks.isTauriAvailable.mockReturnValue(true);
    mocks.invoke.mockResolvedValue({
      started: true,
      sampleReceived: true,
      width: 1920,
      height: 1080,
      encoding: "image/png",
      sizeBytes: 2048,
      sequenceNumber: 1,
      stopped: true,
      cleanupState: "Idle",
    });

    const result = await NativeDeviceService.runNativeScreenCaptureSmokeTest();

    expect(result.sampleReceived).toBe(true);
    expect(result.stopped).toBe(true);
    expect(mocks.invoke).toHaveBeenCalledWith("run_native_screen_capture_smoke_test");
  });

  it("delegates native screen diagnostics to Tauri", async () => {
    mocks.isTauriAvailable.mockReturnValue(true);
    mocks.invoke.mockResolvedValue({
      displayId: "display-1",
      displayLabel: "\\\\.\\DISPLAY1",
      displayX: 0,
      displayY: 0,
      width: 1366,
      height: 768,
      expectedBgraSize: 4196352,
      attempts: [{ sourceStrategy: "GetDC(NULL)", sourceDcAcquired: true }],
    });

    const diagnostic = await NativeDeviceService.diagnoseNativeScreenCapture();

    expect(diagnostic.attempts[0].sourceStrategy).toBe("GetDC(NULL)");
    expect(mocks.invoke).toHaveBeenCalledWith("diagnose_native_screen_capture");
  });

  it("delegates native screen session diagnostics to Tauri", async () => {
    mocks.isTauriAvailable.mockReturnValue(true);
    mocks.invoke.mockResolvedValue({
      processId: 1234,
      currentSessionId: 1,
      currentSessionError: null,
      activeConsoleSessionId: 1,
      sessionMatchesActiveConsole: true,
      interactiveDesktopOpened: true,
      interactiveDesktopError: null,
      elevated: false,
      elevationError: null,
      integrityLevel: null,
      integrityError: "not implemented",
    });

    const diagnostic = await NativeDeviceService.getNativeScreenSessionDiagnostics();

    expect(diagnostic.sessionMatchesActiveConsole).toBe(true);
    expect(diagnostic.interactiveDesktopOpened).toBe(true);
    expect(mocks.invoke).toHaveBeenCalledWith("get_native_screen_session_diagnostics");
  });

  it("surfaces native command failure for device identity", async () => {
    mocks.isTauriAvailable.mockReturnValue(true);
    mocks.invoke.mockRejectedValue(new Error("native failed"));

    await expect(NativeDeviceService.getInstallationDeviceIdentity()).rejects.toThrow("native failed");
  });
});
