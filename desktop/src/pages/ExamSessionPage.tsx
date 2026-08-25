import { useEffect, useState, useRef } from "react";
import type React from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../hooks/useToast";
import { useSecurity } from "../contexts/SecurityContext";
import { useCamera } from "../contexts/CameraContext";
import { useFace } from "../contexts/FaceContext";
import { useLiveness } from "../contexts/LivenessContext";
import { useAudio } from "../contexts/AudioContext";
import { useScreen } from "../contexts/ScreenContext";
import { useObject } from "../contexts/ObjectContext";
import { useSuspicion } from "../contexts/SuspicionContext";
import { CameraPreview } from "../components/CameraPreview";
import { SessionService } from "../services/SessionService";
import { NativeDeviceService } from "../services/NativeDeviceService";
import { SocketService } from "../socket/service";
import { OfflineCache } from "../services/OfflineCache";
import type { ExamDraftScope } from "../services/OfflineCache";
import {
  ActiveExamAnswerService,
  type BackendSyncState,
  type LocalSaveState,
} from "../services/ActiveExamAnswerService";
import { telemetryUploadQueue } from "../services/TelemetryUploadQueue";
import { FIXED_CAPTURE_POLICY } from "../config/capturePolicy";
import { ExamSubmissionLifecycleService } from "../services/ExamSubmissionLifecycleService";
import { EXAM_CONSENT_POLICY_VERSION } from "../config/consentPolicy";
import { IDENTITY_VERIFICATION_POLICY_VERSION } from "../config/identityVerification";
import { attemptIdFromSession, ExamPreparationStateService } from "../services/ExamPreparationStateService";
import {
  ExamMonitoringOrchestrator,
  type ExamMonitor,
  type ExamMonitorRegistration,
} from "../services/monitoring/ExamMonitoringOrchestrator";
import { ExamShortcutManager } from "../utils/ExamShortcutManager";
import { QuestionRenderer } from "../components/QuestionRenderer";
import { QuestionPalette } from "../components/QuestionPalette";
import { Card } from "../components/Card";
import { Button } from "../components/Button";
import { Loader } from "../components/Loader";
import { invoke, getCurrentWindow, isTauriAvailable } from "../utils/tauri";
import { AlertTriangle, Clock, Cloud, CloudOff, HelpCircle, RefreshCw, Save, ShieldCheck, Wifi, WifiOff } from "lucide-react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { pageVariants } from "../motion/variants";
import type { ExamMonitoringPolicy, ExamMonitorName, HealthCheckResult, MonitorState, MonitorStatus } from "../types";
import { studentExamReadinessRoute, studentExamSubmittedRoute } from "../routes/studentRoutes";

export function ExamSessionPage() {
  const { activeExam, activeSession, setActiveExam, setActiveSession, user } = useAuth();
  const { showToast } = useToast();
  const { startSecurityMonitoring, stopSecurityMonitoring, violations } = useSecurity();
  const { pipeline } = useCamera();
  const { startFaceProctoring, stopFaceProctoring } = useFace();
  const { startContinuousLiveness, stopContinuousLiveness, triggerLivenessCheck } = useLiveness();
  const { startMonitoring: startAudioMonitoring, stopMonitoring: stopAudioMonitoring, audioHealth } = useAudio();
  const { startScreenMonitoring, stopScreenMonitoring, captureHealth } = useScreen();
  const { startObjectDetection, stopObjectDetection } = useObject();
  const { startSuspicionEngine, stopSuspicionEngine } = useSuspicion();
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();

  const [loadingSession, setLoadingSession] = useState(true);
  const [sessionError, setSessionError] = useState<string | null>(null);

  // Core Exam States
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [markedQuestions, setMarkedQuestions] = useState<number[]>([]);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [localSaveState, setLocalSaveState] = useState<LocalSaveState>("idle");
  const [backendSyncState, setBackendSyncState] = useState<BackendSyncState>("idle");
  const [monitoringOperationalState, setMonitoringOperationalState] = useState<"starting" | "active" | "action_required">("starting");

  // Network and UI Dialog overlays
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submissionStatusMessage, setSubmissionStatusMessage] = useState("");
  const [isExamPaused, setIsExamPaused] = useState(false);
  const isExamPausedRef = useRef(false);
  const screenStartedRef = useRef(false);
  const answerServiceRef = useRef<ActiveExamAnswerService | null>(null);
  const submissionLifecycleRef = useRef<ExamSubmissionLifecycleService | null>(null);
  const draftScopeRef = useRef<ExamDraftScope | null>(null);
  const serverTimeAnchorRef = useRef<{ serverNowMs: number; localNowMs: number; endsAtMs: number } | null>(null);
  useEffect(() => {
    isExamPausedRef.current = isExamPaused;
  }, [isExamPaused]);

  // Derive warning tallies dynamically from security violations log
  const warnings = {
    appSwitch: violations.filter((v) => v.type === "WINDOW_BLURRED").length,
    faceMissing: 0,
    audio: 0,
    phone: 0,
  };

  const timerRef = useRef<number | null>(null);
  const submitDialogRef = useRef<HTMLDivElement | null>(null);
  const closeDialogRef = useRef<HTMLDivElement | null>(null);
  const lastModalTriggerRef = useRef<HTMLElement | null>(null);

  // Network and termination status listeners
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      showToast("Internet restored. Draft cache is active.", "success");
    };
    const handleOffline = () => {
      setIsOnline(false);
      showToast("Internet lost. Caching answers locally. Keep working.", "warning");
    };
    const handleTerminated = () => {
      navigate("/dashboard");
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("cheatlock_exam_terminated", handleTerminated);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("cheatlock_exam_terminated", handleTerminated);
    };
  }, []);

  // Listen for camera telemetry frames and push them via WebSocket
  useEffect(() => {
    if (!activeExam || !user) return;

    const handleTelemetryFrame = (base64Frame: string, metadata: { capturedAt: number; sequenceNumber: number }) => {
      const evidenceId = `camera-${activeExam.id}-${user.identifier}-${metadata.sequenceNumber}`;
      const capturedAt = new Date(metadata.capturedAt).toISOString();
      void telemetryUploadQueue.enqueue({
        id: evidenceId,
        eventName: "camera_preview_updated",
        sensitive: true,
        createdAt: metadata.capturedAt,
        payload: {
          idempotencyKey: evidenceId,
          evidenceId,
          examId: activeExam.id,
          studentId: user.identifier,
          previewBase64: base64Frame,
          capturedAt,
          captureStartedAt: capturedAt,
          captureCompletedAt: new Date().toISOString(),
          processingCompletedAt: new Date().toISOString(),
          sequenceNumber: metadata.sequenceNumber,
          timestamp: metadata.capturedAt,
        },
      });
    };

    pipeline.registerTelemetryListener(handleTelemetryFrame);
    return () => {
      pipeline.unregisterTelemetryListener(handleTelemetryFrame);
    };
  }, [activeExam, user, pipeline]);

  // Intercept Tauri Window Close requests
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    
    async function setupCloseListener() {
      if (!isTauriAvailable()) {
        console.warn("[Kiosk] Tauri unavailable: close request hook will not be attached.");
        return;
      }

      try {
        const windowInstance = getCurrentWindow();
        unlisten = await windowInstance.onCloseRequested(async (event) => {
          // Block immediate exit, show modal dialog
          event.preventDefault();
          setShowCloseConfirm(true);
        });
      } catch (err) {
        console.warn("[Kiosk] Failed to hook Tauri window close request:", err);
      }
    }

    setupCloseListener();

    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  // Initialize secure monitoring and load draft state
  useEffect(() => {
    async function initExamSession() {
      if (!activeExam || !user) {
        setSessionError("No exam session is currently loaded.");
        setLoadingSession(false);
        return;
      }

      try {
        let session = activeSession;
        let remaining = activeExam.durationMinutes * 60;
        const installationDeviceId = (await NativeDeviceService.getInstallationDeviceIdentity()).deviceId;

        if (!(session && session.status === "IN_PROGRESS" && session.startedAt)) {
          // Fresh Session Creation
          session = await SessionService.startSession(activeExam.id, installationDeviceId);
          setActiveSession(session);
        }
        const timing = deriveSessionTiming(activeExam, session);
        remaining = timing.remainingSeconds;
        serverTimeAnchorRef.current = timing.anchor;

        const attemptId = attemptIdFromSession(session);
        if (!attemptId) {
          throw new Error("A valid exam attempt is required before monitoring can start.");
        }

        const monitoringPolicy = readExamMonitoringPolicy(activeExam);
        telemetryUploadQueue.start({
          heartbeatIntervalMs: monitoringPolicy.telemetryIntervalMs,
          cameraPreviewIntervalMs: FIXED_CAPTURE_POLICY.captureIntervalMs,
          maxOfflineEvents: FIXED_CAPTURE_POLICY.maxQueueItems,
          maxQueueItems: FIXED_CAPTURE_POLICY.maxQueueItems,
          maxQueueBytes: FIXED_CAPTURE_POLICY.maxQueueBytes,
          maxFrameBytes: FIXED_CAPTURE_POLICY.maxFrameBytes,
          maxConcurrentUploads: FIXED_CAPTURE_POLICY.maxConcurrentUploads,
          allowRoutineCameraSnapshots: Boolean((activeExam as unknown as { monitoringPolicy?: { allowRoutineCameraSnapshots?: boolean } }).monitoringPolicy?.allowRoutineCameraSnapshots),
          allowScreenEvidenceSnapshots: true,
        });
        const preparationState = ExamPreparationStateService.getState({
          studentId: user.identifier,
          examId: activeExam.id,
          attemptId,
          deviceId: session.deviceId || installationDeviceId,
          consentPolicyVersion: EXAM_CONSENT_POLICY_VERSION,
        });

        const orchestrator = new ExamMonitoringOrchestrator(
          createSessionMonitorRegistrations({
            policy: monitoringPolicy,
            examId: activeExam.id,
            startSecurityMonitoring,
            stopSecurityMonitoring,
            startFaceProctoring,
            stopFaceProctoring,
            startContinuousLiveness,
            stopContinuousLiveness,
            startAudioMonitoring,
            stopAudioMonitoring,
            audioHealth,
            startScreenMonitoring: async () => {
              if (screenStartedRef.current) return true;
              screenStartedRef.current = true;
              const started = await startScreenMonitoring(activeExam.id);
              if (!started) screenStartedRef.current = false;
              return started;
            },
            stopScreenMonitoring: () => {
              stopScreenMonitoring();
              screenStartedRef.current = false;
            },
            captureHealth,
            startObjectDetection,
            stopObjectDetection,
            startSuspicionEngine,
            stopSuspicionEngine,
          }),
          {
            startHeartbeatAndEvents: async () => {
              await SocketService.getInstance().emit("student_joined_exam", {
                examId: activeExam.id,
                studentId: user.identifier,
                studentName: user.name,
                deviceId: session!.deviceId || installationDeviceId,
              });
            },
            notifyMonitoringReady: async (_context, statuses) => {
              await SocketService.getInstance().emit("exam_monitoring_ready", {
                examId: activeExam.id,
                studentId: user.identifier,
                attemptId,
                deviceId: session!.deviceId || installationDeviceId,
                monitors: statuses.map(({ name, state, required, errorCode }) => ({ name, state, required, errorCode })),
              });
            },
            sendDiagnosticEvent: async (event) => {
              await SocketService.getInstance().emit("exam_monitoring_startup_failed", event).catch(() => {});
            },
            returnToReadiness: () => {
              navigate(studentExamReadinessRoute(activeExam.id), { replace: true });
            },
          }
        );

        const startup = await orchestrator.start({
          studentId: user.identifier,
          examId: activeExam.id,
          attemptId,
          deviceId: session.deviceId || installationDeviceId,
          policy: monitoringPolicy,
          policyVersion: EXAM_CONSENT_POLICY_VERSION,
          consentPolicyVersion: EXAM_CONSENT_POLICY_VERSION,
          identityVerificationPolicyVersion: IDENTITY_VERIFICATION_POLICY_VERSION,
          requireIdentityVerification: monitoringPolicy.requireIdentityVerification,
          readinessReport: preparationState.readinessReport.deviceReport ?? null,
          rulesAcknowledged: preparationState.rulesAcknowledged,
        });

        if (!startup.canRenderQuestions) {
          throw new Error(startup.error?.message || "Monitoring startup failed. Return to readiness and retry.");
        }
        setMonitoringOperationalState(startup.state === "active" || startup.state === "degraded" ? "active" : "action_required");

        // 2. Draft Recovery: restore from OfflineCache if available
        const restoreScope = createDraftScope(user.identifier, activeExam.id, session);
        draftScopeRef.current = restoreScope;
        answerServiceRef.current = restoreScope ? new ActiveExamAnswerService(restoreScope) : null;
        submissionLifecycleRef.current = new ExamSubmissionLifecycleService({
          saveSubmission: (submission) => SessionService.saveSubmission(submission),
          submitSession: (examId) => SessionService.submitSession(examId),
          flushTelemetry: (required) => telemetryUploadQueue.flushPending(required),
          stopMonitoring: stopAllMonitoring,
          disconnectSocket: () => SocketService.getInstance().disconnect(),
          clearSessionCredentials: () => {
            setActiveSession(null);
            setActiveExam(null);
          },
          navigateSubmitted: (examId) => navigate(studentExamSubmittedRoute(examId), { replace: true }),
        });
        const draft = restoreScope ? await OfflineCache.getDraft(restoreScope) : null;
        if (draft) {
          setAnswers(draft.answers);
          setCurrentIdx(draft.currentIndex);
          setMarkedQuestions(draft.markedQuestions);
          showToast("Previous draft recovered successfully.", "info");
        }

        if (remaining <= 0) {
          showToast("Assessment time expired. Submit now.", "warning");
          handleAutoSubmit();
          return;
        }

        setTimeRemaining(remaining);
        setLoadingSession(false);

      } catch (err: any) {
        setSessionError(err.message || "Lockdown environment refused initialization.");
        setLoadingSession(false);
      }
    }

    initExamSession();

    return () => {
      submissionLifecycleRef.current?.cleanup("route_exit").catch(() => {});
      if (!submissionLifecycleRef.current) void stopAllMonitoring();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [activeExam]);

  const stopAllMonitoring = async () => {
    stopSuspicionEngine();
    stopObjectDetection();
    stopScreenMonitoring();
    screenStartedRef.current = false;
    stopContinuousLiveness();
    stopAudioMonitoring();
    stopFaceProctoring();
    if (activeExam) {
      await stopSecurityMonitoring(activeExam.id).catch(() => {});
    }
    if (isTauriAvailable()) {
      await invoke("stop_exam_monitoring").catch(() => {});
    }
    if (timerRef.current) clearInterval(timerRef.current);
  };

  // Countdown timer interval
  useEffect(() => {
    if (loadingSession || sessionError || timeRemaining <= 0) return;

    timerRef.current = window.setInterval(() => {
      if (isExamPausedRef.current) return;
      if (serverTimeAnchorRef.current) {
        const nowMs = serverTimeAnchorRef.current.serverNowMs + (Date.now() - serverTimeAnchorRef.current.localNowMs);
        const nextRemaining = Math.max(0, Math.ceil((serverTimeAnchorRef.current.endsAtMs - nowMs) / 1000));
        setTimeRemaining(nextRemaining);
        if (nextRemaining <= 0) {
          clearInterval(timerRef.current!);
          handleAutoSubmit();
        }
        return;
      }
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current!);
          handleAutoSubmit();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [loadingSession, sessionError, timeRemaining]);

  // Listen for real-time teacher proctoring commands
  useEffect(() => {
    if (!user) return;
    const socket = SocketService.getInstance();
    
    const handleCommand = (payload: any) => {
      if (payload.studentId.toLowerCase() !== user.identifier.toLowerCase()) return;
      console.log("[ExamSessionPage] Received proctor command:", payload);

      switch (payload.command) {
        case "WARN_STUDENT":
          showToast(`Proctor Warning: ${payload.message || "Please remain focused."}`, "error", 8000);
          break;
        case "REQUEST_LIVENESS":
          showToast("Proctor requested immediate biometric liveness check.", "warning", 5000);
          triggerLivenessCheck().then((passed) => {
            showToast(passed ? "Liveness check passed!" : "Liveness check failed.", passed ? "success" : "error");
          });
          break;
        case "REQUEST_ROOM_SCAN":
          showToast("Proctor requested a webcam room scan. Please rotate your camera.", "warning", 8000);
          break;
        case "PAUSE_EXAM":
          showToast("Exam has been paused by the instructor.", "warning", 8000);
          setIsExamPaused(true);
          break;
        case "RESUME_EXAM":
          showToast("Exam has been resumed.", "success", 5000);
          setIsExamPaused(false);
          break;
        case "LOCK_EXAM":
          setBackendSyncState("revoked");
          showToast("Action required", "error", 10000);
          window.dispatchEvent(new Event("cheatlock_exam_terminated"));
          break;
        case "END_EXAM":
          showToast("Exam ended by the proctor.", "warning");
          handleAutoSubmit();
          break;
        default:
          break;
      }
    };

    socket.on("teacher_command", handleCommand);
    return () => {
      socket.off("teacher_command", handleCommand);
    };
  }, [user, showToast, triggerLivenessCheck]);

  // 30-Second Periodic Autosave Loop
  useEffect(() => {
    if (loadingSession || sessionError || !activeExam || !user) return;

    const autoSaveInterval = setInterval(() => {
      void persistSnapshot({ answers, currentIndex: currentIdx, markedQuestions });
    }, 30000);

    return () => clearInterval(autoSaveInterval);
  }, [loadingSession, sessionError, answers, currentIdx, markedQuestions, user, activeExam, activeSession]);

  const handleAnswerChange = (val: string) => {
    if (isExamPausedRef.current) return;
    const updatedAnswers = { ...answers, [currentIdx]: val };
    setAnswers(updatedAnswers);
    void persistSnapshot({ answers: updatedAnswers, currentIndex: currentIdx, markedQuestions });
  };

  const handleToggleMark = () => {
    let updated: number[];
    if (markedQuestions.includes(currentIdx)) {
      updated = markedQuestions.filter((idx) => idx !== currentIdx);
    } else {
      updated = [...markedQuestions, currentIdx];
    }
    setMarkedQuestions(updated);

    void persistSnapshot({ answers, currentIndex: currentIdx, markedQuestions: updated });
  };

  const persistSnapshot = async (snapshot: { answers: Record<number, string>; currentIndex: number; markedQuestions: number[] }) => {
    if (!answerServiceRef.current) return;
    setLocalSaveState("saving");
    setBackendSyncState(navigator.onLine ? "syncing" : "offline");
    const result = await answerServiceRef.current.save(snapshot);
    setLocalSaveState(result.localSaveState);
    setBackendSyncState(result.backendSyncState);
    if (result.serverTime && serverTimeAnchorRef.current) {
      serverTimeAnchorRef.current.serverNowMs = Date.parse(result.serverTime);
      serverTimeAnchorRef.current.localNowMs = Date.now();
    }
    if (result.backendSyncState === "revoked") {
      setSessionError("Action required");
      if (activeExam) {
        void submissionLifecycleRef.current?.cleanup("backend_revocation");
        navigate(studentExamReadinessRoute(activeExam.id), { replace: true });
      }
    }
    if (result.backendSyncState === "expired") {
      setSessionError("Exam has expired.");
      void submissionLifecycleRef.current?.cleanup("session_expiration");
    }
  };

  // Keyboard navigation setup
  useEffect(() => {
    if (loadingSession || sessionError || !activeExam) return;

    const cleanShortcuts = ExamShortcutManager.setupShortcuts({
      onPrev: () => {
        if (currentIdx > 0) setCurrentIdx((p) => p - 1);
      },
      onNext: () => {
        if (currentIdx < activeExam.questions.length - 1) setCurrentIdx((p) => p + 1);
      },
      onToggleMark: handleToggleMark,
      onSelectOption: (optionIdx) => {
        const q = activeExam.questions[currentIdx];
        if (q && q.options && q.options[optionIdx]) {
          handleAnswerChange(q.options[optionIdx]);
        }
      },
    });

    return () => cleanShortcuts();
  }, [loadingSession, sessionError, currentIdx, answers, markedQuestions, activeExam]);

  const handleAutoSubmit = () => {
    submitExamAnswers();
  };

  const submitExamAnswers = async () => {
    if (!activeExam || !user || !activeSession || submitting) return;
    setSubmitting(true);
    setSubmissionStatusMessage("Submitting your answers. Keep this window open until confirmation.");
    
    try {
      const attemptId = attemptIdFromSession(activeSession);
      if (!attemptId) throw new Error("A valid attempt is required before submission.");
      if (!submissionLifecycleRef.current) {
        throw new Error("Submission lifecycle is not ready.");
      }

      await submissionLifecycleRef.current.submit({
        exam: activeExam,
        studentId: user.identifier,
        attemptId,
        snapshot: { answers, currentIndex: currentIdx, markedQuestions },
        answerService: answerServiceRef.current,
        warnings,
      });
      setSubmissionStatusMessage("Submission confirmed by the server.");
      showToast("Exam submitted successfully.", "success");
      setSubmitting(false);
    } catch (err: any) {
      setSubmissionStatusMessage(err.message || "Submission failed. Your local draft remains available; retry when the connection is stable.");
      showToast(err.message || "Failed to submit exam paper.", "error");
      setSubmitting(false);
    }
  };

  const forceExitKiosk = async () => {
    if (activeExam && user) {
      // Autosave answers before closing
      if (answerServiceRef.current) await answerServiceRef.current.save({
        answers,
        currentIndex: currentIdx,
        markedQuestions,
      });
    }
    await submissionLifecycleRef.current?.cleanup("app_close");
    if (isTauriAvailable()) {
      const window = getCurrentWindow();
      window.close();
    } else {
      navigate("/dashboard");
    }
  };

  const formatTime = (seconds: number) => {
    const min = Math.floor(seconds / 60);
    const sec = seconds % 60;
    return `${min.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
  };

  const openSubmitDialog = () => {
    lastModalTriggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setShowSubmitModal(true);
  };

  const closeSubmitDialog = () => {
    setShowSubmitModal(false);
    setSubmissionStatusMessage("");
    lastModalTriggerRef.current?.focus();
  };

  const closeCloseConfirmDialog = () => {
    setShowCloseConfirm(false);
    lastModalTriggerRef.current?.focus();
  };

  useEffect(() => {
    if (showSubmitModal) {
      window.setTimeout(() => submitDialogRef.current?.querySelector<HTMLButtonElement>("button")?.focus(), 0);
    }
  }, [showSubmitModal]);

  useEffect(() => {
    if (showCloseConfirm) {
      window.setTimeout(() => closeDialogRef.current?.querySelector<HTMLButtonElement>("button")?.focus(), 0);
    }
  }, [showCloseConfirm]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (showSubmitModal && !submitting) closeSubmitDialog();
      if (showCloseConfirm) closeCloseConfirmDialog();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showCloseConfirm, showSubmitModal, submitting]);

  if (loadingSession) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-surface-base">
        <Loader label="Initializing Secure Kiosk Container..." />
      </div>
    );
  }

  if (sessionError || !activeExam) {
    const isSecurityError = !sessionError || (
      !sessionError.toLowerCase().includes("ended") && 
      !sessionError.toLowerCase().includes("scheduled") &&
      !sessionError.toLowerCase().includes("live") &&
      !sessionError.toLowerCase().includes("found")
    );

    return (
      <div className="h-full w-full p-6 flex items-center justify-center bg-surface-base">
        <Card glow={isSecurityError ? "threat" : "accent"} className="max-w-md flex flex-col gap-4 text-center items-center bg-surface-raised border border-border">
          <AlertTriangle size={36} className={isSecurityError ? "text-danger" : "text-warning"} />
          <h3 className="font-semibold text-zinc-50 tracking-tight text-base uppercase">
            {sessionError?.toLowerCase().includes("ended")
              ? "Exam Has Ended"
              : sessionError?.toLowerCase().includes("scheduled") || sessionError?.toLowerCase().includes("live")
              ? "Exam Not Active"
              : "Kiosk Lockdown Denied"}
          </h3>
          <p className="text-sm text-zinc-400 leading-relaxed font-sans">
            {sessionError || "Verify you have granted all requested hardware and accessibility permissions."}
          </p>
          <Button className="w-fit text-xs" onClick={() => navigate("/dashboard")}>
            Return to Dashboard
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <motion.div
      variants={pageVariants}
      initial={reduceMotion ? false : "initial"}
      animate="animate"
      exit={reduceMotion ? undefined : "exit"}
      className="h-full w-full flex p-5 gap-5 relative select-none bg-surface-base overflow-hidden"
    >
      
      {/* Active Question Canvas */}
      <div className="flex-1 flex flex-col gap-4 h-full overflow-hidden">
        
        {/* Navigation / Header */}
        <Card className="shrink-0 border-border p-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">Active Exam</p>
              <h1 className="mt-1 truncate text-lg font-semibold text-zinc-50" title={activeExam.title}>
                {activeExam.title}
              </h1>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <StatusPill icon={<ShieldCheck size={13} />} label={monitoringOperationalState === "active" ? "Monitoring active" : "Action required"} tone={monitoringOperationalState === "active" ? "success" : "warning"} />
              <StatusPill icon={isOnline ? <Wifi size={13} /> : <WifiOff size={13} />} label={isOnline ? "Connection active" : "Connection unstable"} tone={isOnline ? "success" : "warning"} />
              <StatusPill icon={<Save size={13} />} label={localSaveLabel(localSaveState)} tone={localSaveState === "failed" ? "danger" : "neutral"} />
              <StatusPill icon={backendSyncState === "synchronized" ? <Cloud size={13} /> : <CloudOff size={13} />} label={backendSyncLabel(backendSyncState)} tone={backendSyncState === "synchronized" ? "success" : backendSyncState === "failed" || backendSyncState === "revoked" || backendSyncState === "expired" || backendSyncState === "conflict" ? "danger" : "warning"} />
              <StatusPill icon={<Clock size={13} />} label={formatTime(timeRemaining)} tone={timeRemaining < 300 ? "warning" : "neutral"} />
            </div>
          </div>
          <div className="sr-only" role="status" aria-live="polite">
            {examSaveAnnouncement(localSaveState, backendSyncState, isOnline)}
            {submissionStatusMessage ? ` ${submissionStatusMessage}` : ""}
          </div>
          {(backendSyncState === "offline" || backendSyncState === "failed" || backendSyncState === "conflict" || localSaveState === "failed") && (
            <div className="mt-4 rounded-md border border-warning/25 bg-warning/10 p-3 text-sm text-yellow-100" role="status" aria-live="polite">
              <p className="font-semibold">{examSaveBannerTitle(localSaveState, backendSyncState)}</p>
              <p className="mt-1 text-yellow-100/80">{examSaveBannerMessage(localSaveState, backendSyncState)}</p>
              {(backendSyncState === "failed" || backendSyncState === "conflict") && (
                <Button
                  type="button"
                  variant="secondary"
                  className="mt-3 text-xs"
                  onClick={() => void persistSnapshot({ answers, currentIndex: currentIdx, markedQuestions })}
                >
                  <RefreshCw size={14} />
                  Retry Sync
                </Button>
              )}
            </div>
          )}
        </Card>

        {/* Question Panel */}
        <Card className="flex-1 flex flex-col gap-6 p-6 overflow-y-auto border-border relative bg-surface-raised">
          {isExamPaused && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-surface-base/95 text-warning gap-4 font-sans text-center p-6 z-30">
              <AlertTriangle size={48} className="text-warning animate-pulse" />
              <h3 className="text-lg font-semibold tracking-tight text-zinc-50">Assessment Paused by Proctor</h3>
              <p className="text-sm text-zinc-500 max-w-sm">
                Your exam session has been temporarily paused by the instructor. Please await instructions.
              </p>
            </div>
          )}
          
          {/* Question contents */}
          <div className="flex-1">
            <div className="mb-5 flex items-center gap-2 text-sm text-zinc-400">
              <HelpCircle size={16} className="text-accent" />
              <span>Question {currentIdx + 1} of {activeExam.questions.length}</span>
            </div>
            <QuestionRenderer
              question={activeExam.questions[currentIdx]}
              value={answers[currentIdx] || ""}
              onChange={handleAnswerChange}
            />
          </div>

          {/* Footer inside Question Panel */}
          <div className="flex justify-between items-center border-t border-border pt-4 mt-6 shrink-0 font-sans text-xs">
            <div className="flex gap-2">
              <Button
                variant="secondary"
                disabled={currentIdx === 0}
                onClick={() => setCurrentIdx((p) => p - 1)}
                className="py-1.5 text-xs"
              >
                Previous
              </Button>
              <Button
                variant="secondary"
                onClick={handleToggleMark}
                className={`py-1.5 text-xs ${
                  markedQuestions.includes(currentIdx) 
                    ? "bg-warning/10 border-warning/30 text-warning" 
                    : ""
                }`}
              >
                {markedQuestions.includes(currentIdx) ? "Unmark Review" : "Mark Review"}
              </Button>
            </div>

            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                onClick={() => {
                  if (user && activeExam) {
                    void persistSnapshot({ answers, currentIndex: currentIdx, markedQuestions });
                    showToast("Answer saved locally", "success", 1500);
                  }
                }}
                className="text-zinc-500 hover:text-zinc-300 text-xs gap-1 border border-transparent"
              >
                <Save size={12} /> Save Progress
              </Button>
              
              {currentIdx === activeExam.questions.length - 1 ? (
                <Button onClick={openSubmitDialog} className="py-1.5" disabled={submitting}>
                  Submit Assessment
                </Button>
              ) : (
                <Button onClick={() => setCurrentIdx((p) => p + 1)} className="py-1.5">
                  Next
                </Button>
              )}
            </div>
          </div>
        </Card>
      </div>

      {/* Navigation and operational panel */}
      <div className="w-72 flex flex-col gap-4 select-none shrink-0 h-full overflow-hidden">
        
        {/* Floating Webcam Preview */}
        <CameraPreview className="h-40 shrink-0 rounded-lg overflow-hidden border border-border" />

        {/* Question Palette Grid */}
        <div className="flex-1 overflow-hidden">
          <QuestionPalette
            totalQuestions={activeExam.questions.length}
            currentIndex={currentIdx}
            answers={answers}
            markedQuestions={markedQuestions}
            onSelect={(idx) => setCurrentIdx(idx)}
          />
        </div>

        <Card className="px-4 py-3 flex justify-between items-center border-border shrink-0 font-sans text-xs bg-surface-raised">
          <span className="text-zinc-500 font-semibold uppercase tracking-wider text-[10px]">Operational State</span>
          <span className="text-accent bg-accent/10 border border-accent/20 px-2 py-0.5 rounded-full font-semibold text-xs">
            {monitoringOperationalState === "active" ? "Monitoring active" : "Action required"}
          </span>
        </Card>
      </div>

      {/* 1. Submission Confirmation Modal */}
      <AnimatePresence>
        {showSubmitModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                if (!submitting) closeSubmitDialog();
              }}
              className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
            />
            <motion.div
              ref={submitDialogRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="submit-dialog-title"
              aria-describedby="submit-dialog-description"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.15 }}
              className="bg-surface-raised border border-border rounded-xl p-6 shadow-2xl max-w-md w-full z-10 flex flex-col gap-4"
            >
              <div className="flex flex-col gap-1">
                <h3 id="submit-dialog-title" className="text-base font-semibold text-zinc-50 tracking-tight">
                  Submit Assessment Paper?
                </h3>
                <p id="submit-dialog-description" className="text-sm text-zinc-400 leading-relaxed font-sans">
                  {unansweredCount(activeExam.questions.length, answers) > 0
                    ? `${unansweredCount(activeExam.questions.length, answers)} question${unansweredCount(activeExam.questions.length, answers) === 1 ? " is" : "s are"} unanswered. Submit only when you are ready.`
                    : "All questions have an answer. Submit only when you are ready."}
                </p>
                {(backendSyncState === "offline" || backendSyncState === "failed" || backendSyncState === "conflict") && (
                  <p className="rounded-md border border-warning/25 bg-warning/10 p-2 text-xs text-yellow-100">
                    Your latest answers are preserved locally. Final submission sends the current answers, but server draft sync still needs attention.
                  </p>
                )}
                <p className="text-xs text-zinc-500">
                  Monitoring stays active until the server confirms your submission.
                </p>
                {submissionStatusMessage && <p className="text-xs text-zinc-300" role="status">{submissionStatusMessage}</p>}
              </div>
              <div className="flex gap-3 justify-end mt-2">
                <Button className="text-xs" isLoading={submitting} onClick={submitExamAnswers} disabled={submitting}>
                  Confirm Submit
                </Button>
                <Button className="text-xs" variant="secondary" onClick={closeSubmitDialog} disabled={submitting}>
                  Cancel
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 2. Window Exit confirmation dialog block */}
      <AnimatePresence>
        {showCloseConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closeCloseConfirmDialog}
              className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
            />
            <motion.div
              ref={closeDialogRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="close-dialog-title"
              aria-describedby="close-dialog-description"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.15 }}
              className="bg-surface-raised border border-border border-l-2 border-l-danger rounded-xl p-6 shadow-2xl max-w-md w-full z-10 flex flex-col gap-4"
            >
              <div className="flex flex-col gap-1">
                <h3 id="close-dialog-title" className="text-base font-semibold text-danger flex items-center gap-1.5">
                  <AlertTriangle size={18} /> Blocked Close Request
                </h3>
                <p id="close-dialog-description" className="text-sm text-zinc-400 leading-relaxed font-sans">
                  Closing the window during an active assessment is monitored. A local draft will be saved before exit, but unsynced answers may still need reconnection.
                </p>
              </div>
              <div className="flex gap-3 justify-end mt-2">
                <Button variant="danger" className="text-xs" onClick={forceExitKiosk}>
                  Force Exit (Saves Draft)
                </Button>
                <Button className="text-xs" variant="secondary" onClick={closeCloseConfirmDialog}>
                  Cancel
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function StatusPill({
  icon,
  label,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  tone: "success" | "warning" | "danger" | "neutral";
}) {
  const toneClass = {
    success: "border-success/20 bg-success/10 text-success",
    warning: "border-warning/20 bg-warning/10 text-warning",
    danger: "border-danger/20 bg-danger/10 text-danger",
    neutral: "border-border bg-surface-base text-zinc-300",
  }[tone];
  return (
    <span className={`inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 font-semibold ${toneClass}`}>
      {icon}
      {label}
    </span>
  );
}

function localSaveLabel(state: LocalSaveState) {
  if (state === "saving") return "Saving locally";
  if (state === "saved") return "Answer saved locally";
  if (state === "failed") return "Action required";
  return "Answer saved locally";
}

function backendSyncLabel(state: BackendSyncState) {
  if (state === "synchronized") return "Saved to server";
  if (state === "syncing") return "Saving to server";
  if (state === "offline") return "Saved locally only";
  if (state === "failed") return "Sync failed";
  if (state === "revoked" || state === "expired" || state === "conflict") return "Action required";
  if (state === "stale_ignored") return "Answer saved locally";
  return "Server save pending";
}

function examSaveAnnouncement(localState: LocalSaveState, backendState: BackendSyncState, isOnline: boolean) {
  if (!isOnline || backendState === "offline") return "Offline. Answers are saved locally only until connection returns.";
  if (backendState === "synchronized") return "Answers are saved locally and synchronized to the server.";
  if (backendState === "syncing") return "Saving answers securely to the server.";
  if (backendState === "conflict") return "Sync needs attention. Your local answers were not discarded.";
  if (backendState === "failed") return "Server sync failed. Your local draft remains available.";
  if (localState === "failed") return "Local draft save failed. Please retry.";
  return "Answer draft is saved locally. Server save is pending.";
}

function examSaveBannerTitle(localState: LocalSaveState, backendState: BackendSyncState) {
  if (localState === "failed") return "Local draft needs attention";
  if (backendState === "conflict") return "Sync needs attention";
  if (backendState === "failed") return "Server sync failed";
  return "Saved locally only";
}

function examSaveBannerMessage(localState: LocalSaveState, backendState: BackendSyncState) {
  if (localState === "failed") return "CheatLock could not update the encrypted local draft. Retry before leaving this device.";
  if (backendState === "conflict") return "Another server version exists. Your answers remain on this device; retry sync or continue and submit when ready.";
  if (backendState === "failed") return "Your encrypted local draft remains available. Retry sync when the connection is stable.";
  return "You can continue answering. CheatLock will try to synchronize when the connection is available.";
}

function unansweredCount(totalQuestions: number, answers: Record<number, string>) {
  return Array.from({ length: totalQuestions }).filter((_, index) => !answers[index]?.trim()).length;
}

function deriveSessionTiming(
  exam: { durationMinutes: number; scheduledEndAt?: string | null },
  session: { startedAt?: number }
) {
  const raw = session as Record<string, unknown>;
  const serverTime = readDateMs(raw.serverTime);
  const expiresAt = readDateMs(raw.expiresAt) ?? readDateMs(raw.endsAt) ?? readDateMs(exam.scheduledEndAt);
  if (serverTime && expiresAt) {
    return {
      remainingSeconds: Math.max(0, Math.ceil((expiresAt - serverTime) / 1000)),
      anchor: { serverNowMs: serverTime, localNowMs: Date.now(), endsAtMs: expiresAt },
    };
  }

  const startedAt = typeof session.startedAt === "number" ? session.startedAt : Date.now();
  const endsAtMs = startedAt + exam.durationMinutes * 60 * 1000;
  return {
    remainingSeconds: Math.max(0, Math.ceil((endsAtMs - Date.now()) / 1000)),
    anchor: { serverNowMs: Date.now(), localNowMs: Date.now(), endsAtMs },
  };
}

function readDateMs(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

interface SessionMonitorFactoryArgs {
  policy: ExamMonitoringPolicy;
  examId: string;
  startSecurityMonitoring: (examId: string) => Promise<void>;
  stopSecurityMonitoring: (examId: string) => Promise<void>;
  startFaceProctoring: (examId: string) => void;
  stopFaceProctoring: () => void;
  startContinuousLiveness: (examId: string) => void;
  stopContinuousLiveness: () => void;
  startAudioMonitoring: (examId: string) => void;
  stopAudioMonitoring: () => void;
  audioHealth: string;
  startScreenMonitoring: () => Promise<boolean>;
  stopScreenMonitoring: () => void;
  captureHealth: string;
  startObjectDetection: (examId: string) => Promise<void>;
  stopObjectDetection: () => void;
  startSuspicionEngine: (examId: string) => void;
  stopSuspicionEngine: () => void;
}

function createSessionMonitorRegistrations(args: SessionMonitorFactoryArgs): ExamMonitorRegistration[] {
  return [
    realMonitor("application_security", true, () => args.startSecurityMonitoring(args.examId), () => args.stopSecurityMonitoring(args.examId)),
    unsupportedMonitor("camera", args.policy.requireCamera, "Camera startup must be bound to the verified camera preview pipeline before session entry."),
    realMonitor("screen", args.policy.requireScreenCapture, async () => {
      const started = await args.startScreenMonitoring();
      if (!started) throw new Error("Screen capture permission was not granted.");
    }, async () => args.stopScreenMonitoring(), () => args.captureHealth === "capturing"),
    unsupportedMonitor("microphone", args.policy.requireMicrophone, "Microphone monitoring does not expose a confirmed active health check yet."),
    unsupportedMonitor(
      "ai_model",
      args.policy.requireLivenessChecks,
      "AI model monitoring cannot be confirmed from the current model loader and is treated as unsupported."
    ),
    realMonitor("backend_heartbeat", true, async () => args.startSuspicionEngine(args.examId), async () => args.stopSuspicionEngine()),
    socketMonitor(),
  ];
}

function realMonitor(
  name: ExamMonitorName,
  required: boolean,
  start: () => Promise<void> | void,
  stop: () => Promise<void> | void,
  isHealthy: () => boolean = () => true,
  unsupportedMessage?: string
): ExamMonitorRegistration {
  let state: MonitorState = "idle";
  let message = `${name} monitor is idle.`;
  const monitor: ExamMonitor = {
    start: async () => {
      state = "starting";
      await start();
      if (unsupportedMessage) {
        state = "failed";
        message = unsupportedMessage;
        throw new Error(unsupportedMessage);
      }
      state = isHealthy() ? "active" : "failed";
      message = state === "active" ? `${name} monitor is active.` : `${name} monitor could not confirm active health.`;
      if (state === "failed") throw new Error(message);
    },
    stop: async () => {
      state = "stopping";
      await stop();
      state = "idle";
      message = `${name} monitor stopped.`;
    },
    getStatus: async () => monitorStatus(name, required, state, message, state === "failed" ? "health_check_failed" : undefined),
    healthCheck: async () => health(state === "active", state, message, state === "failed" ? "health_check_failed" : undefined),
  };
  return { name, monitor, required };
}

function unsupportedMonitor(name: ExamMonitorName, required: boolean, message: string): ExamMonitorRegistration {
  const monitor: ExamMonitor = {
    start: async () => {
      throw new Error(message);
    },
    stop: async () => {},
    getStatus: async () => monitorStatus(name, required, "failed", message, "not_implemented"),
    healthCheck: async () => health(false, "failed", message, "not_implemented"),
  };
  return { name, monitor, required, allowDegraded: !required };
}

function socketMonitor(): ExamMonitorRegistration {
  const monitor: ExamMonitor = {
    start: async () => {
      const socket = SocketService.getInstance().getSocket();
      if (!socket?.connected) throw new Error("Event socket is not connected.");
    },
    stop: async () => {},
    getStatus: async () => monitorStatus("event_socket", true, "active", "Event socket is connected."),
    healthCheck: async () => health(true, "active", "Event socket is connected."),
  };
  return { name: "event_socket", monitor, required: true };
}

function health(healthy: boolean, state: MonitorState, message: string, errorCode?: string): HealthCheckResult {
  return { healthy, state, message, errorCode, checkedAt: new Date().toISOString() };
}

function monitorStatus(
  name: ExamMonitorName,
  required: boolean,
  state: MonitorState,
  message: string,
  errorCode?: string
): MonitorStatus {
  return { name, required, state, message, errorCode, checkedAt: new Date().toISOString() };
}

function readExamMonitoringPolicy(exam: unknown): ExamMonitoringPolicy {
  const rawExam = typeof exam === "object" && exam !== null ? (exam as Record<string, unknown>) : {};
  const raw = typeof rawExam.monitoringPolicy === "object" && rawExam.monitoringPolicy !== null
    ? (rawExam.monitoringPolicy as Record<string, unknown>)
    : {};
  return {
    requireCamera: readBoolean(raw.requireCamera, true),
    requireMicrophone: readBoolean(raw.requireMicrophone, true),
    requireScreenCapture: readBoolean(raw.requireScreenCapture, true),
    requireIdentityVerification: readBoolean(raw.requireIdentityVerification, true),
    requireLivenessChecks: readBoolean(raw.requireLivenessChecks, true),
    allowOfflineDrafts: readBoolean(raw.allowOfflineDrafts, true),
    allowMultipleDisplays: readBoolean(raw.allowMultipleDisplays, false),
    telemetryIntervalMs: readNumber(raw.telemetryIntervalMs, 5000),
    screenSnapshotIntervalMs: readNumber(raw.screenSnapshotIntervalMs, 15000),
  };
}

function readBoolean(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function readNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function createDraftScope(
  studentId: string,
  examId: string,
  session: { examId?: string; studentId: string; status: string; startedAt?: number; deviceId?: string } | null
): ExamDraftScope | null {
  if (!session?.deviceId) return null;
  const attemptId = attemptIdFromSession(session as any);
  if (!attemptId) return null;
  return {
    studentId,
    examId,
    attemptId,
    deviceId: session.deviceId,
  };
}
