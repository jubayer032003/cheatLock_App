import { Camera, Circle } from "lucide-react";
import { StatusBadge, statusFromScore } from "./StatusBadge";
import type { LiveStudent } from "../types";
import { useAnimatedNumber } from "../hooks/useAnimatedNumber";
import { scorePercentage } from "../lib/scoreMetrics";

interface StudentCardProps {
  student: LiveStudent;
  selected: boolean;
  onSelect: (student: LiveStudent) => void;
}

export function StudentCard({ student, selected, onSelect }: StudentCardProps) {
  const percentage = scorePercentage(student);
  const status = statusFromScore(percentage);
  const previewSrc = student.previewUrl || student.previewBase64;
  const displayScore = useAnimatedNumber(percentage);

  return (
    <button
      type="button"
      onClick={() => onSelect(student)}
      className={`student-card ${selected ? "student-card-selected" : ""}`}
    >
      <div className="preview-box">
        {previewSrc ? (
          <img src={previewSrc} alt={`${student.studentName} camera preview`} />
        ) : (
          <div className="grid h-full place-items-center text-slate-400">
            <Camera size={28} />
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1 text-left">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-950">
              {student.studentName || "Unknown student"}
            </p>
            <p className="truncate text-xs text-slate-500">{student.rollId || student.studentId}</p>
          </div>
          <StatusBadge status={status} />
        </div>

        <div className="mt-3 flex items-center justify-between gap-3">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200">
            <div
              className={`h-full rounded-full ${
                status === "SAFE"
                  ? "bg-emerald-500"
                  : status === "WARNING"
                    ? "bg-amber-500"
                    : "bg-rose-500"
              }`}
              style={{ width: `${percentage}%` }}
            />
          </div>
          <span className="w-9 text-right text-sm font-semibold">{Math.round(displayScore)}</span>
        </div>

        <div className="mt-3 flex items-center justify-between gap-3 text-xs">
          <span className="truncate text-slate-500">{student.latestAlert || "No alerts yet"}</span>
          <span className="flex shrink-0 items-center gap-1 text-slate-500">
            <Circle
              size={8}
              fill={student.onlineStatus === "ONLINE" ? "#10b981" : "#94a3b8"}
              className={student.onlineStatus === "ONLINE" ? "text-emerald-500" : "text-slate-400"}
            />
            {student.onlineStatus === "ONLINE" ? "Online" : "Offline"}
          </span>
        </div>
      </div>
    </button>
  );
}
