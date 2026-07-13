interface StatusBadgeProps {
  status: "SAFE" | "WARNING" | "SUSPICIOUS" | "ONLINE" | "OFFLINE" | "IN_PROGRESS" | "SUBMITTED" | "LOCKED" | "LIVE";
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const styles = {
    SAFE: "bg-success/10 text-success border border-success/20",
    ONLINE: "bg-success/10 text-success border border-success/20",
    IN_PROGRESS: "bg-accent/10 text-accent border border-accent/20",
    SUBMITTED: "bg-blue-500/10 text-blue-400 border border-blue-500/20",
    WARNING: "bg-warning/10 text-warning border border-warning/20",
    SUSPICIOUS: "bg-danger/10 text-danger border border-danger/20",
    LOCKED: "bg-danger/10 text-danger border border-danger/20",
    OFFLINE: "bg-zinc-800 text-zinc-400 border border-zinc-700",
    LIVE: "bg-success/10 text-success border border-success/20",
  };

  const hasPulsingDot = status === "LIVE" || status === "ONLINE" || status === "IN_PROGRESS";
  const dotColors = {
    LIVE: "bg-success",
    ONLINE: "bg-success",
    IN_PROGRESS: "bg-accent",
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium font-sans uppercase tracking-normal ${
        styles[status] || styles.OFFLINE
      }`}
    >
      {hasPulsingDot && (
        <span className="relative flex h-1.5 w-1.5">
          <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${dotColors[status as keyof typeof dotColors]}`}></span>
          <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${dotColors[status as keyof typeof dotColors]}`}></span>
        </span>
      )}
      {status.replace("_", " ")}
    </span>
  );
}
