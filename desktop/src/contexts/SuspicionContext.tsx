import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "./AuthContext";
import { useToast } from "../hooks/useToast";
import { suspicionScoreEngine, SuspicionViolation, RiskLevelType } from "../services/SuspicionScoreEngine";
import { SessionService } from "../services/SessionService";
import { SocketService } from "../socket/service";

interface SuspicionContextType {
  suspicionScore: number;
  riskLevel: RiskLevelType;
  timeline: SuspicionViolation[];
  moduleContributions: { module: string; contribution: number; count: number }[];
  isMonitoring: boolean;
  startSuspicionEngine: (examId: string) => void;
  stopSuspicionEngine: () => void;
  reportViolationEvent: (
    eventType: string,
    sourceModule: string,
    confidence: number,
    reason: string,
    durationMs?: number
  ) => void;
}

const SuspicionContext = createContext<SuspicionContextType | undefined>(undefined);

export function SuspicionProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [suspicionScore, setSuspicionScore] = useState(0);
  const [riskLevel, setRiskLevel] = useState<RiskLevelType>("Normal");
  const [timeline, setTimeline] = useState<SuspicionViolation[]>([]);
  const [moduleContributions, setModuleContributions] = useState<{ module: string; contribution: number; count: number }[]>([]);
  const [isMonitoring, setIsMonitoring] = useState(false);

  const examIdRef = useRef<string | null>(null);
  const decayIntervalRef = useRef<number | null>(null);
  const prevRiskRef = useRef<RiskLevelType>("Normal");

  const reportViolationEvent = useCallback(
    async (
      eventType: string,
      sourceModule: string,
      confidence: number,
      reason: string,
      durationMs?: number
    ) => {
      const examId = examIdRef.current;
      if (!examId || !user) return;

      // 1. Add infraction to centralized engine
      const violation = suspicionScoreEngine.addViolation(eventType, sourceModule, confidence, reason, durationMs);
      
      const newScore = suspicionScoreEngine.getScore();
      const newRisk = suspicionScoreEngine.getRiskLevel();

      // 2. Synchronize React context states
      setSuspicionScore(newScore);
      setRiskLevel(newRisk);
      setTimeline(suspicionScoreEngine.getTimeline());
      setModuleContributions(suspicionScoreEngine.getExplanations());

      // 3. Show warnings if risk escalates
      if (newRisk !== prevRiskRef.current) {
        if (newRisk === "High Risk" || newRisk === "Critical Risk") {
          showToast(`Warning: High suspicion levels detected! Suspicion Level: ${newRisk}`, "error");
        } else if (newRisk === "Moderate Risk" || newRisk === "Low Risk") {
          showToast(`Proctor Note: Cheating suspicion levels updated: ${newRisk}`, "warning");
        }
        prevRiskRef.current = newRisk;
      }

      // 4. REST DB submission tracking
      try {
        const submissionPayload = {
          examId,
          studentId: user.identifier,
          answers: [],
          appSwitchWarnings: eventType === "WINDOW_BLURRED" ? 1 : 0,
          faceMissingWarnings: eventType === "FACE_MISSING" ? 1 : 0,
          audioWarnings: eventType === "VOICE_DETECTED" ? 1 : 0,
          phoneWarnings: eventType === "PHONE_DETECTED" ? 1 : 0,
          totalWarnings: 1,
          riskLevel: (newRisk === "Critical Risk" || newRisk === "High Risk" ? "High Risk" : "Medium Risk") as "High Risk" | "Medium Risk" | "Low Risk",
          submittedAt: Date.now(),
        };
        await SessionService.saveSubmission(submissionPayload).catch(() => {});
      } catch {}

      // 5. Socket.IO proctor alerting
      try {
        const socket = SocketService.getInstance();
        socket.emit("ai_alert_created", {
          examId,
          studentId: user.identifier,
          studentName: user.name,
          eventType,
          suspicionScore: violation.scoreChange,
          alertMessage: `Suspicion Engine: ${reason}`,
          severity: violation.severity,
        }).catch(() => {});

        socket.emit("suspicion_score_updated", {
          examId,
          studentId: user.identifier,
          suspicionScore: newScore,
        }).catch(() => {});
      } catch {}
    },
    [user, showToast]
  );

  const startSuspicionEngine = useCallback((examId: string) => {
    examIdRef.current = examId;
    setIsMonitoring(true);
    prevRiskRef.current = "Normal";

    suspicionScoreEngine.reset();
    setSuspicionScore(0);
    setRiskLevel("Normal");
    setTimeline([]);
    setModuleContributions([]);

    // 1-second interval loop for checking decay
    decayIntervalRef.current = window.setInterval(() => {
      const newScore = suspicionScoreEngine.tickDecay(1);
      setSuspicionScore(newScore);
      setRiskLevel(suspicionScoreEngine.getRiskLevel());
      setModuleContributions(suspicionScoreEngine.getExplanations());

      const examId = examIdRef.current;
      if (examId && user) {
        SocketService.getInstance().emit("suspicion_score_updated", {
          examId,
          studentId: user.identifier,
          suspicionScore: newScore,
        }).catch(() => {});
      }
    }, 1000);
  }, [user]);

  const stopSuspicionEngine = useCallback(() => {
    examIdRef.current = null;
    setIsMonitoring(false);

    if (decayIntervalRef.current) {
      clearInterval(decayIntervalRef.current);
      decayIntervalRef.current = null;
    }

    suspicionScoreEngine.reset();
    setSuspicionScore(0);
    setRiskLevel("Normal");
    setTimeline([]);
    setModuleContributions([]);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopSuspicionEngine();
    };
  }, [stopSuspicionEngine]);

  return (
    <SuspicionContext.Provider
      value={{
        suspicionScore,
        riskLevel,
        timeline,
        moduleContributions,
        isMonitoring,
        startSuspicionEngine,
        stopSuspicionEngine,
        reportViolationEvent,
      }}
    >
      {children}
    </SuspicionContext.Provider>
  );
}

export function useSuspicion() {
  const context = useContext(SuspicionContext);
  if (!context) {
    throw new Error("useSuspicion must be used inside a SuspicionProvider");
  }
  return context;
}
