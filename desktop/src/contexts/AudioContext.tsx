import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "./AuthContext";
import { useToast } from "../hooks/useToast";
import { AudioManager, AudioDevice, AudioHealthStatus } from "../services/AudioManager";
import { NoiseCalibrator } from "../services/NoiseCalibrator";
import { VADEngine } from "../services/VADEngine";
import { ViolationManager, VoiceViolationEvent } from "../services/ViolationManager";
import { useSuspicion } from "./SuspicionContext";

type CalibrationState = "idle" | "calibrating" | "calibrated" | "failed";

interface AudioContextType {
  devices: AudioDevice[];
  selectedDeviceId: string | null;
  selectDevice: (deviceId: string) => void;
  calibrationState: CalibrationState;
  calibrationProgress: number; // 0-100
  startCalibration: () => Promise<void>;
  startMonitoring: (examId: string) => void;
  stopMonitoring: () => void;
  speechProbability: number;
  audioHealth: AudioHealthStatus;
  isSpeechDetected: boolean;
}

const AudioCtx = createContext<AudioContextType | undefined>(undefined);

// Singleton instances (survive re-renders, no GC churn)
const audioManager = new AudioManager();
const vadEngine = new VADEngine(audioManager);
const violationManager = new ViolationManager();

export function AudioProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const { reportViolationEvent } = useSuspicion();

  const [devices, setDevices] = useState<AudioDevice[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [calibrationState, setCalibrationState] = useState<CalibrationState>("idle");
  const [calibrationProgress, setCalibrationProgress] = useState(0);
  const [speechProbability, setSpeechProbability] = useState(0);
  const [audioHealth, setAudioHealth] = useState<AudioHealthStatus>("idle");
  const [isSpeechDetected, setIsSpeechDetected] = useState(false);

  const examIdRef = useRef<string | null>(null);
  const monitoringIntervalRef = useRef<number | null>(null);
  const healthCheckRef = useRef<number | null>(null);
  const lastHealthRef = useRef<AudioHealthStatus>("idle");

  // Enumerate devices on mount
  useEffect(() => {
    async function init() {
      const granted = await audioManager.requestPermission();
      if (granted) {
        const devs = await audioManager.enumerateDevices();
        setDevices(devs);
        if (devs.length > 0 && !selectedDeviceId) {
          setSelectedDeviceId(devs[0].deviceId);
        }
      }
    }
    init();

    // Listen for device changes (plugging/unplugging mics)
    const handleDeviceChange = async () => {
      const devs = await audioManager.enumerateDevices();
      setDevices(devs);
    };
    navigator.mediaDevices.addEventListener("devicechange", handleDeviceChange);

    return () => {
      navigator.mediaDevices.removeEventListener("devicechange", handleDeviceChange);
      audioManager.stopCapture();
    };
  }, []);

  const selectDevice = useCallback((deviceId: string) => {
    if (audioManager.isDeviceLocked()) return; // Can't switch during exam
    setSelectedDeviceId(deviceId);
  }, []);

  const startCalibration = useCallback(async () => {
    if (!selectedDeviceId) {
      showToast("No microphone selected.", "warning");
      return;
    }

    setCalibrationState("calibrating");
    setCalibrationProgress(0);

    const started = await audioManager.startCapture(selectedDeviceId);
    if (!started) {
      setCalibrationState("failed");
      showToast("Failed to access microphone for calibration.", "error");
      return;
    }

    try {
      const profile = await NoiseCalibrator.calibrate(audioManager, (elapsed, total) => {
        setCalibrationProgress(Math.round((elapsed / total) * 100));
      });

      vadEngine.setCalibration(profile);
      setCalibrationState("calibrated");
      setCalibrationProgress(100);
      showToast("Microphone calibrated successfully.", "success");
    } catch {
      setCalibrationState("failed");
      showToast("Calibration failed. Please try again.", "error");
    }
  }, [selectedDeviceId, showToast]);

  const handleViolation = useCallback(
    async (event: VoiceViolationEvent) => {
      const examId = examIdRef.current;
      if (!examId || !user) return;

      setIsSpeechDetected(event.type === "VOICE_DETECTED" || event.type === "CONTINUOUS_SPEECH");

      // Report to centralized suspicion score engine
      reportViolationEvent(event.type, "Audio", 1.0, event.message);
    },
    [user, reportViolationEvent]
  );

  const startMonitoring = useCallback(
    (examId: string) => {
      examIdRef.current = examId;

      // Lock selected device
      if (selectedDeviceId) {
        audioManager.lockDevice(selectedDeviceId);
      }

      // Ensure capture is running
      if (audioManager.getHealthStatus() === "idle") {
        audioManager.startCapture(selectedDeviceId ?? undefined);
      }

      // Auto-calibrate if not already done
      if (calibrationState !== "calibrated") {
        NoiseCalibrator.calibrate(audioManager, () => {}).then((profile) => {
          vadEngine.setCalibration(profile);
          setCalibrationState("calibrated");
        });
      }

      // Register violation listener
      violationManager.reset();
      violationManager.registerListener(handleViolation);

      // VAD evaluation loop — runs every 100ms (10 Hz)
      monitoringIntervalRef.current = window.setInterval(() => {
        const prob = vadEngine.evaluate();
        setSpeechProbability(prob);
      }, 100);

      // Health + violation tick loop — runs every 1 second
      healthCheckRef.current = window.setInterval(() => {
        const health = audioManager.getHealthStatus();
        setAudioHealth(health);

        // Emit health violations on transitions
        if (health === "disconnected" && lastHealthRef.current !== "disconnected") {
          violationManager.emitHealthViolation("MIC_DISCONNECTED");
          showToast("Microphone disconnected during exam.", "error");
        }
        if (health === "muted" && lastHealthRef.current !== "muted") {
          violationManager.emitHealthViolation("MIC_MUTED");
          showToast("Microphone muted during exam.", "warning");
        }
        lastHealthRef.current = health;

        // Feed speech probability to violation manager for consecutive-second tracking
        violationManager.tick(speechProbability);
      }, 1000);
    },
    [selectedDeviceId, calibrationState, handleViolation, showToast, speechProbability]
  );

  const stopMonitoring = useCallback(() => {
    examIdRef.current = null;

    if (monitoringIntervalRef.current) {
      clearInterval(monitoringIntervalRef.current);
      monitoringIntervalRef.current = null;
    }
    if (healthCheckRef.current) {
      clearInterval(healthCheckRef.current);
      healthCheckRef.current = null;
    }

    violationManager.reset();
    vadEngine.reset();
    audioManager.unlockDevice();
    audioManager.stopCapture();

    setSpeechProbability(0);
    setAudioHealth("idle");
    setIsSpeechDetected(false);
    lastHealthRef.current = "idle";
  }, []);

  return (
    <AudioCtx.Provider
      value={{
        devices,
        selectedDeviceId,
        selectDevice,
        calibrationState,
        calibrationProgress,
        startCalibration,
        startMonitoring,
        stopMonitoring,
        speechProbability,
        audioHealth,
        isSpeechDetected,
      }}
    >
      {children}
    </AudioCtx.Provider>
  );
}

export function useAudio() {
  const context = useContext(AudioCtx);
  if (!context) {
    throw new Error("useAudio must be used inside an AudioProvider");
  }
  return context;
}
