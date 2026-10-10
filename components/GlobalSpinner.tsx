import React, { useState, useEffect } from "react";
import { useLoading } from "../contexts/LoadingContext";
import Spinner from "./Spinner";

const GlobalSpinner: React.FC = () => {
  const { isLoading } = useLoading();
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;

    if (isLoading) {
      setProgress(0);
      timer = setInterval(() => {
        setProgress((old) => {
          if (old >= 98) {
            if (timer) clearInterval(timer);
            return 98;
          }
          const diff = 2 + Math.random() * 3;
          return Math.min(old + diff, 98);
        });
      }, 100);
    } else {
      setProgress(0);
    }

    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isLoading]);

  if (!isLoading) return null;

  return (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[9999] flex items-center justify-center"
      role="status"
      aria-live="polite"
      aria-label="Loading"
    >
      <Spinner className="h-12" />
    </div>
  );
};

export default GlobalSpinner;
