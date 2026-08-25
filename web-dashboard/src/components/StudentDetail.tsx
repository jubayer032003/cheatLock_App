import { Camera, Monitor, Send, ShieldCheck, Pause, Play, Lock, ShieldX, FileText, Eye, UserRound } from "lucide-react";
import { StatusBadge, statusFromScore } from "./StatusBadge";
import { Card, EmptyState, cn } from "./ui";
import type { LiveStudent, IntegrityDecision } from "../types";
import { useState } from "react";
import { scorePercentage } from "../lib/scoreMetrics";

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
  pendingCommandKey?: string;
  commandFeedback?: string;
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
  pendingCommandKey = "",
  commandFeedback = "",
}: StudentDetailProps) {
  const [confirmCommand, setConfirmCommand] = useState<{ command: string; label: string } | null>(null);

  if (!student) {
    return (
      <Card className="rounded-lg border-slate-800 bg-slate-950 p-6 text-center">
        <EmptyState icon={UserRound} title="No student selected" description="Select any student card to inspect webcam feeds, snapshots, and execute proctor actions." />
      </Card>
    );
  }

  const percentage = scorePercentage(student);
  const status = statusFromScore(percentage);
  const cameraSrc = student.previewUrl || student.previewBase64;
  const screenSrc = student.screenBase64;
  const isSending = (command: string) => pendingCommandKey === `${student.studentId}:${command}`;
  const sendStudentCommand = (command: string, message?: string) => {
    onSendCommand(student.studentId, command, message);
  };
  const requestHighImpactCommand = (command: string, label: string) => setConfirmCommand({ command, label });

  return (
    <Card className="flex flex-col gap-5 rounded-lg border-slate-800 bg-slate-950 p-5 shadow-xl shadow-slate-950/20">
      <div className="flex items-start justify-between gap-3 border-b border-slate-800 pb-4">
        <div className="min-w-0">
          <p className="text-[10px] font-mono uppercase tracking-wider text-slate-500">Selected student</p>
          <h2 className="mt-1 truncate text-lg font-black text-white">{student.studentName}</h2>
          <p className="text-xs text-slate-500 font-mono">{student.rollId || student.studentId}</p>
        </div>
        <StatusBadge status={status} />
      </div>

      <div className="space-y-2">
        <div className="flex rounded-md border border-slate-800 bg-slate-900 p-1">
          <button 
            type="button" 
            onClick={() => setDetailTab("camera")}
            className={cn("flex-1 rounded px-2 py-1.5 text-center text-xs font-bold", detailTab === "camera" ? "bg-cyan-500 text-slate-950" : "text-slate-400 hover:bg-slate-800 hover:text-slate-200")}
          >
            Webcam Feed
          </button>
          <button 
            type="button" 
            onClick={() => setDetailTab("screen")}
            className={cn("flex-1 rounded px-2 py-1.5 text-center text-xs font-bold", detailTab === "screen" ? "bg-cyan-500 text-slate-950" : "text-slate-400 hover:bg-slate-800 hover:text-slate-200")}
          >
            Screen Snapshot
          </button>
        </div>

        <div className="relative aspect-video overflow-hidden rounded-lg border border-slate-800 bg-slate-950">
          {detailTab === "camera" ? (
            cameraSrc ? (
              <img className="h-full w-full object-cover" src={cameraSrc} alt="Webcam Feed" />
            ) : (
              <div className="grid h-full place-items-center text-xs font-mono text-slate-600"><Camera size={28} /> No Camera Stream</div>
            )
          ) : (
            screenSrc ? (
              <img className="h-full w-full object-contain bg-black" src={screenSrc} alt="Screen Feed" />
            ) : (
              <div className="grid h-full place-items-center text-xs font-mono text-slate-600"><Monitor size={28} /> No Screen Snapshot</div>
            )
          )}
        </div>
      </div>

      <div className="space-y-2.5">
        <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-500">Monitoring status</h3>
        <div className="rounded-md border border-slate-800 bg-slate-900 p-3 text-xs font-mono text-slate-300">
          Suspicion score: <span className="font-bold text-white">{percentage}/100</span>
          {student.scoreMetrics?.updatedAt ? <span className="ml-2 text-slate-500">Updated {new Date(student.scoreMetrics.updatedAt).toLocaleTimeString()}</span> : null}
        </div>
        <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
          <DetailBadge label="Face tracking" value={student.faceStatus || "Matching"} highlight={student.faceStatus === "Missing"} />
          <DetailBadge label="Audio activity" value={student.audioStatus || "Quiet"} highlight={student.audioStatus === "Speech detected"} />
          <DetailBadge label="Window focus" value={student.focusStatus || "Focused"} highlight={student.focusStatus === "Blurred"} />
          <DetailBadge label="Monitor count" value={student.multiMonitorStatus || "Normal"} highlight={student.multiMonitorStatus === "Multi-monitor alert"} />
        </div>
      </div>

      <div className="space-y-3 border-t border-slate-800 pt-4">
        <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-500">Proctor actions</h3>
        
        <div className="flex gap-2">
          <label className="sr-only" htmlFor="proctor-warning-message">Warning message for selected student</label>
          <input 
            id="proctor-warning-message"
            type="text" 
            placeholder="Warning message..." 
            value={warningMsg}
            onChange={(e) => setWarningMsg(e.target.value)}
            className="flex-1 rounded border border-slate-800 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-202 placeholder-slate-650 focus:border-cyan-400"
          />
          <button 
            type="button"
            onClick={() => {
              sendStudentCommand("WARN_STUDENT", warningMsg);
              setWarningMsg("");
            }}
            disabled={isSending("WARN_STUDENT")}
            aria-label={`Send warning to ${student.studentName || student.studentId}`}
            className="flex items-center justify-center rounded bg-cyan-500 p-1.5 text-slate-950 transition hover:bg-cyan-400 disabled:opacity-50"
          >
            <Send size={14} />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <button 
            type="button" 
            onClick={() => sendStudentCommand("REQUEST_LIVENESS")}
            disabled={isSending("REQUEST_LIVENESS")}
            className="flex items-center justify-center gap-1.5 rounded border border-slate-800 bg-slate-900 py-2 font-medium text-slate-300 transition hover:bg-slate-800 disabled:opacity-50"
          >
            <ShieldCheck size={13} className="text-emerald-400" />
            Liveness Challenge
          </button>
          <button 
            type="button" 
            onClick={() => sendStudentCommand("REQUEST_ROOM_SCAN")}
            disabled={isSending("REQUEST_ROOM_SCAN")}
            className="flex items-center justify-center gap-1.5 rounded border border-slate-800 bg-slate-900 py-2 font-medium text-slate-300 transition hover:bg-slate-800 disabled:opacity-50"
          >
            <Camera size={13} className="text-amber-400" />
            Room Scan
          </button>
          <button 
            type="button" 
            onClick={() => requestHighImpactCommand("PAUSE_EXAM", "pause this student's exam")}
            disabled={isSending("PAUSE_EXAM")}
            className="flex items-center justify-center gap-1.5 rounded border border-slate-800 bg-slate-900 py-2 font-medium text-slate-300 transition hover:bg-slate-800 disabled:opacity-50"
          >
            <Pause size={13} className="text-violet-400" />
            Pause Exam
          </button>
          <button 
            type="button" 
            onClick={() => sendStudentCommand("RESUME_EXAM")}
            disabled={isSending("RESUME_EXAM")}
            className="flex items-center justify-center gap-1.5 rounded border border-slate-800 bg-slate-900 py-2 font-medium text-slate-300 transition hover:bg-slate-800 disabled:opacity-50"
          >
            <Play size={13} className="text-emerald-400" />
            Resume Exam
          </button>
          <button 
            type="button" 
            onClick={() => requestHighImpactCommand("LOCK_EXAM", "lock this student's exam")}
            disabled={isSending("LOCK_EXAM")}
            className="flex items-center justify-center gap-1.5 rounded border border-rose-500/25 bg-rose-500/10 py-2 font-bold text-rose-300 transition hover:bg-rose-500/15 disabled:opacity-50"
          >
            <Lock size={13} />
            Lock Student
          </button>
          <button 
            type="button" 
            onClick={() => requestHighImpactCommand("END_EXAM", "force end this student's exam")}
            disabled={isSending("END_EXAM")}
            className="flex items-center justify-center gap-1.5 rounded border border-slate-800 bg-slate-900 py-2 font-medium text-slate-400 transition hover:bg-slate-800 disabled:opacity-50"
          >
            <ShieldX size={13} />
            Force End Exam
          </button>
        </div>
        {commandFeedback && <p className="text-[11px] text-slate-400" role="status">{commandFeedback}</p>}
        {confirmCommand && (
          <div className="rounded-md border border-amber-400/25 bg-amber-400/10 p-3 text-xs text-amber-100" role="alertdialog" aria-modal="false" aria-labelledby="confirm-command-title">
            <p id="confirm-command-title" className="font-bold">Confirm action for {student.studentName || student.studentId}</p>
            <p className="mt-1 text-amber-100/80">This will {confirmCommand.label}. Confirm only if you are acting on the selected student.</p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                className="rounded bg-amber-400 px-3 py-1.5 font-bold text-slate-950"
                onClick={() => {
                  sendStudentCommand(confirmCommand.command);
                  setConfirmCommand(null);
                }}
              >
                Confirm
              </button>
              <button
                type="button"
                className="rounded border border-amber-400/30 px-3 py-1.5 text-amber-100"
                onClick={() => setConfirmCommand(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="space-y-3 border-t border-slate-800 pt-4 font-mono text-xs">
        <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-500">Integrity notes</h3>
        <div className="flex gap-2">
          <label className="sr-only" htmlFor="integrity-decision">Integrity review decision</label>
          <select 
            id="integrity-decision"
            value={integrityDecision} 
            onChange={(e) => setIntegrityDecision(e.target.value as IntegrityDecision)}
            className="flex-1 rounded border border-slate-800 bg-slate-900 px-2.5 py-1.5 text-slate-303"
          >
            <option value="PENDING">Pending Review</option>
            <option value="CLEAN">Clean Pass</option>
            <option value="REVIEW_NEEDED">Review Needed</option>
            <option value="DISQUALIFIED">Disqualify Student</option>
          </select>
        </div>
        <label className="sr-only" htmlFor="integrity-private-note">Private examiner notes</label>
        <textarea 
          id="integrity-private-note"
          placeholder="Enter private examiner notes..." 
          value={privateNote}
          onChange={(e) => setPrivateNote(e.target.value)}
          rows={2}
          className="w-full resize-none rounded border border-slate-800 bg-slate-900 p-2.5 text-slate-202 placeholder-slate-700 focus:border-cyan-400"
        />
        <button 
          type="button"
          onClick={() => onSaveReview(student.studentId)}
          className="flex w-full items-center justify-center gap-1.5 rounded bg-cyan-500 py-2 font-bold text-slate-950 transition hover:bg-cyan-400"
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
