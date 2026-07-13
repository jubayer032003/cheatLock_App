import React, { createContext, useContext, useState, useEffect, useRef } from "react";
import { useAuth } from "./AuthContext";
import { useToast } from "../hooks/useToast";
import { SecurityService } from "../services/SecurityService";
import { SessionService } from "../services/SessionService";
import { useSuspicion } from "./SuspicionContext";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { invoke, isTauriAvailable } from "../utils/tauri";

export interface SecurityViolation {
  type: string;
  message: string;
  timestamp: number;
}

interface SecurityContextType {
  violations: SecurityViolation[];
  suspicionScore: number;
  isMonitoring: boolean;
  startSecurityMonitoring: (examId: string) => Promise<void>;
  stopSecurityMonitoring: (examId: string) => Promise<void>;
}

const SecurityContext = createContext<SecurityContextType | undefined>(undefined);

export function SecurityProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { showToast } = useToast();
  
  const [violations, setViolations] = useState<SecurityViolation[]>([]);
  const [isMonitoring, setIsMonitoring] = useState(false);
  const { suspicionScore: globalSuspicionScore, reportViolationEvent } = useSuspicion();
  
  const unlistenFocusRef = useRef<UnlistenFn | null>(null);
  const examIdRef = useRef<string | null>(null);
  const violationsRef = useRef<SecurityViolation[]>([]);
  const securityIntervalRef = useRef<any>(null);
  const unlistenFullscreenRef = useRef<(() => void) | null>(null);

  // Keep ref in sync so callbacks can access latest arrays without state re-binding
  useEffect(() => {
    violationsRef.current = violations;
  }, [violations]);

  const handleViolation = async (type: string, message: string) => {
    const examId = examIdRef.current;
    if (!examId || !user) return;

    const newViolation: SecurityViolation = {
      type,
      message,
      timestamp: Date.now(),
    };

    setViolations((prev) => [...prev, newViolation]);

    // Report to centralized suspicion score engine
    reportViolationEvent(type, "Security", 1.0, message);

    // Auto lock session if score gets too high (e.g. >= 75%)
    if (globalSuspicionScore >= 75) {
      showToast("Security threshold exceeded. Testing locked.", "error", 6000);
      try {
        await SessionService.lockSession(examId, "Too many workspace focus/peripheral violations.");
      } catch (err) {
        console.error("[Security] Kiosk lock call failed:", err);
      }
      stopSecurityMonitoring(examId);
      window.dispatchEvent(new Event("cheatlock_exam_terminated"));
    }
  };

  const startSecurityMonitoring = async (examId: string) => {
    examIdRef.current = examId;
    setViolations([]);
    setIsMonitoring(true);

    // 1. Enforce window fullscreen and capture affinities via Rust Tauri commands
    if (isTauriAvailable()) {
      try {
        await invoke("enforce_window_kiosk", { enabled: true });
      } catch (err) {
        console.warn("[Security] Window kiosk enforcement failed:", err);
      }
    } else {
      console.warn("[Security] Tauri unavailable: requesting HTML5 browser fullscreen.");
      if (document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().catch((err) => {
          console.warn("[Security] Browser fullscreen request rejected:", err);
        });
      }

      const handleFullscreenChange = () => {
        if (!document.fullscreenElement) {
          handleViolation("FULLSCREEN_EXIT", "Candidate exited fullscreen exam window.");
        }
      };

      document.addEventListener("fullscreenchange", handleFullscreenChange);
      unlistenFullscreenRef.current = () => {
        document.removeEventListener("fullscreenchange", handleFullscreenChange);
      };
    }

    // 2. Listen for native window focus shifts from the Tauri backend (or browser tab focus loss)
    if (isTauriAvailable()) {
      try {
        if (unlistenFocusRef.current) {
          unlistenFocusRef.current();
        }
        unlistenFocusRef.current = await listen<boolean>("window-focus-changed", (event) => {
          const focused = event.payload;
          if (!focused) {
            handleViolation("FOCUS_LOSS", "Exam window lost active focus.");
          } else {
            // Check monitors count on refocused window
            invoke<number>("check_monitors").then((count) => {
              if (count > 1) {
                handleViolation("MULTI_MONITOR", `Multi-monitor detected: ${count} displays active.`);
              }
            }).catch(() => {});
          }
        });
      } catch (err) {
        console.error("[Security] Failed to register backend focus listeners:", err);
      }
    } else {
      // Browser fallback: Monitor window focus losses
      const handleBrowserBlur = () => {
        handleViolation("FOCUS_LOSS", "Exam browser tab lost active focus. [Browser Mode]");
      };
      window.addEventListener("blur", handleBrowserBlur);
      unlistenFocusRef.current = () => {
        window.removeEventListener("blur", handleBrowserBlur);
      };
    }

    // 3. Initialize JS perimeter guards (contextmenu, clipboard, developer tools, idle)
    SecurityService.initialize({
      onViolation: (type, msg) => handleViolation(type, msg),
    });

    // Check display counts on entrance
    if (isTauriAvailable()) {
      try {
        const count = await invoke<number>("check_monitors");
        if (count > 1) {
          handleViolation("MULTI_MONITOR", `Workspace audit failed: ${count} displays detected.`);
        }
      } catch {}

      // 4. Native security check loop (VM, blacklisted processes, debugger presence)
      const runNativeSecurityChecks = async () => {
        try {
          interface SecurityViolationsResult {
            virtual_machine_detected: boolean;
            blacklisted_processes: string[];
            debugger_attached: boolean;
          }
          const result = await invoke<SecurityViolationsResult>("check_security_violations");
          if (result.virtual_machine_detected) {
            handleViolation("VM_DETECTED", "Application is running inside a virtual machine environment.");
          }
          if (result.debugger_attached) {
            handleViolation("DEBUGGER_ATTACHED", "An active debugger was detected attached to the process.");
          }
          if (result.blacklisted_processes && result.blacklisted_processes.length > 0) {
            handleViolation(
              "BLACKLISTED_PROCESS",
              `Prohibited app/process active: ${result.blacklisted_processes.join(", ")}`
            );
          }
        } catch (err) {
          console.error("[Security] Native security checks failed:", err);
        }
      };

      // Run immediately
      runNativeSecurityChecks();

      // Poll every 5 seconds
      if (securityIntervalRef.current) {
        clearInterval(securityIntervalRef.current);
      }
      securityIntervalRef.current = setInterval(runNativeSecurityChecks, 5000);
    }
  };

  const stopSecurityMonitoring = async (_examId?: string) => {
    examIdRef.current = null;
    setIsMonitoring(false);

    // 1. Release window kiosk fullscreen and capture affinity settings
    if (isTauriAvailable()) {
      try {
        await invoke("enforce_window_kiosk", { enabled: false });
      } catch (err) {
        console.warn("[Security] Window kiosk deactivation failed:", err);
      }
    } else {
      console.warn("[Security] Tauri unavailable: exiting HTML5 browser fullscreen.");
      if (document.fullscreenElement) {
        document.exitFullscreen().catch((err) => {
          console.warn("[Security] Browser exitFullscreen failed:", err);
        });
      }

      if (unlistenFullscreenRef.current) {
        unlistenFullscreenRef.current();
        unlistenFullscreenRef.current = null;
      }
    }

    // 2. Unsubscribe from focus listeners
    if (unlistenFocusRef.current) {
      unlistenFocusRef.current();
      unlistenFocusRef.current = null;
    }

    // 3. Clear JS guards
    SecurityService.destroy();

    // 4. Clear native threat check interval
    if (securityIntervalRef.current) {
      clearInterval(securityIntervalRef.current);
      securityIntervalRef.current = null;
    }
  };

  return (
    <SecurityContext.Provider
      value={{
        violations,
        suspicionScore: globalSuspicionScore,
        isMonitoring,
        startSecurityMonitoring,
        stopSecurityMonitoring,
      }}
    >
      {children}
    </SecurityContext.Provider>
  );
}

export function useSecurity() {
  const context = useContext(SecurityContext);
  if (!context) {
    throw new Error("useSecurity must be used inside a SecurityProvider");
  }
  return context;
}
