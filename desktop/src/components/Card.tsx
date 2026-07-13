import React from "react";
import { motion } from "framer-motion";

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  glow?: "accent" | "threat" | "safe" | "none";
}

export function Card({ children, glow = "none", className = "", ...props }: CardProps) {
  const glowClasses = {
    accent: "border-l-2 border-l-accent",
    threat: "border-l-2 border-l-danger",
    safe: "border-l-2 border-l-success",
    none: "",
  };

  return (
    <motion.div
      whileHover={{ borderColor: "var(--border-emphasis, #3f3f46)" }}
      transition={{ duration: 0.15 }}
      className={`bg-surface-raised p-5 rounded-lg border border-border transition-colors duration-150 ${glowClasses[glow]} ${className}`}
      {...(props as any)}
    >
      {children}
    </motion.div>
  );
}
