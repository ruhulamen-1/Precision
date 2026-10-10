import React from "react";

interface StatusBadgeProps {
  status: string;
  type?: "check" | "upload";
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  type = "check",
}) => {
  if (type === "upload") {
    return (
      <div
        className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border ${status === "Old Upload" ? "bg-amber-50 text-amber-600 border-amber-100" : "bg-indigo-50 text-indigo-600 border-indigo-100"}`}
      >
        {status || "New Upload"}
      </div>
    );
  }

  return (
    <div
      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border transition-all ${
        status === "Checked"
          ? "bg-emerald-100 text-emerald-700 border-emerald-200 shadow-sm shadow-emerald-500/10"
          : status === "On Hold"
            ? "bg-amber-100 text-amber-700 border-amber-200 shadow-sm shadow-amber-500/10"
            : status === "Returned"
              ? "bg-rose-100 text-rose-700 border-rose-200 shadow-sm shadow-rose-500/10"
              : status === "Re-Audit"
                ? "bg-purple-100 text-purple-700 border-purple-200 shadow-sm shadow-purple-500/10"
                : "bg-slate-100 text-slate-500 border-slate-200"
      }`}
    >
      <div
        className={`h-1 w-1 rounded-full ${status === "Checked" ? "bg-emerald-400" : status === "On Hold" ? "bg-amber-400" : status === "Returned" ? "bg-rose-400" : status === "Re-Audit" ? "bg-purple-400" : "bg-slate-400"}`}
      />
      {status}
    </div>
  );
};
