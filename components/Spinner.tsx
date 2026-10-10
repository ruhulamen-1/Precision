import React, { useState, useEffect, useRef } from "react";
import { useLoading } from "../contexts/LoadingContext";

const WORD = "PRECISION";
const CHAR_DELAYS = [0, 120, 220, 310, 390, 460, 520, 570, 610];
const CYCLE_MS = 2800;

export interface SpinnerProps {
  className?: string;
  size?: "sm" | "md" | "lg";
}

const Spinner: React.FC<SpinnerProps> = ({ className, size }) => {
  const { isLoading } = useLoading();
  const [visibleCount, setVisibleCount] = useState(0);
  const [showCursor, setShowCursor] = useState(true);
  const cycleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const charTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearAll = () => {
    if (cycleRef.current) clearTimeout(cycleRef.current);
    charTimersRef.current.forEach((t) => clearTimeout(t));
    charTimersRef.current = [];
  };

  const runCycle = () => {
    setVisibleCount(0);

    // reveal each character
    CHAR_DELAYS.forEach((delay, i) => {
      const t = setTimeout(() => setVisibleCount(i + 1), delay);
      charTimersRef.current.push(t);
    });

    // pause at full word, then restart
    cycleRef.current = setTimeout(() => {
      charTimersRef.current = [];
      runCycle();
    }, CYCLE_MS);
  };

  // cursor blink
  useEffect(() => {
    const id = setInterval(() => setShowCursor((v) => !v), 530);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (isLoading) {
      runCycle();
    } else {
      clearAll();
      setVisibleCount(0);
    }
    return clearAll;
  }, [isLoading]);

  if (!isLoading) return null;

  return (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[9999] flex items-center justify-center"
      role="status"
      aria-live="polite"
      aria-label="Loading"
    >
      <div className="flex flex-col items-center gap-5">
        {/* Typewriter word */}
        <div className="flex items-end gap-[1px]">
          {WORD.split("").map((char, i) => (
            <span
              key={i}
              style={{
                display: "inline-block",
                fontSize: i === 0 ? "3rem" : "2rem",
                fontWeight: 700,
                color: "#EA580C",
                opacity: visibleCount > i ? 1 : 0,
                transform:
                  visibleCount > i ? "translateY(0)" : "translateY(8px)",
                transition: "opacity 0.12s ease, transform 0.12s ease",
                letterSpacing: "-0.5px",
                lineHeight: 1,
              }}
            >
              {char}
            </span>
          ))}

          {/* blinking cursor */}
          <span
            style={{
              display: "inline-block",
              width: "2px",
              height: "2rem",
              background: "#EA580C",
              marginLeft: "3px",
              marginBottom: "2px",
              opacity: showCursor ? 1 : 0,
              transition: "opacity 0.1s",
              borderRadius: "1px",
            }}
          />
        </div>

        {/* Tagline */}
        <p
          style={{
            fontSize: "11px",
            fontWeight: 500,
            color: "rgba(255,255,255,0.55)",
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            opacity: visibleCount === WORD.length ? 1 : 0,
            transition: "opacity 0.4s ease 0.1s",
          }}
        >
          Eyes on Every Site
        </p>

        {/* Progress dots */}
        <div style={{ display: "flex", gap: "6px" }}>
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              style={{
                width: "5px",
                height: "5px",
                borderRadius: "50%",
                background: "#EA580C",
                opacity: 0.3,
                animation: `dot-pulse 1.2s ease-in-out ${i * 0.2}s infinite`,
              }}
            />
          ))}
        </div>
      </div>

      <style>{`
        @keyframes dot-pulse {
          0%, 100% { opacity: 0.3; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.3); }
        }
      `}</style>
    </div>
  );
};

export default Spinner;
