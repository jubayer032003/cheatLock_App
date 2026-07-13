import type { IntegrityStudentReport, IntegrityDecision } from "../types";

interface IntegrityStudentCardProps {
  student: IntegrityStudentReport;
  notes: string;
  saving: boolean;
  onNotesChange: (notes: string) => void;
  onSaveDecision: (decision: IntegrityDecision) => void;
  onReset: () => void;
}

export function IntegrityStudentCard({
  student,
  notes,
  saving,
  onNotesChange,
  onSaveDecision,
  onReset,
}: IntegrityStudentCardProps) {
  return (
    <article className="rounded-lg border border-slate-800 bg-slate-900 p-5 w-full">
      <div className="grid gap-5 lg:grid-cols-[260px_1fr]">
        <div>
          <p className="text-xs font-mono font-bold text-slate-500">Student</p>
          <h3 className="mt-1 text-base font-bold text-white">{student.studentName || student.studentId}</h3>
          <p className="text-xs text-slate-500 font-mono mt-0.5">{student.studentId}</p>

          <div className={`mt-4 rounded-lg p-4 font-mono ${riskClass(student.riskLevel)}`}>
            <p className="text-xs font-bold text-slate-400">Final Risk Score</p>
            <p className="mt-1 text-2xl font-bold">{student.finalRiskScore}/100</p>
            <p className="mt-1 text-[10px] uppercase font-bold">{student.riskLevel}</p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <MiniStat label="Face missing" value={student.breakdown.faceMissingCount} />
            <MiniStat label="App switches" value={student.breakdown.appSwitchCount} />
            <MiniStat label="Suspicious events" value={student.breakdown.suspiciousAlertCount} />
            <MiniStat label="High severity" value={student.breakdown.highSeverityCount} />
            <MiniStat label="Preview snapshots" value={student.breakdown.previewEventCount} />
            <MiniStat label="Offline events" value={student.breakdown.offlineEventCount} />
          </div>

          <div className="rounded-lg border border-slate-850 bg-slate-950 p-4">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between text-xs">
              <div>
                <p className="font-bold text-white">Teacher Verdict</p>
                <p className="text-[10px] text-slate-500 font-mono mt-0.5">
                  Current: {decisionLabel(student.review.decision)} / Recommended: {recommendationLabel(student.recommendation)}
                </p>
              </div>
              <button 
                className="secondary-button bg-slate-900 border-slate-800 hover:bg-slate-850 text-[10px] font-mono py-1 px-2.5 rounded transition" 
                type="button" 
                onClick={onReset} 
                disabled={student.status === "IN_PROGRESS"}
              >
                Reset Attempt
              </button>
            </div>

            <textarea
              className="field-input mt-3 min-h-20 py-2 bg-slate-900 border-slate-800 text-xs rounded text-slate-202 w-full placeholder-slate-700 resize-none focus:outline-none"
              value={notes}
              onChange={(event) => onNotesChange(event.target.value)}
              placeholder="Add teacher notes for this student..."
            />
            {student.review.notes && (
              <p className="mt-3 hidden rounded-md bg-slate-950 p-3 text-xs print:block text-slate-300">{student.review.notes}</p>
            )}

            <div className="mt-3 flex flex-wrap gap-2 text-xs font-mono">
              <button 
                className="secondary-button bg-slate-900 border-slate-800 hover:bg-slate-855 py-1 px-2.5 rounded text-[10px] text-emerald-400" 
                disabled={saving} 
                type="button" 
                onClick={() => onSaveDecision("CLEAN")}
              >
                Mark Clean
              </button>
              <button 
                className="secondary-button bg-slate-900 border-slate-800 hover:bg-slate-855 py-1 px-2.5 rounded text-[10px] text-amber-400" 
                disabled={saving} 
                type="button" 
                onClick={() => onSaveDecision("REVIEW_NEEDED")}
              >
                Review Needed
              </button>
              <button 
                className="secondary-button bg-slate-900 border-slate-800 hover:bg-slate-855 py-1 px-2.5 rounded text-[10px] text-red-400" 
                disabled={saving} 
                type="button" 
                onClick={() => onSaveDecision("DISQUALIFIED")}
              >
                Disqualified
              </button>
            </div>
          </div>

          <p className="rounded-lg bg-slate-955 border border-slate-850 p-3 text-xs font-mono text-slate-500">
            Latest alert: {student.latestAlert || "No alert recorded."}
          </p>
        </div>
      </div>
    </article>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-slate-950 border border-slate-850 p-3 text-center font-mono">
      <p className="text-base font-bold text-white">{value}</p>
      <p className="text-[9px] text-slate-500 uppercase mt-0.5">{label}</p>
    </div>
  );
}

function riskClass(level: IntegrityStudentReport["riskLevel"]) {
  if (level === "SUSPICIOUS") return "bg-red-955/20 border border-red-500/30 text-red-450";
  if (level === "WARNING") return "bg-amber-955/20 border border-amber-500/30 text-amber-450";
  return "bg-slate-950 border border-slate-850 text-slate-400";
}

export function decisionLabel(decision: IntegrityDecision) {
  if (decision === "CLEAN") return "Clean";
  if (decision === "REVIEW_NEEDED") return "Review Needed";
  if (decision === "DISQUALIFIED") return "Disqualified";
  return "Pending";
}

export function recommendationLabel(recommendation: IntegrityStudentReport["recommendation"]) {
  if (recommendation === "DISQUALIFY_RECOMMENDED") return "Disqualify recommended";
  if (recommendation === "REVIEW_RECOMMENDED") return "Review recommended";
  return "Clean recommended";
}
