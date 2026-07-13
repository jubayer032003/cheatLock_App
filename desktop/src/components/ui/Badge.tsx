import React from "react";

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: "default" | "success" | "warning" | "danger" | "accent";
}

export function Badge({ children, variant = "default", className = "", ...props }: BadgeProps) {
  const styles = {
    default: "bg-zinc-800 text-zinc-300 border-zinc-700",
    success: "bg-success/10 text-success border-success/20",
    warning: "bg-warning/10 text-warning border-warning/20",
    danger: "bg-danger/10 text-danger border-danger/20",
    accent: "bg-accent/10 text-accent border-accent/20",
  };

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${styles[variant]} ${className}`}
      {...props}
    >
      {children}
    </span>
  );
}
