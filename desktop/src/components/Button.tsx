import React from "react";
import { motion } from "framer-motion";
import { tapScale } from "../motion/variants";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  isLoading?: boolean;
}

export function Button({
  children,
  variant = "primary",
  isLoading = false,
  className = "",
  disabled,
  ...props
}: ButtonProps) {
  const baseStyle =
    "px-4 py-2 rounded-md font-medium flex items-center justify-center gap-2 select-none disabled:opacity-40 disabled:pointer-events-none text-sm transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface-base";
  
  const variants = {
    primary:
      "bg-accent hover:bg-accent-hover text-white shadow-sm border border-accent",
    secondary:
      "bg-surface-overlay hover:bg-[#343438] text-zinc-200 border border-border",
    danger:
      "bg-danger hover:bg-red-700 text-white shadow-sm border border-danger",
    ghost:
      "bg-transparent hover:bg-zinc-800/50 text-zinc-400 hover:text-zinc-200",
  };

  return (
    <motion.button
      disabled={disabled || isLoading}
      whileTap={tapScale}
      className={`${baseStyle} ${variants[variant]} ${className}`}
      {...(props as any)}
    >
      {isLoading && (
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-t-transparent border-current" />
      )}
      {children}
    </motion.button>
  );
}
