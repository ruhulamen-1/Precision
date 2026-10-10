import React from "react";
import { motion } from "framer-motion";
import {
  Calendar,
  FileText,
  CheckCircle,
  AlertCircle,
  RotateCcw,
  AlertTriangle,
} from "lucide-react";
import { ArchiveDataVerification as ArchiveDataVerificationType } from "../types";
import {
  getLocalDateString as getLocalDateStringUtil,
  normalizeDateStr as normalizeDateStrUtil,
} from "../utils/dateUtils";

export interface TodayActivityTabProps {
  records: ArchiveDataVerificationType[];
  getLocalDateString: () => string;
  normalizeDateStr: (val: any) => string;
}

export const TodayActivityTab: React.FC<TodayActivityTabProps> = ({
  records,
  getLocalDateString,
  normalizeDateStr,
}) => {
  // Optional: use imported functions if they're not provided or just rely on props as requested.
  const localDateStr = getLocalDateString
    ? getLocalDateString()
    : getLocalDateStringUtil();
  const normalize = normalizeDateStr || normalizeDateStrUtil;

  return (
    <motion.div
      key="todayActivity"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="space-y-6"
    >
      <div className="bg-indigo-600 rounded-[2.5rem] p-8 text-white relative overflow-hidden group">
        <div className="relative z-10 space-y-4">
          <div className="inline-flex px-4 py-1.5 bg-white/10 dark:bg-white/5 backdrop-blur-md rounded-full text-[10px] font-black uppercase tracking-widest">
            Today's Activity
          </div>
          <h3 className="text-3xl font-black tracking-tight">
            Today's System Operations
          </h3>
          <p className="text-indigo-100 text-sm max-w-xl opacity-80">
            A summary of data verification events that took place today: entries
            submitted, reviews handled, issues raised, and work completed.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-6 pt-6">
            <div className="space-y-1">
              <div className="text-[10px] font-bold text-indigo-300 uppercase tracking-widest flex items-center gap-1.5">
                <FileText className="w-3 h-3" /> New Entries
              </div>
              <div className="text-4xl font-black text-white">
                {
                  records.filter(
                    (r) => normalize(r.upload_date) === localDateStr,
                  ).length
                }
              </div>
            </div>
            <div className="space-y-1">
              <div className="text-[10px] font-bold text-emerald-300 uppercase tracking-widest flex items-center gap-1.5">
                <CheckCircle className="w-3 h-3" /> Completed
              </div>
              <div className="text-4xl font-black text-white">
                {
                  records.filter(
                    (r) =>
                      r.check_status === "Checked" &&
                      normalize(r.check_date) === localDateStr,
                  ).length
                }
              </div>
            </div>
            <div className="space-y-1">
              <div className="text-[10px] font-bold text-rose-300 uppercase tracking-widest flex items-center gap-1.5">
                <AlertCircle className="w-3 h-3" /> Returned
              </div>
              <div className="text-4xl font-black text-white">
                {
                  records.filter(
                    (r) =>
                      r.check_status === "Returned" &&
                      normalize(r.check_date) === localDateStr,
                  ).length
                }
              </div>
            </div>
            <div className="space-y-1">
              <div className="text-[10px] font-bold text-orange-300 uppercase tracking-widest flex items-center gap-1.5">
                <RotateCcw className="w-3 h-3" /> Re-Audit
              </div>
              <div className="text-4xl font-black text-white">
                {
                  records.filter(
                    (r) =>
                      r.check_status === "Re-Audit" &&
                      normalize(r.check_date) === localDateStr,
                  ).length
                }
              </div>
            </div>
            <div className="space-y-1">
              <div className="text-[10px] font-bold text-amber-300 uppercase tracking-widest flex items-center gap-1.5">
                <AlertTriangle className="w-3 h-3" /> Data Issues
              </div>
              <div className="text-4xl font-black text-white">
                {
                  records.filter(
                    (r) =>
                      (r.errors_count || 0) > 0 &&
                      normalize(r.check_date) === localDateStr,
                  ).length
                }
              </div>
            </div>
          </div>
        </div>
        <Calendar className="absolute -right-8 -bottom-8 w-64 h-64 text-indigo-500/30 group-hover:scale-110 transition-transform duration-700" />
      </div>
    </motion.div>
  );
};
