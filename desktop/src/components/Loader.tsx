export function Loader({ size = "md", label }: { size?: "sm" | "md" | "lg"; label?: string }) {
  const sizes = {
    sm: "h-5 w-5 border-2",
    md: "h-8 w-8 border-2",
    lg: "h-12 w-12 border-[3px]",
  };

  return (
    <div className="flex flex-col items-center justify-center gap-3">
      <div className={`animate-spin rounded-full border-t-transparent border-accent ${sizes[size]}`} />
      {label && (
        <span className="text-xs font-mono tracking-widest text-zinc-400 uppercase select-none">
          {label}
        </span>
      )}
    </div>
  );
}
