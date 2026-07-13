import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "./AuthContext";
import { useToast } from "../hooks/useToast";
import { displayMonitor, DisplayEvent } from "../services/DisplayMonitor";
import { screenCaptureManager, ScreenHealthStatus } from "../services/ScreenCaptureManager";
import { PipelineFrame } from "../services/CapturePipeline";
import { SocketService } from "../socket/service";
import { useSuspicion } from "./SuspicionContext";

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

    console.log(`[ScreenContext] Captured screenshot (${pFrame.mode}) - Size: ${(pFrame.frame.sizeBytes / 1024).toFixed(1)} KB`);

    // WebSockets upload payload
    try {
      const socket = SocketService.getInstance();
      socket.emit("screen_telemetry_uploaded", {
        examId,
        studentId: user.identifier,
        timestamp: pFrame.timestamp,
        mode: pFrame.mode,
        sizeBytes: pFrame.frame.sizeBytes,
        base64: pFrame.frame.base64,
      }).catch(() => {});
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
      }
    });

    // Request display share permissions and schedule 30s interval
    const captureStarted = await screenCaptureManager.startCapture(30, "image/jpeg");
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
    try {
      await screenCaptureManager.triggerSnapshot("EVENT_TRIGGERED");
    } catch (err) {
      console.warn("[ScreenContext] Failed to trigger event-triggered snapshot:", err);
    }
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
