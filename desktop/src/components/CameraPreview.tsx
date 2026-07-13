import { useEffect, useRef } from "react";
import { useCamera } from "../contexts/CameraContext";
import { Camera, AlertCircle, RefreshCw } from "lucide-react";
import { useFace } from "../contexts/FaceContext";
import { useObject } from "../contexts/ObjectContext";

export function CameraPreview({ className = "" }: { className?: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const { 
    startCamera, 
    stopCamera, 
    fps, 
    resolution, 
    healthStatus, 
    stream,
    pipeline
  } = useCamera();

  const { primaryFaceBox, status: faceStatus } = useFace();
  const { activeDetections, showOverlay } = useObject();

  const renderObjectBoundingBoxes = () => {
    if (!stream || healthStatus !== "streaming" || !showOverlay || activeDetections.length === 0) return null;
    
    const res = pipeline.getResolution();
    if (res.width === 0 || res.height === 0) return null;

    return activeDetections.map((det, index) => {
      // Flip X coordinate because video element uses scale-x-[-1]
      const left = (1 - (det.x + det.width) / res.width) * 100;
      const top = (det.y / res.height) * 100;
      const width = (det.width / res.width) * 100;
      const height = (det.height / res.height) * 100;

      let borderColor = "border-danger animate-pulse";
      let textColor = "text-danger bg-danger/10 border-danger/20";
      
      if (det.classLabel === "Book" || det.classLabel === "Notebook") {
        borderColor = "border-warning animate-pulse";
        textColor = "text-warning bg-warning/10 border-warning/20";
      } else if (det.classLabel === "Calculator") {
        borderColor = "border-blue-500 animate-pulse";
        textColor = "text-blue-400 bg-blue-500/10 border-blue-500/20";
      }

      return (
        <div 
          key={index}
          className={`absolute border-2 rounded transition-all duration-75 pointer-events-none z-10 flex flex-col items-start ${borderColor}`}
          style={{
            left: `${left}%`,
            top: `${top}%`,
            width: `${width}%`,
            height: `${height}%`,
          }}
        >
          <span className={`absolute -top-5 left-0 text-[8px] font-mono border rounded px-1 py-0.5 tracking-wider uppercase whitespace-nowrap ${textColor}`}>
            {det.classLabel} ({(det.confidence * 100).toFixed(0)}%)
          </span>
        </div>
      );
    });
  };

  const renderFaceBoundingBox = () => {
    if (!stream || healthStatus !== "streaming" || !primaryFaceBox) return null;
    
    const res = pipeline.getResolution();
    if (res.width === 0 || res.height === 0) return null;

    // Flip X coordinate because video element uses scale-x-[-1]
    const left = (1 - (primaryFaceBox.x + primaryFaceBox.width) / res.width) * 100;
    const top = (primaryFaceBox.y / res.height) * 100;
    const width = (primaryFaceBox.width / res.width) * 100;
    const height = (primaryFaceBox.height / res.height) * 100;

    let borderColor = "border-success";
    let textColor = "text-success bg-success/10 border-success/20";
    let label = "Identity Verified";

    if (faceStatus === "FACE_MISMATCH") {
      borderColor = "border-warning animate-pulse";
      textColor = "text-warning bg-warning/10 border-warning/20";
      label = "Verification Mismatch";
    } else if (faceStatus === "MULTIPLE_FACES") {
      borderColor = "border-danger animate-pulse";
      textColor = "text-danger bg-danger/10 border-danger/20";
      label = "Multi-face Alert";
    }

    return (
      <div 
        className={`absolute border-2 rounded transition-all duration-75 pointer-events-none z-10 flex flex-col items-start ${borderColor}`}
        style={{
          left: `${left}%`,
          top: `${top}%`,
          width: `${width}%`,
          height: `${height}%`,
        }}
      >
        <span className={`absolute -top-5 left-0 text-[8px] font-mono border rounded px-1 py-0.5 tracking-wider uppercase whitespace-nowrap ${textColor}`}>
          {label}
        </span>
      </div>
    );
  };

  useEffect(() => {
    if (videoRef.current) {
      startCamera(videoRef.current);
    }
    return () => {
      stopCamera();
    };
  }, []);

  // Format connection quality color based on health status
  const getQualityColor = () => {
    switch (healthStatus) {
      case "streaming":
        return fps >= 24 ? "bg-success" : "bg-warning";
      case "stalled":
        return "bg-warning animate-pulse";
      case "disconnected":
      case "error":
        return "bg-danger animate-ping";
      default:
        return "bg-zinc-600";
    }
  };

  return (
    <div className={`relative rounded-lg bg-surface-base border border-border overflow-hidden select-none group w-full h-full min-h-[160px] ${className}`}>
      {/* 1. Live HTML Video Element */}
      <video
        ref={videoRef}
        muted
        playsInline
        className={`w-full h-full object-cover transform scale-x-[-1] transition-opacity duration-300 ${
          healthStatus === "streaming" ? "opacity-100" : "opacity-0"
        }`}
      />

      {renderFaceBoundingBox()}
      {renderObjectBoundingBoxes()}

      {/* 2. Loading / Empty Overlay */}
      {healthStatus === "idle" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-zinc-500 gap-2 font-sans text-xs">
          <RefreshCw size={20} className="animate-spin text-accent" />
          <span className="tracking-wider text-[10px] uppercase font-semibold text-zinc-500">Initializing camera...</span>
        </div>
      )}

      {/* 3. Disconnected / Error Overlay */}
      {(healthStatus === "disconnected" || healthStatus === "error") && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-danger/5 backdrop-blur-[2px] text-danger gap-2 font-sans text-xs p-4 text-center">
          <AlertCircle size={24} className="text-danger animate-bounce" />
          <span className="font-semibold uppercase tracking-wider text-xs">Camera Stream Offline</span>
          <span className="text-[10px] text-zinc-500">Please check device connection or permissions.</span>
        </div>
      )}

      {/* 4. Telemetry Overlays */}
      {stream && healthStatus !== "disconnected" && healthStatus !== "error" && (
        <>
          {/* Top telemetry bar */}
          <div className="absolute top-2 left-2 right-2 flex justify-between items-center text-[9px] font-mono text-zinc-300 bg-surface-base/90 px-2 py-1 rounded border border-border pointer-events-none">
            <span className="flex items-center gap-1.5 uppercase font-medium">
              <span className={`h-1.5 w-1.5 rounded-full ${getQualityColor()}`} />
              {healthStatus}
            </span>
            <span className="tracking-wider uppercase text-zinc-400">
              {resolution} @ {fps} fps
            </span>
          </div>

          {/* Bottom Live ping label */}
          <span className="absolute bottom-2 left-2 text-[8px] font-mono text-zinc-500 tracking-wider uppercase flex items-center gap-1 bg-surface-base/90 px-1.5 py-0.5 rounded pointer-events-none border border-border">
            <Camera size={10} className="text-accent" />
            Live video pipeline
          </span>
        </>
      )}
    </div>
  );
}
