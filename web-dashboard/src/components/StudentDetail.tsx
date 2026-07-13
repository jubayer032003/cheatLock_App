import { Camera, Monitor, Send, ShieldCheck, Pause, Play, Lock, ShieldX, FileText, Eye, UserRound } from "lucide-react";
import { StatusBadge, statusFromScore } from "./StatusBadge";
import { Card, EmptyState, cn } from "./ui";
import type { LiveStudent, IntegrityDecision } from "../types";

interface StudentDetailProps {
  student: LiveStudent | null;
  detailTab: "camera" | "screen";
  setDetailTab: (tab: "camera" | "screen") => void;
  warningMsg: string;
  setWarningMsg: (msg: string) => void;
  privateNote: string;
  setPrivateNote: (note: string) => void;
  integrityDecision: IntegrityDecision;
  setIntegrityDecision: (val: IntegrityDecision) => void;
  onSendCommand: (studentId: string, cmd: string, msg?: string) => void;
  onSaveReview: (studentId: string) => Promise<void>;
  onOpen: (student: LiveStudent) => void;
}

export function StudentDetail({
  student,
  detailTab,
  setDetailTab,
  warningMsg,
  setWarningMsg,
  privateNote,
  setPrivateNote,
  integrityDecision,
  setIntegrityDecision,
  onSendCommand,
  onSaveReview,
  onOpen,
}: StudentDetailProps) {
  if (!student) {
    return (
      <Card className="p-6 bg-slate-900 border-slate-800 text-center">
        <EmptyState icon={UserRound} title="No student selected" description="Select any student card to inspect webcam feeds, snapshots, and execute proctor actions." />
      </Card>
    );
  }

  const status = statusFromScore(student.suspicionScore);
  const cameraSrc = student.previewUrl || student.previewBase64;
  const screenSrc = student.screenBase64;

  return (
    <Card className="p-5 bg-slate-905 border-slate-800 flex flex-col gap-5">
      <div className="flex items-start justify-between gap-3 border-b border-slate-800 pb-3">
        <div>
          <h2 className="text-base font-bold text-white">{student.studentName}</h2>
          <p className="text-xs text-slate-500 font-mono">{student.rollId || student.studentId}</p>
        </div>
        <StatusBadge status={status} />
      </div>

      <div className="space-y-2">
        <div className="flex rounded border border-slate-800 bg-slate-955 p-0.5">
          <button 
            type="button" 
            onClick={() => setDetailTab("camera")}
            className={cn("flex-1 text-center py-1 text-xs font-mono rounded", detailTab === "camera" ? "bg-slate-800 text-white font-bold" : "text-slate-400 hover:text-slate-200")}
          >
            Webcam Feed
          </button>
          <button 
            type="button" 
            onClick={() => setDetailTab("screen")}
            className={cn("flex-1 text-center py-1 text-xs font-mono rounded", detailTab === "screen" ? "bg-slate-800 text-white font-bold" : "text-slate-400 hover:text-slate-200")}
          >
            Screen Snapshot
          </button>
        </div>

        <div className="relative aspect-video rounded overflow-hidden bg-slate-950 border border-slate-850">
          {detailTab === "camera" ? (
            cameraSrc ? (
              <img className="h-full w-full object-cover" src={cameraSrc} alt="Webcam Feed" />
            ) : (
              <div className="grid h-full place-items-center text-slate-700 text-xs font-mono"><Camera size={28} /> No Camera Stream</div>
            )
          ) : (
            screenSrc ? (
              <img className="h-full w-full object-contain bg-black" src={screenSrc} alt="Screen Feed" />
            ) : (
              <div className="grid h-full place-items-center text-slate-700 text-xs font-mono"><Monitor size={28} /> No Screen Snapshot</div>
            )
          )}
        </div>
      </div>

      <div className="space-y-2.5">
        <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-400">AI Subsystems Status</h3>
        <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
          <DetailBadge label="Face tracking" value={student.faceStatus || "Matching"} highlight={student.faceStatus === "Missing"} />
          <DetailBadge label="Audio activity" value={student.audioStatus || "Quiet"} highlight={student.audioStatus === "Speech detected"} />
          <DetailBadge label="Window focus" value={student.focusStatus || "Focused"} highlight={student.focusStatus === "Blurred"} />
          <DetailBadge label="Monitor count" value={student.multiMonitorStatus || "Normal"} highlight={student.multiMonitorStatus === "Multi-monitor alert"} />
        </div>
      </div>

      <div className="space-y-3 pt-3 border-t border-slate-800">
        <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-400">Proctor Controls</h3>
        
        <div className="flex gap-2">
          <input 
            type="text" 
            placeholder="Warning message..." 
            value={warningMsg}
            onChange={(e) => setWarningMsg(e.target.value)}
            className="flex-1 bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-202 placeholder-slate-650 focus:border-violet-505"
          />
          <button 
            type="button"
            onClick={() => {
              onSendCommand(student.studentId, "WARN_STUDENT", warningMsg);
              setWarningMsg("");
            }}
            className="bg-violet-600 hover:bg-violet-700 text-white rounded p-1.5 flex items-center justify-center transition"
          >
            <Send size={14} />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <button 
            type="button" 
            onClick={() => onSendCommand(student.studentId, "REQUEST_LIVENESS")}
            className="flex items-center justify-center gap-1.5 py-2 rounded bg-slate-950 border border-slate-800 hover:bg-slate-800 transition text-slate-300 font-medium"
          >
            <ShieldCheck size={13} className="text-emerald-400" />
            Liveness Challenge
          </button>
          <button 
            type="button" 
            onClick={() => onSendCommand(student.studentId, "REQUEST_ROOM_SCAN")}
            className="flex items-center justify-center gap-1.5 py-2 rounded bg-slate-950 border border-slate-800 hover:bg-slate-800 transition text-slate-300 font-medium"
          >
            <Camera size={13} className="text-amber-400" />
            Room Scan
          </button>
          <button 
            type="button" 
            onClick={() => onSendCommand(student.studentId, "PAUSE_EXAM")}
            className="flex items-center justify-center gap-1.5 py-2 rounded bg-slate-950 border border-slate-800 hover:bg-slate-800 transition text-slate-300 font-medium"
          >
            <Pause size={13} className="text-violet-400" />
            Pause Exam
          </button>
          <button 
            type="button" 
            onClick={() => onSendCommand(student.studentId, "RESUME_EXAM")}
            className="flex items-center justify-center gap-1.5 py-2 rounded bg-slate-950 border border-slate-800 hover:bg-slate-800 transition text-slate-300 font-medium"
          >
            <Play size={13} className="text-emerald-400" />
            Resume Exam
          </button>
          <button 
            type="button" 
            onClick={() => onSendCommand(student.studentId, "LOCK_EXAM")}
            className="flex items-center justify-center gap-1.5 py-2 rounded bg-red-955/20 border border-red-500/20 hover:bg-red-955/40 transition text-red-400 font-bold"
          >
            <Lock size={13} />
            Lock Student
          </button>
          <button 
            type="button" 
            onClick={() => onSendCommand(student.studentId, "END_EXAM")}
            className="flex items-center justify-center gap-1.5 py-2 rounded bg-slate-950 border border-slate-850 hover:bg-slate-800 transition text-slate-400 font-medium"
          >
            <ShieldX size={13} />
            Force End Exam
          </button>
        </div>
      </div>

      <div className="space-y-3 pt-3 border-t border-slate-800 font-mono text-xs">
        <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-400">Integrity Flags & Notes</h3>
        <div className="flex gap-2">
          <select 
            value={integrityDecision} 
            onChange={(e) => setIntegrityDecision(e.target.value as IntegrityDecision)}
            className="flex-1 bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-slate-303"
          >
            <option value="PENDING">Pending Review</option>
            <option value="CLEAN">Clean Pass</option>
            <option value="REVIEW_NEEDED">Review Needed</option>
            <option value="DISQUALIFIED">Disqualify Student</option>
          </select>
        </div>
        <textarea 
          placeholder="Enter private examiner notes..." 
          value={privateNote}
          onChange={(e) => setPrivateNote(e.target.value)}
          rows={2}
          className="w-full bg-slate-950 border border-slate-800 rounded p-2.5 text-slate-202 placeholder-slate-700 resize-none focus:border-violet-500"
        />
        <button 
          type="button"
          onClick={() => onSaveReview(student.studentId)}
          className="w-full py-2 bg-violet-600 hover:bg-violet-700 text-white rounded font-bold transition flex items-center justify-center gap-1.5"
        >
          <FileText size={13} /> Save review flag
        </button>
      </div>

      <div className="space-y-3 pt-3 border-t border-slate-800">
        <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-400">Student Violation Timeline</h3>
        <div className="max-h-40 overflow-y-auto space-y-2 font-mono text-[10px]">
          {student.violationsList?.map((violation, i) => (
            <div key={i} className="p-2.5 rounded bg-slate-950 border border-slate-850 flex flex-col gap-1">
              <div className="flex justify-between items-center text-slate-500">
                <span className="font-bold text-violet-400">{violation.type}</span>
                <span>{new Date(violation.timestamp).toLocaleTimeString()}</span>
              </div>
              <p className="text-slate-300">{violation.message}</p>
            </div>
          ))}
          {(!student.violationsList || student.violationsList.length === 0) && (
            <p className="py-2 text-slate-550 text-center">No alerts logged in current session.</p>
          )}
        </div>
      </div>

      <button className="primary-button bg-slate-950 hover:bg-slate-800 border-slate-800 text-slate-300 py-2.5 w-full text-xs font-bold uppercase tracking-wider" type="button" onClick={() => onOpen(student)}>
        <Eye size={15} /> Open monitor dashboard
      </button>
    </Card>
  );
}

function DetailBadge({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={cn("p-2 rounded border flex flex-col gap-0.5", highlight ? "bg-red-955/20 border-red-500/20 text-red-400" : "bg-slate-950 border-slate-850 text-slate-400")}>
      <span className="text-[9px] uppercase text-slate-500">{label}</span>
      <span className="font-bold text-slate-200 truncate">{value}</span>
    </div>
  );
}
