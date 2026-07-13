import React, { createContext, useContext, useState, useEffect, useRef } from "react";

import { useCamera } from "./CameraContext";
import { useToast } from "../hooks/useToast";
import { ChallengeManager, ChallengeState } from "../services/ChallengeManager";
import { LandmarkAnalyzer } from "../services/LandmarkAnalyzer";
import { FaceDetector } from "../services/FaceDetector";
import { LivenessManager } from "../services/LivenessManager";
import { useSuspicion } from "./SuspicionContext";
import { Card } from "../components/Card";

import { RefreshCw, CheckCircle2, ShieldAlert } from "lucide-react";
import { isTauriAvailable } from "../utils/tauri";
import { Button } from "../components/Button";

interface LivenessContextType {
  challengeState: ChallengeState | null;
  triggerLivenessCheck: () => Promise<boolean>;
  startContinuousLiveness: (examId: string) => void;
  stopContinuousLiveness: () => void;
}

const LivenessContext = createContext<LivenessContextType | undefined>(undefined);

export function LivenessProvider({ children }: { children: React.ReactNode }) {
  const { pipeline, stream, healthStatus } = useCamera();
  const { showToast } = useToast();
  const { reportViolationEvent } = useSuspicion();

  const [challengeState, setChallengeState] = useState<ChallengeState | null>(null);
  
  const examIdRef = useRef<string | null>(null);
  const evaluationIntervalId = useRef<number | null>(null);
  const countdownIntervalId = useRef<number | null>(null);
  const resolvePromiseRef = useRef<((passed: boolean) => void) | null>(null);

  // Keep state in sync for timers
  const challengeStateRef = useRef<ChallengeState | null>(null);
  useEffect(() => {
    challengeStateRef.current = challengeState;
  }, [challengeState]);

  const triggerLivenessCheck = (): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      resolvePromiseRef.current = resolve;
      
      const newChallenge = ChallengeManager.generateChallenge(0);
      setChallengeState(newChallenge);
      
      startEvaluationLoops(newChallenge);
      
      // Dispatch telemetry event: Challenge started
      dispatchTelemetry("LIVENESS_STARTED", "Biometric liveness verification challenge started.");
    });
  };

  const startContinuousLiveness = (examId: string) => {
    examIdRef.current = examId;
    LivenessManager.startScheduler(async () => {
      if (healthStatus === "streaming" && stream) {
        showToast("AI Proctoring: Liveness verification check required.", "info");
        await triggerLivenessCheck();
      }
    });
  };

  const stopContinuousLiveness = () => {
    examIdRef.current = null;
    LivenessManager.stopScheduler();
    stopEvaluationLoops();
    setChallengeState(null);
  };

  const startEvaluationLoops = (_state: ChallengeState) => {
    stopEvaluationLoops();

    // 1. Countdown Timer (1 second intervals)
    countdownIntervalId.current = window.setInterval(() => {
      const activeState = challengeStateRef.current;
      if (!activeState || activeState.status !== "running") return;

      const remaining = activeState.timeRemainingSec - 1;
      if (remaining <= 0) {
        handleChallengeTimeout();
      } else {
        setChallengeState((prev) => prev ? { ...prev, timeRemainingSec: remaining } : null);
      }
    }, 1000);

    // 2. Real-time Face Landmark Evaluation (100ms intervals -> 10 FPS)
    evaluationIntervalId.current = window.setInterval(async () => {
      const activeState = challengeStateRef.current;
      if (!activeState || activeState.status !== "running" || !pipeline) return;

      const frame = pipeline.getLatestFrame();
      if (!frame) return;

      const canvas = document.createElement("canvas");
      canvas.width = frame.width;
      canvas.height = frame.height;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;
      ctx.putImageData(frame.data, 0, 0);

      // Run Face Detection in background Web Worker
      const detections = await FaceDetector.detectAsync(frame.data);
      if (detections.length === 0) return; // No face detected in frame

      const primary = detections[0];

      // Extract and analyze facial landmarks
      const metrics = LandmarkAnalyzer.analyze(ctx, primary, frame.width, frame.height);
      
      // Anti-Replay Check
      if (metrics.replayScore === 0) {
        dispatchTelemetry("REPLAY_ATTACK", "Webcam frame freeze or static picture replay detected.");
        showToast("Anti-Replay Alert: Please present natural movements.", "warning");
        return;
      }

      const currentAction = activeState.actions[activeState.currentActionIdx];
      const actionSucceeded = ChallengeManager.evaluateAction(currentAction, metrics);

      if (actionSucceeded) {
        const nextIdx = activeState.currentActionIdx + 1;
        if (nextIdx >= activeState.actions.length) {
          handleChallengeSuccess();
        } else {
          // Advance to next action
          setChallengeState((prev) => prev ? { ...prev, currentActionIdx: nextIdx, timeRemainingSec: 10 } : null);
          showToast("Action completed! Next instruction.", "success", 1000);
        }
      }
    }, 100);
  };

  const stopEvaluationLoops = () => {
    if (evaluationIntervalId.current) {
      clearInterval(evaluationIntervalId.current);
      evaluationIntervalId.current = null;
    }
    if (countdownIntervalId.current) {
      clearInterval(countdownIntervalId.current);
      countdownIntervalId.current = null;
    }
  };

  const handleChallengeSuccess = () => {
    stopEvaluationLoops();
    setChallengeState((prev) => prev ? { ...prev, status: "completed" } : null);
    dispatchTelemetry("LIVENESS_PASSED", "Biometric liveness verification check completed successfully.");

    setTimeout(() => {
      setChallengeState(null);
      if (resolvePromiseRef.current) {
        resolvePromiseRef.current(true);
        resolvePromiseRef.current = null;
      }
    }, 1500);
  };

  const handleChallengeTimeout = () => {
    const activeState = challengeStateRef.current;
    if (!activeState) return;

    if (activeState.retryCount === 0) {
      // First Failure: Retry once with a new challenge
      stopEvaluationLoops();
      showToast("Verification timed out. Retrying with a new challenge...", "warning");
      const retryChallenge = ChallengeManager.generateChallenge(1);
      setChallengeState(retryChallenge);
      startEvaluationLoops(retryChallenge);
    } else {
      // Second Failure: High-severity violation
      handleChallengeFailure();
    }
  };

  const handleChallengeFailure = () => {
    stopEvaluationLoops();
    setChallengeState((prev) => prev ? { ...prev, status: "failed" } : null);
    
    dispatchTelemetry("LIVENESS_FAILED", "Candidate failed continuous biometric liveness checks twice.");
    showToast("Identity Verification Failed: Liveness challenge failed.", "error", 4000);

    setTimeout(() => {
      setChallengeState(null);
      if (resolvePromiseRef.current) {
        resolvePromiseRef.current(false);
        resolvePromiseRef.current = null;
      }
    }, 2000);
  };

  const dispatchTelemetry = async (type: string, message: string) => {
    reportViolationEvent(type, "Liveness", 1.0, message);
  };

  return (
    <LivenessContext.Provider
      value={{
        challengeState,
        triggerLivenessCheck,
        startContinuousLiveness,
        stopContinuousLiveness,
      }}
    >
      {children}

      {/* 3. Liveness Prompt Modal Overlay */}
      {challengeState && (
        <div className="fixed inset-0 z-[100] bg-black/75 backdrop-blur-md flex items-center justify-center px-4 select-none">
          <Card className="max-w-md w-full flex flex-col gap-5 shadow-2xl border-violet-500/25 p-6" glow="accent">
            <div className="flex items-center justify-between border-b border-cyber-border/40 pb-3">
              <span className="text-xs font-mono text-violet-400 font-bold uppercase tracking-widest flex items-center gap-2">
                <RefreshCw size={14} className={challengeState.status === "running" ? "animate-spin" : ""} />
                Liveness Verification
              </span>
              <span className="text-[10px] font-mono text-slate-500">
                Attempt {challengeState.retryCount + 1} of 2
              </span>
            </div>

            {challengeState.status === "running" && (
              <div className="flex flex-col gap-4 text-center">
                <p className="text-sm font-semibold text-white font-mono uppercase tracking-wide">
                  {ChallengeManager.getInstruction(challengeState.actions[challengeState.currentActionIdx])}
                </p>

                {/* Progress Indicators */}
                <div className="flex justify-center gap-1.5 mt-1">
                  {challengeState.actions.map((_, idx) => (
                    <div
                      key={idx}
                      className={`h-1.5 rounded-full transition-all duration-300 ${
                        idx < challengeState.currentActionIdx
                          ? "w-6 bg-emerald-500"
                          : idx === challengeState.currentActionIdx
                            ? "w-8 bg-violet-500 animate-pulse"
                            : "w-4 bg-slate-800"
                      }`}
                    />
                  ))}
                </div>

                {/* Countdown Progress Bar */}
                <div className="w-full bg-slate-900 h-2 rounded overflow-hidden mt-2 border border-cyber-border/45">
                  <div
                    className="bg-violet-500 h-full transition-all duration-1000 ease-linear"
                    style={{ width: `${(challengeState.timeRemainingSec / 10) * 100}%` }}
                  />
                </div>
                <span className="text-[10px] font-mono text-slate-500 mt-1">
                  Time Remaining: {challengeState.timeRemainingSec} seconds
                </span>
              </div>
            )}

            {challengeState.status === "completed" && (
              <div className="flex flex-col items-center justify-center text-center gap-3 py-4 text-emerald-400 font-mono">
                <CheckCircle2 size={48} className="animate-bounce" />
                <span className="text-sm font-bold uppercase tracking-widest">Verification Cleared</span>
                <p className="text-[10px] text-slate-400 leading-relaxed max-w-xs">
                  Biometric presence validation succeeded. Retaining lockdown exam interface...
                </p>
              </div>
            )}

            {challengeState.status === "failed" && (
              <div className="flex flex-col items-center justify-center text-center gap-3 py-4 text-red-400 font-mono">
                <ShieldAlert size={48} className="animate-bounce" />
                <span className="text-sm font-bold uppercase tracking-widest">Verification Failed</span>
                <p className="text-[10px] text-slate-400 leading-relaxed max-w-xs">
                  Failed presence checks. Proctoring logs have flagged the anomaly.
                </p>
              </div>
            )}

            {!isTauriAvailable() && challengeState.status === "running" && (
              <div className="border-t border-cyber-border/40 pt-3 flex justify-end">
                <Button 
                  className="font-mono text-[9px] py-1 px-3 bg-violet-950/20 border border-violet-500/20 text-violet-400 hover:bg-violet-900/20"
                  onClick={handleChallengeSuccess}
                >
                  Bypass Challenge (Dev Mode)
                </Button>
              </div>
            )}
          </Card>
        </div>
      )}
    </LivenessContext.Provider>
  );
}

export function useLiveness() {
  const context = useContext(LivenessContext);
  if (!context) {
    throw new Error("useLiveness must be used inside a LivenessProvider");
  }
  return context;
}
