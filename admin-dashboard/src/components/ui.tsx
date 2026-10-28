import React, { useEffect, useRef } from "react";
import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { AlertCircle, CheckCircle, X } from "lucide-react";

export type Tone = "neutral" | "primary" | "success" | "warning" | "danger" | "info";

const toneClasses: Record<Tone, string> = {
  neutral: "border-slate-200 bg-slate-100/70 text-slate-700 dark:border-white/10 dark:bg-white/[0.06] dark:text-slate-300",
  primary: "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-300",
  success: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300",
  warning: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300",
  danger: "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300",
  info: "border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-500/20 dark:bg-indigo-500/10 dark:text-indigo-300",
};

export function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function Card({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("surface-card p-5", className)} {...props}>
      {children}
    </div>
  );
}

export function Badge({
  tone = "neutral",
  children,
  className,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-medium leading-none select-none",
        toneClasses[tone],
        className
      )}
    >
      {children}
    </span>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="surface-card flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200/60 dark:border-white/10">
      <div className="min-w-0">
        {eyebrow && (
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-sky-600 dark:text-sky-400">
            {eyebrow}
          </div>
        )}
        <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-2xl">
          {title}
        </h1>
        {description && (
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function MetricCard({
  icon: Icon,
  label,
  value,
  helper,
  tone = "primary",
}: {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
  helper?: ReactNode;
  tone?: Tone;
}) {
  return (
    <Card className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          {label}
        </p>
        <p className="mt-1 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
          {value}
        </p>
        {helper && (
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 truncate">{helper}</p>
        )}
      </div>
      <div
        className={cn(
          "grid h-10 w-10 shrink-0 place-items-center rounded-lg border",
          toneClasses[tone]
        )}
      >
        <Icon size={18} />
      </div>
    </Card>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="grid min-h-48 place-items-center rounded-xl border border-dashed border-slate-300/80 bg-slate-50/50 p-6 text-center dark:border-white/10 dark:bg-white/[0.02]">
      <div className="max-w-xs">
        <div className="mx-auto mb-3 grid h-10 w-10 place-items-center rounded-full bg-slate-200/60 text-slate-500 dark:bg-white/10 dark:text-slate-400">
          <Icon size={20} />
        </div>
        <p className="text-xs font-bold text-slate-900 dark:text-white">{title}</p>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
          {description}
        </p>
        {action && <div className="mt-4">{action}</div>}
      </div>
    </div>
  );
}

export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 p-3.5 text-xs text-rose-800 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-200">
      <div className="flex items-center gap-2">
        <AlertCircle size={16} className="shrink-0 text-rose-600 dark:text-rose-400" />
        <span>{message}</span>
      </div>
      {onRetry && (
        <button
          className="secondary-button !h-8 !px-2.5 !text-xs shrink-0"
          type="button"
          onClick={onRetry}
        >
          Retry
        </button>
      )}
    </div>
  );
}

export function SkeletonBlock({ className }: { className?: string }) {
  return (
    <div
      className={cn("animate-pulse rounded-lg bg-slate-200/70 dark:bg-white/10", className)}
    />
  );
}

export function IconButton({
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className={cn("icon-button", className)} type="button" {...props} />;
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  children,
  ...props
}: {
  variant?: "primary" | "secondary" | "danger";
  size?: "sm" | "md" | "lg";
  className?: string;
  children: ReactNode;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  const baseClass =
    variant === "secondary"
      ? "secondary-button"
      : variant === "danger"
      ? "inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition-all duration-150 hover:bg-rose-500 active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-rose-500/40 disabled:cursor-not-allowed disabled:opacity-50"
      : "primary-button";

  const sizeClass =
    size === "sm" ? "!h-8 !px-2.5 !text-xs" : size === "lg" ? "!h-11 !px-5 !text-sm" : "";

  return (
    <button className={cn(baseClass, sizeClass, className)} type="button" {...props}>
      {children}
    </button>
  );
}

export function Dialog({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    previouslyFocusedRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    window.setTimeout(() => closeButtonRef.current?.focus(), 0);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      previouslyFocusedRef.current?.focus();
    };
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-xs transition-opacity duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dialog-title"
    >
      <div className="animate-modal-in max-h-[90vh] w-full max-w-4xl overflow-auto rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-white/10 dark:bg-[#0e1424]">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200/80 bg-white/95 px-5 py-4 backdrop-blur dark:border-white/10 dark:bg-[#0e1424]/95">
          <h2 id="dialog-title" className="text-base font-bold text-slate-900 dark:text-white">
            {title}
          </h2>
          <button
            ref={closeButtonRef}
            className="icon-button !h-8 !w-8"
            type="button"
            onClick={onClose}
            aria-label="Close modal"
          >
            <X size={16} />
          </button>
        </div>
        <div className="p-5 sm:p-6">{children}</div>
      </div>
    </div>
  );
}
