import React from "react";
import { motion } from "framer-motion";
import { User, Search } from "lucide-react";
import { User as UserType } from "../types";
import { UserAvatar } from "./UserAvatar";

export interface AuditorPerformanceData {
  totalPending: number;
  stats: {
    name: string;
    checked: number;
    returned: number;
    reAudit: number;
    onHold: number;
    dataIssues: number;
    total: number;
  }[];
}

export interface AuditorInsightsTabProps {
  auditorPerformance: AuditorPerformanceData | null;
  currentUser: UserType | null | undefined;
  getUserAvatar: (name?: string | null) => string | null;
}

export const AuditorInsightsTab: React.FC<AuditorInsightsTabProps> = ({
  auditorPerformance,
  currentUser,
  getUserAvatar,
}) => {
  return (
    <motion.div
      key="auditorInsights"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="space-y-8"
    >
      {/* Dashboard Header */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="col-span-1 md:col-span-2 bg-indigo-600 rounded-[2.5rem] p-8 text-white relative overflow-hidden group">
          <div className="relative z-10 space-y-4">
            <div className="inline-flex px-4 py-1.5 bg-white/10 dark:bg-white/5 backdrop-blur-md rounded-full text-[10px] font-black uppercase tracking-widest">
              Auditor Command Center
            </div>
            <h3 className="text-3xl font-black tracking-tight">
              System-Wide Verification Progress
            </h3>
            <p className="text-indigo-100 text-sm max-w-md opacity-80">
              Monitor the current audit workload across all departments and
              track auditor performance metrics.
            </p>

            <div className="flex items-center gap-8 pt-4">
              <div>
                <div className="text-4xl font-black tabular-nums">
                  {auditorPerformance?.totalPending || 0}
                </div>
                <div className="text-[10px] font-black uppercase tracking-widest text-indigo-200">
                  Global Pending Audit
                </div>
              </div>
              <div className="h-10 w-px bg-white/20" />
              <div>
                <div className="text-4xl font-black tabular-nums">
                  {auditorPerformance?.stats.length || 0}
                </div>
                <div className="text-[10px] font-black uppercase tracking-widest text-indigo-200">
                  Active Auditors
                </div>
              </div>
            </div>
          </div>
          <User className="absolute -right-8 -bottom-8 h-64 w-64 opacity-10 -rotate-12 group-hover:rotate-0 transition-transform duration-700" />
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] border border-slate-200 dark:border-slate-700 p-8 shadow-sm dark:shadow-slate-900/50 flex flex-col justify-between">
          <div className="space-y-2">
            <h4 className="text-sm font-black text-slate-900 dark:text-slate-50 uppercase tracking-widest">
              My Workflow
            </h4>
            <p className="text-xs text-slate-400 dark:text-slate-500 font-medium">
              Your assigned verification contributions.
            </p>
          </div>

          <div className="space-y-4 mt-6">
            {(() => {
              const myStats = auditorPerformance?.stats.find(
                (s) => s.name === currentUser?.name,
              );
              return (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-tighter">
                      Completed
                    </span>
                    <span className="text-sm font-black text-emerald-600 tabular-nums">
                      {myStats?.checked || 0}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-tighter">
                      Returned
                    </span>
                    <span className="text-sm font-black text-rose-500 tabular-nums">
                      {myStats?.returned || 0}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-tighter">
                      Under Re-Audit
                    </span>
                    <span className="text-sm font-black text-blue-500 tabular-nums">
                      {myStats?.reAudit || 0}
                    </span>
                  </div>
                  <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                    <span className="text-xs font-black text-slate-900 dark:text-slate-50 uppercase tracking-widest">
                      Total Handled
                    </span>
                    <span className="text-base font-black text-indigo-600 tabular-nums">
                      {myStats?.total || 0}
                    </span>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      </div>

      {/* Auditors Table */}
      <div className="bg-white/40 dark:bg-white/5 backdrop-blur-md rounded-[2.5rem] shadow-sm dark:shadow-slate-900/50 border border-white dark:border-white/8 overflow-hidden">
        <div className="px-8 py-6 border-b border-white/50 dark:border-white/10 flex items-center justify-between">
          <h3 className="text-lg font-black text-slate-800 dark:text-slate-100 uppercase tracking-widest">
            Auditor Workload
          </h3>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">
              Live Monitoring
            </span>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[1000px]">
            <thead>
              <tr className="bg-slate-50/50 backdrop-blur-sm border-b border-slate-100 dark:border-slate-800 italic">
                <th className="px-8 py-6 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                  Auditor Name
                </th>
                <th className="px-8 py-6 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest text-center">
                  Checked
                </th>
                <th className="px-8 py-6 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest text-center">
                  Returned
                </th>
                <th className="px-8 py-6 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest text-center">
                  Re-Audit
                </th>
                <th className="px-8 py-6 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest text-center">
                  Hold
                </th>
                <th className="px-8 py-6 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest text-center">
                  Data Issues
                </th>
                <th className="px-8 py-6 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest text-right">
                  Total Verified
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {auditorPerformance?.stats.map((s, idx) => (
                <tr
                  key={idx}
                  className="hover:bg-white dark:bg-slate-900 group/row transition-all duration-300"
                >
                  <td className="px-8 py-6">
                    <div className="flex items-center gap-3">
                      <UserAvatar
                        name={s.name}
                        avatarUrl={getUserAvatar(s.name)}
                        size="md"
                        className="rounded-2xl shadow-sm dark:shadow-slate-900/50 shadow-slate-200/50 border-slate-200 dark:border-slate-700"
                      />
                      <div>
                        <div className="text-sm font-black text-slate-900 dark:text-slate-50">
                          {s.name}{" "}
                          {s.name === currentUser?.name && (
                            <span className="ml-1 text-[10px] text-indigo-500">
                              (You)
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest italic">
                          Verification Specialist
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-8 py-6 text-center tabular-nums font-black text-emerald-600">
                    {s.checked}
                  </td>
                  <td className="px-8 py-6 text-center tabular-nums font-black text-rose-500">
                    {s.returned}
                  </td>
                  <td className="px-8 py-6 text-center tabular-nums font-black text-blue-500">
                    {s.reAudit}
                  </td>
                  <td className="px-8 py-6 text-center tabular-nums font-black text-amber-500">
                    {s.onHold}
                  </td>
                  <td className="px-8 py-6 text-center tabular-nums font-black text-rose-600/60 bg-rose-50/30">
                    {s.dataIssues}
                  </td>
                  <td className="px-8 py-6 text-right tabular-nums font-black text-slate-800 dark:text-slate-100 text-lg">
                    {s.total}
                  </td>
                </tr>
              ))}
              {auditorPerformance?.stats.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-8 py-32 text-center">
                    <div className="opacity-30 space-y-4">
                      <Search className="h-12 w-12 mx-auto text-slate-400 dark:text-slate-500" />
                      <p className="font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest text-xs">
                        No active verification instances found
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
