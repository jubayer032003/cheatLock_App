import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Activity,
  AlertTriangle,
  BadgeCheck,
  BookOpenCheck,
  Camera,
  CheckCircle2,
  Clock3,
  Cpu,
  Bell,
  Gauge,
  KeyRound,
  Mic,
  Play,
  Radio,
  RefreshCw,
  Server,
  ShieldCheck,
  Signal,
  TimerReset,
  UserCheck,
} from "lucide-react";
import { useAudio } from "../contexts/AudioContext";
import { useAuth } from "../contexts/AuthContext";
import { useCamera } from "../contexts/CameraContext";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { Input } from "../components/Input";
import { Loader } from "../components/Loader";
import { Dialog } from "../components/ui/Dialog";
import { useToast } from "../hooks/useToast";
import { pageVariants, staggerContainer, staggerItem } from "../motion/variants";
import { SessionService } from "../services/SessionService";
import type { Exam, StudentNotification } from "../types";
import { isTauriAvailable } from "../utils/tauri";
import { NetworkProbeService } from "../services/NetworkProbeService";
import { NativeDeviceService } from "../services/NativeDeviceService";

interface CheckState {
  label: string;
  passed: boolean | null;
  value: string;
}

type ReadinessTone = "ready" | "waiting" | "blocked";

export function DashboardPage() {
  const { user, serverUrl, setActiveExam } = useAuth();
  const { showToast } = useToast();
  const { devices, selectedDeviceId, changeCamera, isLocked } = useCamera();
  const {
    devices: audioDevices,
    selectedDeviceId: selectedMicId,
    selectDevice: selectMic,
    calibrationState,
    calibrationProgress,
    startCalibration,
  } = useAudio();
  const navigate = useNavigate();

  const [exam, setExam] = useState<Exam | null>(null);
  const [loadingExam, setLoadingExam] = useState(true);
  const [showCodeModal, setShowCodeModal] = useState(false);
  const [accessCode, setAccessCode] = useState("");
  const [verifyingCode, setVerifyingCode] = useState(false);
  const [checking, setChecking] = useState(false);
  const [notifications, setNotifications] = useState<StudentNotification[]>([]);
  const shownNotificationIdsRef = useRef<Set<string>>(new Set());

  const [latencyCheck, setLatencyCheck] = useState<CheckState>({
    label: "Secure server",
    passed: null,
    value: "Probing",
  });
  const [hardwareCheck, setHardwareCheck] = useState<CheckState>({
    label: "Media hardware",
    passed: null,
    value: "Querying",
  });

  const fetchExamData = async () => {
    setLoadingExam(true);
    try {
      const assigned = await SessionService.getAssignedExam();
      setExam(assigned);
      setActiveExam(assigned);
    } catch (err: any) {
      console.warn("[Dashboard] Assigned exam fetch skipped/failed:", err.message);
      setExam(null);
      setActiveExam(null);
    } finally {
      setLoadingExam(false);
    }
  };

  const runDiagnostics = async () => {
    setChecking(true);

    try {
      const probe = await NetworkProbeService.probeBackendHealth({ origin: serverUrl });
      const ping = probe.latencyMs ?? 0;
      setLatencyCheck({
        label: "Secure server",
        passed: probe.reachable && ping < 500,
        value: probe.reachable ? `${ping} ms ${ping < 500 ? "stable" : "slow"}` : probe.errorCode || "Unreachable",
      });
    } catch {
      setLatencyCheck({
        label: "Secure server",
        passed: false,
        value: "Unreachable",
      });
    }

    try {
      if (isTauriAvailable()) {
        const hw = await NativeDeviceService.getNativeHardwareDiagnostics();
        const cameraReady = hw.camera.state === "available";
        const microphoneReady = hw.microphone.state === "available";
        const passed = cameraReady && microphoneReady;
        setHardwareCheck({
          label: "Media hardware",
          passed,
          value: `${hw.osName} | camera ${cameraReady ? `${hw.cameras.length} detected` : hw.camera.errorCode || "missing"} | mic ${
            microphoneReady ? `${hw.microphones.length} detected` : hw.microphone.errorCode || "missing"
          }`,
        });
      } else {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const hasCamera = devices.some((device) => device.kind === "videoinput");
        const hasMicrophone = devices.some((device) => device.kind === "audioinput");
        setHardwareCheck({
          label: "Media hardware",
          passed: hasCamera && hasMicrophone,
          value: `camera ${hasCamera ? "detected" : "missing"} | mic ${hasMicrophone ? "detected" : "missing"}`,
        });
      }
    } catch {
      setHardwareCheck({
        label: "Media hardware",
        passed: false,
        value: "Permission or device issue",
      });
    }

    setChecking(false);
  };

  const refreshNotifications = async (showNewToast = false) => {
    if (!user) return;
    try {
      const pending = await SessionService.getStudentNotifications(user.identifier, true);
      if (pending.length === 0) return;

      setNotifications((current) => {
        const existing = new Map(current.map((item) => [item.id, item]));
        pending.forEach((item) => existing.set(item.id, item));
        return [...existing.values()].sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
      });

      const examNotification = pending.find((item) =>
        item.type === "EXAM_LIVE" || item.type === "EXAM_CREATED" || item.type === "EXAM_ASSIGNED"
      );
      if (examNotification) {
        fetchExamData();
        const hasShown = shownNotificationIdsRef.current.has(examNotification.id);
        if (showNewToast && !hasShown) {
          shownNotificationIdsRef.current.add(examNotification.id);
          showToast(examNotification.payload.message || "Your exam roster was updated.", "info", 8000);
        }
      }
    } catch (err) {
      console.warn("[Dashboard] Notification sync failed:", err);
    }
  };

  const markNotificationRead = async (notification: StudentNotification) => {
    if (!user) return;
    setNotifications((current) => current.filter((item) => item.id !== notification.id));
    try {
      await SessionService.markNotificationRead(user.identifier, notification.id);
    } catch (err) {
      console.warn("[Dashboard] Failed to mark notification read:", err);
    }
  };

  const handleVerifyAccessCode = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!accessCode.trim()) {
      showToast("Please input a valid exam access code.", "warning");
      return;
    }

    setVerifyingCode(true);
    try {
      const verifiedExam = await SessionService.getExamByCode(accessCode.trim());
      setExam(verifiedExam);
      setActiveExam(verifiedExam);
      showToast(`Verified: ${verifiedExam.title}`, "success");
      setShowCodeModal(false);
      setAccessCode("");
    } catch (err: any) {
      showToast(err.message || "Failed to verify exam access code.", "error");
    } finally {
      setVerifyingCode(false);
    }
  };

  useEffect(() => {
    fetchExamData().then(() => {
      runDiagnostics();
    });
    refreshNotifications(false);
  }, []);

  useEffect(() => {
    const intervalId = window.setInterval(() => refreshNotifications(true), 15000);
    return () => window.clearInterval(intervalId);
  }, [user?.identifier]);

  const cameraReady = devices.length > 0;
  const micReady = audioDevices.length > 0;
  const allChecksPassed = latencyCheck.passed === true && hardwareCheck.passed === true;
  const canStartIdentity = Boolean(exam) && allChecksPassed && cameraReady && micReady;
  const readyCount = [Boolean(exam), allChecksPassed, cameraReady, micReady].filter(Boolean).length;
  const readinessPercent = Math.round((readyCount / 4) * 100);
  const readinessTone: ReadinessTone = !exam || latencyCheck.passed === false || hardwareCheck.passed === false
    ? "blocked"
    : readinessPercent === 100
      ? "ready"
      : "waiting";

  const selectedCameraLabel = useMemo(
    () => devices.find((device) => device.deviceId === selectedDeviceId)?.label || "Default camera",
    [devices, selectedDeviceId]
  );
  const selectedMicLabel = useMemo(
    () => audioDevices.find((device) => device.deviceId === selectedMicId)?.label || "Default microphone",
    [audioDevices, selectedMicId]
  );

  if (loadingExam) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-surface-base">
        <Loader label="Synchronizing Exam Rosters..." />
      </div>
    );
  }

  return (
    <motion.div
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      className="h-full w-full overflow-y-auto bg-surface-base"
    >
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-6">
        <section className="grid min-h-[188px] grid-cols-1 overflow-hidden rounded-lg border border-border bg-zinc-950 lg:grid-cols-[1.35fr_0.65fr]">
          <div className="relative flex flex-col justify-between border-b border-border p-6 lg:border-b-0 lg:border-r">
            <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px)] bg-[size:32px_32px]" />
            <div className="relative flex flex-col gap-5">
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill icon={ShieldCheck} label="Student home" tone="accent" />
                <StatusPill icon={Radio} label={isTauriAvailable() ? "Desktop mode" : "Browser mode"} tone="neutral" />
                <StatusPill icon={Signal} label={latencyCheck.value} tone={latencyCheck.passed === false ? "danger" : "success"} />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-zinc-500">Welcome back</p>
                <h2 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-50">
                  {user?.name || "Student"}
                </h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
                  {exam
                    ? "Your assigned assessment is ready for final checks."
                    : "No assigned assessment is available in your roster."}
                </p>
              </div>
            </div>
            <div className="relative mt-6 flex flex-wrap gap-3">
              <Button className="h-10 px-4" onClick={() => setShowCodeModal(true)}>
                <KeyRound size={16} /> Enter Access Code
              </Button>
              <Button variant="secondary" className="h-10 px-4" onClick={fetchExamData}>
                <RefreshCw size={16} /> Sync Roster
              </Button>
            </div>
          </div>

          <div className="flex flex-col justify-between bg-surface-raised p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">Readiness</p>
                <p className="mt-2 text-4xl font-semibold text-zinc-50">{readinessPercent}%</p>
              </div>
              <ReadinessRing percent={readinessPercent} tone={readinessTone} />
            </div>
            <div className="mt-6 grid grid-cols-2 gap-2">
              <MiniCheck label="Exam" ok={Boolean(exam)} />
              <MiniCheck label="Server" ok={latencyCheck.passed === true} />
              <MiniCheck label="Camera" ok={cameraReady} />
              <MiniCheck label="Audio" ok={micReady} />
            </div>
          </div>
        </section>

        {exam ? (
          <motion.section
            variants={staggerContainer}
            initial="initial"
            animate="animate"
            className="grid grid-cols-1 gap-5 xl:grid-cols-[1.1fr_0.9fr]"
          >
            <motion.div variants={staggerItem} className="flex flex-col gap-5">
              {notifications.length > 0 && (
                <Card className="border-cyan-500/20 bg-cyan-500/5">
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-100">
                        <Bell size={15} />
                        Student Notifications
                      </div>
                      <MiniCheck label={`${notifications.length} new`} ok compact />
                    </div>
                    {notifications.slice(0, 3).map((notification) => (
                      <NotificationRow
                        key={notification.id}
                        notification={notification}
                        onOpen={() => {
                          markNotificationRead(notification);
                          if (notification.payload.accessCode) {
                            setAccessCode(String(notification.payload.accessCode));
                            setShowCodeModal(true);
                          }
                        }}
                      />
                    ))}
                  </div>
                </Card>
              )}
              <Card className="min-h-[304px]">
                <div className="flex h-full flex-col justify-between gap-6">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
                        <BookOpenCheck size={15} className="text-cyan-400" />
                        Active Assessment
                      </div>
                      <h3 className="mt-4 max-w-3xl text-2xl font-semibold tracking-tight text-zinc-50">
                        {exam.title}
                      </h3>
                    </div>
                    <ExamStatusPill status={exam.status} />
                  </div>

                  <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                    <Metric icon={Clock3} label="Duration" value={`${exam.durationMinutes}m`} />
                    <Metric icon={BadgeCheck} label="Questions" value={`${exam.questions.length}`} />
                    <Metric icon={TimerReset} label="Mode" value={exam.lockAnswers ? "Locked" : "Open"} />
                    <Metric icon={UserCheck} label="Identity" value="Required" />
                  </div>

                  <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface-base p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-zinc-200">Identity gate</p>
                        <p className="mt-1 text-xs text-zinc-500">
                          Face verification opens after all readiness checks pass.
                        </p>
                      </div>
                      <Button
                        disabled={!canStartIdentity || checking}
                        onClick={() => navigate("/face-verification")}
                        className="h-10 shrink-0 px-4"
                      >
                        <Play size={16} /> Start
                      </Button>
                    </div>
                    {!canStartIdentity && (
                      <div className="flex items-center gap-2 rounded-md border border-warning/20 bg-warning/10 px-3 py-2 text-xs font-medium text-warning">
                        <AlertTriangle size={14} />
                        Load an exam and complete camera, microphone, and system checks first.
                      </div>
                    )}
                  </div>
                </div>
              </Card>

              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                <DevicePanel
                  icon={Camera}
                  title="Camera"
                  ready={cameraReady}
                  value={selectedCameraLabel}
                  emptyText="No cameras detected"
                >
                  {devices.length > 0 && (
                    <select
                      value={selectedDeviceId}
                      onChange={(event) => changeCamera(event.target.value)}
                      disabled={isLocked}
                      className="h-10 w-full rounded-md border border-border bg-surface-base px-3 text-sm text-zinc-200 outline-none transition-colors focus:border-accent disabled:opacity-50"
                    >
                      {devices.map((device, index) => (
                        <option key={device.deviceId} value={device.deviceId}>
                          {device.label || `Camera ${index + 1}`}
                        </option>
                      ))}
                    </select>
                  )}
                </DevicePanel>

                <DevicePanel
                  icon={Mic}
                  title="Microphone"
                  ready={micReady}
                  value={selectedMicLabel}
                  emptyText="No microphones detected"
                >
                  {audioDevices.length > 0 && (
                    <div className="flex flex-col gap-2">
                      <select
                        value={selectedMicId ?? ""}
                        onChange={(event) => selectMic(event.target.value)}
                        className="h-10 w-full rounded-md border border-border bg-surface-base px-3 text-sm text-zinc-200 outline-none transition-colors focus:border-accent"
                      >
                        {audioDevices.map((device, index) => (
                          <option key={device.deviceId} value={device.deviceId}>
                            {device.label || `Microphone ${index + 1}`}
                          </option>
                        ))}
                      </select>
                      <Button
                        variant="secondary"
                        onClick={startCalibration}
                        disabled={calibrationState === "calibrating" || !selectedMicId}
                        className="h-9 text-xs"
                      >
                        <Gauge size={14} />
                        {calibrationState === "calibrating"
                          ? `Calibrating ${calibrationProgress}%`
                          : calibrationState === "calibrated"
                            ? "Recalibrate"
                            : "Calibrate Noise"}
                      </Button>
                    </div>
                  )}
                </DevicePanel>
              </div>
            </motion.div>

            <motion.div variants={staggerItem} className="flex flex-col gap-5">
              <Card className="min-h-[304px]">
                <div className="flex h-full flex-col gap-5">
                  <div className="flex items-center justify-between border-b border-border pb-4">
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
                      <Cpu size={15} className="text-accent" />
                      System Diagnostics
                    </div>
                    <Button
                      variant="ghost"
                      onClick={runDiagnostics}
                      disabled={checking}
                      className="h-8 w-8 p-0"
                      title="Rerun diagnostics"
                    >
                      <RefreshCw size={15} className={checking ? "animate-spin" : ""} />
                    </Button>
                  </div>

                  <div className="flex flex-col gap-3">
                    <DiagnosticRow icon={Server} check={latencyCheck} />
                    <DiagnosticRow icon={Activity} check={hardwareCheck} />
                  </div>

                  <div className="mt-auto rounded-lg border border-border bg-surface-base p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-zinc-200">Secure session profile</p>
                        <p className="mt-1 max-w-md text-xs text-zinc-500">
                          {user?.identifier || "unknown"} | {serverUrl.replace(/^https?:\/\//, "")}
                        </p>
                      </div>
                      <StatusPill
                        icon={ShieldCheck}
                        label={canStartIdentity ? "Ready" : "Pending"}
                        tone={canStartIdentity ? "success" : "warning"}
                      />
                    </div>
                  </div>
                </div>
              </Card>

              <Card className="border-cyan-500/20 bg-cyan-500/5">
                <div className="flex items-start gap-4">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-cyan-400/25 bg-cyan-400/10 text-cyan-300">
                    <ShieldCheck size={20} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-cyan-100">Exam desk locked to this profile</p>
                    <p className="mt-1 text-xs leading-5 text-cyan-100/65">
                      {exam.title} is assigned to {user?.name || "this student"}.
                    </p>
                  </div>
                </div>
              </Card>
            </motion.div>
          </motion.section>
        ) : (
          <EmptyExamState
            notifications={notifications}
            onNotificationOpen={(notification) => {
              markNotificationRead(notification);
              if (notification.payload.accessCode) {
                setAccessCode(String(notification.payload.accessCode));
                setShowCodeModal(true);
              }
            }}
            onSync={() => {
              fetchExamData();
              refreshNotifications(false);
            }}
            onEnterCode={() => setShowCodeModal(true)}
            checking={checking}
            latencyCheck={latencyCheck}
            hardwareCheck={hardwareCheck}
            runDiagnostics={runDiagnostics}
          />
        )}
      </div>

      <Dialog
        open={showCodeModal}
        onClose={() => setShowCodeModal(false)}
        title="Enter Exam Access Code"
        description="Verify enrollment using the exam code from your supervisor."
      >
        <form onSubmit={handleVerifyAccessCode} className="mt-1 flex flex-col gap-4">
          <Input
            placeholder="EXAM-CODE-101"
            value={accessCode}
            onChange={(event) => setAccessCode(event.target.value)}
            disabled={verifyingCode}
            className="text-center font-mono text-sm uppercase tracking-[0.2em]"
          />
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" className="text-xs" variant="secondary" onClick={() => setShowCodeModal(false)} disabled={verifyingCode}>
              Cancel
            </Button>
            <Button type="submit" className="text-xs" isLoading={verifyingCode}>
              Verify Code
            </Button>
          </div>
        </form>
      </Dialog>
    </motion.div>
  );
}

function EmptyExamState({
  notifications,
  onNotificationOpen,
  onSync,
  onEnterCode,
  checking,
  latencyCheck,
  hardwareCheck,
  runDiagnostics,
}: {
  notifications: StudentNotification[];
  onNotificationOpen: (notification: StudentNotification) => void;
  onSync: () => void;
  onEnterCode: () => void;
  checking: boolean;
  latencyCheck: CheckState;
  hardwareCheck: CheckState;
  runDiagnostics: () => void;
}) {
  return (
    <section className="grid grid-cols-1 gap-5 lg:grid-cols-[0.9fr_1.1fr]">
      <Card className="min-h-[300px]">
        <div className="flex h-full flex-col items-center justify-center gap-5 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-lg border border-accent/25 bg-accent/10 text-accent">
            <KeyRound size={28} />
          </div>
          <div>
            <h3 className="text-xl font-semibold tracking-tight text-zinc-50">No Active Assessment</h3>
            <p className="mt-2 max-w-md text-sm leading-6 text-zinc-500">
              Sync your roster or enter an access code to load the assigned exam.
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-3">
            <Button variant="secondary" onClick={onSync}>
              <RefreshCw size={16} /> Sync Roster
            </Button>
            <Button onClick={onEnterCode}>
              <KeyRound size={16} /> Enter Access Code
            </Button>
          </div>
        </div>
      </Card>

      <Card className="min-h-[300px]">
        <div className="flex h-full flex-col gap-5">
          <div className="flex items-center justify-between border-b border-border pb-4">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
              <Cpu size={15} className="text-accent" />
              System Diagnostics
            </div>
            <Button variant="ghost" onClick={runDiagnostics} disabled={checking} className="h-8 w-8 p-0" title="Rerun diagnostics">
              <RefreshCw size={15} className={checking ? "animate-spin" : ""} />
            </Button>
          </div>
          <DiagnosticRow icon={Server} check={latencyCheck} />
          <DiagnosticRow icon={Activity} check={hardwareCheck} />
          {notifications.length > 0 && (
            <div className="mt-auto flex flex-col gap-2 border-t border-border pt-4">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-100">
                <Bell size={15} />
                New Exam Alerts
              </div>
              {notifications.slice(0, 3).map((notification) => (
                <NotificationRow
                  key={notification.id}
                  notification={notification}
                  onOpen={() => onNotificationOpen(notification)}
                />
              ))}
            </div>
          )}
        </div>
      </Card>
    </section>
  );
}

function NotificationRow({
  notification,
  onOpen,
}: {
  notification: StudentNotification;
  onOpen: () => void;
}) {
  const title = notification.payload.title || "Exam update";
  const message = notification.payload.message || "Your teacher updated an exam.";

  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex min-h-[64px] w-full items-center justify-between gap-3 rounded-md border border-cyan-500/15 bg-surface-base px-3 py-2 text-left transition-colors hover:border-cyan-400/35 hover:bg-cyan-400/5"
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-zinc-100">{title}</p>
        <p className="mt-1 text-xs leading-5 text-zinc-500">{message}</p>
      </div>
      <span className="shrink-0 rounded-md border border-cyan-400/20 bg-cyan-400/10 px-2 py-1 text-[10px] font-semibold uppercase text-cyan-100">
        {notification.type.replace("EXAM_", "")}
      </span>
    </button>
  );
}

function Metric({ icon: Icon, label, value }: { icon: typeof Clock3; label: string; value: string }) {
  return (
    <div className="flex min-h-[82px] flex-col justify-between rounded-lg border border-border bg-surface-base p-4">
      <Icon size={17} className="text-zinc-500" />
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">{label}</p>
        <p className="mt-1 truncate text-lg font-semibold text-zinc-100">{value}</p>
      </div>
    </div>
  );
}

function ExamStatusPill({ status }: { status: Exam["status"] }) {
  const live = status === "LIVE";
  const styles = live
    ? "border-success/20 bg-success/10 text-green-200"
    : status === "SCHEDULED"
      ? "border-cyan-400/20 bg-cyan-400/10 text-cyan-200"
      : status === "ENDED" || status === "ARCHIVED"
        ? "border-zinc-700 bg-zinc-800 text-zinc-400"
        : "border-warning/20 bg-warning/10 text-yellow-200";

  return (
    <span className={`inline-flex h-7 items-center gap-2 rounded-md border px-3 text-xs font-semibold uppercase ${styles}`}>
      {live && <span className="h-1.5 w-1.5 rounded-full bg-success" />}
      {status.replace("_", " ")}
    </span>
  );
}

function DiagnosticRow({ icon: Icon, check }: { icon: typeof Server; check: CheckState }) {
  const stateIcon = check.passed === true ? (
    <CheckCircle2 size={17} className="text-success" />
  ) : check.passed === false ? (
    <AlertTriangle size={17} className="text-danger" />
  ) : (
    <div className="h-[17px] w-[17px] animate-spin rounded-full border-2 border-zinc-500 border-t-transparent" />
  );

  return (
    <div className="flex min-h-[76px] items-center justify-between gap-4 rounded-lg border border-border bg-surface-base px-4 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border bg-surface-raised text-zinc-400">
          <Icon size={18} />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-zinc-200">{check.label}</p>
          <p className="mt-1 truncate font-mono text-xs text-zinc-500">{check.value}</p>
        </div>
      </div>
      <div className="shrink-0">{stateIcon}</div>
    </div>
  );
}

function DevicePanel({
  icon: Icon,
  title,
  ready,
  value,
  emptyText,
  children,
}: {
  icon: typeof Camera;
  title: string;
  ready: boolean;
  value: string;
  emptyText: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="min-h-[192px]">
      <div className="flex h-full flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md border border-border bg-surface-base text-zinc-400">
              <Icon size={18} />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-zinc-200">{title}</p>
              <p className="mt-1 truncate text-xs text-zinc-500">{ready ? value : emptyText}</p>
            </div>
          </div>
          <MiniCheck label={ready ? "Ready" : "Missing"} ok={ready} compact />
        </div>
        <div className="mt-auto">{children}</div>
      </div>
    </Card>
  );
}

function StatusPill({
  icon: Icon,
  label,
  tone,
}: {
  icon: typeof ShieldCheck;
  label: string;
  tone: "accent" | "neutral" | "success" | "warning" | "danger";
}) {
  const tones = {
    accent: "border-accent/25 bg-accent/10 text-violet-200",
    neutral: "border-border bg-surface-raised text-zinc-300",
    success: "border-success/25 bg-success/10 text-green-200",
    warning: "border-warning/25 bg-warning/10 text-yellow-200",
    danger: "border-danger/25 bg-danger/10 text-red-200",
  };

  return (
    <span className={`inline-flex h-8 max-w-full items-center gap-2 rounded-md border px-3 text-xs font-semibold ${tones[tone]}`}>
      <Icon size={14} className="shrink-0" />
      <span className="truncate">{label}</span>
    </span>
  );
}

function MiniCheck({ label, ok, compact = false }: { label: string; ok: boolean; compact?: boolean }) {
  return (
    <div
      className={`flex items-center justify-between rounded-md border px-3 ${
        compact ? "h-8 gap-2" : "h-10"
      } ${ok ? "border-success/20 bg-success/10 text-green-200" : "border-border bg-surface-base text-zinc-500"}`}
    >
      <span className={`${compact ? "text-[11px]" : "text-xs"} font-semibold uppercase tracking-[0.12em]`}>{label}</span>
      {ok ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
    </div>
  );
}

function ReadinessRing({ percent, tone }: { percent: number; tone: ReadinessTone }) {
  const color = tone === "ready" ? "#22c55e" : tone === "blocked" ? "#ef4444" : "#eab308";
  const radius = 34;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percent / 100) * circumference;

  return (
    <svg className="h-24 w-24" viewBox="0 0 88 88" role="img" aria-label={`Readiness ${percent}%`}>
      <circle cx="44" cy="44" r={radius} fill="none" stroke="#27272a" strokeWidth="8" />
      <circle
        cx="44"
        cy="44"
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth="8"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        transform="rotate(-90 44 44)"
      />
      <text x="44" y="49" textAnchor="middle" className="fill-zinc-100 text-base font-semibold">
        {percent}
      </text>
    </svg>
  );
}
