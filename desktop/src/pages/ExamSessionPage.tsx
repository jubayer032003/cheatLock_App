import { useEffect, useState, useRef } from "react";
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
import { SocketService } from "../socket/service";
import { OfflineCache } from "../services/OfflineCache";
import { ExamShortcutManager } from "../utils/ExamShortcutManager";
import { QuestionRenderer } from "../components/QuestionRenderer";
import { QuestionPalette } from "../components/QuestionPalette";
import { Card } from "../components/Card";
import { Button } from "../components/Button";
import { Loader } from "../components/Loader";
import { invoke, getCurrentWindow, isTauriAvailable } from "../utils/tauri";
import { AlertTriangle, HelpCircle, Wifi, WifiOff, Save } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { pageVariants } from "../motion/variants";

export function ExamSessionPage() {
  const { activeExam, activeSession, setActiveSession, user } = useAuth();
  const { showToast } = useToast();
  const { startSecurityMonitoring, stopSecurityMonitoring, suspicionScore, violations } = useSecurity();
  const { pipeline } = useCamera();
  const { startFaceProctoring, stopFaceProctoring } = useFace();
  const { startContinuousLiveness, stopContinuousLiveness, triggerLivenessCheck } = useLiveness();
  const { startMonitoring: startAudioMonitoring, stopMonitoring: stopAudioMonitoring } = useAudio();
  const { startScreenMonitoring, stopScreenMonitoring } = useScreen();
  const { startObjectDetection, stopObjectDetection } = useObject();
  const { startSuspicionEngine, stopSuspicionEngine } = useSuspicion();
  const navigate = useNavigate();

  const [loadingSession, setLoadingSession] = useState(true);
  const [sessionError, setSessionError] = useState<string | null>(null);

  // Core Exam States
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [markedQuestions, setMarkedQuestions] = useState<number[]>([]);
  const [timeRemaining, setTimeRemaining] = useState(0);

  // Network and UI Dialog overlays
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [isExamPaused, setIsExamPaused] = useState(false);
  const isExamPausedRef = useRef(false);
  const screenStartedRef = useRef(false);
  useEffect(() => {
    isExamPausedRef.current = isExamPaused;
  }, [isExamPaused]);

  // Derive warning tallies dynamically from security violations log
  const warnings = {
    appSwitch: violations.filter((v) => v.type === "FOCUS_LOSS").length,
    faceMissing: 0,
    audio: 0,
    phone: 0,
  };

  const timerRef = useRef<number | null>(null);

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

    const handleTelemetryFrame = (base64Frame: string) => {
      SocketService.getInstance().emit("camera_preview_updated", {
        examId: activeExam.id,
        studentId: user.identifier,
        previewBase64: base64Frame,
        timestamp: Date.now(),
      }).catch(() => {});
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
        // 1. Invoke Tauri commands to secure the OS desktop environment
        if (isTauriAvailable()) {
          await invoke("start_exam_monitoring");
        } else {
          console.warn("[ExamSessionPage] Tauri not available, skipping start_exam_monitoring.");
        }
        await startSecurityMonitoring(activeExam.id);
        startFaceProctoring(activeExam.id);
        startContinuousLiveness(activeExam.id);
        startAudioMonitoring(activeExam.id);
        if (!screenStartedRef.current) {
          screenStartedRef.current = true;
          await startScreenMonitoring(activeExam.id);
        }
        await startObjectDetection(activeExam.id);
        startSuspicionEngine(activeExam.id);
        
        let session = activeSession;
        let remaining = activeExam.durationMinutes * 60;

        if (session && session.status === "IN_PROGRESS" && session.startedAt) {
          // Recovery: recalculate time remaining based on start time
          const elapsed = Math.floor((Date.now() - session.startedAt) / 1000);
          remaining = Math.max(0, activeExam.durationMinutes * 60 - elapsed);
        } else {
          // Fresh Session Creation
          const deviceId = "desktop-client-uuid-placeholder";
          session = await SessionService.startSession(activeExam.id, deviceId);
          setActiveSession(session);
        }

        // 2. Draft Recovery: restore from OfflineCache if available
        const draft = OfflineCache.getDraft(user.identifier, activeExam.id);
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

        // Socket Join Emit
        SocketService.getInstance().emit("student_joined_exam", {
          examId: activeExam.id,
          studentId: user.identifier,
          studentName: user.name,
        }).catch(() => {});

      } catch (err: any) {
        setSessionError(err.message || "Lockdown environment refused initialization.");
        setLoadingSession(false);
      }
    }

    initExamSession();

    return () => {
      stopSuspicionEngine();
      stopObjectDetection();
      stopScreenMonitoring();
      screenStartedRef.current = false;
      stopContinuousLiveness();
      stopAudioMonitoring();
      stopFaceProctoring();
      if (activeExam) {
        stopSecurityMonitoring(activeExam.id).catch(() => {});
      }
      if (isTauriAvailable()) {
        invoke("stop_exam_monitoring").catch(() => {});
      }
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [activeExam]);

  // Countdown timer interval
  useEffect(() => {
    if (loadingSession || sessionError || timeRemaining <= 0) return;

    timerRef.current = window.setInterval(() => {
      if (isExamPausedRef.current) return;
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
          showToast("Your session has been locked by the proctor.", "error", 10000);
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
      OfflineCache.saveDraft(user.identifier, activeExam.id, {
        answers,
        currentIndex: currentIdx,
        markedQuestions,
      });
      showToast("Progress autosaved.", "info", 1500);
    }, 30000);

    return () => clearInterval(autoSaveInterval);
  }, [loadingSession, sessionError, answers, currentIdx, markedQuestions, user, activeExam]);

  const handleAnswerChange = (val: string) => {
    if (isExamPausedRef.current) return;
    const updatedAnswers = { ...answers, [currentIdx]: val };
    setAnswers(updatedAnswers);

    // Save immediately on any modification
    if (user && activeExam) {
      OfflineCache.saveDraft(user.identifier, activeExam.id, {
        answers: updatedAnswers,
        currentIndex: currentIdx,
        markedQuestions,
      });
    }
  };

  const handleToggleMark = () => {
    let updated: number[];
    if (markedQuestions.includes(currentIdx)) {
      updated = markedQuestions.filter((idx) => idx !== currentIdx);
    } else {
      updated = [...markedQuestions, currentIdx];
    }
    setMarkedQuestions(updated);

    if (user && activeExam) {
      OfflineCache.saveDraft(user.identifier, activeExam.id, {
        answers,
        currentIndex: currentIdx,
        markedQuestions: updated,
      });
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
    if (!activeExam || !user) return;
    setSubmitting(true);
    
    try {
      const totalWarnings = Object.values(warnings).reduce((a, b) => a + b, 0);
      const riskLevel = totalWarnings >= 4 ? "High Risk" : totalWarnings >= 2 ? "Medium Risk" : "Low Risk";

      const formattedAnswers = Object.entries(answers).map(([idx, text]) => ({
        questionIndex: Number(idx),
        questionText: activeExam.questions[Number(idx)].text,
        answerText: text,
      }));

      // Submit answers (handles offline checks)
      if (isOnline) {
        await SessionService.saveSubmission({
          examId: activeExam.id,
          studentId: user.identifier,
          answers: formattedAnswers,
          appSwitchWarnings: warnings.appSwitch,
          faceMissingWarnings: warnings.faceMissing,
          audioWarnings: warnings.audio,
          phoneWarnings: warnings.phone,
          totalWarnings,
          riskLevel,
          submittedAt: Date.now(),
        });

        await SessionService.submitSession(activeExam.id);
      } else {
        showToast("No internet connection. Submission cached locally. Connect to upload.", "warning", 6000);
      }

      // Purge cached drafts
      OfflineCache.clearDraft(user.identifier, activeExam.id);
      setActiveSession(null);

      showToast("Exam submitted successfully.", "success");
      setSubmitting(false);
      
      // Stop Tauri secure window modes
      if (isTauriAvailable()) {
        await invoke("stop_exam_monitoring");
      }
      navigate("/dashboard");
    } catch (err: any) {
      showToast(err.message || "Failed to submit exam paper.", "error");
      setSubmitting(false);
    }
  };

  const forceExitKiosk = async () => {
    if (activeExam && user) {
      // Autosave answers before closing
      OfflineCache.saveDraft(user.identifier, activeExam.id, {
        answers,
        currentIndex: currentIdx,
        markedQuestions,
      });
    }
    // Release secure window modes and close window
    if (isTauriAvailable()) {
      await invoke("stop_exam_monitoring");
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

  const getRiskColor = (score: number) => {
    if (score >= 60) return "bg-danger/10 text-danger border-danger/20";
    if (score >= 30) return "bg-warning/10 text-warning border-warning/20";
    return "bg-success/10 text-success border-success/20";
  };

  return (
    <motion.div
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      className="h-full w-full flex p-5 gap-5 relative select-none bg-surface-base overflow-hidden"
    >
      
      {/* Active Question Canvas */}
      <div className="flex-1 flex flex-col gap-4 h-full overflow-hidden">
        
        {/* Navigation / Header */}
        <Card className="p-4 flex items-center justify-between border-border shrink-0 select-none">
          <div className="flex items-center gap-2">
            <HelpCircle size={16} className="text-accent" />
            <span className="text-xs font-semibold text-zinc-300">
              QUESTION {currentIdx + 1} OF {activeExam.questions.length}
            </span>
          </div>

          <div className="flex items-center gap-4 text-xs font-sans">
            {/* Online Status light */}
            <div className="flex items-center gap-1.5 bg-surface-base px-2.5 py-1 rounded-md border border-border">
              {isOnline ? (
                <>
                  <Wifi size={12} className="text-success" />
                  <span className="text-[10px] text-success font-semibold uppercase">Online</span>
                </>
              ) : (
                <>
                  <WifiOff size={12} className="text-danger animate-pulse" />
                  <span className="text-[10px] text-danger font-semibold uppercase">Offline Cache</span>
                </>
              )}
            </div>

            <span className="text-zinc-500 font-medium">TIME REMAINING:</span>
            <span className={`text-sm font-mono font-semibold px-3 py-1 rounded border ${
              timeRemaining < 300 
                ? "text-danger bg-danger/5 border-danger/20 animate-pulse" 
                : "text-zinc-300 bg-surface-base border-border"
            }`}>
              {formatTime(timeRemaining)}
            </span>
          </div>
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
                    OfflineCache.saveDraft(user.identifier, activeExam.id, {
                      answers,
                      currentIndex: currentIdx,
                      markedQuestions,
                    });
                    showToast("Draft saved successfully.", "success", 1500);
                  }
                }}
                className="text-zinc-500 hover:text-zinc-300 text-xs gap-1 border border-transparent"
              >
                <Save size={12} /> Save Progress
              </Button>
              
              {currentIdx === activeExam.questions.length - 1 ? (
                <Button onClick={() => setShowSubmitModal(true)} className="py-1.5">
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

      {/* Proctoring / Diagnostics Panel */}
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

        {/* Security Violation Log Widget */}
        <Card className="p-4 flex flex-col gap-3 border-border shrink-0 font-sans text-xs bg-surface-raised">
          <div className="flex justify-between items-center border-b border-border pb-2">
            <span className="text-zinc-500 font-semibold uppercase tracking-wider text-[10px]">Risk Score:</span>
            <span className={`px-2 py-0.5 rounded-full font-semibold font-mono text-xs border ${getRiskColor(suspicionScore)}`}>
              {suspicionScore}%
            </span>
          </div>
          <div className="max-h-24 overflow-y-auto flex flex-col gap-1.5 text-xs pr-1">
            {violations.length === 0 ? (
              <span className="text-zinc-600 italic text-center py-2">No security alerts triggered.</span>
            ) : (
              violations.map((v, i) => (
                <div key={i} className="flex justify-between text-danger border-b border-zinc-800/40 pb-1">
                  <span className="font-medium text-zinc-300">{v.type}:</span>
                  <span className="truncate max-w-[130px] font-mono text-[11px]" title={v.message}>{v.message}</span>
                </div>
              ))
            )}
          </div>
        </Card>

        {/* AI Proctor pill */}
        <Card className="px-4 py-3 flex justify-between items-center border-border shrink-0 font-sans text-xs bg-surface-raised">
          <span className="text-zinc-500 font-semibold uppercase tracking-wider text-[10px]">AI Proctoring:</span>
          <span className="text-accent bg-accent/10 border border-accent/20 px-2 py-0.5 rounded-full font-semibold text-xs">
            ACTIVE
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
              onClick={() => setShowSubmitModal(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.15 }}
              className="bg-surface-raised border border-border rounded-xl p-6 shadow-2xl max-w-md w-full z-10 flex flex-col gap-4"
            >
              <div className="flex flex-col gap-1">
                <h3 className="text-base font-semibold text-zinc-50 tracking-tight">
                  Submit Assessment Paper?
                </h3>
                <p className="text-sm text-zinc-400 leading-relaxed font-sans">
                  Are you sure you want to finish the exam? This will release all kiosk protections and write final answers to the database logs.
                </p>
              </div>
              <div className="flex gap-3 justify-end mt-2">
                <Button className="text-xs" isLoading={submitting} onClick={submitExamAnswers}>
                  Confirm Submit
                </Button>
                <Button className="text-xs" variant="secondary" onClick={() => setShowSubmitModal(false)}>
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
              onClick={() => setShowCloseConfirm(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.15 }}
              className="bg-surface-raised border border-border border-l-2 border-l-danger rounded-xl p-6 shadow-2xl max-w-md w-full z-10 flex flex-col gap-4"
            >
              <div className="flex flex-col gap-1">
                <h3 className="text-base font-semibold text-danger flex items-center gap-1.5">
                  <AlertTriangle size={18} /> Blocked Close Request
                </h3>
                <p className="text-sm text-zinc-400 leading-relaxed font-sans">
                  Closing the window during an active assessment is monitored. If you wish to exit, you must save your draft answers first.
                </p>
              </div>
              <div className="flex gap-3 justify-end mt-2">
                <Button variant="danger" className="text-xs" onClick={forceExitKiosk}>
                  Force Exit (Saves Draft)
                </Button>
                <Button className="text-xs" variant="secondary" onClick={() => setShowCloseConfirm(false)}>
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
