import { Camera, Monitor } from "lucide-react";
import { StatusBadge, statusFromScore } from "./StatusBadge";
import { ProgressMeter, cn } from "./ui";
import type { LiveStudent } from "../types";

interface FullscreenStudentProps {
  student: LiveStudent;
  detailTab: "camera" | "screen";
  setDetailTab: (tab: "camera" | "screen") => void;
}

export function FullscreenStudent({ student, detailTab, setDetailTab }: FullscreenStudentProps) {
  const status = statusFromScore(student.suspicionScore);
  const cameraSrc = student.previewUrl || student.previewBase64;
  const screenSrc = student.screenBase64;

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_340px] text-slate-202 font-sans p-2">
      <div className="flex flex-col gap-3">
        <div className="flex rounded border border-slate-800 bg-slate-950 p-0.5">
          <button 
            type="button" 
            onClick={() => setDetailTab("camera")}
            className={cn("flex-1 text-center py-1.5 text-xs font-mono rounded", detailTab === "camera" ? "bg-slate-800 text-white font-bold" : "text-slate-400 hover:text-slate-200")}
          >
            Webcam Stream
          </button>
          <button 
            type="button" 
            onClick={() => setDetailTab("screen")}
            className={cn("flex-1 text-center py-1.5 text-xs font-mono rounded", detailTab === "screen" ? "bg-slate-800 text-white font-bold" : "text-slate-400 hover:text-slate-200")}
          >
            Desktop Capture
          </button>
        </div>

        <div className="aspect-video overflow-hidden rounded-lg bg-slate-955 border border-slate-800 relative">
          {detailTab === "camera" ? (
            cameraSrc ? (
              <img className="h-full w-full object-cover" src={cameraSrc} alt="Webcam Feed" />
            ) : (
              <div className="grid h-full place-items-center text-slate-600"><Camera size={56} className="animate-pulse" /></div>
            )
          ) : (
            screenSrc ? (
              <img className="h-full w-full object-contain bg-black" src={screenSrc} alt="Screen Feed" />
            ) : (
              <div className="grid h-full place-items-center text-slate-600"><Monitor size={56} className="animate-pulse" /></div>
            )
          )}
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <p className="text-xl font-bold text-white tracking-wide">{student.studentName}</p>
          <p className="text-xs text-slate-500 font-mono mt-0.5">{student.rollId || student.studentId}</p>
        </div>
        
        <StatusBadge status={status} />
        
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-slate-400">
            <span>Suspicion Score</span>
            <span className="font-bold text-white font-mono">{student.suspicionScore}/100</span>
          </div>
          <ProgressMeter value={student.suspicionScore} tone={status === "SUSPICIOUS" ? "danger" : status === "WARNING" ? "warning" : "success"} />
        </div>

        <div className="space-y-2.5 pt-2 border-t border-slate-800 text-xs">
          <DetailRow label="Live Status" value={student.onlineStatus} />
          <DetailRow label="Face status" value={student.faceStatus || "Matching"} />
          <DetailRow label="Audio status" value={student.audioStatus || "Quiet"} />
          <DetailRow label="Window focus" value={student.focusStatus || "Focused"} />
          <DetailRow label="Monitor Setup" value={student.multiMonitorStatus || "Normal"} />
          <DetailRow label="Latest alert" value={student.latestAlert || "Active focus monitoring"} />
        </div>
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-slate-850 pb-2.5 text-xs font-mono">
      <span className="text-slate-500">{label}</span>
      <span className="text-right font-medium text-slate-202 truncate max-w-[200px]">{value}</span>
    </div>
  );
}
