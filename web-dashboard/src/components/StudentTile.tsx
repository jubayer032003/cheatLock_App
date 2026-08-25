import { Camera, Eye, Monitor, Wifi, WifiOff } from "lucide-react";
import { StatusBadge, statusFromScore } from "./StatusBadge";
import { ProgressMeter, cn } from "./ui";
import type { LiveStudent } from "../types";
import { useAnimatedNumber } from "../hooks/useAnimatedNumber";
import { scorePercentage } from "../lib/scoreMetrics";

interface StudentTileProps {
  student: LiveStudent;
  selected: boolean;
  rank?: number;
  onSelect: (student: LiveStudent) => void;
  onOpen: (student: LiveStudent) => void;
}

export function StudentTile({ student, selected, rank, onSelect, onOpen }: StudentTileProps) {
  const percentage = scorePercentage(student);
  const status = statusFromScore(percentage);
  const previewSrc = student.previewUrl || student.previewBase64;
  const tone = status === "SUSPICIOUS" ? "danger" : status === "WARNING" ? "warning" : "success";
  const displayScore = useAnimatedNumber(percentage);
  const online = student.onlineStatus === "ONLINE";

  return (
    <div 
      role="button"
      tabIndex={0}
      onClick={() => onSelect(student)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(student);
        }
      }}
      aria-pressed={selected}
      aria-label={`Select ${student.studentName || student.studentId}. Status ${status}. Suspicion score ${Math.round(percentage)}.`}
      className={cn(
        "group flex h-full w-full flex-col overflow-hidden rounded-lg border bg-slate-955 text-left transition select-none outline-none focus:ring-1 focus:ring-cyan-400",
        selected ? "border-cyan-400 shadow-[0_0_18px_rgba(34,211,238,0.18)]" : "border-slate-850 hover:border-slate-700",
        status === "SUSPICIOUS" && "border-red-500/45 bg-red-950/10",
        status === "WARNING" && "border-amber-500/35 bg-amber-950/10"
      )}
    >
      <div className={cn("h-1 w-full", status === "SUSPICIOUS" ? "bg-red-500" : status === "WARNING" ? "bg-amber-400" : "bg-emerald-400")} />

      <div className="relative aspect-video w-full overflow-hidden bg-slate-900 border-b border-slate-855">
        {previewSrc ? (
          <img className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]" src={previewSrc} alt={`${student.studentName} feed`} />
        ) : (
          <div className="grid h-full place-items-center bg-[radial-gradient(circle_at_center,rgba(71,85,105,0.22),transparent_62%)] text-slate-655">
            <Camera size={30} className="motion-safe:animate-pulse" />
          </div>
        )}
        <div className="absolute left-2 top-2 flex items-center gap-1.5">
          {rank ? <span className="rounded bg-slate-950/90 px-1.5 py-0.5 text-[10px] font-black text-slate-200 border border-slate-800">#{rank}</span> : null}
          <StatusBadge status={status} />
        </div>
        <button 
          className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded bg-slate-950/85 border border-slate-800 text-slate-300 transition hover:text-white focus:outline-none focus:ring-1 focus:ring-violet-400" 
          type="button" 
          title="Fullscreen monitor" 
          aria-label={`Open fullscreen monitor for ${student.studentName || student.studentId}`}
          onClick={(event) => { event.stopPropagation(); onOpen(student); }}
        >
          <Eye size={13} />
        </button>
        {student.screenBase64 && (
          <div className="absolute bottom-2 left-2 flex items-center gap-1 rounded bg-slate-950/90 border border-slate-800 px-2 py-0.5 text-[9px] font-mono text-emerald-300">
            <Monitor size={10} /> Screen live
          </div>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2 p-3">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-white" title={student.studentName || student.studentId}>{student.studentName || "Unknown student"}</p>
            <p className="truncate text-[10px] text-slate-505 font-mono">{student.rollId || student.studentId}</p>
          </div>
          <span className={cn("inline-flex h-6 shrink-0 items-center gap-1 rounded border px-2 text-[10px] font-mono", online ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-300" : "border-slate-700 bg-slate-900 text-slate-500")}>
            {online ? <Wifi size={11} /> : <WifiOff size={11} />}
            {online ? "Live" : "Offline"}
          </span>
        </div>
        
        <div className="grid grid-cols-[minmax(0,1fr)_44px] items-center gap-3">
          <div className="flex-1"><ProgressMeter value={percentage} tone={tone} /></div>
          <span className={cn("w-11 text-right text-sm font-mono font-black", status === "SUSPICIOUS" ? "text-red-300" : status === "WARNING" ? "text-amber-300" : "text-emerald-300")}>
            {Math.round(displayScore)}%
          </span>
        </div>

        <div className="grid grid-cols-2 gap-1.5 pt-1">
          <span className={cn("truncate rounded border px-2 py-0.5 text-[9px] font-mono", student.faceStatus === "Missing" ? "bg-red-950/30 border-red-500/30 text-red-400" : "bg-slate-900 border-slate-800 text-slate-400")}>
            Face: {student.faceStatus || "Matching"}
          </span>
          <span className={cn("truncate rounded border px-2 py-0.5 text-[9px] font-mono", student.audioStatus === "Speech detected" ? "bg-red-950/30 border-red-500/30 text-red-400" : "bg-slate-900 border-slate-800 text-slate-400")}>
            Audio: {student.audioStatus || "Quiet"}
          </span>
        </div>

        <p className="mt-auto truncate border-t border-slate-900 pt-2 text-[10px] text-slate-500 font-mono" title={student.latestAlert || "Active focus monitoring"}>
          {student.latestAlert || "Active focus monitoring"}
        </p>
      </div>
    </div>
  );
}
