import React, { useState, useMemo, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Search,
  X,
  Filter,
  Download,
  Check,
  History,
  Trash2,
  Clock,
  Plus,
  AlertCircle,
  ChevronRight,
} from "lucide-react";
import {
  ArchiveDataVerification as ArchiveDataVerificationType,
  AllEmployee,
  User as UserType,
} from "../types";
import { DataTypeOption } from "./NewEntryForm";
import { SkeletonRow } from "./TableSkeleton";
import { UserAvatar } from "./UserAvatar";
import { StatusBadge } from "./StatusBadge";
import { CHECK_STATUS, UPLOAD_STATUS, USER_ROLE } from "../constants";
import {
  getLocalDateString,
  getLocalTimeString,
  normalizeDateStr,
} from "../utils/dateUtils";

export interface EditFields {
  file_name: string;
  data_type: string;
  submitted_by: string;
  check_status: "Pending" | "Checked" | "On Hold" | "Returned" | "Re-Audit";
  check_date: string;
  check_time: string;
  checked_by: string;
  files_count: number;
  errors_count: number;
  remarks_on_errors: string;
  user_remarks: string;
  status: "Old Upload" | "New Upload";
  upload_date: string;
  upload_time: string;
}

export interface RecordsTableProps {
  records: ArchiveDataVerificationType[];
  loading: boolean;
  currentUser: UserType | null | undefined;
  allEmployees: AllEmployee[];
  allUsers: UserType[];
  dataTypeOptions: DataTypeOption[];
  isAdding: boolean;
  advPerms: { view: boolean; edit: boolean; audit: boolean; editAll?: boolean };
  onAdd: (record: any) => Promise<void>;
  onUpdate: (id: number, fields: EditFields) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  onOpenHistory: (record: ArchiveDataVerificationType) => void;
  onManageTypes: () => void;
  onCancelAdd?: () => void;
  onToggleAdd?: () => void;
  initialFilters?: {
    checkStatus?: string;
    type?: string;
    user?: string;
    auditor?: string;
    errorOnly?: boolean;
  };
}

export const RecordsTable: React.FC<RecordsTableProps> = ({
  records,
  loading,
  currentUser,
  allEmployees,
  allUsers,
  dataTypeOptions,
  isAdding,
  advPerms,
  onAdd,
  onUpdate,
  onDelete,
  onOpenHistory,
  onManageTypes,
  onCancelAdd,
  onToggleAdd,
  initialFilters,
}) => {
  const isAdmin = currentUser?.role === USER_ROLE.ADMIN;
  const isSuperAdmin = currentUser?.role === USER_ROLE.SUPER_ADMIN;
  // Per-user "Edit All" toggle (or super admin): every column of every row is editable
  const fullEdit = isSuperAdmin || !!advPerms.editAll;

  // Deduplicate to prevent React key warnings (DB may return duplicate rows)
  const dedupedUsers = useMemo(() => {
    const seen = new Set();
    return allUsers.filter(u => { if (seen.has(u.id)) return false; seen.add(u.id); return true; });
  }, [allUsers]);
  const dedupedEmployees = useMemo(() => {
    const seen = new Set();
    return allEmployees.filter(e => { if (seen.has(e.id)) return false; seen.add(e.id); return true; });
  }, [allEmployees]);

  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [checkStatusFilter, setCheckStatusFilter] = useState<string>(
    initialFilters?.checkStatus || "all",
  );
  const [uploadStatusFilter, setUploadStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>(
    initialFilters?.type || "all",
  );
  const [userFilter, setUserFilter] = useState<string>(
    initialFilters?.user || "all",
  );
  const [auditorFilter, setAuditorFilter] = useState<string>(
    initialFilters?.auditor || "all",
  );
  const [errorOnlyFilter, setErrorOnlyFilter] = useState<boolean>(
    initialFilters?.errorOnly || false,
  );
  // Report Date Range Filter (Upload Date)
  const [reportDateFrom, setReportDateFrom] = useState<string>("");
  const [reportDateTo, setReportDateTo] = useState<string>("");

  // Summary cards (parent) drive these filters via `initialFilters`. Since the
  // table stays mounted while the active tab doesn't change, re-sync the
  // filter state whenever the parent pushes new values (e.g. clicking a
  // different summary card while already on the Records tab).
  useEffect(() => {
    setCheckStatusFilter(initialFilters?.checkStatus || "all");
    setErrorOnlyFilter(initialFilters?.errorOnly || false);
    setUserFilter(initialFilters?.user || "all");
    setTypeFilter(initialFilters?.type || "all");
    setAuditorFilter(initialFilters?.auditor || "all");
  }, [
    initialFilters?.checkStatus,
    initialFilters?.errorOnly,
    initialFilters?.user,
    initialFilters?.type,
    initialFilters?.auditor,
  ]);

  const [editId, setEditId] = useState<number | null>(null);
  const [editFields, setEditFields] = useState<EditFields>({
    file_name: "",
    data_type: "",
    submitted_by: "",
    check_status: "Pending",
    check_date: "",
    check_time: "",
    checked_by: "",
    files_count: 0,
    errors_count: 0,
    remarks_on_errors: "",
    user_remarks: "",
    status: "New Upload",
    upload_date: "",
    upload_time: "",
  });

  const [newData, setNewData] = useState<Partial<ArchiveDataVerificationType>>({
    data_type: "Archive",
    file_name: "",
    submitted_by: currentUser?.name || "",
    status: "New Upload",
    upload_date: getLocalDateString(),
    upload_time: getLocalTimeString(),
    files_count: 0,
    errors_count: 0,
    check_status: "Pending",
  });

  const uniqueTypes = useMemo(
    () => Array.from(new Set(records.map((r) => r.data_type).filter(Boolean))),
    [records],
  );
  const uniqueUsers = useMemo(
    () =>
      Array.from(new Set(records.map((r) => r.submitted_by).filter(Boolean))),
    [records],
  );
  const uniqueAuditors = useMemo(
    () => Array.from(new Set(records.map((r) => r.checked_by).filter(Boolean))),
    [records],
  );

  const filteredRecords = useMemo(() => {
    return records.filter((r) => {
      const isAuditUser = advPerms.audit && !isAdmin && !isSuperAdmin;
      const matchesGlobal =
        (isAdmin ||
          fullEdit ||
          r.submitted_by === currentUser?.name ||
          (isAuditUser && r.checked_by === currentUser?.name) ||
          (isAuditUser && (!r.checked_by || r.checked_by.trim() === ""))) &&
        (r.file_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          r.submitted_by?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          r.data_type?.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchesType = typeFilter === "all" || r.data_type === typeFilter;
      const matchesUser = userFilter === "all" || r.submitted_by === userFilter;
      const matchesCheckStatus =
        checkStatusFilter === "all" || r.check_status === checkStatusFilter;
      const matchesUploadStatus =
        uploadStatusFilter === "all" || r.status === uploadStatusFilter;
      const matchesAuditor =
        auditorFilter === "all" || r.checked_by === auditorFilter;
      const matchesError = !errorOnlyFilter || (r.errors_count ?? 0) > 0;

      const recordUploadDate = normalizeDateStr(r.upload_date);
      const matchesDateFrom =
        !reportDateFrom || (recordUploadDate && recordUploadDate >= reportDateFrom);
      const matchesDateTo =
        !reportDateTo || (recordUploadDate && recordUploadDate <= reportDateTo);

      return (
        matchesGlobal &&
        matchesType &&
        matchesUser &&
        matchesCheckStatus &&
        matchesUploadStatus &&
        matchesAuditor &&
        matchesError &&
        matchesDateFrom &&
        matchesDateTo
      );
    });
  }, [
    records,
    isAdmin,
    isSuperAdmin,
    fullEdit,
    currentUser,
    searchQuery,
    typeFilter,
    userFilter,
    checkStatusFilter,
    uploadStatusFilter,
    auditorFilter,
    errorOnlyFilter,
    reportDateFrom,
    reportDateTo,
  ]);

  // Whenever the filtered set changes (search, filters, or the underlying
  // records themselves), jump back to page 1 so the user isn't stranded on
  // a page that no longer exists.
  useEffect(() => {
    setCurrentPage(1);
  }, [
    searchQuery,
    typeFilter,
    userFilter,
    checkStatusFilter,
    uploadStatusFilter,
    auditorFilter,
    errorOnlyFilter,
    reportDateFrom,
    reportDateTo,
  ]);

  const totalPages = Math.max(1, Math.ceil(filteredRecords.length / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const paginatedRecords = useMemo(
    () =>
      filteredRecords.slice(
        (safeCurrentPage - 1) * pageSize,
        safeCurrentPage * pageSize,
      ),
    [filteredRecords, safeCurrentPage, pageSize],
  );

  // Quick summary of currently filtered records (respects date range & all other filters)
  const filterSummary = useMemo(() => {
    const totalRecords = filteredRecords.length;
    const totalFiles = filteredRecords.reduce(
      (sum, r) => sum + (r.files_count || 0),
      0,
    );
    const totalErrors = filteredRecords.reduce(
      (sum, r) => sum + (r.errors_count || 0),
      0,
    );
    const checked = filteredRecords.filter(
      (r) => r.check_status === "Checked",
    ).length;
    const pending = filteredRecords.filter(
      (r) => r.check_status === "Pending",
    ).length;
    const returned = filteredRecords.filter(
      (r) => r.check_status === "Returned",
    ).length;
    const onHold = filteredRecords.filter(
      (r) => r.check_status === "On Hold",
    ).length;

    return {
      totalRecords,
      totalFiles,
      totalErrors,
      checked,
      pending,
      returned,
      onHold,
    };
  }, [filteredRecords]);

  const isDateRangeActive = reportDateFrom !== "" || reportDateTo !== "";

  const handleExportData = () => {
    if (filteredRecords.length === 0) return;

    const headers = [
      "Data ID",
      "Data Type",
      "File Name",
      "Submitted By",
      "Status",
      "Upload Date",
      "Upload Time",
      "Received By",
      "Check Date",
      "Check Time",
      "No. Of Files",
      "No. Of Errors",
      "Remarks/Cause of Errors",
      "User Remarks",
      "Check Status",
    ];

    const csvRows = filteredRecords.map((r) => {
      return [
        r.id?.toString() || "-",
        r.data_type || "-",
        r.file_name || "-",
        r.submitted_by || "-",
        r.status || "-",
        normalizeDateStr(r.upload_date) || "-",
        r.upload_time || "-",
        r.checked_by || "-",
        r.check_date ? normalizeDateStr(r.check_date) : "-",
        r.check_time || "-",
        r.files_count?.toString() || "0",
        r.errors_count?.toString() || "0",
        r.remarks_on_errors || "-",
        r.user_remarks || "-",
        r.check_status || "-",
      ]
        .map((val) => `"${val.toString().replace(/"/g, '""')}"`)
        .join(",");
    });

    const csvContent = [headers.join(","), ...csvRows].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    const rangeSuffix =
      reportDateFrom || reportDateTo
        ? `_${reportDateFrom || "start"}_to_${reportDateTo || "end"}`
        : `_${new Date().toISOString().split("T")[0]}`;
    link.setAttribute(
      "download",
      `Archive_Data_Verification_Report${rangeSuffix}.csv`,
    );
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const formatDateDisplay = (dateStr: string | null | undefined) => {
    if (!dateStr) return "-";
    const normalized = normalizeDateStr(dateStr);
    try {
      const parts = normalized.split("-");
      if (parts.length === 3) {
        const year = parseInt(parts[0]);
        const month = parseInt(parts[1]) - 1;
        const day = parseInt(parts[2]);
        const date = new Date(year, month, day);
        if (!isNaN(date.getTime())) {
          return date.toLocaleDateString("en-GB", {
            day: "2-digit",
            month: "short",
            year: "numeric",
          });
        }
      }
      return normalized;
    } catch (e) {
      return normalized;
    }
  };

  const handleNewSave = async () => {
    if (!newData.file_name) {
      alert("Please provide a file name.");
      return;
    }
    const payload = {
      ...newData,
      upload_date: `${newData.upload_date}T00:00:00.000Z`,
      check_date: newData.check_date
        ? `${newData.check_date}T00:00:00.000Z`
        : null,
    };
    await onAdd(payload);
    setNewData({
      data_type: "Archive",
      file_name: "",
      submitted_by: currentUser?.name || "",
      status: "New Upload",
      upload_date: getLocalDateString(),
      upload_time: getLocalTimeString(),
      files_count: 0,
      errors_count: 0,
      check_status: "Pending",
    });
  };

  const startEdit = (record: ArchiveDataVerificationType) => {
    // Guard: admin অন্য কেউর assigned entry edit করতে পারবে না
    const hasCheckedBy = !!(record.checked_by && record.checked_by.trim() !== "");
    const isAssignedAuditor = hasCheckedBy && record.checked_by === currentUser?.name;
    if (isAdmin && hasCheckedBy && !isAssignedAuditor && !fullEdit) return;
    setEditId(record.id);
    setEditFields({
      file_name: record.file_name,
      data_type: record.data_type,
      submitted_by: record.submitted_by,
      check_status: record.check_status,
      check_date: normalizeDateStr(record.check_date),
      check_time: record.check_time || "",
      checked_by: record.checked_by || "",
      files_count: record.files_count,
      errors_count: record.errors_count,
      remarks_on_errors: record.remarks_on_errors,
      user_remarks: record.user_remarks || "",
      status: record.status || "New Upload",
      upload_date: normalizeDateStr(record.upload_date),
      upload_time: record.upload_time,
    });
  };

  const handleUpdate = async (id: number) => {
    await onUpdate(id, editFields);
    setEditId(null);
  };

  const getUserAvatarUrl = (name?: string | null) => {
    if (!name) return null;
    const user = allUsers.find((u) => u.name === name);
    return user?.avatar || null;
  };

  return (
    <motion.div
      key="records"
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className="space-y-6"
    >
      <div className="flex flex-col gap-3 bg-white/50 dark:bg-white/10 dark:bg-white/5 backdrop-blur-sm p-2 rounded-3xl border border-white/50 dark:border-white/10 shadow-sm dark:shadow-slate-900/50">
        <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 flex-1 max-w-2xl">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 dark:text-slate-500 group-focus-within:text-indigo-500 transition-colors" />
            <input
              type="text"
              placeholder="Search by file, user, or data type..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-12 pr-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl text-sm font-medium focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all"
            />
          </div>
          {/* Report Date Range Filter (Upload Date) */}
          <div className="flex items-center gap-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl px-3 py-2 whitespace-nowrap">
            <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">
              From
            </span>
            <input
              type="date"
              value={reportDateFrom}
              onChange={(e) => setReportDateFrom(e.target.value)}
              max={reportDateTo || undefined}
              className="bg-transparent text-xs font-bold text-slate-700 dark:text-slate-200 outline-none"
              title="Report Start Date (Upload Date)"
            />
            <span className="text-slate-300 dark:text-slate-600">-</span>
            <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">
              To
            </span>
            <input
              type="date"
              value={reportDateTo}
              onChange={(e) => setReportDateTo(e.target.value)}
              min={reportDateFrom || undefined}
              className="bg-transparent text-xs font-bold text-slate-700 dark:text-slate-200 outline-none"
              title="Report End Date (Upload Date)"
            />
          </div>
          {/* Clear Filters logic */}
          {(typeFilter !== "all" ||
            userFilter !== "all" ||
            checkStatusFilter !== "all" ||
            uploadStatusFilter !== "all" ||
            auditorFilter !== "all" ||
            errorOnlyFilter ||
            reportDateFrom !== "" ||
            reportDateTo !== "" ||
            searchQuery !== "") && (
            <button
              onClick={() => {
                setTypeFilter("all");
                setUserFilter("all");
                setCheckStatusFilter("all");
                setUploadStatusFilter("all");
                setAuditorFilter("all");
                setErrorOnlyFilter(false);
                setReportDateFrom("");
                setReportDateTo("");
                setSearchQuery("");
              }}
              className="px-4 py-3 bg-rose-50 text-rose-600 rounded-2xl text-[10px] font-black uppercase tracking-widest border border-rose-100 hover:bg-rose-100 transition-all flex items-center gap-2 whitespace-nowrap"
            >
              <X className="h-3.5 w-3.5" />
              Clear Filters
            </button>
          )}
        </div>
        <div className="flex items-center gap-2 px-2">
          {(isAdmin || isSuperAdmin || advPerms.edit) && onToggleAdd && (
            <button
              onClick={onToggleAdd}
              className={`group relative overflow-hidden px-6 py-3 rounded-2xl text-sm font-black uppercase tracking-widest transition-all duration-500 active:scale-95 whitespace-nowrap ${isAdding ? "bg-slate-800 text-white shadow-xl shadow-slate-900/20" : "bg-indigo-600 text-white shadow-2xl shadow-indigo-600/30 hover:bg-indigo-700"}`}
            >
              <span className="relative z-10 flex items-center gap-2">
                {isAdding ? (
                  <X className="h-4 w-4" />
                ) : (
                  <Plus className="h-4 w-4 group-hover:rotate-90 transition-transform duration-500" />
                )}
                {isAdding ? "Dismiss" : "New Entry"}
              </span>
              {!isAdding && (
                <div className="absolute inset-0 bg-gradient-to-tr from-indigo-400/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              )}
            </button>
          )}
          <button className="p-3 text-slate-400 dark:text-slate-500 hover:text-indigo-600 hover:bg-white dark:bg-slate-900 rounded-xl transition-all border border-transparent hover:border-slate-100 dark:border-slate-800">
            <Filter className="h-5 w-5" />
          </button>
          <button
            onClick={handleExportData}
            disabled={filteredRecords.length === 0}
            className="p-3 text-slate-400 dark:text-slate-500 hover:text-indigo-600 hover:bg-white dark:bg-slate-900 rounded-xl transition-all border border-transparent hover:border-slate-100 dark:border-slate-800 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:text-slate-400"
            title="Generate Report (Excel/CSV) for Selected Filters & Date Range"
          >
            <Download className="h-5 w-5" />
          </button>
        </div>
        </div>

        {/* Inline Filtered Summary — shown when a date range (or any filter) narrows the records */}
        {isDateRangeActive && (
          <div className="flex flex-wrap items-center gap-2 px-3 pb-1">
            <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mr-1">
              {reportDateFrom || "…"} to {reportDateTo || "…"} Summary:
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-50 text-indigo-700 text-[11px] font-black border border-indigo-100">
              {filterSummary.totalRecords} Records
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-50 text-slate-700 dark:text-slate-200 text-[11px] font-black border border-slate-100 dark:border-slate-700">
              {filterSummary.totalFiles} Files
            </span>
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-black border ${
                filterSummary.totalErrors > 0
                  ? "bg-rose-50 text-rose-600 border-rose-100"
                  : "bg-emerald-50 text-emerald-600 border-emerald-100"
              }`}
            >
              {filterSummary.totalErrors} Errors
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-600 text-[11px] font-black border border-emerald-100">
              {filterSummary.checked} Checked
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-50 text-amber-600 text-[11px] font-black border border-amber-100">
              {filterSummary.pending} Pending
            </span>
            {filterSummary.returned > 0 && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-50 text-rose-600 text-[11px] font-black border border-rose-100">
                {filterSummary.returned} Returned
              </span>
            )}
            {filterSummary.onHold > 0 && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-orange-50 text-orange-600 text-[11px] font-black border border-orange-100">
                {filterSummary.onHold} On Hold
              </span>
            )}
          </div>
        )}
      </div>

      <div className="bg-white/40 dark:bg-white/5 backdrop-blur-md rounded-[2.5rem] shadow-sm dark:shadow-slate-900/50 border border-white dark:border-white/8 overflow-hidden relative group/table">
        <div className="overflow-x-auto scrollbar-hide">
          <table className="w-full text-left border-collapse min-w-[1200px]">
            <thead>
              <tr className="bg-slate-50/50 backdrop-blur-sm border-b border-slate-100 dark:border-slate-800 italic">
                <th className="px-6 py-6 text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest text-center w-16">
                  #
                </th>
                <th className="px-6 py-6 text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest min-w-[280px]">
                  <div className="flex flex-col gap-2">
                    <span>Archive Details &amp; Classification</span>
                    <select
                      value={typeFilter}
                      onChange={(e) => setTypeFilter(e.target.value)}
                      className="w-full bg-white/20 backdrop-blur-md border border-white/50 dark:border-white/10 rounded-lg px-2 py-1 text-[10px] font-bold outline-none focus:border-indigo-400 normal-case shadow-inner text-slate-700 dark:text-slate-200"
                    >
                      <option value="all">All Types</option>
                      {uniqueTypes.map((t, _idx) => (
                        <option key={`type-${_idx}-${t}`} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>
                </th>
                <th className="px-6 py-6 text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                  <div className="flex flex-col gap-2">
                    <span>Ownership</span>
                    <select
                      value={userFilter}
                      onChange={(e) => setUserFilter(e.target.value)}
                      className="w-full bg-white/20 backdrop-blur-md border border-white/50 dark:border-white/10 rounded-lg px-2 py-1 text-[10px] font-bold outline-none focus:border-indigo-400 normal-case shadow-inner text-slate-700 dark:text-slate-200"
                    >
                      <option value="all">All Owners</option>
                      {uniqueUsers.map((u, _idx) => (
                        <option key={`user-${_idx}-${u}`} value={u}>
                          {u}
                        </option>
                      ))}
                    </select>
                  </div>
                </th>
                <th className="px-6 py-6 text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                  <div className="flex flex-col gap-2">
                    <span>Upload Status</span>
                    <select
                      value={uploadStatusFilter}
                      onChange={(e) => setUploadStatusFilter(e.target.value)}
                      className="w-full bg-white/20 backdrop-blur-md border border-white/50 dark:border-white/10 rounded-lg px-2 py-1 text-[10px] font-bold outline-none focus:border-indigo-400 normal-case shadow-inner text-slate-700 dark:text-slate-200"
                    >
                      <option value="all">All Status</option>
                      <option value="New Upload">New Upload</option>
                      <option value="Old Upload">Old Upload</option>
                    </select>
                  </div>
                </th>
                <th className="px-6 py-6 text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest text-center">
                  Metric Vol.
                </th>
                <th className="px-6 py-6 text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest text-center">
                  <div className="flex flex-col gap-2 items-center">
                    <span>System Audit</span>
                    <select
                      value={checkStatusFilter}
                      onChange={(e) => setCheckStatusFilter(e.target.value)}
                      className="w-full bg-white/20 backdrop-blur-md border border-white/50 dark:border-white/10 rounded-lg px-2 py-1 text-[10px] font-bold outline-none focus:border-indigo-400 normal-case shadow-inner text-slate-700 dark:text-slate-200"
                    >
                      <option value="all">Check Status</option>
                      <option value="Pending">Pending</option>
                      <option value="Checked">Checked</option>
                      <option value="On Hold">On Hold</option>
                      <option value="Returned">Returned</option>
                      <option value="Re-Audit">Re-Audit</option>
                    </select>
                  </div>
                </th>
                <th className="px-6 py-6 text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                  <div className="flex flex-col gap-2">
                    <span>Verification Path</span>
                    <select
                      value={auditorFilter}
                      onChange={(e) => setAuditorFilter(e.target.value)}
                      className="w-full bg-white/20 backdrop-blur-md border border-white/50 dark:border-white/10 rounded-lg px-2 py-1 text-[10px] font-bold outline-none focus:border-indigo-400 normal-case shadow-inner text-slate-700 dark:text-slate-200"
                    >
                      <option value="all">All Auditors</option>
                      {uniqueAuditors.map((a, _idx) => (
                        <option key={`auditor-${_idx}-${a}`} value={a}>
                          {a}
                        </option>
                      ))}
                    </select>
                  </div>
                </th>
                <th className="px-6 py-6 text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest text-right">
                  Commands
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
              {isAdding && (isAdmin || isSuperAdmin || advPerms.edit) && (
                <tr className="bg-indigo-50/10 border-l-4 border-indigo-500 animate-in fade-in slide-in-from-left-2 duration-300">
                  <td className="px-6 py-6 text-center font-mono text-xs font-bold text-indigo-400 italic">
                    NEW
                  </td>
                  <td className="px-6 py-6 font-bold">
                    <div className="space-y-2 max-w-[260px]">
                      <input
                        type="text"
                        placeholder="File Name"
                        value={newData.file_name}
                        onChange={(e) =>
                          setNewData({ ...newData, file_name: e.target.value })
                        }
                        className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-bold outline-none focus:border-indigo-500 shadow-sm dark:shadow-slate-900/50"
                      />
                      <div className="flex gap-2">
                        <input
                          type="date"
                          value={newData.upload_date}
                          onChange={(e) =>
                            setNewData({
                              ...newData,
                              upload_date: e.target.value,
                            })
                          }
                          className="flex-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-2 py-1 text-xs font-bold outline-none focus:border-indigo-500 shadow-sm dark:shadow-slate-900/50"
                        />
                        <input
                          type="time"
                          value={newData.upload_time}
                          onChange={(e) =>
                            setNewData({
                              ...newData,
                              upload_time: e.target.value,
                            })
                          }
                          className="w-20 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-2 py-1 text-xs font-bold outline-none focus:border-indigo-500 shadow-sm dark:shadow-slate-900/50"
                        />
                      </div>
                      <select
                        value={newData.data_type}
                        onChange={(e) =>
                          setNewData({ ...newData, data_type: e.target.value })
                        }
                        className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-black uppercase tracking-widest outline-none focus:border-indigo-500 shadow-sm dark:shadow-slate-900/50"
                      >
                        <option value="">Select Type</option>
                        {dataTypeOptions.map((t, _idx) => (
                          <option key={`dtype-${_idx}-${t.name}`} value={t.name}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </td>
                  <td className="px-6 py-6 font-bold">
                    <input
                      type="text"
                      placeholder="Owner"
                      value={newData.submitted_by}
                      onChange={(e) =>
                        setNewData({ ...newData, submitted_by: e.target.value })
                      }
                      className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-bold outline-none focus:border-indigo-500 shadow-sm dark:shadow-slate-900/50"
                    />
                  </td>
                  <td className="px-6 py-6">
                    <select
                      value={newData.status}
                      onChange={(e) =>
                        setNewData({
                          ...newData,
                          status: e.target.value as any,
                        })
                      }
                      className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-bold outline-none focus:border-indigo-500 shadow-sm dark:shadow-slate-900/50"
                    >
                      <option value={UPLOAD_STATUS.NEW_UPLOAD}>
                        New Upload
                      </option>
                      <option value={UPLOAD_STATUS.OLD_UPLOAD}>
                        Old Upload
                      </option>
                    </select>
                  </td>
                  <td className="px-6 py-6">
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase">
                          Files
                        </span>
                        <input
                          type="number"
                          value={newData.files_count}
                          onChange={(e) =>
                            setNewData({
                              ...newData,
                              files_count: parseInt(e.target.value) || 0,
                            })
                          }
                          className="w-12 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-xs font-bold text-center outline-none focus:border-indigo-500"
                        />
                      </div>
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase">
                          Errors
                        </span>
                        <input
                          type="number"
                          value={newData.errors_count}
                          onChange={(e) =>
                            setNewData({
                              ...newData,
                              errors_count: parseInt(e.target.value) || 0,
                            })
                          }
                          className="w-12 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-xs font-bold text-center outline-none focus:border-indigo-500"
                        />
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-6">
                    <select
                      value={newData.check_status}
                      onChange={(e) => {
                        const s = e.target.value as any;
                        setNewData({
                          ...newData,
                          check_status: s,
                          checked_by:
                            s !== CHECK_STATUS.PENDING ? currentUser?.name : "",
                        });
                      }}
                      className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-bold outline-none focus:border-indigo-500 shadow-sm dark:shadow-slate-900/50"
                    >
                      <option value={CHECK_STATUS.PENDING}>Pending</option>
                      <option value={CHECK_STATUS.CHECKED}>Checked</option>
                      <option value={CHECK_STATUS.ON_HOLD}>On Hold</option>
                      <option value={CHECK_STATUS.RETURNED}>Returned</option>
                    </select>
                  </td>
                  <td className="px-6 py-6">
                    <div className="flex items-center gap-2">
                      <UserAvatar
                        name={newData.checked_by || "Auto"}
                        avatarUrl={getUserAvatarUrl(newData.checked_by)}
                        size="sm"
                      />
                      <span className="text-xs font-black text-slate-500 dark:text-slate-400 truncate max-w-[80px]">
                        {newData.checked_by || "Auto"}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-6 border-l border-slate-100 dark:border-slate-800">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={handleNewSave}
                        className="p-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 shadow-sm dark:shadow-slate-900/50 transition-all"
                        title="Save New Entry"
                      >
                        <Check className="h-3.5 w-3.5" />
                      </button>
                      {onCancelAdd && (
                        <button
                          onClick={onCancelAdd}
                          className="p-2 bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 rounded-lg hover:bg-rose-50 hover:text-rose-500 transition-all"
                          title="Cancel"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )}
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <SkeletonRow key={i} cols={9} />
                ))
              ) : paginatedRecords.length > 0 ? (
                paginatedRecords.map((r, idx) => (
                  <motion.tr
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: Math.min(idx, 15) * 0.03 }}
                    key={r.id}
                    className="hover:bg-slate-50 dark:hover:bg-white/5 group/row transition-all duration-300 border-b border-slate-200 dark:border-slate-700/60 last:border-0"
                  >
                    <td className="px-6 py-6 text-center font-mono text-xs font-bold text-slate-300 group-hover/row:text-indigo-400 transition-colors">
                      {String((safeCurrentPage - 1) * pageSize + idx + 1).padStart(2, "0")}
                    </td>
                    <td className="px-6 py-6">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          {editId === r.id &&
                          (fullEdit ||
                            r.check_status !== CHECK_STATUS.PENDING) ? (
                            <input
                              type="text"
                              value={editFields.file_name || r.file_name}
                              onChange={(e) =>
                                setEditFields({
                                  ...editFields,
                                  file_name: e.target.value,
                                })
                              }
                              className="text-sm font-bold text-slate-900 dark:text-slate-50 bg-white dark:bg-slate-900 border border-indigo-200 rounded-lg px-2 py-1 outline-none focus:ring-2 focus:ring-indigo-500/20"
                            />
                          ) : (
                            <span className="text-sm font-bold text-slate-900 dark:text-slate-50 group-hover/row:text-indigo-700 transition-colors line-clamp-1">
                              {r.file_name}
                            </span>
                          )}
                          <div className="h-1 w-1 rounded-full bg-slate-300" />
                          {editId === r.id &&
                          (fullEdit ||
                            r.check_status !== CHECK_STATUS.PENDING) ? (
                            <input
                              type="date"
                              value={editFields.upload_date}
                              onChange={(e) =>
                                setEditFields({
                                  ...editFields,
                                  upload_date: e.target.value,
                                })
                              }
                              className="text-xs font-black text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-900 border border-indigo-200 rounded-lg px-2 py-1 outline-none"
                            />
                          ) : (
                            <span className="text-xs font-black text-slate-400 dark:text-slate-500 tabular-nums uppercase tracking-tight">
                              {formatDateDisplay(r.upload_date)}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider">
                          <Clock className="h-3 w-3" />
                          {editId === r.id &&
                          (fullEdit ||
                            r.check_status !== CHECK_STATUS.PENDING) ? (
                            <input
                              type="time"
                              value={editFields.upload_time}
                              onChange={(e) =>
                                setEditFields({
                                  ...editFields,
                                  upload_time: e.target.value,
                                })
                              }
                              className="bg-white dark:bg-slate-900 border border-indigo-200 rounded-lg px-1 py-0.5 outline-none"
                            />
                          ) : (
                            r.upload_time
                          )}
                        </div>
                        <div className="pt-1">
                          {editId === r.id &&
                          (fullEdit ||
                            r.check_status !== CHECK_STATUS.PENDING) ? (
                            <select
                              value={editFields.data_type}
                              onChange={(e) =>
                                setEditFields({
                                  ...editFields,
                                  data_type: e.target.value,
                                })
                              }
                              className="px-3 py-1.5 bg-white dark:bg-slate-900 border border-indigo-200 rounded-xl text-[10px] font-black uppercase outline-none focus:border-indigo-500 shadow-sm dark:shadow-slate-900/50"
                            >
                              <option value="">Select Type</option>
                              {dataTypeOptions.map((t, _idx2) => (
                                <option key={`dtype-edit-${_idx2}-${t.name}`} value={t.name}>
                                  {t.name}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded-xl text-[10px] font-black uppercase tracking-widest border border-indigo-100/50">
                              <div className="h-1 w-1 rounded-full bg-indigo-400 animate-pulse" />
                              {r.data_type}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-6 font-mono text-xs font-bold text-slate-500 dark:text-slate-400">
                      {editId === r.id &&
                      (fullEdit ||
                        r.check_status !== CHECK_STATUS.PENDING) ? (
                        <input
                          type="text"
                          value={editFields.submitted_by || r.submitted_by}
                          onChange={(e) =>
                            setEditFields({
                              ...editFields,
                              submitted_by: e.target.value,
                            })
                          }
                          className="w-full px-2 py-1 bg-white dark:bg-slate-900 border border-indigo-200 rounded-lg text-xs font-bold outline-none"
                        />
                      ) : (
                        <div className="flex items-center gap-2">
                          <UserAvatar
                            name={r.submitted_by}
                            avatarUrl={getUserAvatarUrl(r.submitted_by)}
                            size="sm"
                          />
                          <div>
                            <div className="text-xs text-slate-700 dark:text-slate-200 font-black tracking-tight">
                              {r.submitted_by}
                            </div>
                            <div className="text-[9px] text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                              Entry Owner
                            </div>
                          </div>
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-6">
                      <div className="flex flex-col gap-1.5 items-center">
                        {editId === r.id ? (
                          <>
                            <select
                              value={editFields.status}
                              onChange={(e) =>
                                setEditFields({
                                  ...editFields,
                                  status: e.target.value as any,
                                })
                              }
                              disabled={
                                !(
                                  fullEdit ||
                                  r.check_status !== CHECK_STATUS.PENDING
                                )
                              }
                              className={`w-full px-2 py-1 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold outline-none focus:border-indigo-500 ${!(fullEdit || r.check_status !== CHECK_STATUS.PENDING) ? "bg-slate-50 dark:bg-slate-800/50 text-slate-400 dark:text-slate-500 cursor-not-allowed" : "bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-50"}`}
                            >
                              <option value={UPLOAD_STATUS.NEW_UPLOAD}>
                                New Upload
                              </option>
                              <option value={UPLOAD_STATUS.OLD_UPLOAD}>
                                Old Upload
                              </option>
                            </select>
                            {(fullEdit ||
                              r.check_status !== CHECK_STATUS.PENDING) && (
                              <input
                                type="date"
                                value={editFields.upload_date}
                                onChange={(e) =>
                                  setEditFields({
                                    ...editFields,
                                    upload_date: e.target.value,
                                  })
                                }
                                className="w-full px-2 py-1 bg-indigo-50 border border-indigo-100 rounded-lg text-[9px] font-black outline-none"
                              />
                            )}
                          </>
                        ) : (
                          <StatusBadge
                            status={r.status || UPLOAD_STATUS.NEW_UPLOAD}
                            type="upload"
                          />
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-6">
                      <div className="flex flex-col items-center">
                        {editId === r.id &&
                        (fullEdit ||
                          r.check_status !== CHECK_STATUS.PENDING) ? (
                          <input
                            type="number"
                            value={editFields.files_count}
                            onChange={(e) =>
                              setEditFields({
                                ...editFields,
                                files_count: parseInt(e.target.value) || 0,
                              })
                            }
                            className="w-20 px-3 py-2 bg-white dark:bg-slate-900 border border-indigo-200 rounded-xl text-center text-sm font-black focus:ring-4 focus:ring-indigo-500/20 outline-none shadow-sm dark:shadow-slate-900/50"
                          />
                        ) : (
                          <div className="px-4 py-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 rounded-2xl text-center">
                            <div className="text-sm font-black text-slate-800 dark:text-slate-100 tabular-nums">
                              {r.files_count || 0}
                            </div>
                            <div className="text-[9px] text-slate-400 dark:text-slate-500 font-black uppercase tracking-tight">
                              Units
                            </div>
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-6">
                      <div className="flex flex-col items-center gap-2">
                        {editId === r.id ? (
                          <div className="space-y-2">
                            <input
                              type="number"
                              value={editFields.errors_count}
                              onChange={(e) =>
                                setEditFields({
                                  ...editFields,
                                  errors_count: parseInt(e.target.value) || 0,
                                })
                              }
                              disabled={
                                !(
                                  fullEdit ||
                                  !r.checked_by ||
                                  r.checked_by.trim() === "" ||
                                  r.checked_by === currentUser?.name
                                )
                              }
                              className={`w-20 px-3 py-2 border rounded-xl text-center text-sm font-black outline-none ${
                                !(
                                  fullEdit ||
                                  !r.checked_by ||
                                  r.checked_by.trim() === "" ||
                                  r.checked_by === currentUser?.name
                                )
                                  ? "bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 text-slate-400 dark:text-slate-500 cursor-not-allowed"
                                  : "bg-rose-50 border-rose-100 text-rose-600 focus:ring-4 focus:ring-rose-500/10"
                              }`}
                            />
                            <select
                              value={editFields.check_status}
                              onChange={(e) => {
                                const s = e.target.value as any;
                                setEditFields({
                                  ...editFields,
                                  check_status: s,
                                  checked_by:
                                    s !== CHECK_STATUS.PENDING &&
                                    (!editFields.checked_by ||
                                      editFields.checked_by === "")
                                      ? currentUser?.name || ""
                                      : editFields.checked_by,
                                });
                              }}
                              className="w-20 px-2 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-black uppercase outline-none focus:border-indigo-500"
                            >
                              {fullEdit ||
                              !r.checked_by ||
                              r.checked_by.trim() === "" ||
                              r.checked_by === currentUser?.name ? (
                                <>
                                  <option value={CHECK_STATUS.PENDING}>
                                    PND
                                  </option>
                                  <option value={CHECK_STATUS.CHECKED}>
                                    OK
                                  </option>
                                  <option value={CHECK_STATUS.ON_HOLD}>
                                    HLD
                                  </option>
                                  <option value={CHECK_STATUS.RETURNED}>
                                    RTN
                                  </option>
                                  <option value={CHECK_STATUS.RE_AUDIT}>
                                    RE-AUDIT
                                  </option>
                                </>
                              ) : (
                                <option value={CHECK_STATUS.RE_AUDIT}>
                                  RE-AUDIT
                                </option>
                              )}
                            </select>
                          </div>
                        ) : (
                          <>
                            <div
                              className={`px-4 py-2 rounded-2xl text-center min-w-[80px] border ${r.errors_count > 0 ? "bg-rose-50/50 border-rose-100 text-rose-600" : "bg-emerald-50/50 border-emerald-100 text-emerald-600"}`}
                            >
                              <div className="text-sm font-black tabular-nums">
                                {r.errors_count}
                              </div>
                              <div className="text-[9px] font-black uppercase tracking-tight">
                                Anomalies
                              </div>
                            </div>
                            <StatusBadge status={r.check_status} type="check" />
                          </>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-6">
                      <div className="space-y-2">
                        {editId === r.id ? (
                          <select
                            value={editFields.checked_by}
                            onChange={(e) =>
                              setEditFields({
                                ...editFields,
                                checked_by: e.target.value,
                              })
                            }
                            className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold outline-none focus:border-indigo-500"
                          >
                            <option value="">Auditor Assigned</option>
                            {allEmployees.map((emp) => (
                              <option key={`emp-${r.id}-${emp.id}`} value={emp.name}>
                                {emp.name}
                              </option>
                            ))}
                            {dedupedUsers
                              .filter(
                                (u) =>
                                  !dedupedEmployees.some(
                                    (emp) => emp.name === u.name,
                                  ),
                              )
                              .map((u) => (
                                <option key={`usr-${r.id}-${u.id}`} value={u.name}>
                                  {u.name} (User)
                                </option>
                              ))}
                          </select>
                        ) : (
                          <div className="flex items-center gap-2">
                            {r.checked_by ? (
                              <div className="flex items-center gap-2">
                                <UserAvatar
                                  name={r.checked_by}
                                  avatarUrl={getUserAvatarUrl(r.checked_by)}
                                  size="sm"
                                />
                                <div>
                                  <div className="text-xs font-black text-slate-800 dark:text-slate-100">
                                    {r.checked_by}
                                  </div>
                                  <div className="text-[9px] text-slate-400 dark:text-slate-500 font-bold italic">
                                    {formatDateDisplay(r.check_date)}
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <span className="text-xs font-black text-slate-300 uppercase tracking-widest italic">
                                Unassigned
                              </span>
                            )}
                          </div>
                        )}
                        <div className="text-xs text-slate-500 dark:text-slate-400 font-medium space-y-2 mt-2 w-full">
                          <div>
                            <span className="font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest text-[8px] block mb-1">
                              Audit Remarks:
                            </span>
                            {editId === r.id &&
                            (fullEdit ||
                              !r.checked_by ||
                              r.checked_by.trim() === "" ||
                              r.checked_by === currentUser?.name) ? (
                              <textarea
                                value={editFields.remarks_on_errors || ""}
                                onChange={(e) =>
                                  setEditFields({
                                    ...editFields,
                                    remarks_on_errors: e.target.value,
                                  })
                                }
                                placeholder="Audit remarks এখানে লিখুন..."
                                className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-indigo-300 dark:border-indigo-700 rounded-xl text-xs outline-none focus:ring-2 focus:ring-indigo-400/30 focus:border-indigo-500 resize-y transition-all placeholder:text-slate-300 dark:placeholder:text-slate-600 leading-relaxed"
                                rows={3}
                              />
                            ) : (
                              <div
                                className="line-clamp-2 italic"
                                title={r.remarks_on_errors || "N/A"}
                              >
                                {r.remarks_on_errors || "N/A"}
                              </div>
                            )}
                          </div>

                          {r.user_remarks ||
                          (editId === r.id &&
                            (fullEdit ||
                              (!isAdmin &&
                                (r.check_status === CHECK_STATUS.RETURNED ||
                                  r.check_status === CHECK_STATUS.ON_HOLD ||
                                  editFields.check_status ===
                                    CHECK_STATUS.RE_AUDIT)))) ? (
                            <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                              <span className="font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest text-[8px] block mb-1">
                                User Remarks:
                              </span>
                              {editId === r.id && (!isAdmin || fullEdit) ? (
                                <textarea
                                  value={editFields.user_remarks || ""}
                                  onChange={(e) =>
                                    setEditFields({
                                      ...editFields,
                                      user_remarks: e.target.value,
                                    })
                                  }
                                  placeholder="Re-Audit এর জবাব বা পরিবর্তনের কারণ লিখুন..."
                                  className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-purple-300 dark:border-purple-700 rounded-xl text-xs outline-none focus:ring-2 focus:ring-purple-400/30 focus:border-purple-500 resize-y transition-all placeholder:text-slate-300 dark:placeholder:text-slate-600 leading-relaxed"
                                  rows={3}
                                />
                              ) : (
                                <div
                                  className="line-clamp-2 italic"
                                  title={r.user_remarks || "N/A"}
                                >
                                  {r.user_remarks || "N/A"}
                                </div>
                              )}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-6">
                      <div className="flex items-center justify-end gap-1.5">
                        {editId === r.id ? (
                          <button
                            onClick={() => handleUpdate(r.id)}
                            className="p-2.5 bg-indigo-600 text-white rounded-2xl hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-600/20 active:scale-90"
                            title="Verify Audit"
                          >
                            <Check className="h-4 w-4" />
                          </button>
                        ) : (
                          <>
                            <button
                              onClick={() => onOpenHistory(r)}
                              className="p-2.5 text-slate-400 dark:text-slate-500 hover:text-indigo-600 hover:bg-slate-50 dark:bg-slate-800/50 rounded-2xl transition-all border border-transparent hover:border-slate-100 dark:border-slate-800"
                              title="View Audit History"
                            >
                              <History className="h-4 w-4" />
                            </button>
                            {(() => {
                              const isOwner = r.submitted_by === currentUser?.name;
                              const hasCheckedBy = !!(r.checked_by && r.checked_by.trim() !== "");
                              const isAssignedAuditor = hasCheckedBy && r.checked_by === currentUser?.name;
                              const isReturnedOrOnHold =
                                r.check_status === CHECK_STATUS.RETURNED ||
                                r.check_status === CHECK_STATUS.ON_HOLD;
                              const canAudit = advPerms.audit && !hasCheckedBy && !isOwner;
                              // Admin: checked_by অন্য কেউ থাকলে শুধু Super Admin edit করতে পারবে
                              const isAdminCanEdit = isAdmin && (!hasCheckedBy || isAssignedAuditor);
                              return (
                                fullEdit ||
                                isAdminCanEdit ||
                                (isOwner && isReturnedOrOnHold) ||
                                (!isOwner && isAssignedAuditor) ||
                                canAudit
                              );
                            })() ? (
                              <button
                                onClick={() => startEdit(r)}
                                className="p-2.5 text-indigo-600 hover:bg-indigo-50 rounded-2xl transition-all border border-transparent hover:border-indigo-100"
                                title="Action Record"
                              >
                                <Plus className="h-4 w-4" />
                              </button>
                            ) : null}
                          </>
                        )}
                        <div className="h-8 w-[1px] bg-slate-100 dark:bg-slate-800 mx-1" />
                        {isSuperAdmin && (
                          <button
                            onClick={() => onDelete(r.id)}
                            className="p-2.5 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded-2xl transition-all border border-transparent hover:border-rose-100"
                            title="Purge record"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                        <ChevronRight className="h-4 w-4 text-slate-200 group-hover/row:text-indigo-200 transition-colors" />
                      </div>
                    </td>
                  </motion.tr>
                ))
              ) : (
                <tr>
                  <td colSpan={14} className="px-4 py-40 text-center">
                    <motion.div
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="flex flex-col items-center gap-4"
                    >
                      <div className="p-8 rounded-[3rem] bg-slate-50/50 border border-slate-100 dark:border-slate-800 inline-flex">
                        <AlertCircle className="h-16 w-16 text-slate-200" />
                      </div>
                      <div className="space-y-1">
                        <p className="font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.4em] text-sm">
                          Registry is Empty
                        </p>
                        <p className="text-xs text-slate-300 font-medium italic">
                          No matches found for the current filter criteria.
                        </p>
                      </div>
                    </motion.div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination footer */}
        {!loading && filteredRecords.length > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-6 py-4 border-t border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-400 dark:text-slate-500">
              <span>
                Showing{" "}
                <span className="text-slate-700 dark:text-slate-200">
                  {(safeCurrentPage - 1) * pageSize + 1}
                  {"–"}
                  {Math.min(safeCurrentPage * pageSize, filteredRecords.length)}
                </span>{" "}
                of{" "}
                <span className="text-slate-700 dark:text-slate-200">
                  {filteredRecords.length}
                </span>
              </span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="ml-2 px-2 py-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold outline-none"
              >
                <option value={25}>25 / page</option>
                <option value={50}>50 / page</option>
                <option value={100}>100 / page</option>
              </select>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={safeCurrentPage <= 1}
                className="px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wide text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                Prev
              </button>
              <span className="px-3 py-1.5 text-xs font-black text-slate-600 dark:text-slate-300 tabular-nums">
                {safeCurrentPage} / {totalPages}
              </span>
              <button
                onClick={() =>
                  setCurrentPage((p) => Math.min(totalPages, p + 1))
                }
                disabled={safeCurrentPage >= totalPages}
                className="px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wide text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
};