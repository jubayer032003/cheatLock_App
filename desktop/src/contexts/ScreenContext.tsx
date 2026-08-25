import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "./AuthContext";
import { useToast } from "../hooks/useToast";
import { displayMonitor, DisplayEvent } from "../services/DisplayMonitor";
import { screenCaptureManager, ScreenHealthStatus } from "../services/ScreenCaptureManager";
import { PipelineFrame } from "../services/CapturePipeline";
import { useSuspicion } from "./SuspicionContext";
import { telemetryUploadQueue } from "../services/TelemetryUploadQueue";
import { FIXED_CAPTURE_POLICY } from "../config/capturePolicy";

interface ScreenContextType {
  captureHealth: ScreenHealthStatus;
  isMonitoring: boolean;
  displayCount: number;
  startScreenMonitoring: (examId: string) => Promise<boolean>;
  stopScreenMonitoring: () => void;
  triggerManualSnapshot: () => Promise<void>;
  triggerEventSnapshot: () => Promise<void>;
}

const ScreenContext = createContext<ScreenContextType | undefined>(undefined);

export function ScreenProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const { reportViolationEvent } = useSuspicion();

  const [captureHealth, setCaptureHealth] = useState<ScreenHealthStatus>("idle");
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [displayCount, setDisplayCount] = useState(1);

  const examIdRef = useRef<string | null>(null);

  // 1. Telemetry dispatcher for Display config events (Added / Removed / Orientation changes)
  const dispatchDisplayTelemetry = useCallback(async (event: DisplayEvent) => {
    const examId = examIdRef.current;
    if (!examId || !user) return;

    setDisplayCount(event.displayCount);

    // Report to centralized suspicion score engine
    reportViolationEvent(event.type, "Screen", 1.0, event.message);
  }, [user, reportViolationEvent]);

  // 2. Telemetry dispatcher for Screen compressed frame grabs
  const dispatchFrameTelemetry = useCallback(async (pFrame: PipelineFrame) => {
    const examId = examIdRef.current;
    if (!examId || !user) return;

    console.log(`[ScreenContext] Captured screenshot (${pFrame.mode}) - Size: ${(pFrame.frame.sizeBytes / 1024).toFixed(1)} KB; drift=${pFrame.driftMs}ms`);

    // WebSockets upload payload
    try {
      const nowIso = new Date().toISOString();
      const evidenceId = `screen-${examId}-${user.identifier}-${pFrame.sequenceNumber}`;
      void telemetryUploadQueue.enqueue({
        id: evidenceId,
        eventName: "screen_telemetry_uploaded",
        sensitive: true,
        priority: pFrame.priority,
        sizeBytes: pFrame.frame.sizeBytes,
        createdAt: pFrame.timestamp,
        payload: {
          idempotencyKey: evidenceId,
          evidenceId,
          examId,
          studentId: user.identifier,
          capturedAt: new Date(pFrame.captureStartedAt).toISOString(),
          captureStartedAt: new Date(pFrame.captureStartedAt).toISOString(),
          captureStartedAtMs: pFrame.captureStartedAt,
          captureCompletedAt: new Date(pFrame.captureCompletedAt).toISOString(),
          captureCompletedAtMs: pFrame.captureCompletedAt,
          processingCompletedAt: nowIso,
          sequenceNumber: pFrame.sequenceNumber,
          timestamp: pFrame.timestamp,
          mode: pFrame.mode,
          priority: pFrame.priority,
          suspicious: pFrame.suspicious,
          suspiciousEventId: pFrame.suspiciousEventId,
          expectedIntervalMs: pFrame.expectedIntervalMs,
          actualIntervalMs: pFrame.actualIntervalMs,
          driftMs: pFrame.driftMs,
          sizeBytes: pFrame.frame.sizeBytes,
          mimeType: pFrame.frame.mimeType,
          width: pFrame.frame.width,
          height: pFrame.frame.height,
          base64: pFrame.frame.base64,
        },
      });
    } catch {}
  }, [user]);

  const startScreenMonitoring = useCallback(async (examId: string): Promise<boolean> => {
    examIdRef.current = examId;
    setIsMonitoring(true);

    // 1. Initialize Display monitor checks
    displayMonitor.registerListener(dispatchDisplayTelemetry);
    await displayMonitor.start();

    // 2. Initialize Frame Capture manager
    screenCaptureManager.setHealthCallback((status) => {
      setCaptureHealth(status);
      if (status === "disconnected") {
        showToast("Screen capture stopped by candidate.", "error");
        reportViolationEvent("SCREEN_SHARE_STOPPED", "Screen", 1.0, "Student terminated screen share permission.");
      }
      if (status === "failed") {
        showToast("Native screen capture failed.", "error");
        reportViolationEvent("SCREEN_CAPTURE_FAILED", "Screen", 1.0, "Native screen capture worker reported a failure.");
      }
    });

    // Request display share permissions and schedule 30s interval
    const captureStarted = await screenCaptureManager.startCapture(
      FIXED_CAPTURE_POLICY.captureIntervalMs / 1000,
      FIXED_CAPTURE_POLICY.preferredFormat
    );
    if (!captureStarted) {
      setIsMonitoring(false);
      displayMonitor.unregisterListener(dispatchDisplayTelemetry);
      displayMonitor.stop();
      showToast("Screen share permissions required to proceed.", "error");
      return false;
    }

    // Connect pipeline listener
    screenCaptureManager.getPipeline().registerCaptureListener(dispatchFrameTelemetry);
    return true;
  }, [dispatchDisplayTelemetry, dispatchFrameTelemetry, showToast]);

  const stopScreenMonitoring = useCallback(() => {
    examIdRef.current = null;
    setIsMonitoring(false);

    displayMonitor.unregisterListener(dispatchDisplayTelemetry);
    displayMonitor.stop();

    screenCaptureManager.getPipeline().unregisterCaptureListener(dispatchFrameTelemetry);
    screenCaptureManager.stopCapture();
    
    setCaptureHealth("idle");
    setDisplayCount(1);
  }, [dispatchDisplayTelemetry, dispatchFrameTelemetry]);

  const triggerManualSnapshot = useCallback(async () => {
    if (!isMonitoring || captureHealth !== "capturing") return;
    try {
      await screenCaptureManager.triggerSnapshot("MANUAL");
    } catch (err) {
      console.warn("[ScreenContext] Failed to trigger manual snapshot:", err);
    }
  }, [isMonitoring, captureHealth]);

  const triggerEventSnapshot = useCallback(async () => {
    if (!isMonitoring || captureHealth !== "capturing") return;
    screenCaptureManager.markSuspiciousEvidence();
  }, [isMonitoring, captureHealth]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopScreenMonitoring();
    };
  }, [stopScreenMonitoring]);

  return (
    <ScreenContext.Provider
      value={{
        captureHealth,
        isMonitoring,
        displayCount,
        startScreenMonitoring,
        stopScreenMonitoring,
        triggerManualSnapshot,
        triggerEventSnapshot,
      }}
    >
      {children}
    </ScreenContext.Provider>
  );
}

export function useScreen() {
  const context = useContext(ScreenContext);
  if (!context) {
    throw new Error("useScreen must be used inside a ScreenProvider");
  }
  return context;
}
