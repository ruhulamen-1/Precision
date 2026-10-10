import React, { useState, useEffect, useRef, useCallback } from "react";
import { User, DailyTask } from "../types";
import { Bell, X, CheckCircle2, Clock } from "lucide-react";

interface TaskReminderPopupProps {
  currentUser: User;
}

const SHOWN_KEY = "taskReminder_shownKeys";
const CHECK_INTERVAL_MS = 30 * 1000; // 30s — frequent enough to feel instant, cheap enough to poll

const getShownKeys = (): Set<string> => {
  try {
    const raw = localStorage.getItem(SHOWN_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
};

const saveShownKeys = (keys: Set<string>) => {
  try {
    // Keep this from growing forever — cap at the most recent 500 entries.
    const arr = Array.from(keys);
    const trimmed = arr.length > 500 ? arr.slice(arr.length - 500) : arr;
    localStorage.setItem(SHOWN_KEY, JSON.stringify(trimmed));
  } catch {}
};

// Runs globally (mounted once at the app shell level) so a reminder pops up
// no matter which page the user is currently on — not just while they're on
// the My Daily Task screen.
const TaskReminderPopup: React.FC<TaskReminderPopupProps> = ({ currentUser }) => {
  const [queue, setQueue] = useState<DailyTask[]>([]);
  const shownKeysRef = useRef<Set<string>>(getShownKeys());

  useEffect(() => {
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
  }, []);

  const checkReminders = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/daily-tasks?user_id=${currentUser.id}&role=${currentUser.role}`,
      );
      if (!res.ok) return;
      const tasks: DailyTask[] = await res.json();
      const now = new Date();

      const due = tasks.filter((t) => {
        if (!t.reminder_at || t.status === "Done") return false;
        const key = `${t.id}:${t.reminder_at}`;
        if (shownKeysRef.current.has(key)) return false;
        const reminderTime = new Date(t.reminder_at.replace(" ", "T"));
        return reminderTime.getTime() <= now.getTime();
      });

      if (due.length > 0) {
        due.forEach((t) => shownKeysRef.current.add(`${t.id}:${t.reminder_at}`));
        saveShownKeys(shownKeysRef.current);
        setQueue((prev) => [...prev, ...due]);

        if (typeof Notification !== "undefined" && Notification.permission === "granted") {
          due.forEach((t) => {
            try {
              new Notification("Task Reminder", {
                body: t.title,
                tag: `daily-task-${t.id}`,
              });
            } catch {}
          });
        }
      }
    } catch {
      // Reminders are best-effort — a failed poll just tries again next tick.
    }
  }, [currentUser.id, currentUser.role]);

  useEffect(() => {
    checkReminders();
    const interval = setInterval(checkReminders, CHECK_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [checkReminders]);

  const dismiss = (id: number) => setQueue((prev) => prev.filter((t) => t.id !== id));

  const markDone = async (task: DailyTask) => {
    dismiss(task.id);
    try {
      await fetch(`/api/daily-tasks/${task.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...task, status: "Done" }),
      });
    } catch {}
  };

  const snooze = async (task: DailyTask, minutes: number) => {
    dismiss(task.id);
    const newReminder = new Date(Date.now() + minutes * 60000)
      .toISOString()
      .slice(0, 19)
      .replace("T", " ");
    try {
      await fetch(`/api/daily-tasks/${task.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...task, reminder_at: newReminder }),
      });
    } catch {}
  };

  if (queue.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-[300] flex flex-col gap-3 w-[calc(100%-2rem)] max-w-sm">
      {queue.map((task) => (
        <div
          key={task.id}
          className="bg-white border border-indigo-200 shadow-2xl rounded-2xl p-4 animate-in fade-in slide-in-from-right duration-300"
        >
          <div className="flex items-start gap-3">
            <div className="p-2 bg-indigo-100 rounded-xl shrink-0">
              <Bell className="h-4 w-4 text-indigo-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-bold text-indigo-600 uppercase tracking-wide mb-0.5">
                Task Reminder
              </p>
              <p className="text-sm font-bold text-slate-800 mb-1 break-words">
                {task.title}
              </p>
              {task.description && (
                <p className="text-xs text-slate-500 mb-2 line-clamp-2">
                  {task.description}
                </p>
              )}
              <div className="flex flex-wrap items-center gap-1.5 mt-2">
                <button
                  onClick={() => markDone(task)}
                  className="flex items-center gap-1 text-xs font-medium bg-emerald-50 text-emerald-700 hover:bg-emerald-100 px-2.5 py-1 rounded-lg transition-colors"
                >
                  <CheckCircle2 className="h-3 w-3" /> Done
                </button>
                <button
                  onClick={() => snooze(task, 10)}
                  className="flex items-center gap-1 text-xs font-medium bg-slate-50 text-slate-600 hover:bg-slate-100 px-2.5 py-1 rounded-lg transition-colors"
                >
                  <Clock className="h-3 w-3" /> 10 মিনিট পর
                </button>
                <button
                  onClick={() => snooze(task, 60)}
                  className="flex items-center gap-1 text-xs font-medium bg-slate-50 text-slate-600 hover:bg-slate-100 px-2.5 py-1 rounded-lg transition-colors"
                >
                  <Clock className="h-3 w-3" /> ১ ঘন্টা পর
                </button>
              </div>
            </div>
            <button
              onClick={() => dismiss(task.id)}
              className="text-slate-300 hover:text-slate-500 shrink-0"
              title="Dismiss"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};

export default TaskReminderPopup;