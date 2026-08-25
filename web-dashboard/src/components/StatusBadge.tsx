import type { StudentStatus } from "../types";

const statusClasses: Record<StudentStatus, string> = {
  SAFE: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-200",
  WARNING: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-200",
  SUSPICIOUS: "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-400/20 dark:bg-rose-400/10 dark:text-rose-200",
};

const statusLabels: Record<StudentStatus, string> = {
  SAFE: "Safe",
  WARNING: "Warning",
  SUSPICIOUS: "Suspicious",
};

export function statusFromScore(score: number): StudentStatus {
  const normalized = Number.isFinite(Number(score)) ? Math.max(0, Math.min(100, Number(score))) : 0;
  if (normalized >= 70) return "SUSPICIOUS";
  if (normalized >= 40) return "WARNING";
  return "SAFE";
}

export function StatusBadge({ status }: { status: StudentStatus }) {
  return (
    <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClasses[status]}`}>
      {statusLabels[status]}
    </span>
  );
}
