import { Camera, Monitor } from "lucide-react";
import { StatusBadge, statusFromScore } from "./StatusBadge";
import { ProgressMeter, cn } from "./ui";
import type { LiveStudent } from "../types";
import { useAnimatedNumber } from "../hooks/useAnimatedNumber";
import { scorePercentage } from "../lib/scoreMetrics";
import { snapshotFor, sensorStatus } from "../lib/monitoringState";
import { useMonitoringFreshness } from "../hooks/useMonitoringFreshness";

interface FullscreenStudentProps {
  student: LiveStudent;
  detailTab: "camera" | "screen";
  setDetailTab: (tab: "camera" | "screen") => void;
}

export function FullscreenStudent({ student, detailTab, setDetailTab }: FullscreenStudentProps) {
  const percentage = scorePercentage(student);
  const freshness = useMonitoringFreshness(student);
  const status = statusFromScore(percentage);
  const cameraSrc = snapshotFor(student, "camera");
  const screenSrc = snapshotFor(student, "screen");
  const displayScore = useAnimatedNumber(percentage);

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_340px] text-slate-202 font-sans p-2">
      <div className="flex flex-col gap-3">
        <div className="flex rounded border border-slate-800 bg-slate-950 p-0.5">
          <button 
            type="button" 
            onClick={() => setDetailTab("camera")}
            className={cn("flex-1 text-center py-1.5 text-xs font-mono rounded", detailTab === "camera" ? "bg-slate-800 text-white font-bold" : "text-slate-400 hover:text-slate-200")}
          >
            Camera Snapshot
          </button>
          <button 
            type="button" 
            onClick={() => setDetailTab("screen")}
            className={cn("flex-1 text-center py-1.5 text-xs font-mono rounded", detailTab === "screen" ? "bg-slate-800 text-white font-bold" : "text-slate-400 hover:text-slate-200")}
          >
            Screen Snapshot
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
        
        <StatusBadge status={status} scoreOnly />
        
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-slate-400">
            <span>Suspicion Score</span>
            <span className="font-bold text-white font-mono">{Math.round(displayScore)}/100</span>
          </div>
          <ProgressMeter value={percentage} tone={status === "SUSPICIOUS" ? "danger" : status === "WARNING" ? "warning" : "success"} />
        </div>

        <div className="space-y-2.5 pt-2 border-t border-slate-800 text-xs">
          <DetailRow label="Monitoring status" value={freshness} />
          <DetailRow label="Face status" value={sensorStatus(student.faceStatus)} />
          <DetailRow label="Audio status" value={sensorStatus(student.audioStatus)} />
          <DetailRow label="Window focus" value={sensorStatus(student.focusStatus)} />
          <DetailRow label="Monitor Setup" value={sensorStatus(student.multiMonitorStatus)} />
          <DetailRow label="Object detector" value="Unverified" />
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
