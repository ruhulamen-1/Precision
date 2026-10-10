import React, { useEffect } from "react";

interface FeedbackMessageProps {
  message: string;
  type: "success" | "error" | "info";
  onDismiss: () => void;
}

const getStyles = (type: FeedbackMessageProps["type"]) => {
  switch (type) {
    case "success":
      return {
        bg: "bg-green-100 dark:bg-emerald-900/20",
        border: "border-green-400 dark:border-emerald-900/40",
        text: "text-green-800 dark:text-emerald-200",
        icon: (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-5 w-5"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
              clipRule="evenodd"
            />
          </svg>
        ),
      };
    case "error":
      return {
        bg: "bg-red-100 dark:bg-rose-900/20",
        border: "border-red-400 dark:border-rose-900/40",
        text: "text-red-800 dark:text-rose-200",
        icon: (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-5 w-5"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
              clipRule="evenodd"
            />
          </svg>
        ),
      };
    case "info":
      return {
        bg: "bg-blue-100 dark:bg-blue-900/20",
        border: "border-blue-400 dark:border-blue-900/40",
        text: "text-blue-800 dark:text-blue-200",
        icon: (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-5 w-5"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
              clipRule="evenodd"
            />
          </svg>
        ),
      };
  }
};

const FeedbackMessage: React.FC<FeedbackMessageProps> = ({
  message,
  type,
  onDismiss,
}) => {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 5000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  const styles = getStyles(type);

  return (
    <div
      role="alert"
      className={`fixed bottom-5 right-5 z-50 w-full max-w-sm p-4 rounded-lg shadow-lg dark:shadow-slate-900/50 border-l-4 flex items-start gap-4 fade-in ${styles.bg} ${styles.border} ${styles.text}`}
    >
      <div className="flex-shrink-0">{styles.icon}</div>
      <div className="flex-1 text-sm font-medium">{message}</div>
      <button
        onClick={onDismiss}
        className="flex-shrink-0"
        aria-label="Dismiss message"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-5 w-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      </button>
    </div>
  );
};

export default FeedbackMessage;
