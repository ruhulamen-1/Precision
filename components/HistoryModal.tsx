import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { History, X, Clock, AlertCircle } from "lucide-react";
import {
  ArchiveDataVerification as ArchiveDataVerificationType,
  ArchiveVerificationHistory,
} from "../types";
import { UserAvatar } from "./UserAvatar";
import { formatDateDisplay } from "../utils/dateUtils";
import { CHECK_STATUS } from "../constants";

interface HistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  record: ArchiveDataVerificationType | null;
  historyData: ArchiveVerificationHistory[];
  isLoading: boolean;
  getUserAvatar: (name?: string | null) => string | null;
}

export const HistoryModal: React.FC<HistoryModalProps> = ({
  isOpen,
  onClose,
  record,
  historyData,
  isLoading,
  getUserAvatar,
}) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[100] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="bg-white dark:bg-slate-900 rounded-[3rem] w-full max-w-2xl shadow-2xl relative overflow-hidden flex flex-col max-h-[85vh]"
          >
            <div className="p-8 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between sticky top-0 bg-white dark:bg-slate-900 z-10">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-indigo-600 font-black text-[10px] uppercase tracking-widest">
                  <History className="h-4 w-4" />
                  Audit History
                </div>
                <h2 className="text-xl font-black text-slate-900 dark:text-slate-50 line-clamp-1">
                  {record?.file_name}
                </h2>
              </div>
              <button
                onClick={onClose}
                className="p-3 bg-slate-50 dark:bg-slate-800/50 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:text-slate-300 rounded-2xl transition-all"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-8 pt-2 scrollbar-hide">
              {isLoading ? (
                <div className="py-20 text-center space-y-4">
                  <div className="relative inline-block">
                    <div className="absolute inset-0 bg-indigo-500/20 blur-xl rounded-full animate-pulse" />
                    <Clock className="h-10 w-10 text-indigo-600 animate-[spin_3s_linear_infinite] relative" />
                  </div>
                  <p className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                    Compiling audit trails...
                  </p>
                </div>
              ) : historyData.length === 0 ? (
                <div className="py-20 text-center space-y-4">
                  <div className="h-16 w-16 bg-slate-50 dark:bg-slate-800/50 rounded-3xl flex items-center justify-center mx-auto border border-slate-100 dark:border-slate-800">
                    <AlertCircle className="h-8 w-8 text-slate-300" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-black text-slate-800 dark:text-slate-100 uppercase tracking-widest">
                      No history found
                    </p>
                    <p className="text-xs text-slate-400 dark:text-slate-500 font-medium">
                      This record has not been modified since inception.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="relative ml-4 pl-8 border-l-2 border-slate-100 dark:border-slate-800 py-6 space-y-12">
                  {historyData.map((h) => (
                    <div key={h.id} className="relative group">
                      <div className="absolute -left-[3.1rem] top-0 h-4 w-4 rounded-full bg-white dark:bg-slate-900 border-4 border-indigo-600 group-hover:scale-125 transition-transform duration-300 shadow-[0_0_0_8px_rgba(79,70,229,0.05)]" />
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <UserAvatar
                              name={h.changed_by}
                              avatarUrl={getUserAvatar(h.changed_by)}
                              size="md"
                              className="rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm dark:shadow-slate-900/50 shadow-slate-200/50"
                            />
                            <div>
                              <div className="text-sm font-black text-slate-900 dark:text-slate-50">
                                {h.changed_by}
                              </div>
                              <div className="text-[10px] text-slate-400 dark:text-slate-500 font-bold tabular-nums uppercase tracking-widest">
                                {formatDateDisplay(h.change_date)}{" "}
                                <span className="mx-1">•</span> {h.change_time}
                              </div>
                            </div>
                          </div>
                          <div
                            className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border ${
                              h.new_status === CHECK_STATUS.CHECKED
                                ? "bg-emerald-50 text-emerald-700 border-emerald-100"
                                : h.new_status === CHECK_STATUS.ON_HOLD
                                  ? "bg-amber-50 text-amber-700 border-amber-100"
                                  : h.new_status === CHECK_STATUS.RETURNED
                                    ? "bg-rose-50 text-rose-700 border-rose-100"
                                    : h.new_status === CHECK_STATUS.RE_AUDIT
                                      ? "bg-purple-50 text-purple-700 border-purple-100"
                                      : "bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700"
                            }`}
                          >
                            {h.new_status}
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800 space-y-2">
                            <div className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                              Previous State
                            </div>
                            <div className="text-[11px] font-black text-slate-500 dark:text-slate-400 uppercase">
                              {h.old_status}
                            </div>
                            <div className="text-xs text-slate-400 dark:text-slate-500 font-medium whitespace-pre-wrap italic">
                              {h.old_remarks || "No remarks"}
                            </div>
                          </div>
                          <div className="p-4 bg-indigo-50/30 rounded-2xl border border-indigo-100/50 space-y-2">
                            <div className="text-[9px] font-black text-indigo-400 uppercase tracking-widest">
                              New State
                            </div>
                            <div className="text-[11px] font-black text-indigo-600 uppercase">
                              {h.new_status}
                            </div>
                            <div className="text-xs text-slate-600 dark:text-slate-300 font-black whitespace-pre-wrap italic">
                              {h.new_remarks || "No remarks"}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="p-8 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] text-center">
              End of system audit trail
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
