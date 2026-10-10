import React, { useEffect, useMemo } from "react";
import { AnimatePresence, motion } from "motion/react";
import { X, Bell } from "lucide-react";
import { User } from "../types";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LiveActivityNotification {
  id?: string;
  user_id?: string | number;
  date?: string;
  time?: string;
  remarks?: string;
  screenshots?: string | string[];
  employeeNames?: string; // optional pre-resolved names
}

interface LiveNotificationPopupProps {
  activity: LiveActivityNotification | null;
  onClose: () => void;
  allProfiles?: User[]; // all app users — used to resolve user_id → name/avatar
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const safeJsonParse = <T,>(value: string, fallback: T): T => {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

const resolveImageUrl = (screenshots: string | string[] | undefined): string | null => {
  const list: string[] =
    typeof screenshots === "string"
      ? safeJsonParse<string[]>(screenshots, [])
      : screenshots ?? [];

  if (!list.length) return null;
  const key = list[0];
  if (!key) return null;
  if (key.startsWith("http") || key.startsWith("/uploads")) return key;
  return `/api/media/${key}`;
};

// ─── Component ────────────────────────────────────────────────────────────────

const LiveNotificationPopup: React.FC<LiveNotificationPopupProps> = ({
  activity,
  onClose,
  allProfiles = [],
}) => {
  // Auto-close after 10 s — intentionally empty dep array so timer never resets
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!activity) return;
    const t = setTimeout(onClose, 10_000);
    return () => clearTimeout(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const imageUrl = useMemo(
    () => resolveImageUrl(activity?.screenshots),
    [activity]
  );

  // Resolve the user profile who triggered the activity
  const profile = useMemo(() => {
    if (!activity?.user_id || !allProfiles.length) return null;
    return allProfiles.find(
      (p) => String(p.id) === String(activity.user_id)
    ) ?? null;
  }, [allProfiles, activity]);

  // Avatar: prefer activity screenshot, then user avatar
  const displayImage = imageUrl ?? (profile?.avatar || null);

  if (!activity) return null;

  return (
    <AnimatePresence>
      <motion.div
        key="live-notification"
        initial={{ opacity: 0, y: -56, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -56, scale: 0.96 }}
        transition={{ type: "spring", stiffness: 280, damping: 24 }}
        className="fixed top-4 left-1/2 -translate-x-1/2 z-[9999] w-[calc(100%-2rem)] max-w-2xl bg-white rounded-2xl shadow-2xl border-l-8 border-orange-500 overflow-hidden"
        style={{ boxShadow: "0 12px 48px rgba(0,0,0,0.18)" }}
      >
        {/* Countdown progress bar */}
        <motion.div
          className="h-0.5 bg-orange-400 origin-left"
          initial={{ scaleX: 1 }}
          animate={{ scaleX: 0 }}
          transition={{ duration: 10, ease: "linear" }}
        />

        <div className="p-5 flex items-center gap-5">

          {/* Thumbnail / Avatar */}
          <div className="flex-shrink-0 h-20 w-20 rounded-xl overflow-hidden border border-orange-100 bg-orange-50 flex items-center justify-center shadow-sm">
            {displayImage ? (
              <img
                src={displayImage}
                alt="Activity"
                className="w-full h-full object-cover"
              />
            ) : (
              <Bell className="h-9 w-9 text-orange-400" />
            )}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-bold text-orange-500 uppercase tracking-widest mb-0.5">
              🔴 New Casual Activity Detected
            </p>

            {/* Who logged it */}
            {profile && (
              <p className="text-xs font-semibold text-slate-500 mb-0.5 truncate">
                Logged by&nbsp;
                <span className="text-slate-700">{profile.name}</span>
                {profile.department && (
                  <span className="text-slate-400"> · {profile.department}</span>
                )}
              </p>
            )}

            <h4 className="text-sm font-extrabold text-slate-800 truncate">
              {activity.date ?? "—"}
              &nbsp;·&nbsp;
              {activity.time ?? "—"}
            </h4>

            {activity.remarks && (
              <div
                className="mt-1.5 text-xs text-slate-500 line-clamp-2 leading-snug"
                dangerouslySetInnerHTML={{ __html: activity.remarks }}
              />
            )}

            {activity.employeeNames && (
              <p className="mt-1 text-[10px] text-slate-400 truncate">
                Employees: <span className="font-medium text-slate-600">{activity.employeeNames}</span>
              </p>
            )}
          </div>

          {/* Close button */}
          <button
            onClick={onClose}
            aria-label="Dismiss notification"
            className="flex-shrink-0 p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

export default LiveNotificationPopup;
