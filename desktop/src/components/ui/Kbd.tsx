import React from "react";

interface KbdProps {
  children: React.ReactNode;
}

export function Kbd({ children }: KbdProps) {
  return (
    <kbd className="inline-flex items-center justify-center bg-zinc-800 border border-zinc-700 text-zinc-400 text-[10px] font-mono px-1.5 py-0.5 rounded leading-none">
      {children}
    </kbd>
  );
}
