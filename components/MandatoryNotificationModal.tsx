import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Player } from "@lottiefiles/react-lottie-player";
import { ArrowRight, Bell } from "lucide-react";
import { AppNotification } from "../types";
import notificationAlertAnimation from "../src/notification-alert.json";
import {
  loadAnimationData,
  DEFAULT_NOTIFICATION_ANIMATION_KEY,
} from "./notificationAnimations";

interface MandatoryNotificationModalProps {
  notification: AppNotification | null;
  onAcknowledge: (notification: AppNotification) => void;
  onOpen?: (notification: AppNotification) => void;
}

// Full-screen, non-dismissible (no backdrop click / no Escape) modal for
// admin-sent custom notifications. The user must acknowledge it before they
// can continue using the app.
const MandatoryNotificationModal: React.FC<MandatoryNotificationModalProps> = ({
  notification,
  onAcknowledge,
  onOpen,
}) => {
  const [animationData, setAnimationData] = useState<any>(notificationAlertAnimation);

  // Resolve the animation key (if any) sent by the admin in `link_state.animation`
  // and fetch the matching Lottie JSON from `src/` via the server API.
  useEffect(() => {
    let animationKey: string | null = null;
    if (notification?.link_state) {
      try {
        const parsed = JSON.parse(notification.link_state);
        animationKey = parsed?.animation || null;
      } catch {
        animationKey = null;
      }
    }

    if (!animationKey || animationKey === DEFAULT_NOTIFICATION_ANIMATION_KEY) {
      setAnimationData(notificationAlertAnimation);
      return;
    }

    let cancelled = false;
    loadAnimationData(animationKey)
      .then((data) => {
        if (!cancelled) setAnimationData(data);
      })
      .catch(() => {
        if (!cancelled) setAnimationData(notificationAlertAnimation);
      });

    return () => {
      cancelled = true;
    };
  }, [notification]);

  return (
    <AnimatePresence>
      {notification && (
        <motion.div
          className="fixed inset-0 z-[999] flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          {/* Backdrop — intentionally not clickable to dismiss */}
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" />

          <motion.div
            className="relative z-10 w-full max-w-md bg-white/30 dark:bg-slate-900/30 backdrop-blur-2xl rounded-3xl shadow-2xl ring-1 ring-white/40 dark:ring-white/10 border border-white/20 overflow-hidden flex flex-col items-center text-center"
            initial={{ scale: 0.85, opacity: 0, y: 30 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            transition={{ type: "spring", stiffness: 280, damping: 22 }}
          >
            {/* Glass sheen overlay */}
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/40 via-white/5 to-transparent dark:from-white/10 dark:via-white/0 dark:to-transparent" />

            <div className="relative w-full pt-6">
              <Player
                src={animationData as any}
                autoplay
                loop
                style={{ width: 220, height: 190, margin: "0 auto" }}
                background="transparent"
              />
            </div>

            <div className="relative px-8 pb-8 -mt-2 space-y-2 w-full">
              <div className="flex items-center justify-center gap-2">
                <Bell className="h-4 w-4 text-orange-500" />
                <span className="text-[11px] font-black uppercase tracking-widest text-orange-600">
                  New Notification
                </span>
              </div>

              <h3 className="text-xl font-black text-slate-800 dark:text-white tracking-tight drop-shadow-sm">
                {notification.title}
              </h3>

              {notification.message && (
                <p className="text-sm text-slate-600 dark:text-slate-200 leading-relaxed">
                  {notification.message}
                </p>
              )}

              {notification.sender_name && (
                <p className="text-[11px] text-slate-500 dark:text-slate-300 uppercase font-bold tracking-wider pt-1">
                  From {notification.sender_name}
                </p>
              )}

              <div className="pt-4 flex flex-col gap-2">
                {notification.link_view && (
                  <button
                    onClick={() => {
                      onOpen?.(notification);
                    }}
                    className="w-full flex items-center justify-center gap-2 bg-orange-600 hover:bg-orange-700 text-white px-6 py-3 rounded-2xl text-sm font-black uppercase tracking-widest shadow-lg shadow-orange-600/20 active:scale-95 transition-all"
                  >
                    Open
                    <ArrowRight className="h-4 w-4" />
                  </button>
                )}
                <button
                  onClick={() => onAcknowledge(notification)}
                  className={`w-full px-6 py-3 rounded-2xl text-sm font-black uppercase tracking-widest transition-all active:scale-95 ${
                    notification.link_view
                      ? "bg-white/40 dark:bg-white/10 text-slate-700 dark:text-slate-100 hover:bg-white/60 dark:hover:bg-white/20 backdrop-blur-md border border-white/30"
                      : "bg-orange-600 hover:bg-orange-700 text-white shadow-lg shadow-orange-600/20"
                  }`}
                >
                  {notification.link_view ? "Dismiss" : "Got it"}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default MandatoryNotificationModal;
