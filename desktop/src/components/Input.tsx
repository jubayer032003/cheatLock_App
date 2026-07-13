import React from "react";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export function Input({ label, error, className = "", ...props }: InputProps) {
  return (
    <div className="flex flex-col gap-1.5 w-full">
      {label && (
        <label className="text-xs font-semibold tracking-wider text-zinc-400 uppercase select-none font-sans">
          {label}
        </label>
      )}
      <input
        className={`px-3.5 py-2 rounded-md text-sm bg-surface-base border border-border focus:border-accent focus:ring-2 focus:ring-accent/20 text-zinc-50 placeholder-zinc-600 transition-all duration-150 outline-none w-full ${
          error ? "border-danger focus:border-danger focus:ring-danger/20" : ""
        } ${className}`}
        {...props}
      />
      {error && (
        <span className="text-xs text-danger font-medium tracking-wide">
          {error}
        </span>
      )}
    </div>
  );
}
