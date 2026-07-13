import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "../components/Card";
import { Button } from "../components/Button";
import { Loader } from "../components/Loader";
import { CameraPreview } from "../components/CameraPreview";
import { useCamera } from "../contexts/CameraContext";
import { useFace } from "../contexts/FaceContext";
import { useLiveness } from "../contexts/LivenessContext";
import { FaceDetector } from "../services/FaceDetector";
import { EmbeddingGenerator } from "../services/EmbeddingGenerator";
import { apiClient } from "../api/client";
import { ShieldAlert, UserCheck } from "lucide-react";
import { motion } from "framer-motion";
import { pageVariants } from "../motion/variants";

export function FaceVerificationPage() {
  const navigate = useNavigate();
  const { pipeline } = useCamera();
  const { setRegisteredFaceProfile } = useFace();
  const { triggerLivenessCheck } = useLiveness();

  const [step, setStep] = useState<"READY" | "SCANNING" | "VERIFYING" | "SUCCESS" | "FAILED">("READY");
  const [scanStatus, setScanStatus] = useState("Face camera idle...");
  const scanTimer = useRef<number | null>(null);

  const startVerification = async () => {
    setStep("SCANNING");
    setScanStatus("Initiating presence check (liveness)...");

    const passed = await triggerLivenessCheck();
    if (!passed) {
      setStep("FAILED");
      setScanStatus("Identity verification failed: presence check failed.");
      return;
    }

    setStep("SCANNING");
    setScanStatus("Detecting facial boundary landmarks...");

    // Stage 1: Face Capture & Alignment
    scanTimer.current = window.setTimeout(async () => {
      setScanStatus("Extracting unit normalized descriptor (192-dim)...");
      
      // Async helper to poll for a frame, retrying up to 15 times with 200ms delay (3 seconds total)
      const getFrameWithRetry = async (retries = 15, delay = 200) => {
        for (let i = 0; i < retries; i++) {
          const f = pipeline.getLatestFrame();
          if (f && f.width > 0 && f.height > 0) {
            return f;
          }
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
        return null;
      };

      const frame = await getFrameWithRetry();
      if (!frame) {
        setStep("FAILED");
        setScanStatus("Webcam frame not available. Ensure camera is active.");
        return;
      }

      // Draw frame to canvas for detector
      const canvas = document.createElement("canvas");
      canvas.width = frame.width;
      canvas.height = frame.height;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) {
        setStep("FAILED");
        setScanStatus("Canvas rendering context creation failed.");
        return;
      }
      ctx.putImageData(frame.data, 0, 0);

      // Run detection in background Web Worker
      const detections = await FaceDetector.detectAsync(frame.data);
      if (detections.length === 0) {
        setStep("FAILED");
        setScanStatus("No face detected. Align your face inside the webcam frame.");
        return;
      }
      if (detections.length > 1) {
        setStep("FAILED");
        setScanStatus("Multiple faces detected. Ensure only one person is in view.");
        return;
      }

      const primary = detections[0];

      // Stage 2: Feature Extraction & Verification
      scanTimer.current = window.setTimeout(async () => {
        setStep("VERIFYING");
        setScanStatus("Verifying credentials against registration model...");

        try {
          const descriptor = EmbeddingGenerator.generate(ctx, primary);
          if (descriptor.length === 0) {
            throw new Error("Failed to extract face alignment embeddings.");
          }

          // Post to backend verification endpoint
          const { data } = await apiClient.post<{ ok: boolean; distance: number }>("/auth/face-profile/verify", {
            descriptor,
          });

          if (data.ok) {
            setStep("SUCCESS");
            setScanStatus("Identity verified successfully.");
            
            // Cache verified descriptor locally for continuous exam proctoring
            setRegisteredFaceProfile(descriptor);

            setTimeout(() => {
              navigate("/exam");
            }, 2000);
          } else {
            throw new Error(`Biometric distance threshold exceeded (distance: ${data.distance.toFixed(3)}).`);
          }
        } catch (err: any) {
          setStep("FAILED");
          setScanStatus(err.response?.data?.message || err.message || "Facial comparison failed.");
        }
      }, 1500);
    }, 1500);
  };

  useEffect(() => {
    return () => {
      if (scanTimer.current) clearTimeout(scanTimer.current);
    };
  }, []);

  return (
    <motion.div
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      className="h-full w-full p-6 flex flex-col items-center justify-center relative bg-surface-base"
    >
      <div className="w-full max-w-md flex flex-col gap-5 select-none">
        <div className="text-center flex flex-col gap-1">
          <h2 className="text-lg font-semibold text-zinc-50 font-sans">
            Identity Verification
          </h2>
          <p className="text-sm text-zinc-500">
            Verify biometric profile against registration records
          </p>
        </div>

        <Card className="flex flex-col gap-5 items-center p-6 bg-surface-raised border border-border rounded-xl">
          
          {/* Webcam Feed Box */}
          <div className="w-full aspect-[4/3] rounded-lg bg-surface-base border border-border overflow-hidden relative flex items-center justify-center">
            <CameraPreview className="w-full h-full border-none" />
            
            {step === "SCANNING" && (
              <div className="absolute inset-0 border border-accent/20 rounded-lg pointer-events-none overflow-hidden">
                {/* Horizontal scanner beam animation */}
                <div className="w-full h-0.5 bg-accent/40 absolute top-0 animate-scan-beam" />
                <style>{`
                  @keyframes scan-beam {
                    0% { top: 0%; }
                    50% { top: 100%; }
                    100% { top: 0%; }
                  }
                  .animate-scan-beam {
                    animation: scan-beam 2.5s ease-in-out infinite;
                  }
                `}</style>
              </div>
            )}

            {step === "READY" && (
              <div className="absolute inset-0 bg-surface-base/80 flex flex-col items-center justify-center text-center p-4">
                <div className="h-10 w-10 rounded-full bg-surface-overlay border border-border flex items-center justify-center text-zinc-400">
                  <UserCheck size={18} />
                </div>
                <p className="text-xs text-zinc-500 mt-2">Camera stream is active</p>
              </div>
            )}

            {(step === "SCANNING" || step === "VERIFYING") && (
              <div className="absolute inset-0 bg-surface-base/40 flex flex-col items-center justify-center">
                <Loader size="md" />
              </div>
            )}

            {step === "SUCCESS" && (
              <div className="absolute inset-0 bg-success/10 flex flex-col items-center justify-center text-success gap-2">
                <div className="h-12 w-12 rounded-full bg-success/10 flex items-center justify-center border border-success/35">
                  <UserCheck size={24} />
                </div>
                <span className="text-xs font-semibold uppercase tracking-wider">Identity Cleared</span>
              </div>
            )}

            {step === "FAILED" && (
              <div className="absolute inset-0 bg-danger/10 flex flex-col items-center justify-center text-danger gap-2">
                <div className="h-12 w-12 rounded-full bg-danger/10 flex items-center justify-center border border-danger/35">
                  <ShieldAlert size={24} />
                </div>
                <span className="text-xs font-semibold uppercase tracking-wider">Verification Mismatch</span>
              </div>
            )}
          </div>

          {/* Diagnostic Status Ticker */}
          <div className="w-full text-center">
            <span className="text-xs font-mono text-zinc-400 tracking-wide block truncate">
              {scanStatus}
            </span>
          </div>

          {/* Action controls */}
          <div className="w-full flex gap-3 border-t border-border pt-4">
            {step === "READY" && (
              <Button className="w-full" onClick={startVerification}>
                Start Biometric Scan
              </Button>
            )}

            {step === "FAILED" && (
              <>
                <Button className="flex-1" onClick={startVerification}>
                  Retry Verification
                </Button>
                <Button className="flex-1" variant="secondary" onClick={() => navigate("/dashboard")}>
                  Dashboard
                </Button>
              </>
            )}

            {step === "SUCCESS" && (
              <Button className="w-full bg-success hover:bg-success/90 border-success/30" onClick={() => navigate("/exam")}>
                Enter Exam Room
              </Button>
            )}

            {(step === "SCANNING" || step === "VERIFYING") && (
              <Button className="w-full" disabled>
                Verification in progress...
              </Button>
            )}
          </div>
        </Card>
      </div>
    </motion.div>
  );
}
