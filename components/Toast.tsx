import React, { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle, AlertCircle, X } from "lucide-react";
import { ToastMessage } from "../hooks/useToast";

interface ToastProps {
  toasts: ToastMessage[];
  dismiss: (id: string) => void;
}

export const Toast: React.FC<ToastProps> = ({ toasts, dismiss }) => {
  return (
    <div className="fixed bottom-6 right-6 z-[200] flex flex-col gap-3 pointer-events-none">
      <AnimatePresence>
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} dismiss={dismiss} />
        ))}
      </AnimatePresence>
    </div>
  );
};

const ToastItem: React.FC<{
  toast: ToastMessage;
  dismiss: (id: string) => void;
}> = ({ toast, dismiss }) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      dismiss(toast.id);
    }, 3000);
    return () => clearTimeout(timer);
  }, [toast.id, dismiss]);

  const isSuccess = toast.type === "success";

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9 }}
      className={`pointer-events-auto flex items-center gap-3 rounded-2xl px-5 py-3 shadow-xl backdrop-blur-md border ${
        isSuccess
          ? "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-900/40 text-emerald-800 dark:text-emerald-200"
          : "bg-rose-50 dark:bg-rose-900/20 border-rose-200 dark:border-rose-900/40 text-rose-800 dark:text-rose-200"
      }`}
    >
      {isSuccess ? (
        <CheckCircle className="h-5 w-5" />
      ) : (
        <AlertCircle className="h-5 w-5" />
      )}
      <p className="text-sm font-medium">{toast.message}</p>
      <button
        onClick={() => dismiss(toast.id)}
        className={`ml-2 p-1 rounded-full bg-white/50 dark:bg-white/10 hover:bg-white/80 dark:bg-white/8 transition-colors ${
          isSuccess
            ? "text-emerald-700 dark:text-emerald-300"
            : "text-rose-700 dark:text-rose-300"
        }`}
      >
        <X className="h-4 w-4" />
      </button>
    </motion.div>
  );
};
