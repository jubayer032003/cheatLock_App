import React, { createContext, useContext, useState, useEffect, useRef } from "react";
import { CameraManager } from "../services/CameraManager";
import { FramePipeline } from "../services/FramePipeline";
import { invoke } from "../utils/tauri";
import { useToast } from "../hooks/useToast";

export type CameraHealthStatus = "idle" | "streaming" | "stalled" | "error" | "disconnected";

interface CameraContextType {
  devices: MediaDeviceInfo[];
  selectedDeviceId: string;
  stream: MediaStream | null;
  pipeline: FramePipeline;
  fps: number;
  resolution: string;
  healthStatus: CameraHealthStatus;
  isLocked: boolean;
  startCamera: (videoEl: HTMLVideoElement, lockBeforeStart?: boolean) => Promise<void>;
  stopCamera: () => Promise<void>;
  changeCamera: (deviceId: string) => Promise<void>;
  lockCamera: () => Promise<void>;
}

const CameraContext = createContext<CameraContextType | undefined>(undefined);

export function CameraProvider({ children }: { children: React.ReactNode }) {
  const { showToast } = useToast();
  
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("");
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isLocked, setIsLocked] = useState(false);
  const [fps, setFps] = useState(0);
  const [resolution, setResolution] = useState("0x0");
  const [healthStatus, setHealthStatus] = useState<CameraHealthStatus>("idle");

  const pipelineRef = useRef<FramePipeline>(new FramePipeline());
  const activeVideoElRef = useRef<HTMLVideoElement | null>(null);

  // 1. Enumerate available webcams on mount
  useEffect(() => {
    async function loadDevices() {
      const cameraDevices = await CameraManager.enumerateWebcams();
      setDevices(cameraDevices);
      if (cameraDevices.length > 0) {
        // Recover locked camera from Rust backend, or use first device
        try {
          const lockedId = await invoke<string | null>("get_locked_camera");
          if (lockedId) {
            setSelectedDeviceId(lockedId);
            setIsLocked(true);
          } else {
            setSelectedDeviceId(cameraDevices[0].deviceId);
          }
        } catch {
          setSelectedDeviceId(cameraDevices[0].deviceId);
        }
      }
    }
    loadDevices();

    // Listen for device change events
    const handleDeviceChange = async () => {
      const cameraDevices = await CameraManager.enumerateWebcams();
      setDevices(cameraDevices);
      
      // If active stream device gets unplugged
      if (stream) {
        const activeTrack = stream.getVideoTracks()[0];
        const label = activeTrack?.label;
        const exists = cameraDevices.some((d) => d.label === label);
        if (!exists) {
          setHealthStatus("disconnected");
          showToast("Active camera disconnected!", "error");
          stopCamera();
        }
      }
    };

    navigator.mediaDevices.addEventListener("devicechange", handleDeviceChange);
    return () => {
      navigator.mediaDevices.removeEventListener("devicechange", handleDeviceChange);
    };
  }, [stream]);

  // 2. Performance metrics & health diagnostics tracker loop
  useEffect(() => {
    if (healthStatus !== "streaming") return;

    const intervalId = window.setInterval(() => {
      const pipeline = pipelineRef.current;
      setFps(pipeline.getFps());
      const res = pipeline.getResolution();
      setResolution(`${res.width}x${res.height}`);

      // Health Diagnostics: Stall warning (if last capture is older than 2s)
      const lastCap = pipeline.getLastCaptureTime();
      if (lastCap && Date.now() - lastCap > 2000) {
        setHealthStatus("stalled");
        showToast("Webcam stream stalled. Reconnecting...", "warning");
        // Attempt auto-recovery
        if (activeVideoElRef.current) {
          startCamera(activeVideoElRef.current);
        }
      }
    }, 1000);

    return () => clearInterval(intervalId);
  }, [healthStatus]);

  const startCamera = async (videoEl: HTMLVideoElement, lockBeforeStart = false) => {
    activeVideoElRef.current = videoEl;
    
    // Check if camera device is locked
    let targetDeviceId = selectedDeviceId;
    try {
      const lockedId = await invoke<string | null>("get_locked_camera");
      if (lockedId) {
        targetDeviceId = lockedId;
        setIsLocked(true);
      }
    } catch {}

    try {
      // Release current tracks
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }

      const activeStream = await CameraManager.getStream(targetDeviceId);
      setStream(activeStream);
      videoEl.srcObject = activeStream;
      
      // Play video with audio explicitly disabled
      videoEl.muted = true;
      await videoEl.play().catch(() => {});

      pipelineRef.current.stop();
      pipelineRef.current.start(videoEl);
      setHealthStatus("streaming");

      if (lockBeforeStart) {
        await lockCamera();
      }
    } catch (err: any) {
      setHealthStatus("error");
      showToast(`Camera start failed: ${err.message}`, "error");
    }
  };

  const stopCamera = async () => {
    pipelineRef.current.stop();
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
    }
    if (activeVideoElRef.current) {
      activeVideoElRef.current.srcObject = null;
    }
    setHealthStatus("idle");
    setFps(0);
    setResolution("0x0");
    activeVideoElRef.current = null;
  };

  const changeCamera = async (deviceId: string) => {
    if (isLocked) {
      showToast("Cannot change camera after the exam starts.", "error");
      return;
    }
    setSelectedDeviceId(deviceId);
    if (activeVideoElRef.current) {
      await startCamera(activeVideoElRef.current);
    }
  };

  const lockCamera = async () => {
    if (!selectedDeviceId) return;
    try {
      await invoke("lock_camera_device", { deviceId: selectedDeviceId });
      setIsLocked(true);
      showToast("Camera configuration locked for session.", "success", 1500);
    } catch (err) {
      console.warn("[CameraContext] Kiosk device lock failed:", err);
    }
  };

  return (
    <CameraContext.Provider
      value={{
        devices,
        selectedDeviceId,
        stream,
        pipeline: pipelineRef.current,
        fps,
        resolution,
        healthStatus,
        isLocked,
        startCamera,
        stopCamera,
        changeCamera,
        lockCamera,
      }}
    >
      {children}
    </CameraContext.Provider>
  );
}

export function useCamera() {
  const context = useContext(CameraContext);
  if (!context) {
    throw new Error("useCamera must be used inside a CameraProvider");
  }
  return context;
}
