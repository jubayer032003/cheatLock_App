import React, { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { dialogOverlayVariants, dialogContentVariants } from "../../motion/variants";

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
}

export function Dialog({ open, onClose, title, description, children }: DialogProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    if (open) {
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Overlay */}
          <motion.div
            variants={dialogOverlayVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            onClick={onClose}
            className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
          />

          {/* Modal Container */}
          <motion.div
            variants={dialogContentVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            className="relative bg-surface-raised border border-border rounded-xl p-6 shadow-2xl max-w-md w-full z-10 flex flex-col gap-4"
          >
            {/* Close Button */}
            <button
              onClick={onClose}
              className="absolute top-4 right-4 p-1 rounded-md text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
            >
              <X size={16} />
            </button>

            {/* Header */}
            <div className="flex flex-col gap-1 pr-6">
              <h3 className="text-base font-semibold text-zinc-50 tracking-tight">
                {title}
              </h3>
              {description && (
                <p className="text-sm text-zinc-400">
                  {description}
                </p>
              )}
            </div>

            {/* Content */}
            <div className="flex flex-col gap-4">
              {children}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
