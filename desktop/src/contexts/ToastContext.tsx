import React, { createContext, useContext, useState, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, AlertTriangle, Info, X, AlertCircle } from "lucide-react";
import { slideInRight } from "../motion/variants";

export type ToastType = "success" | "error" | "warning" | "info";

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
  duration?: number;
}

interface ToastContextType {
  showToast: (message: string, type?: ToastType, duration?: number) => void;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback((message: string, type: ToastType = "info", duration = 4000) => {
    const id = Math.random().toString(36).substring(2, 9);
    const newToast: Toast = { id, type, message, duration };
    
    setToasts((prev) => [...prev, newToast]);

    if (duration > 0) {
      setTimeout(() => {
        removeToast(id);
      }, duration);
    }
  }, [removeToast]);

  const getIcon = (type: ToastType) => {
    switch (type) {
      case "success":
        return <CheckCircle2 size={16} className="text-success shrink-0" />;
      case "error":
        return <AlertCircle size={16} className="text-danger shrink-0" />;
      case "warning":
        return <AlertTriangle size={16} className="text-warning shrink-0" />;
      case "info":
      default:
        return <Info size={16} className="text-accent shrink-0" />;
    }
  };

  const getBorderColor = (type: ToastType) => {
    switch (type) {
      case "success":
        return "border-success/20";
      case "error":
        return "border-danger/20";
      case "warning":
        return "border-warning/20";
      case "info":
      default:
        return "border-accent/20";
    }
  };

  return (
    <ToastContext.Provider value={{ showToast, removeToast }}>
      {children}

      {/* Floating viewport container */}
      <div className="fixed top-6 right-6 z-[9999] flex flex-col gap-2.5 w-80 max-w-full pointer-events-none select-none">
        <AnimatePresence>
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              layout
              variants={slideInRight}
              initial="initial"
              animate="animate"
              exit="exit"
              className={`p-3.5 rounded-lg border bg-surface-raised/95 backdrop-blur-md shadow-2xl flex items-start gap-3 pointer-events-auto border-border ${getBorderColor(
                toast.type
              )}`}
            >
              {getIcon(toast.type)}
              <div className="flex-1 flex flex-col gap-0.5">
                <p className="text-xs font-medium text-zinc-150 font-sans leading-relaxed">
                  {toast.message}
                </p>
              </div>
              <button
                onClick={() => removeToast(toast.id)}
                className="text-zinc-500 hover:text-zinc-350 transition-colors p-0.5"
              >
                <X size={14} />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used inside a ToastProvider");
  }
  return context;
}
