import { Camera, Monitor, Eye } from "lucide-react";
import { StatusBadge, statusFromScore } from "./StatusBadge";
import { ProgressMeter, cn } from "./ui";
import type { LiveStudent } from "../types";

interface StudentTileProps {
  student: LiveStudent;
  selected: boolean;
  onSelect: (student: LiveStudent) => void;
  onOpen: (student: LiveStudent) => void;
}

export function StudentTile({ student, selected, onSelect, onOpen }: StudentTileProps) {
  const status = statusFromScore(student.suspicionScore);
  const previewSrc = student.previewUrl || student.previewBase64;
  const tone = status === "SUSPICIOUS" ? "danger" : status === "WARNING" ? "warning" : "success";

  return (
    <button 
      type="button" 
      onClick={() => onSelect(student)} 
      className={cn(
        "flex flex-col gap-3 p-3.5 rounded-lg border bg-slate-955 text-left transition select-none outline-none focus:ring-1 focus:ring-violet-500 w-full h-full",
        selected ? "border-violet-500 shadow-[0_0_15px_rgba(139,92,246,0.15)]" : "border-slate-850 hover:border-slate-700"
      )}
    >
      <div className="relative aspect-video w-full overflow-hidden rounded-md bg-slate-900 border border-slate-855">
        {previewSrc ? (
          <img className="h-full w-full object-cover" src={previewSrc} alt={`${student.studentName} feed`} />
        ) : (
          <div className="grid h-full place-items-center text-slate-655">
            <Camera size={28} className="animate-pulse" />
          </div>
        )}
        <div className="absolute left-2 top-2"><StatusBadge status={status} /></div>
        <button 
          className="absolute right-2 top-2 h-7 w-7 rounded bg-slate-950/80 border border-slate-800 text-slate-300 hover:text-white flex items-center justify-center transition" 
          type="button" 
          title="Fullscreen monitor" 
          onClick={(event) => { event.stopPropagation(); onOpen(student); }}
        >
          <Eye size={13} />
        </button>
        {student.screenBase64 && (
          <div className="absolute bottom-2 left-2 bg-slate-950/90 border border-slate-800 px-2 py-0.5 rounded flex items-center gap-1 text-[9px] font-mono text-emerald-400">
            <Monitor size={10} /> Screen Streamed
          </div>
        )}
      </div>

      <div className="w-full space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="truncate text-sm font-bold text-white">{student.studentName || "Unknown student"}</p>
            <p className="truncate text-[10px] text-slate-505 font-mono">{student.rollId || student.studentId}</p>
          </div>
          <span className={cn("mt-1 h-2 w-2 rounded-full", student.onlineStatus === "ONLINE" ? "bg-emerald-400 shadow-[0_0_8px_#34d399]" : "bg-slate-600")} />
        </div>
        
        <div className="flex items-center gap-3">
          <div className="flex-1"><ProgressMeter value={student.suspicionScore} tone={tone} /></div>
          <span className="w-8 text-right text-xs font-mono font-bold text-slate-202">{student.suspicionScore}</span>
        </div>

        <div className="flex flex-wrap gap-1.5 pt-1">
          <span className={cn("text-[9px] font-mono px-2 py-0.5 rounded border", student.faceStatus === "Missing" ? "bg-red-950/30 border-red-500/30 text-red-400" : "bg-slate-900 border-slate-800 text-slate-400")}>
            Face: {student.faceStatus || "Matching"}
          </span>
          <span className={cn("text-[9px] font-mono px-2 py-0.5 rounded border", student.audioStatus === "Speech detected" ? "bg-red-950/30 border-red-500/30 text-red-400" : "bg-slate-900 border-slate-800 text-slate-400")}>
            Audio: {student.audioStatus || "Quiet"}
          </span>
        </div>

        <p className="truncate text-[10px] text-slate-500 font-mono pt-1 border-t border-slate-900">{student.latestAlert || "Active focus monitoring"}</p>
      </div>
    </button>
  );
}
