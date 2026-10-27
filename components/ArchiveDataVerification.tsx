import React, { useState, useEffect, useMemo } from "react";
import {
  Database,
  User,
  Clock,
  Calendar,
  BarChart3,
  List,
  FileCheck,
  AlertTriangle,
  RotateCcw,
  Send,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Player } from "@lottiefiles/react-lottie-player";
import emailSentAnimation from "../src/email-sent.json";
import {
  ArchiveDataVerification as ArchiveDataVerificationType,
  ArchiveDataVerificationTab,
  AllEmployee,
  User as UserType,
  ArchiveVerificationHistory,
} from "../types";
import { getEffectivePermissions } from "../utils/permissionUtils";
import {
  getLocalDateString,
  getLocalTimeString,
  normalizeDateStr,
} from "../utils/dateUtils";
import { useToast } from "../hooks/useToast";
import { Toast } from "./Toast";
import { CHECK_STATUS } from "../constants";

// Sub-components
import { RecordsTable, EditFields } from "./RecordsTable";
import { NewEntryForm, DataTypeOption, NewRecordData } from "./NewEntryForm";
import { ManageTypesModal } from "./ManageTypesModal";
import { HistoryModal } from "./HistoryModal";
import { SummaryTab } from "./SummaryTab";
import { AuditorInsightsTab } from "./AuditorInsightsTab";
import { TodayActivityTab } from "./TodayActivityTab";
import AccountsTransferTab, { TransferPayload } from "./AccountsTransferTab";

interface Props {
  allEmployees?: AllEmployee[];
  allUsers?: UserType[];
  currentUser?: UserType | null;
  initialState?: any;
}

const ArchiveDataVerification: React.FC<Props> = ({
  allEmployees = [],
  allUsers = [],
  currentUser,
  initialState,
}) => {
  const { toasts, showSuccess, showError, dismiss } = useToast();

  const [activeTab, setActiveTab] =
    useState<ArchiveDataVerificationTab>("records");
  const [records, setRecords] = useState<ArchiveDataVerificationType[]>([]);
  const [loading, setLoading] = useState(true);
  const advPerms = useMemo(
    () =>
      getEffectivePermissions(currentUser as any).archiveDataVerification || {
        view: true,
        edit: true,
        audit: false,
        editAll: false,
      },
    [currentUser],
  );

  const [isAdding, setIsAdding] = useState(false);
  const [showSaveSuccess, setShowSaveSuccess] = useState(false);

  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    variant?: 'danger' | 'warning';
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
    variant: 'danger'
  });

  // Data Types Options State
  const [dataTypeOptions, setDataTypeOptions] = useState<DataTypeOption[]>([]);
  const [isManagingTypes, setIsManagingTypes] = useState(false);

  // Summary States
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    const firstDay = new Date(d.getFullYear(), d.getMonth(), 1);
    return `${firstDay.getFullYear()}-${String(firstDay.getMonth() + 1).padStart(2, "0")}-${String(firstDay.getDate()).padStart(2, "0")}`;
  });
  const [endDate, setEndDate] = useState(getLocalDateString());

  // History States
  const [showHistory, setShowHistory] = useState(false);
  const [historyData, setHistoryData] = useState<ArchiveVerificationHistory[]>(
    [],
  );
  const [historyLoading, setHistoryLoading] = useState(false);
  const [selectedRecordForHistory, setSelectedRecordForHistory] =
    useState<ArchiveDataVerificationType | null>(null);

  // Table Filters driven from top-level stats cards
  const [tableFilters, setTableFilters] = useState<{
    checkStatus: string;
    errorOnly: boolean;
  }>({
    checkStatus: initialState?.checkStatus || "all",
    errorOnly: false,
  });

  const [uploadDateFilter, setUploadDateFilter] = useState<string | null>(null);

  // Global User Filter (drives summary cards, table, and analytics)
  const [userFilter, setUserFilter] = useState<string>("all");

  const uniqueSubmitters = useMemo(
    () =>
      Array.from(new Set(records.map((r) => r.submitted_by).filter(Boolean))) as string[],
    [records],
  );

  const filteredRecordsForTable = useMemo(() => {
    let filtered = records;
    if (uploadDateFilter) {
      filtered = filtered.filter(
        (r) => normalizeDateStr(r.upload_date) === uploadDateFilter,
      );
    }
    return filtered;
  }, [records, uploadDateFilter]);

  const userScopedRecords = useMemo(() => {
    if (userFilter === "all") return records;
    return records.filter((r) => r.submitted_by === userFilter);
  }, [records, userFilter]);

  useEffect(() => {
    fetchRecords();
    fetchDataTypes();
  }, []);

  const fetchDataTypes = async () => {
    try {
      const res = await fetch("/api/archive-data-types");
      const data = await res.json();
      setDataTypeOptions(data);
    } catch (error) {
      console.error("Error fetching data types:", error);
    }
  };

  const handleAddType = async (name: string) => {
    try {
      const res = await fetch("/api/archive-data-types", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (res.ok) {
        fetchDataTypes();
        showSuccess("Data type added successfully");
      } else {
        showError("Failed to add data type");
      }
    } catch (error) {
      console.error("Error adding data type:", error);
      showError("An error occurred");
    }
  };

  const handleUpdateType = async (type: DataTypeOption) => {
    try {
      const res = await fetch(`/api/archive-data-types/${type.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: type.name }),
      });
      if (res.ok) {
        fetchDataTypes();
        showSuccess("Data type updated successfully");
      } else {
        showError("Failed to update data type");
      }
    } catch (error) {
      console.error("Error updating data type:", error);
      showError("An error occurred");
    }
  };

  const handleDeleteType = async (id: number) => {
    setConfirmModal({
      isOpen: true,
      title: 'Delete Data Type',
      message: `Are you sure you want to delete this data type? Records using this type will not be affected.`,
      variant: 'warning',
      onConfirm: async () => {
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
        try {
          const res = await fetch(`/api/archive-data-types/${id}`, {
            method: "DELETE",
          });
          if (res.ok) {
            fetchDataTypes();
            showSuccess("Data type deleted successfully");
          } else {
            showError("Failed to delete data type");
          }
        } catch (error) {
          console.error("Error deleting data type:", error);
          showError("An error occurred");
        }
      }
    });
  };

  const fetchRecords = async () => {
    try {
      const res = await fetch("/api/archive-data-verification");
      const data = await res.json();
      setRecords(data);
    } catch (error) {
      console.error("Error fetching archive records:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchHistory = async (recordId: number) => {
    setHistoryLoading(true);
    try {
      const res = await fetch(
        `/api/archive-data-verification/${recordId}/history`,
      );
      const data = await res.json();
      setHistoryData(data);
    } catch (error) {
      console.error("Error fetching history:", error);
    } finally {
      setHistoryLoading(false);
    }
  };

  const openHistory = (record: ArchiveDataVerificationType) => {
    setSelectedRecordForHistory(record);
    setHistoryData([]);
    setShowHistory(true);
    fetchHistory(record.id);
  };

  const handleAdd = async (record: NewRecordData) => {
    try {
      const payload = {
        ...record,
        upload_date: record.upload_date
          ? `${record.upload_date}T00:00:00.000Z`
          : `${new Date().toISOString().split("T")[0]}T00:00:00.000Z`,
      };
      const res = await fetch("/api/archive-data-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        fetchRecords();
        setIsAdding(false);
        setShowSaveSuccess(true);
        setTimeout(() => setShowSaveSuccess(false), 5000);
        showSuccess("Record added successfully");
      } else {
        showError("Failed to add record");
      }
    } catch (error) {
      console.error("Error adding record:", error);
      showError("An error occurred");
    }
  };

  const handleUpdate = async (id: number, fields: EditFields) => {
    try {
      const originalRecord = records.find((r) => r.id === id);

      const isSuperAdmin = currentUser?.role === "super_admin";
      const isAdmin = currentUser?.role === "admin";
      // Per-user "Edit All" toggle: full edit on every column/row, like a super admin (minus delete)
      const hasFullEdit = isSuperAdmin || !!advPerms.editAll;
      const hasCheckedBy =
        originalRecord?.checked_by && originalRecord.checked_by.trim() !== "";
      const isAssignedAuditor =
        hasCheckedBy && originalRecord?.checked_by === currentUser?.name;
      const isOwner = originalRecord?.submitted_by === currentUser?.name;

      const hasAuditPerm = advPerms.audit;
      const isReturnedOrOnHold =
        originalRecord?.check_status === "Returned" ||
        originalRecord?.check_status === "On Hold";
      // Audit: only unassigned files that are not own
      const canAudit = hasAuditPerm && !hasCheckedBy && !isOwner;
      const canUpdate =
        hasFullEdit ||
        isSuperAdmin ||
        isAdmin ||
        (isOwner && isReturnedOrOnHold) || // owner can always fix own Returned/On Hold (even if checked_by exists)
        (!isOwner && isAssignedAuditor) ||  // assigned auditor on others file
        canAudit;                           // audit permission on unassigned non-own file

      if (!canUpdate) {
        showError(
          "Only the assigned auditor or a super admin can update this record.",
        );
        return;
      }

      const finalFields = { ...fields } as any;

      if (
        originalRecord?.check_status === "Pending" &&
        finalFields.check_status !== "Pending" &&
        (!finalFields.checked_by || finalFields.checked_by.trim() === "")
      ) {
        finalFields.checked_by = currentUser?.name || "";
      }

      finalFields.check_date = getLocalDateString();
      finalFields.check_time = getLocalTimeString();

      const isAuditUser = advPerms.audit && !hasFullEdit && !isAdmin;
      // Owner নিজের Returned/On Hold file fix করলে সবসময় Re-Audit — audit permission override করবে না
      const isOwnerFixing =
        isOwner &&
        !hasFullEdit &&
        !isAdmin &&
        (originalRecord?.check_status === "Returned" ||
          originalRecord?.check_status === "On Hold");
      if (
        isOwnerFixing ||
        (!hasFullEdit &&
          !isAdmin &&
          !isAuditUser &&
          (originalRecord?.check_status === "Returned" ||
            originalRecord?.check_status === "On Hold"))
      ) {
        finalFields.check_status = "Re-Audit";

        try {
          const hRes = await fetch(
            `/api/archive-data-verification/${id}/history`,
          );
          if (hRes.ok) {
            const history = await hRes.json();
            const returnEntry = history.find(
              (h: any) =>
                h.new_status === "Returned" || h.new_status === "On Hold",
            );
            if (returnEntry) {
              finalFields.checked_by = returnEntry.changed_by;
            } else {
              finalFields.checked_by = originalRecord?.checked_by || "";
            }
          } else {
            finalFields.checked_by = originalRecord?.checked_by || "";
          }
        } catch (err) {
          finalFields.checked_by = originalRecord?.checked_by || "";
        }
      }

      const isPending = originalRecord?.check_status === "Pending";
      if (isPending && !hasFullEdit) {
        finalFields.file_name =
          originalRecord?.file_name || finalFields.file_name;
        finalFields.upload_date =
          normalizeDateStr(originalRecord?.upload_date) ||
          finalFields.upload_date;
        finalFields.upload_time =
          originalRecord?.upload_time || finalFields.upload_time;
        finalFields.data_type =
          originalRecord?.data_type || finalFields.data_type;
        finalFields.status = originalRecord?.status || finalFields.status;
        finalFields.files_count =
          originalRecord?.files_count ?? finalFields.files_count;
        finalFields.submitted_by =
          originalRecord?.submitted_by || finalFields.submitted_by;
      } else {
        if (!hasFullEdit) {
          finalFields.submitted_by =
            originalRecord?.submitted_by || finalFields.submitted_by;
        }
      }

      if (
        finalFields.upload_date &&
        /^\d{4}-\d{2}-\d{2}$/.test(finalFields.upload_date)
      ) {
        finalFields.upload_date = `${finalFields.upload_date}T00:00:00.000Z`;
      }
      if (
        finalFields.check_date &&
        /^\d{4}-\d{2}-\d{2}$/.test(finalFields.check_date)
      ) {
        finalFields.check_date = `${finalFields.check_date}T00:00:00.000Z`;
      }

      const res = await fetch(`/api/archive-data-verification/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...finalFields, actor_name: currentUser?.name }),
      });
      if (res.ok) {
        fetchRecords();
        showSuccess("Record updated successfully");
      } else {
        showError("Failed to update record");
      }
    } catch (error) {
      console.error("Error updating record:", error);
      showError("An error occurred");
    }
  };

  const handleDelete = async (id: number) => {
    if (currentUser?.role !== "super_admin") {
      showError("Only super admins can delete records");
      return;
    }

    setConfirmModal({
      isOpen: true,
      title: 'Delete Record',
      message: 'Are you sure you want to delete this record? This action cannot be undone.',
      variant: 'danger',
      onConfirm: async () => {
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
        try {
          const res = await fetch(`/api/archive-data-verification/${id}`, {
            method: "DELETE",
          });
          if (res.ok) {
            fetchRecords();
            showSuccess("Record deleted successfully");
          } else {
            showError("Failed to delete record");
          }
        } catch (error) {
          console.error("Error deleting record:", error);
          showError("An error occurred");
        }
      }
    });
  };

  const handleTransfer = async (id: number, payload: TransferPayload) => {
    const res = await fetch(`/api/archive-data-verification/${id}/transfer`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      fetchRecords();
    } else {
      let errMsg = `Transfer failed (${res.status})`;
      try {
        const errData = await res.json();
        errMsg = errData?.error || errData?.message || errData?.details || errMsg;
      } catch {
        // json parse failed, keep status-based message
      }
      throw new Error(errMsg);
    }
  };

  const handleExportData = () => {
    const filteredRecords = records;
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
    link.setAttribute(
      "download",
      `Archive_Data_Verification_${new Date().toISOString().split("T")[0]}.csv`,
    );
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showSuccess("Data exported successfully");
  };

  // Stats Calculation
  const stats = useMemo(() => {
    const accessibleRecords = userScopedRecords.filter(
      (r) =>
        currentUser?.role === "admin" ||
        currentUser?.role === "super_admin" ||
        r.submitted_by === currentUser?.name,
    );

    const today = getLocalDateString();
    const total = accessibleRecords.length;
    const checked = accessibleRecords.filter(
      (r) => r.check_status === CHECK_STATUS.CHECKED,
    ).length;
    const pending = accessibleRecords.filter(
      (r) => r.check_status === CHECK_STATUS.PENDING,
    ).length;
    const returned = accessibleRecords.filter(
      (r) => r.check_status === CHECK_STATUS.RETURNED,
    ).length;
    const reAudit = accessibleRecords.filter(
      (r) => r.check_status === CHECK_STATUS.RE_AUDIT,
    ).length;
    const onHold = accessibleRecords.filter(
      (r) => r.check_status === "On Hold",
    ).length;
    const withErrors = accessibleRecords.filter(
      (r) => r.errors_count && r.errors_count > 0,
    ).length;
    const todayUploads = accessibleRecords.filter(
      (r) => normalizeDateStr(r.upload_date) === today,
    ).length;

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, "0")}-${String(yesterday.getDate()).padStart(2, "0")}`;

    const yesterdayUploads = accessibleRecords.filter(
      (r) => normalizeDateStr(r.upload_date) === yesterdayStr,
    ).length;

    // আজ vs গতকালের তুলনা
    const todayVsYesterday = todayUploads - yesterdayUploads;

    // Completion rate
    const completionRate = total > 0 ? Math.round((checked / total) * 100) : 0;

    // Error rate
    const errorRate = total > 0 ? Math.round((withErrors / total) * 100) : 0;

    // Pending rate
    const pendingRate = total > 0 ? Math.round((pending / total) * 100) : 0;

    // Total files count (volume metric)
    const totalFilesCount = accessibleRecords.reduce(
      (sum, r) => sum + (r.files_count || 0),
      0,
    );

    // Total errors count (anomalies)
    const totalErrorsCount = accessibleRecords.reduce(
      (sum, r) => sum + (r.errors_count || 0),
      0,
    );

    const errorPct = totalFilesCount > 0 ? parseFloat(((totalErrorsCount / totalFilesCount) * 100).toFixed(1)) : 0;
    const accuracyPct = totalFilesCount > 0 ? parseFloat((100 - errorPct).toFixed(1)) : 100;

    return {
      total,
      checked,
      pending,
      returned,
      reAudit,
      onHold,
      withErrors,
      todayUploads,
      yesterdayUploads,
      todayVsYesterday,
      completionRate,
      errorRate,
      pendingRate,
      totalFilesCount,
      totalErrorsCount,
      errorPct,
      accuracyPct,
    };
  }, [userScopedRecords, currentUser]);

  // Summary Logic
  const summaryData = useMemo(() => {
    const filtered = userScopedRecords.filter((r) => {
      const normalizedUploadStr = normalizeDateStr(r.upload_date);
      const uploadDate = new Date(normalizedUploadStr + "T00:00:00"); // Force midnight local
      const start = new Date(startDate + "T00:00:00");
      const end = new Date(endDate + "T23:59:59");
      return uploadDate >= start && uploadDate <= end;
    });

    const employeeMap = new Map<
      string,
      {
        name: string;
        totalErrors: number;
        totalSubmittedFiles: number;
        uniqueDays: Set<string>;
        totalRows: number;
        totalWorkingDays: number;
      }
    >();

    filtered.forEach((r) => {
      const name = r.submitted_by || "Unknown";
      if (!employeeMap.has(name)) {
        employeeMap.set(name, {
          name,
          totalErrors: 0,
          totalSubmittedFiles: 0,
          uniqueDays: new Set(),
          totalRows: 0,
          totalWorkingDays: 20, // Default or estimated
        });
      }
      const stats = employeeMap.get(name)!;
      stats.totalRows += 1;
      stats.totalErrors += r.errors_count || 0;
      stats.totalSubmittedFiles += r.files_count || 0;
      if (r.upload_date) {
        stats.uniqueDays.add(normalizeDateStr(r.upload_date));
      }
    });

    const result = Array.from(employeeMap.values()).map((e) => ({
      ...e,
      totalDaysWorked: e.uniqueDays.size,
    }));

    result.sort((a, b) => {
      const aErrorRate = a.totalErrors / (a.totalSubmittedFiles || 1);
      const bErrorRate = b.totalErrors / (b.totalSubmittedFiles || 1);
      return bErrorRate - aErrorRate;
    });

    return result;
  }, [userScopedRecords, startDate, endDate]);

  // Auditor Performance Logic
  const auditorPerformance = useMemo(() => {
    const totalPending = records.filter(
      (r) => r.check_status === "Pending",
    ).length;
    const auditorMap = new Map<
      string,
      {
        name: string;
        checked: number;
        returned: number;
        reAudit: number;
        onHold: number;
        dataIssues: number;
        total: number;
      }
    >();

    records.forEach((r) => {
      if (!r.checked_by) return;
      if (!auditorMap.has(r.checked_by)) {
        auditorMap.set(r.checked_by, {
          name: r.checked_by,
          checked: 0,
          returned: 0,
          reAudit: 0,
          onHold: 0,
          dataIssues: 0,
          total: 0,
        });
      }
      const stats = auditorMap.get(r.checked_by)!;
      stats.total += 1;
      if (r.check_status === "Checked") stats.checked += 1;
      if (r.check_status === "Returned") stats.returned += 1;
      if (r.check_status === "Re-Audit") stats.reAudit += 1;
      if (r.check_status === "On Hold") stats.onHold += 1;
      if (r.errors_count && r.errors_count > 0) stats.dataIssues += 1;
    });

    return {
      totalPending,
      stats: Array.from(auditorMap.values()).sort((a, b) => b.total - a.total),
    };
  }, [records]);

  return (
    <div className="space-y-8 px-4 sm:px-6 lg:px-8 py-6 min-h-screen selection:bg-indigo-100 relative">
      {/* Header Area */}
      <header className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 pb-2">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-indigo-600 font-bold text-xs uppercase tracking-[0.2em]">
            <Database className="h-3.5 w-3.5" />
            System Archive
          </div>
          <h1 className="text-4xl font-black text-slate-900 dark:text-slate-50 tracking-tight flex items-center gap-3">
            Data Verification
            <span className="text-slate-200 text-3xl font-thin group-hover:rotate-12 transition-transform">
              /
            </span>
            <span className="text-indigo-600/50 text-2xl font-medium tabular-nums">
              {stats.total}
            </span>
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {(currentUser?.role === "admin" ||
            currentUser?.role === "super_admin") && (
            <div className="flex items-center gap-2 bg-slate-100/80 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/50 rounded-2xl pl-3 pr-1.5 h-[50px]">
              <span className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest whitespace-nowrap">
                Employee
              </span>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 dark:text-slate-500 pointer-events-none" />
                <select
                  value={userFilter}
                  onChange={(e) => setUserFilter(e.target.value)}
                  className="pl-8 pr-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/50 rounded-xl text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-200 outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all appearance-none cursor-pointer"
                >
                  <option value="all">All Employees</option>
                  {uniqueSubmitters.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
          <div className="bg-slate-100/80 backdrop-blur-md p-1.5 rounded-2xl flex gap-1 border border-slate-200 dark:border-slate-700/50">
            <button
              onClick={() => setActiveTab("records")}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all duration-300 ${activeTab === "records" ? "bg-white dark:bg-slate-900 text-indigo-600 shadow-xl shadow-indigo-500/10" : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100"}`}
            >
              <List className="h-4 w-4" />
              Registry
            </button>
            <button
              onClick={() => setActiveTab("summary")}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all duration-300 ${activeTab === "summary" ? "bg-white dark:bg-slate-900 text-indigo-600 shadow-xl shadow-indigo-500/10" : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100"}`}
            >
              <BarChart3 className="h-4 w-4" />
              Analytics
            </button>
            {(currentUser?.role === "admin" ||
              currentUser?.role === "super_admin") && (
              <button
                onClick={() => setActiveTab("auditorInsights")}
                className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all duration-300 ${activeTab === "auditorInsights" ? "bg-white dark:bg-slate-900 text-indigo-600 shadow-xl shadow-indigo-500/10" : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100"}`}
              >
                <User className="h-4 w-4" />
                Auditor Dashboard
              </button>
            )}
            <button
              onClick={() => setActiveTab("todayActivity")}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all duration-300 ${activeTab === "todayActivity" ? "bg-white dark:bg-slate-900 text-indigo-600 shadow-xl shadow-indigo-500/10" : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100"}`}
            >
              <Calendar className="h-4 w-4" />
              Today's Activity
            </button>
            <button
              onClick={() => setActiveTab("accountsTransfer")}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all duration-300 ${activeTab === "accountsTransfer" ? "bg-white dark:bg-slate-900 text-emerald-600 shadow-xl shadow-emerald-500/10" : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100"}`}
            >
              <Send className="h-4 w-4" />
              Transfer
            </button>
          </div>
        </div>
      </header>

      {/* Quick Stats Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-10 gap-4 pb-4">
        {[
          {
            label: "Total Records",
            value: stats.total,
            icon: Database,
            color: "indigo",
            trend: `${stats.total} total`,
            filter: () => {
              setTableFilters({ checkStatus: "all", errorOnly: false });
              setUploadDateFilter(null);
              setActiveTab("records");
            },
          },
          {
            label: "Total Files",
            value: stats.totalFilesCount,
            icon: Database,
            color: "violet",
            trend: `${stats.total} records`,
            filter: () => {
              setTableFilters({ checkStatus: "all", errorOnly: false });
              setUploadDateFilter(null);
              setActiveTab("records");
            },
          },
          {
            label: "Total Errors",
            value: stats.totalErrorsCount,
            icon: AlertTriangle,
            color: "orange",
            trend: `${stats.withErrors} records`,
            errorPct: stats.errorPct,
            accuracyPct: stats.accuracyPct,
            filter: () => {
              setTableFilters({ checkStatus: "all", errorOnly: true });
              setUploadDateFilter(null);
              setActiveTab("records");
            },
          },
          {
            label: "Today Uploads",
            value: stats.todayUploads,
            icon: Send,
            color: "sky",
            trend: stats.todayVsYesterday >= 0 
              ? `+${stats.todayVsYesterday} vs yesterday` 
              : `${stats.todayVsYesterday} vs yesterday`,
            filter: () => {
              setTableFilters({ checkStatus: "all", errorOnly: false });
              setUploadDateFilter(getLocalDateString());
              setActiveTab("records");
            },
          },
          {
            label: "Pending Audit",
            value: stats.pending,
            icon: Clock,
            color: "amber",
            trend: `${stats.pendingRate}% of total`,
            filter: () => {
              setTableFilters({ checkStatus: "Pending", errorOnly: false });
              setUploadDateFilter(null);
              setActiveTab("records");
            },
          },
          {
            label: "Returned",
            value: stats.returned,
            icon: AlertTriangle,
            color: "rose",
            trend: stats.returned > 0 ? "Needs attention" : "All clear",
            filter: () => {
              setTableFilters({ checkStatus: "Returned", errorOnly: false });
              setUploadDateFilter(null);
              setActiveTab("records");
            },
          },
          {
            label: "Re-Audit",
            value: stats.reAudit,
            icon: RotateCcw,
            color: "blue",
            trend: `${stats.reAudit} resubmitted`,
            filter: () => {
              setTableFilters({ checkStatus: "Re-Audit", errorOnly: false });
              setUploadDateFilter(null);
              setActiveTab("records");
            },
          },
          {
            label: "Completed",
            value: stats.checked,
            icon: FileCheck,
            color: "emerald",
            trend: `${stats.completionRate}% rate`,
            filter: () => {
              setTableFilters({ checkStatus: "Checked", errorOnly: false });
              setUploadDateFilter(null);
              setActiveTab("records");
            },
          },
          {
            label: "Data Issues",
            value: stats.withErrors,
            icon: AlertTriangle,
            color: "rose",
            trend: `${stats.errorRate}% of total`,
            filter: () => {
              setTableFilters({ checkStatus: "all", errorOnly: true });
              setUploadDateFilter(null);
              setActiveTab("records");
            },
          },
          {
            label: "On Hold",
            value: stats.onHold,
            icon: Clock,
            color: "slate",
            trend: stats.onHold > 0 ? "Review needed" : "None",
            filter: () => {
              setTableFilters({ checkStatus: "On Hold", errorOnly: false });
              setUploadDateFilter(null);
              setActiveTab("records");
            },
          },
        ].map((stat, i) => {
          const isActive =
            ((stat.label === "Total Records" || stat.label === "Total Files") &&
              tableFilters.checkStatus === "all" &&
              !tableFilters.errorOnly) ||
            (stat.label === "Today Uploads" &&
              tableFilters.checkStatus === "all" &&
              !tableFilters.errorOnly &&
              activeTab === "records") ||
            (stat.label === "Pending Audit" &&
              tableFilters.checkStatus === "Pending") ||
            (stat.label === "Returned" &&
              tableFilters.checkStatus === "Returned") ||
            (stat.label === "Re-Audit" &&
              tableFilters.checkStatus === "Re-Audit") ||
            (stat.label === "On Hold" &&
              tableFilters.checkStatus === "On Hold") ||
            (stat.label === "Completed" &&
              tableFilters.checkStatus === "Checked") ||
            (stat.label === "Data Issues" && tableFilters.errorOnly);

          const borderColors: Record<string, string> = {
            indigo: "border-indigo-200/80",
            sky: "border-sky-200/80",
            amber: "border-amber-200/80",
            rose: "border-rose-200/80",
            blue: "border-blue-200/80",
            emerald: "border-emerald-200/80",
            slate: "border-slate-200/80",
            violet: "border-violet-200/80",
            orange: "border-orange-200/80",
          };

          const activeCardBg: Record<string, string> = {
            indigo: "bg-indigo-600 border-indigo-600",
            sky: "bg-sky-500 border-sky-500",
            amber: "bg-amber-500 border-amber-500",
            rose: "bg-rose-500 border-rose-500",
            blue: "bg-blue-600 border-blue-600",
            emerald: "bg-emerald-500 border-emerald-500",
            slate: "bg-slate-600 border-slate-600",
            violet: "bg-violet-600 border-violet-600",
            orange: "bg-orange-500 border-orange-500",
          };

          return (
            <div
              key={stat.label}
              onClick={stat.filter}
              className={`cursor-pointer backdrop-blur-sm p-4 rounded-3xl border transition-all duration-300 group relative overflow-hidden ${
                isActive && activeTab === "records"
                  ? `${activeCardBg[stat.color] || "bg-indigo-600 border-indigo-600"} shadow-2xl scale-[1.03] -translate-y-1`
                  : `bg-white/40 dark:bg-white/5 ${borderColors[stat.color] || "border-slate-200 dark:border-slate-700"} shadow-sm hover:shadow-lg hover:bg-white/80 dark:hover:bg-white/10 hover:scale-[1.02]`
              }`}
            >
              <div
                className={`inline-flex p-2 rounded-xl mb-2 transition-transform group-hover:scale-105 duration-300 shadow-sm ${
                  isActive && activeTab === "records"
                    ? "bg-white/20 border border-white/30 text-white"
                    : `bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 text-${stat.color}-500/80`
                }`}
              >
                <stat.icon className="h-4 w-4" />
              </div>
              <div className="space-y-0.5">
                <span
                  className={`text-[10px] font-black uppercase tracking-widest block transition-colors duration-300 truncate ${
                    isActive && activeTab === "records"
                      ? "text-white/80"
                      : "text-slate-600 dark:text-slate-300"
                  }`}
                >
                  {stat.label}
                </span>
                <div className="flex items-end gap-1.5">
                  <span className={`text-3xl font-black tabular-nums leading-none tracking-tighter transition-colors duration-300 ${isActive && activeTab === "records" ? "text-white" : "text-slate-900 dark:text-slate-50/80"}`}>
                    {stat.value}
                  </span>
                  <span
                    className={`text-[9px] font-black px-1.5 py-0 rounded-full tracking-wider transition-all duration-300 ${
                      isActive && activeTab === "records"
                        ? "bg-white/20 text-white border border-white/30"
                        : `bg-white dark:bg-slate-900 text-${stat.color}-500/70 border border-slate-100 dark:border-slate-800`
                    }`}
                  >
                    {stat.trend}
                  </span>
                </div>
                {(stat as any).errorPct !== undefined && (
                  <div className="pt-2 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] font-bold text-orange-500 uppercase tracking-wider">Error</span>
                      <span className="text-[9px] font-black text-orange-600 tabular-nums">{(stat as any).errorPct}%</span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-orange-400 transition-all duration-700"
                        style={{ width: `${(stat as any).errorPct}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] font-bold text-emerald-500 uppercase tracking-wider">Accuracy</span>
                      <span className="text-[9px] font-black text-emerald-600 tabular-nums">{(stat as any).accuracyPct}%</span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-emerald-400 transition-all duration-700"
                        style={{ width: `${(stat as any).accuracyPct}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <main className="relative min-h-[600px]">
        <AnimatePresence>
          {activeTab === "records" && (
            <motion.div
              key="records"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="space-y-6"
            >
              {isAdding && (
                <NewEntryForm
                  currentUser={currentUser}
                  dataTypeOptions={dataTypeOptions}
                  onSave={handleAdd}
                  onCancel={() => setIsAdding(false)}
                  onManageTypes={() => setIsManagingTypes(true)}
                />
              )}

              <RecordsTable
                onToggleAdd={() => setIsAdding(!isAdding)}
                records={filteredRecordsForTable}
                loading={loading}
                currentUser={currentUser}
                allEmployees={allEmployees}
                allUsers={allUsers}
                dataTypeOptions={dataTypeOptions}
                isAdding={isAdding}
                advPerms={advPerms}
                onAdd={handleAdd}
                onUpdate={handleUpdate as any}
                onDelete={handleDelete}
                onOpenHistory={openHistory}
                onManageTypes={() => setIsManagingTypes(true)}
                onCancelAdd={() => setIsAdding(false)}
                initialFilters={{
                  checkStatus: tableFilters.checkStatus,
                  user: userFilter,
                  errorOnly: tableFilters.errorOnly,
                }}
              />
            </motion.div>
          )}

          {activeTab === "summary" && (
            <motion.div
              key="summary"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
            >
              <SummaryTab
                summaryData={summaryData}
                startDate={startDate}
                endDate={endDate}
                onStartDateChange={setStartDate}
                onEndDateChange={setEndDate}
                getUserAvatar={(name) => {
                  const u = allUsers.find((u) => u.name === name);
                  return u ? u.avatar || null : null;
                }}
              />
            </motion.div>
          )}

          {activeTab === "auditorInsights" &&
            (currentUser?.role === "admin" ||
              currentUser?.role === "super_admin") && (
              <motion.div
                key="auditorInsights"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
              >
                <AuditorInsightsTab
                  auditorPerformance={auditorPerformance}
                  currentUser={currentUser}
                  getUserAvatar={(name) => {
                    const u = allUsers.find((u) => u.name === name);
                    return u ? u.avatar || null : null;
                  }}
                />
              </motion.div>
            )}

          {activeTab === "todayActivity" && (
            <motion.div
              key="todayActivity"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
            >
              <TodayActivityTab
                records={records}
                getLocalDateString={getLocalDateString}
                normalizeDateStr={normalizeDateStr}
              />
            </motion.div>
          )}

          {activeTab === "accountsTransfer" && (
            <motion.div
              key="accountsTransfer"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
            >
              <AccountsTransferTab
                records={records}
                currentUser={currentUser}
                allUsers={allUsers}
                allEmployees={allEmployees}
                onTransfer={handleTransfer}
                showSuccess={showSuccess}
                showError={showError}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {isManagingTypes && (
        <ManageTypesModal
          isOpen={isManagingTypes}
          onClose={() => setIsManagingTypes(false)}
          dataTypeOptions={dataTypeOptions}
          onAdd={handleAddType}
          onUpdate={handleUpdateType}
          onDelete={handleDeleteType}
        />
      )}

      {showHistory && selectedRecordForHistory && (
        <HistoryModal
          isOpen={showHistory}
          onClose={() => setShowHistory(false)}
          record={selectedRecordForHistory}
          historyData={historyData}
          isLoading={historyLoading}
          getUserAvatar={(name) => {
            const u = allUsers.find((u) => u.name === name);
            return u ? u.avatar || null : null;
          }}
        />
      )}

      {confirmModal.isOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100]
          flex items-center justify-center p-4">
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4"
          >
            <div className="flex items-start gap-3">
              <div className={`p-2 rounded-xl flex-shrink-0 ${
                confirmModal.variant === 'danger' 
                  ? 'bg-red-50' : 'bg-amber-50'
              }`}>
                <AlertTriangle className={`h-5 w-5 ${
                  confirmModal.variant === 'danger' 
                    ? 'text-red-500' : 'text-amber-500'
                }`} />
              </div>
              <div>
                <h3 className="font-bold text-slate-800 text-sm">
                  {confirmModal.title}
                </h3>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  {confirmModal.message}
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setConfirmModal(prev => 
                  ({ ...prev, isOpen: false }))}
                className="px-5 py-2 text-sm font-bold text-slate-500
                  hover:text-slate-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmModal.onConfirm}
                className={`px-5 py-2 text-white text-sm font-bold 
                  rounded-xl shadow-lg active:scale-95 transition-all ${
                  confirmModal.variant === 'danger'
                    ? 'bg-red-600 hover:bg-red-700 shadow-red-600/20'
                    : 'bg-amber-600 hover:bg-amber-700 shadow-amber-600/20'
                }`}
              >
                {confirmModal.variant === 'danger' ? 'Delete' : 'Confirm'}
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Save Success Lottie Modal */}
      <AnimatePresence>
        {showSaveSuccess && (
          <motion.div
            className="fixed inset-0 z-[200] flex items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowSaveSuccess(false)}
          >
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" />

            {/* Lottie + text */}
            <motion.div
              className="relative z-10 flex flex-col items-center gap-1"
              initial={{ scale: 0.6, opacity: 0, y: 30 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.8, opacity: 0, y: 20 }}
              transition={{ type: "spring", stiffness: 280, damping: 20 }}
              onClick={(e) => e.stopPropagation()}
            >
              <Player
                src={emailSentAnimation as any}
                autoplay
                keepLastFrame
                style={{ width: 280, height: 280 }}
                background="transparent"
              />
              <motion.h3
                className="text-xl font-black text-white tracking-tight drop-shadow-lg -mt-4"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
              >
                Record Saved!
              </motion.h3>
              <motion.p
                className="text-sm text-white/80 font-medium drop-shadow"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.45 }}
              >
                New entry added successfully.
              </motion.p>
              <motion.button
                onClick={() => setShowSaveSuccess(false)}
                className="mt-4 px-7 py-2.5 bg-white/20 backdrop-blur-md border border-white/30 text-white text-xs font-black uppercase tracking-widest rounded-2xl hover:bg-white/30 active:scale-95 transition-all"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.55 }}
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.96 }}
              >
                Great!
              </motion.button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {toasts && toasts.length > 0 && (
        <Toast toasts={toasts} dismiss={dismiss} />
      )}
    </div>
  );
};

export default ArchiveDataVerification;