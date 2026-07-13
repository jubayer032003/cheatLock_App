import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "../hooks/useToast";
import { useCamera } from "../contexts/CameraContext";
import { useAudio } from "../contexts/AudioContext";
import { SessionService } from "../services/SessionService";
import { Card } from "../components/Card";
import { Button } from "../components/Button";
import { Loader } from "../components/Loader";
import { StatusBadge } from "../components/StatusBadge";
import { Input } from "../components/Input";
import { Dialog } from "../components/ui/Dialog";
import { invoke, isTauriAvailable } from "../utils/tauri";
import { CheckCircle2, AlertTriangle, Play, RefreshCw, Cpu, Activity, Key, Mic, Camera } from "lucide-react";
import { Exam } from "../types";
import { motion } from "framer-motion";
import { pageVariants, staggerContainer, staggerItem } from "../motion/variants";

interface CheckState {
  label: string;
  passed: boolean | null;
  value: string;
}

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
  
  // Access Code Modal States
  const [showCodeModal, setShowCodeModal] = useState(false);
  const [accessCode, setAccessCode] = useState("");
  const [verifyingCode, setVerifyingCode] = useState(false);

  // Diagnostic states
  const [latencyCheck, setLatencyCheck] = useState<CheckState>({
    label: "Backend Server Latency",
    passed: null,
    value: "Probing...",
  });
  const [hardwareCheck, setHardwareCheck] = useState<CheckState>({
    label: "Diagnostic Check (OS & Peripherals)",
    passed: null,
    value: "Querying...",
  });
  const [checking, setChecking] = useState(false);

  const fetchExamData = async () => {
    setLoadingExam(true);
    try {
      const assigned = await SessionService.getAssignedExam();
      setExam(assigned);
      setActiveExam(assigned);
    } catch (err: any) {
      console.warn("[Dashboard] Assigned exam fetch skipped/failed:", err.message);
    } finally {
      setLoadingExam(false);
    }
  };

  const runDiagnostics = async () => {
    setChecking(true);
    
    // 1. Check Latency
    try {
      if (isTauriAvailable()) {
        const ping = await invoke<number>("check_network_latency", { url: serverUrl });
        setLatencyCheck({
          label: "Backend Server Latency",
          passed: ping < 150,
          value: `${ping} ms (${ping < 150 ? "Excellent" : "Slow Connection"})`,
        });
      } else {
        const start = Date.now();
        await fetch(`${serverUrl}/health`).catch(() => {});
        const ping = Date.now() - start;
        setLatencyCheck({
          label: "Backend Server Latency",
          passed: ping < 500,
          value: `${ping} ms (${ping < 250 ? "Excellent" : "Slow Connection"}) [Browser Mode]`,
        });
      }
    } catch (err: any) {
      setLatencyCheck({
        label: "Backend Server Latency",
        passed: false,
        value: "Unreachable host",
      });
    }

    // 2. Check Hardware
    try {
      if (isTauriAvailable()) {
        const hw = await invoke<{ has_camera: boolean; has_microphone: boolean; os_name: string }>(
          "get_hardware_status"
        );
        const passed = hw.has_camera && hw.has_microphone;
        setHardwareCheck({
          label: "Hardware & Media Diagnostic",
          passed,
          value: `${hw.os_name.toUpperCase()} - Cam: ${hw.has_camera ? "OK" : "Error"}, Mic: ${
            hw.has_microphone ? "OK" : "Error"
          }`,
        });
      } else {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        stream.getTracks().forEach((track) => track.stop());
        setHardwareCheck({
          label: "Hardware & Media Diagnostic",
          passed: true,
          value: "Browser WebRTC - Cam: OK, Mic: OK [Browser Mode]",
        });
      }
    } catch (err) {
      setHardwareCheck({
        label: "Hardware & Media Diagnostic",
        passed: false,
        value: "Media permissions denied or unavailable",
      });
    }

    setChecking(false);
  };

  const handleVerifyAccessCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessCode.trim()) {
      showToast("Please input a valid exam access code.", "warning");
      return;
    }

    setVerifyingCode(true);
    try {
      const verifiedExam = await SessionService.getExamByCode(accessCode.trim());
      setExam(verifiedExam);
      setActiveExam(verifiedExam);
      showToast(`Successfully verified exam: "${verifiedExam.title}"`, "success");
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
  }, []);

  const allChecksPassed = latencyCheck.passed === true && hardwareCheck.passed === true;

  if (loadingExam) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-surface-base">
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
      className="h-full w-full p-6 overflow-y-auto flex flex-col gap-6 bg-surface-base"
    >
      {/* Header Info */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border pb-5 select-none">
        <div className="flex flex-col gap-1">
          <h2 className="text-xl font-semibold tracking-tight text-zinc-50 font-sans">
            Student Dashboard
          </h2>
          <p className="text-sm text-zinc-400 font-sans">
            Welcome back, <span className="text-zinc-200 font-medium">{user?.name}</span>
          </p>
        </div>
        <div className="flex gap-2.5">
          <Button variant="secondary" className="text-xs gap-1.5" onClick={() => setShowCodeModal(true)}>
            <Key size={14} /> Enter Access Code
          </Button>
        </div>
      </div>

      {exam ? (
        <motion.div
          variants={staggerContainer}
          initial="initial"
          animate="animate"
          className="grid grid-cols-1 lg:grid-cols-2 gap-5 max-w-4xl"
        >
          {/* Exam Details Card */}
          <motion.div variants={staggerItem}>
            <Card className="flex flex-col gap-4 h-full">
              <div className="flex items-center justify-between border-b border-border pb-3">
                <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider font-sans">
                  Active Assessment
                </span>
                <StatusBadge status="LIVE" />
              </div>

              <div className="flex flex-col gap-2 flex-1">
                <h3 className="text-base font-semibold text-zinc-50 tracking-tight">{exam.title}</h3>
                <p className="text-sm text-zinc-400 leading-relaxed font-sans">
                  Ensure your workspace is well-lit and quiet. All system key shortcuts are monitored.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4 bg-surface-base p-4 rounded-lg border border-border mt-2">
                <div>
                  <span className="text-zinc-500 block text-[11px] uppercase tracking-wider font-sans font-medium">Duration</span>
                  <span className="text-zinc-200 font-semibold text-base font-mono">{exam.durationMinutes}m</span>
                </div>
                <div>
                  <span className="text-zinc-500 block text-[11px] uppercase tracking-wider font-sans font-medium">Questions</span>
                  <span className="text-zinc-200 font-semibold text-base font-mono">{exam.questions.length} items</span>
                </div>
              </div>
            </Card>
          </motion.div>

          {/* Diagnostics Card */}
          <motion.div variants={staggerItem}>
            <Card className="flex flex-col gap-4">
              <div className="flex items-center justify-between border-b border-border pb-3">
                <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider font-sans flex items-center gap-1.5">
                  <Cpu size={14} className="text-accent" />
                  System Diagnostics
                </span>
                <Button
                  variant="ghost"
                  onClick={runDiagnostics}
                  disabled={checking}
                  className="p-1 rounded-md text-zinc-500 hover:text-zinc-300"
                  title="Rerun Diagnostics"
                >
                  <RefreshCw size={14} className={checking ? "animate-spin" : ""} />
                </Button>
              </div>

              <div className="flex flex-col gap-3">
                {/* Latency Item */}
                <div className="flex items-center justify-between py-2 border-b border-border">
                  <div>
                    <h4 className="text-sm font-medium text-zinc-200 font-sans">{latencyCheck.label}</h4>
                    <p className="text-xs text-zinc-500 mt-0.5 font-mono">{latencyCheck.value}</p>
                  </div>
                  {latencyCheck.passed === true ? (
                    <CheckCircle2 size={16} className="text-success shrink-0" />
                  ) : latencyCheck.passed === false ? (
                    <AlertTriangle size={16} className="text-danger shrink-0" />
                  ) : (
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-t-transparent border-zinc-500 shrink-0" />
                  )}
                </div>

                {/* Hardware Item */}
                <div className="flex items-center justify-between py-2 border-b border-border">
                  <div>
                    <h4 className="text-sm font-medium text-zinc-200 font-sans">{hardwareCheck.label}</h4>
                    <p className="text-xs text-zinc-500 mt-0.5 font-mono">{hardwareCheck.value}</p>
                  </div>
                  {hardwareCheck.passed === true ? (
                    <CheckCircle2 size={16} className="text-success shrink-0" />
                  ) : hardwareCheck.passed === false ? (
                    <AlertTriangle size={16} className="text-danger shrink-0" />
                  ) : (
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-t-transparent border-zinc-500 shrink-0" />
                  )}
                </div>

                {/* Camera Selector Dropdown */}
                <div className="flex flex-col gap-1.5 mt-1 font-sans text-xs">
                  <label className="text-zinc-500 font-semibold uppercase text-[10px] tracking-wider block flex items-center gap-1.5">
                    <Camera size={12} /> Proctoring Camera:
                  </label>
                  {devices.length === 0 ? (
                    <span className="text-zinc-500 italic text-[11px]">No cameras detected. Check permissions.</span>
                  ) : (
                    <select
                      value={selectedDeviceId}
                      onChange={(e) => changeCamera(e.target.value)}
                      disabled={isLocked}
                      className="w-full bg-surface-base text-zinc-200 border border-border rounded-md px-2.5 py-1.5 text-xs focus:outline-none focus:border-accent disabled:opacity-50 transition-colors duration-150"
                    >
                      {devices.map((device, idx) => (
                        <option key={device.deviceId} value={device.deviceId}>
                          {device.label || `Camera ${idx + 1}`}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {/* Microphone Selector Dropdown */}
                <div className="flex flex-col gap-1.5 mt-1 font-sans text-xs">
                  <label className="text-zinc-500 font-semibold uppercase text-[10px] tracking-wider block flex items-center gap-1.5">
                    <Mic size={12} /> Proctoring Microphone:
                  </label>
                  {audioDevices.length === 0 ? (
                    <span className="text-zinc-500 italic text-[11px]">No microphones detected.</span>
                  ) : (
                    <select
                      value={selectedMicId ?? ""}
                      onChange={(e) => selectMic(e.target.value)}
                      className="w-full bg-surface-base text-zinc-200 border border-border rounded-md px-2.5 py-1.5 text-xs focus:outline-none focus:border-accent transition-colors duration-150"
                    >
                      {audioDevices.map((d, idx) => (
                        <option key={d.deviceId} value={d.deviceId}>
                          {d.label || `Microphone ${idx + 1}`}
                        </option>
                      ))}
                    </select>
                  )}
                  <button
                    onClick={startCalibration}
                    disabled={calibrationState === "calibrating" || !selectedMicId}
                    className="mt-1 w-full py-1.5 px-3 rounded-md text-xs font-semibold border transition-all duration-150
                      bg-accent/10 border-accent/20 text-accent hover:bg-accent/20 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {calibrationState === "calibrating"
                      ? `Calibrating... ${calibrationProgress}%`
                      : calibrationState === "calibrated"
                        ? "✓ Recalibrate Microphone"
                        : "Calibrate Ambient Noise"}
                  </button>
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-border flex flex-col gap-3">
                {!allChecksPassed && (
                  <div className="px-3.5 py-2 bg-warning/5 border border-warning/15 text-warning rounded-md text-xs font-sans flex items-start gap-2">
                    <AlertTriangle size={15} className="shrink-0 mt-0.5" />
                    All system audits must pass prior to entering the identity checkout environment.
                  </div>
                )}

                <Button
                  disabled={!allChecksPassed || checking}
                  onClick={() => navigate("/face-verification")}
                  className="w-full flex items-center justify-center gap-2"
                >
                  <Play size={14} /> Proceed to Identity Verification
                </Button>
              </div>
            </Card>
          </motion.div>
        </motion.div>
      ) : (
        <Card className="max-w-md text-center py-10 flex flex-col items-center gap-4 mx-auto mt-10 bg-surface-raised border border-border">
          <Activity size={32} className="text-accent animate-pulse" />
          <h3 className="font-semibold text-zinc-200 tracking-tight text-base">
            No Active Assessment
          </h3>
          <p className="text-sm text-zinc-500 leading-relaxed max-w-sm px-4">
            You do not have any assigned exams. Click "Enter Access Code" to join using an alphanumeric code provided by your supervisor.
          </p>
          <div className="flex gap-3 mt-2">
            <Button variant="secondary" className="text-xs" onClick={fetchExamData}>
              <RefreshCw size={14} /> Sync Roster
            </Button>
            <Button className="text-xs gap-1.5" onClick={() => setShowCodeModal(true)}>
              <Key size={14} /> Enter Access Code
            </Button>
          </div>
        </Card>
      )}

      {/* Access Code Input Dialog */}
      <Dialog
        open={showCodeModal}
        onClose={() => setShowCodeModal(false)}
        title="Enter Exam Access Code"
        description="Verify your enrollment using the alphanumeric exam code provided by your supervisor."
      >
        <form onSubmit={handleVerifyAccessCode} className="flex flex-col gap-4 mt-1">
          <Input
            placeholder="e.g. EXAM-CODE-101"
            value={accessCode}
            onChange={(e) => setAccessCode(e.target.value)}
            disabled={verifyingCode}
            className="font-mono uppercase tracking-widest text-center text-sm"
          />
          <div className="flex gap-3 justify-end pt-2">
            <Button type="submit" className="text-xs" isLoading={verifyingCode}>
              Verify Code
            </Button>
            <Button type="button" className="text-xs" variant="secondary" onClick={() => setShowCodeModal(false)} disabled={verifyingCode}>
              Cancel
            </Button>
          </div>
        </form>
      </Dialog>
    </motion.div>
  );
}
