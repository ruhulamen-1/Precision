import React from "react";
import { motion } from "framer-motion";
import { TrendingUp } from "lucide-react";
import { UserAvatar } from "./UserAvatar";

export interface SummaryEntry {
  name: string;
  totalErrors: number;
  totalSubmittedFiles: number;
  uniqueDays: Set<string>;
  totalRows: number;
  totalDaysWorked: number;
  totalWorkingDays: number;
}

export interface SummaryTabProps {
  summaryData: SummaryEntry[];
  startDate: string;
  endDate: string;
  onStartDateChange: (val: string) => void;
  onEndDateChange: (val: string) => void;
  getUserAvatar: (name?: string | null) => string | null;
}

export const SummaryTab: React.FC<SummaryTabProps> = ({
  summaryData,
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  getUserAvatar,
}) => {
  return (
    <motion.div
      key="summary"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="space-y-8"
    >
      {/* Analytics Header */}
      <div className="bg-white/40 dark:bg-white/5 backdrop-blur-md p-8 rounded-[2.5rem] border border-white dark:border-white/8 shadow-sm dark:shadow-slate-900/50 flex flex-col lg:flex-row lg:items-center justify-between gap-8 group">
        <div className="flex items-center gap-6">
          <div className="h-20 w-20 rounded-[2rem] bg-indigo-600 flex items-center justify-center text-white shadow-2xl shadow-indigo-600/30 group-hover:rotate-6 transition-transform duration-500">
            <TrendingUp className="h-8 w-8" />
          </div>
          <div>
            <h3 className="text-2xl font-black text-slate-900 dark:text-slate-50 tracking-tight">
              Performance Audit
            </h3>
            <p className="text-sm text-slate-400 dark:text-slate-500 font-medium">
              Analyzing submission accuracy and auditor velocity.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <div className="space-y-2">
            <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest block ml-1">
              Period Start
            </span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => onStartDateChange(e.target.value)}
              className="px-6 py-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl text-sm font-black text-slate-700 dark:text-slate-200 outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all"
            />
          </div>
          <div className="space-y-2">
            <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest block ml-1">
              Period End
            </span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => onEndDateChange(e.target.value)}
              className="px-6 py-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl text-sm font-black text-slate-700 dark:text-slate-200 outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all"
            />
          </div>
          <button className="self-end px-8 py-3.5 bg-indigo-600 text-white rounded-2xl text-xs font-black uppercase tracking-widest shadow-2xl shadow-indigo-600/20 active:scale-95 transition-all">
            Generate Insight
          </button>
        </div>
      </div>

      {/* Analytics Grid */}
      <div className="bg-white/40 dark:bg-white/5 backdrop-blur-md rounded-[2.5rem] shadow-sm dark:shadow-slate-900/50 border border-white dark:border-white/8 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[1000px]">
            <thead>
              <tr className="bg-slate-50/50 backdrop-blur-sm border-b border-slate-100 dark:border-slate-800 italic">
                <th className="px-8 py-6 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest text-center w-24">
                  Pos.
                </th>
                <th className="px-8 py-6 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                  Audited Contributor
                </th>
                <th className="px-8 py-6 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest text-center">
                  Quality Score
                </th>
                <th className="px-8 py-6 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest text-center">
                  Volume
                </th>
                <th className="px-8 py-6 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest text-center">
                  Activity
                </th>
                <th className="px-8 py-6 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest text-right">
                  Health Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {summaryData.length > 0 ? (
                summaryData.map((s, idx) => (
                  <tr
                    key={idx}
                    className="hover:bg-slate-50 dark:bg-slate-800/50 group/row transition-all duration-300"
                  >
                    <td className="px-8 py-8 text-center font-mono text-[11px] font-bold text-slate-300">
                      {String(idx + 1).padStart(2, "0")}
                    </td>
                    <td className="px-8 py-8">
                      <div className="flex items-center gap-4">
                        <UserAvatar
                          name={s.name}
                          avatarUrl={getUserAvatar(s.name)}
                          size="lg"
                          className="rounded-[1.25rem] group-hover/row:border-indigo-500 transition-all duration-500 shadow-md dark:shadow-slate-900/50 shadow-slate-200/50"
                        />
                        <div>
                          <div className="text-base font-black text-slate-800 dark:text-slate-100 tracking-tight transition-colors group-hover/row:text-indigo-700">
                            {s.name}
                          </div>
                          <div className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest">
                            Employee UID: {s.name.split(" ")[0].toLowerCase()}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-8 py-8 text-center">
                      <div className="inline-flex flex-col items-center gap-1">
                        <span
                          className={`text-xl font-black tabular-nums transition-colors ${s.totalErrors > 5 ? "text-rose-600" : s.totalErrors > 0 ? "text-amber-500" : "text-emerald-500"}`}
                        >
                          {s.totalErrors}
                        </span>
                        <span className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-tighter">
                          Gross Faults
                        </span>
                      </div>
                    </td>
                    <td className="px-8 py-8 text-center">
                      <div className="inline-flex flex-col items-center gap-1">
                        <span className="text-xl font-black text-indigo-600 tabular-nums">
                          {s.totalSubmittedFiles}
                        </span>
                        <span className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-tighter">
                          Units Audited
                        </span>
                      </div>
                    </td>
                    <td className="px-8 py-8 text-center">
                      <div className="flex items-center justify-center gap-3">
                        <div className="h-1.5 w-24 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-indigo-500 rounded-full transition-all duration-1000"
                            style={{
                              width: `${(s.totalDaysWorked / (s.totalWorkingDays || 1)) * 100}%`,
                            }}
                          />
                        </div>
                        <span className="text-xs font-black text-slate-600 dark:text-slate-300 tabular-nums min-w-[30px]">
                          {s.totalDaysWorked}d
                        </span>
                      </div>
                    </td>
                    <td className="px-8 py-8 text-right">
                      <span
                        className={`inline-flex items-center px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border ${
                          s.totalErrors / (s.totalSubmittedFiles || 1) > 0.1
                            ? "bg-rose-50 text-rose-600 border-rose-100 shadow-sm dark:shadow-slate-900/50 shadow-rose-500/10"
                            : "bg-emerald-50 text-emerald-600 border-emerald-100 shadow-sm dark:shadow-slate-900/50 shadow-emerald-500/10"
                        }`}
                      >
                        {s.totalErrors / (s.totalSubmittedFiles || 1) > 0.1
                          ? "Risk Alert"
                          : "Operational"}
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={15} className="px-4 py-40 text-center">
                    <div className="flex flex-col items-center gap-4 opacity-30">
                      <TrendingUp
                        size={64}
                        className="text-slate-400 dark:text-slate-500 animate-pulse"
                      />
                      <p className="font-black text-slate-500 dark:text-slate-400 uppercase tracking-[0.2em] text-sm">
                        Awaiting Data Cycles
                      </p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </motion.div>
  );
};
