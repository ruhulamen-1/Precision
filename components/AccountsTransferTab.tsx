import React, { useState, useMemo, useCallback } from "react";
import {
  Send,
  Clock,
  CheckCircle2,
  Download,
  User,
  Calendar,
  FileText,
  X,
  AlertCircle,
  History,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { ArchiveDataVerification, AllEmployee, User as UserType } from "../types";
import { getLocalDateString, getLocalTimeString, normalizeDateStr } from "../utils/dateUtils";
import { DEPARTMENTS } from "../constants";

// Default department — preserves existing behaviour for anyone who doesn't
// explicitly change the destination in the transfer modal.
const DEFAULT_TRANSFER_DEPARTMENT = "Accounts & Finance";

interface TransferHistoryEntry {
  id: number;
  record_id: number;
  transferred_by: string | null;
  transferred_to: string | null;
  transfer_date: string | null;
  transfer_time: string | null;
  transfer_notes: string | null;
  transfer_department: string | null;
  created_at: string;
}

interface Props {
  records: ArchiveDataVerification[];
  currentUser?: UserType | null;
  allUsers?: UserType[];
  allEmployees?: AllEmployee[];
  onTransfer: (id: number, payload: TransferPayload) => Promise<void>;
  showSuccess: (msg: string) => void;
  showError: (msg: string) => void;
}

export interface TransferPayload {
  af_transfer_status: "Transferred";
  af_transferred_to: string;
  af_transferred_by: string;
  af_transfer_date: string;
  af_transfer_time: string;
  af_transfer_notes: string;
  af_transfer_department: string;
}

// ── Transfer History Panel ─────────────────────────────────────────────────────
const TransferHistoryPanel: React.FC<{
  recordId: number;
  fileName: string;
  history: TransferHistoryEntry[];
}> = ({ fileName, history }) => {
  const [openDate, setOpenDate] = useState<string | null>(null);

  // Group by transfer_date
  const grouped = useMemo(() => {
    const map: Record<string, TransferHistoryEntry[]> = {};
    history.forEach((h) => {
      const key = h.transfer_date || "Unknown Date";
      if (!map[key]) map[key] = [];
      map[key].push(h);
    });
    // Sort dates descending
    return Object.entries(map).sort(([a], [b]) => b.localeCompare(a));
  }, [history]);

  if (history.length === 0) {
    return (
      <div className="flex items-center gap-2 py-3 text-slate-400">
        <AlertCircle className="h-4 w-4 shrink-0" />
        <span className="text-xs italic">No transfer history found.</span>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <div className="w-7 h-7 rounded-lg bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center shrink-0">
          <History className="h-3.5 w-3.5 text-indigo-500" />
        </div>
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-indigo-500">Transfer History</p>
          <p className="text-xs font-semibold text-slate-600 dark:text-slate-300 truncate max-w-xs">{fileName}</p>
        </div>
        <span className="ml-auto text-[10px] font-bold text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full">
          {history.length} transfer{history.length !== 1 ? "s" : ""} · {grouped.length} date{grouped.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Date list */}
      <div className="space-y-1.5">
        {grouped.map(([date, entries], groupIdx) => {
          const isOpen = openDate === date;
          const totalOnDate = entries.length;
          return (
            <div key={date} className="rounded-xl border border-indigo-100 dark:border-indigo-800 overflow-hidden">
              {/* Date row — clickable */}
              <button
                onClick={() => setOpenDate(isOpen ? null : date)}
                className="w-full flex items-center gap-3 px-4 py-2.5 bg-white dark:bg-slate-900 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors text-left"
              >
                <div className="w-6 h-6 rounded-lg bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center shrink-0">
                  <Calendar className="h-3 w-3 text-indigo-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-200">{date}</span>
                  <span className="ml-2 text-[10px] text-slate-400">
                    {totalOnDate} transfer{totalOnDate !== 1 ? "s" : ""}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {/* Recipient avatars preview */}
                  <div className="flex items-center gap-1">
                    {entries.slice(0, 3).map((e, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 text-[10px] font-semibold rounded-md"
                      >
                        <User className="h-2 w-2" />
                        {e.transferred_to || "—"}
                      </span>
                    ))}
                    {entries.length > 3 && (
                      <span className="text-[10px] text-slate-400">+{entries.length - 3}</span>
                    )}
                  </div>
                  {isOpen ? (
                    <ChevronUp className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                  )}
                </div>
              </button>

              {/* Expanded transfers for this date */}
              {isOpen && (
                <div className="border-t border-indigo-100 dark:border-indigo-800 divide-y divide-indigo-50 dark:divide-indigo-900/30 bg-indigo-50/30 dark:bg-indigo-900/10">
                  {entries.map((h, idx) => (
                    <div key={h.id} className="flex items-start gap-3 px-4 py-3">
                      {/* Index bubble */}
                      <div className="w-5 h-5 rounded-full bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center shrink-0 mt-0.5">
                        <span className="text-[9px] font-black text-indigo-500">
                          {groupIdx === 0 ? history.length - idx : "·"}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          {/* To */}
                          <div className="flex items-center gap-1">
                            <span className="text-[10px] text-slate-400 uppercase tracking-wider">To</span>
                            <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400">{h.transferred_to || "—"}</span>
                          </div>
                          {h.transfer_department && (
                            <>
                              <span className="text-slate-200 dark:text-slate-700">·</span>
                              <span className="inline-flex items-center px-1.5 py-0.5 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 text-[10px] font-semibold rounded-md">
                                {h.transfer_department}
                              </span>
                            </>
                          )}
                          <span className="text-slate-200 dark:text-slate-700">·</span>
                          {/* By */}
                          <div className="flex items-center gap-1">
                            <span className="text-[10px] text-slate-400 uppercase tracking-wider">By</span>
                            <span className="text-xs text-slate-600 dark:text-slate-300">{h.transferred_by || "—"}</span>
                          </div>
                          {/* Time */}
                          {h.transfer_time && (
                            <>
                              <span className="text-slate-200 dark:text-slate-700">·</span>
                              <div className="flex items-center gap-1 text-slate-400">
                                <Clock className="h-2.5 w-2.5" />
                                <span className="text-[10px]">{h.transfer_time}</span>
                              </div>
                            </>
                          )}
                        </div>
                        {h.transfer_notes && (
                          <p className="text-[11px] italic text-slate-400 dark:text-slate-500">"{h.transfer_notes}"</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ── Transfer Modal ─────────────────────────────────────────────────────────────
const TransferModal: React.FC<{
  records: ArchiveDataVerification[];
  currentUser?: UserType | null;
  allEmployees?: AllEmployee[];
  onConfirm: (ids: number[], payload: Omit<TransferPayload, "af_transferred_by">) => void;
  onClose: () => void;
}> = ({ records, currentUser, allEmployees = [], onConfirm, onClose }) => {
  const [selectedIds, setSelectedIds] = useState<number[]>(records.map((r) => r.id));
  const [department, setDepartment] = useState(DEFAULT_TRANSFER_DEPARTMENT);
  const [transferredTo, setTransferredTo] = useState("");
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Employees belonging to the selected destination department, so the
  // "responsible person" list changes with the chosen department instead
  // of always showing Accounts & Finance staff. Pulled from the full
  // employee directory (not just system login users) and sorted by name.
  const deptEmployees = useMemo(() => {
    return allEmployees
      .filter((e) => e.department === department && e.is_active !== false)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [allEmployees, department]);

  // Reset the picked person whenever the destination department changes,
  // since a name from the old department list is no longer valid.
  const handleDepartmentChange = (value: string) => {
    setDepartment(value);
    setTransferredTo("");
  };

  const toggleRecord = (id: number) =>
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );

  const handleSubmit = async () => {
    if (!transferredTo.trim()) return;
    if (!department.trim()) return;
    if (selectedIds.length === 0) return;
    setIsSubmitting(true);
    await onConfirm(selectedIds, {
      af_transfer_status: "Transferred",
      af_transferred_to: transferredTo.trim(),
      af_transfer_date: getLocalDateString(),
      af_transfer_time: getLocalTimeString(),
      af_transfer_notes: notes.trim(),
      af_transfer_department: department.trim(),
    });
    setIsSubmitting(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
              <Send className="w-4 h-4 text-emerald-600" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">Transfer Files</h3>
              <p className="text-xs text-slate-400 mt-0.5">{records.length} file{records.length !== 1 ? "s" : ""} ready to transfer</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto px-6 py-4 space-y-4 flex-1">
          {/* Destination department */}
          <div>
            <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
              Transfer Branch / Department <span className="text-red-500">*</span>
            </label>
            <select
              value={department}
              onChange={(e) => handleDepartmentChange(e.target.value)}
              className="w-full px-3 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-400"
            >
              {DEPARTMENTS.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>

          {/* Responsible person */}
          <div>
            <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
              Responsible Person at {department} <span className="text-red-500">*</span>
            </label>
            {deptEmployees.length > 0 ? (
              <select
                value={transferredTo}
                onChange={(e) => setTransferredTo(e.target.value)}
                className="w-full px-3 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-400"
              >
                <option value="">— Select person —</option>
                {deptEmployees.map((e) => (
                  <option key={e.id} value={e.name}>{e.name} {e.designation ? `(${e.designation})` : ""}</option>
                ))}
                <option value="__custom__">Other (type manually)</option>
              </select>
            ) : null}
            {(deptEmployees.length === 0 || transferredTo === "__custom__") && (
              <input
                type="text"
                placeholder={`Enter name of ${department} responsible person`}
                value={transferredTo === "__custom__" ? "" : transferredTo}
                onChange={(e) => setTransferredTo(e.target.value)}
                className="w-full mt-2 px-3 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-400"
              />
            )}
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
              Transfer Notes (optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any notes about this transfer..."
              rows={2}
              className="w-full px-3 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-sm bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-400 resize-none"
            />
          </div>

          {/* File selection */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Select Files ({selectedIds.length}/{records.length})
              </label>
              <button
                onClick={() =>
                  selectedIds.length === records.length
                    ? setSelectedIds([])
                    : setSelectedIds(records.map((r) => r.id))
                }
                className="text-xs text-emerald-600 font-semibold hover:underline"
              >
                {selectedIds.length === records.length ? "Deselect all" : "Select all"}
              </button>
            </div>
            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {records.map((r) => (
                <label
                  key={r.id}
                  className={`flex items-start gap-3 px-3 py-2.5 rounded-xl cursor-pointer border transition-colors ${
                    selectedIds.includes(r.id)
                      ? "border-emerald-300 bg-emerald-50 dark:bg-emerald-900/20 dark:border-emerald-700"
                      : "border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(r.id)}
                    onChange={() => toggleRecord(r.id)}
                    className="mt-0.5 w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-400"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 truncate">{r.file_name}</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {r.data_type} · {normalizeDateStr(r.upload_date)} · {r.files_count} file{r.files_count !== 1 ? "s" : ""}
                    </p>
                  </div>
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-3 shrink-0">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 font-medium transition-colors">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!transferredTo.trim() || selectedIds.length === 0 || isSubmitting || transferredTo === "__custom__"}
            className="flex items-center gap-2 px-5 py-2 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl shadow-sm active:scale-95 transition-all"
          >
            <Send className="h-3.5 w-3.5" />
            {isSubmitting ? "Transferring…" : `Transfer ${selectedIds.length} File${selectedIds.length !== 1 ? "s" : ""}`}
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Main Tab ───────────────────────────────────────────────────────────────────
const AccountsTransferTab: React.FC<Props> = ({
  records,
  currentUser,
  allUsers = [],
  allEmployees = [],
  onTransfer,
  showSuccess,
  showError,
}) => {
  const [view, setView] = useState<"pending" | "transferred">("pending");
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [expandedDate, setExpandedDate] = useState<string | null>(null);

  // Transfer history per record
  const [expandedHistoryId, setExpandedHistoryId] = useState<number | null>(null);
  const [historyMap, setHistoryMap] = useState<Record<number, TransferHistoryEntry[]>>({});
  const [historyLoading, setHistoryLoading] = useState<number | null>(null);

  const fetchTransferHistory = useCallback(async (recordId: number) => {
    if (historyMap[recordId]) {
      setExpandedHistoryId(prev => prev === recordId ? null : recordId);
      return;
    }
    setHistoryLoading(recordId);
    try {
      const res = await fetch(`/api/archive-data-verification/${recordId}/transfer-history`);
      const data = await res.json();
      setHistoryMap(prev => ({ ...prev, [recordId]: data }));
      setExpandedHistoryId(recordId);
    } catch {
      // silently fail
    } finally {
      setHistoryLoading(null);
    }
  }, [historyMap]);

  // Only "Checked" records qualify for transfer
  const checkedRecords = useMemo(
    () => records.filter((r) => r.check_status === "Checked"),
    [records]
  );

  const pendingTransfer = useMemo(
    () =>
      checkedRecords.filter(
        (r) => !r.af_transfer_status || r.af_transfer_status === "Pending"
      ),
    [checkedRecords]
  );

  const transferred = useMemo(
    () => checkedRecords.filter((r) => r.af_transfer_status === "Transferred"),
    [checkedRecords]
  );

  // Date-filtered transferred list
  const filteredTransferred = useMemo(() => {
    let list = transferred;
    if (dateFrom) list = list.filter((r) => (r.af_transfer_date || "") >= dateFrom);
    if (dateTo) list = list.filter((r) => (r.af_transfer_date || "") <= dateTo);
    return list;
  }, [transferred, dateFrom, dateTo]);

  // Group transferred records by transfer date
  const transferredByDate = useMemo(() => {
    const map: Record<string, ArchiveDataVerification[]> = {};
    filteredTransferred.forEach((r) => {
      const key = r.af_transfer_date || "Unknown Date";
      if (!map[key]) map[key] = [];
      map[key].push(r);
    });
    return Object.entries(map).sort(([a], [b]) => b.localeCompare(a));
  }, [filteredTransferred]);

  const handleTransferConfirm = async (
    ids: number[],
    payload: Omit<TransferPayload, "af_transferred_by">
  ) => {
    const fullPayload: TransferPayload = {
      ...payload,
      af_transferred_by: currentUser?.name || "Unknown",
    };
    let failed = 0;
    let lastError = "";
    for (const id of ids) {
      try {
        await onTransfer(id, fullPayload);
      } catch (err) {
        failed++;
        lastError = err instanceof Error ? err.message : "Unknown error";
      }
    }
    setIsTransferModalOpen(false);
    // Clear cached history for transferred records so it refetches fresh
    setHistoryMap(prev => {
      const updated = { ...prev };
      ids.forEach(id => delete updated[id]);
      return updated;
    });
    if (failed === 0) {
      showSuccess(`${ids.length} file${ids.length !== 1 ? "s" : ""} transferred to ${fullPayload.af_transfer_department}`);
    } else if (failed === ids.length) {
      showError(`Transfer failed: ${lastError}`);
    } else {
      showError(`${failed} of ${ids.length} transfer(s) failed: ${lastError}`);
    }
  };

  const exportCSV = (list: ArchiveDataVerification[], label: string) => {
    if (list.length === 0) return;
    const headers = [
      "ID", "File Name", "Data Type", "Submitted By", "Upload Date",
      "Files Count", "Check Status", "Checked By", "Check Date",
      "Transfer Status", "Transfer Department", "Transferred To", "Transferred By", "Transfer Date", "Transfer Time", "Transfer Notes",
    ];
    const rows = list.map((r) =>
      [
        r.id,
        r.file_name,
        r.data_type,
        r.submitted_by,
        normalizeDateStr(r.upload_date),
        r.files_count,
        r.check_status,
        r.checked_by || "-",
        r.check_date ? normalizeDateStr(r.check_date) : "-",
        r.af_transfer_status || "Pending",
        r.af_transfer_department || "-",
        r.af_transferred_to || "-",
        r.af_transferred_by || "-",
        r.af_transfer_date || "-",
        r.af_transfer_time || "-",
        r.af_transfer_notes || "-",
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(",")
    );
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Transfer_${label}_${getLocalDateString()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const displayList = view === "pending" ? pendingTransfer : filteredTransferred;

  return (
    <div className="space-y-5">
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800 rounded-2xl p-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">Pending Transfer</p>
          <p className="text-3xl font-black text-amber-900 dark:text-amber-100 mt-1 tabular-nums">{pendingTransfer.length}</p>
          <p className="text-[10px] text-amber-400 mt-1">Checked · awaiting transfer</p>
        </div>
        <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800 rounded-2xl p-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">Transferred</p>
          <p className="text-3xl font-black text-emerald-900 dark:text-emerald-100 mt-1 tabular-nums">{transferred.length}</p>
          <p className="text-[10px] text-emerald-400 mt-1">Sent to respective departments</p>
        </div>
        <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700 rounded-2xl p-4 sm:col-span-1 col-span-2">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Total Checked</p>
          <p className="text-3xl font-black text-slate-800 dark:text-slate-100 mt-1 tabular-nums">{checkedRecords.length}</p>
          <p className="text-[10px] text-slate-400 mt-1">Eligible for transfer</p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-xl gap-1">
          <button
            onClick={() => setView("pending")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              view === "pending"
                ? "bg-white dark:bg-slate-700 text-amber-600 shadow-sm"
                : "text-slate-500 dark:text-slate-400 hover:text-slate-700"
            }`}
          >
            <Clock className="h-3.5 w-3.5" />
            Pending ({pendingTransfer.length})
          </button>
          <button
            onClick={() => setView("transferred")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              view === "transferred"
                ? "bg-white dark:bg-slate-700 text-emerald-600 shadow-sm"
                : "text-slate-500 dark:text-slate-400 hover:text-slate-700"
            }`}
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            Transferred ({transferred.length})
          </button>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {view === "transferred" && (
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="text-xs px-2.5 py-1.5 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-400"
              />
              <span className="text-xs text-slate-400">to</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="text-xs px-2.5 py-1.5 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-400"
              />
              {(dateFrom || dateTo) && (
                <button onClick={() => { setDateFrom(""); setDateTo(""); }} className="p-1.5 text-slate-400 hover:text-red-500 transition-colors">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          )}

          <button
            onClick={() => exportCSV(displayList, view === "pending" ? "Pending" : "Transferred")}
            disabled={displayList.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs font-semibold rounded-lg transition-colors disabled:opacity-40"
          >
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </button>

          {pendingTransfer.length > 0 && (
            <button
              onClick={() => setIsTransferModalOpen(true)}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-semibold rounded-lg shadow-sm active:scale-95 transition-all"
            >
              <Send className="h-3.5 w-3.5" />
              Transfer
            </button>
          )}
        </div>
      </div>

      {/* Table — Pending view */}
      {view === "pending" && (
        <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl overflow-hidden">
          {pendingTransfer.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16">
              <CheckCircle2 className="h-12 w-12 mb-3 text-slate-200 dark:text-slate-700" />
              <p className="text-sm font-semibold text-slate-400 dark:text-slate-500">No files pending transfer</p>
              <p className="text-xs text-slate-300 dark:text-slate-600 mt-1">All checked files have been transferred</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800">
                    <th className="text-left px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">File Name</th>
                    <th className="text-left px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">Data Type</th>
                    <th className="text-left px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">Upload Date</th>
                    <th className="text-left px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">Files</th>
                    <th className="text-left px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">Checked By</th>
                    <th className="text-left px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                  {pendingTransfer.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-700 dark:text-slate-200 truncate max-w-[160px]">{r.file_name}</p>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">{r.data_type}</td>
                      <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">{normalizeDateStr(r.upload_date)}</td>
                      <td className="px-4 py-3 text-xs font-semibold text-slate-600 dark:text-slate-300">{r.files_count}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <div className="w-5 h-5 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center shrink-0">
                            <User className="h-2.5 w-2.5 text-indigo-500" />
                          </div>
                          <span className="text-xs text-slate-600 dark:text-slate-300 truncate max-w-[100px]">{r.checked_by || "-"}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 text-[10px] font-bold rounded-full">
                          <Clock className="h-2.5 w-2.5" />
                          Pending
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Date-grouped accordion — Transferred view */}
      {view === "transferred" && (
        <div className="space-y-2">
          {transferredByDate.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl flex flex-col items-center justify-center py-16">
              <FileText className="h-12 w-12 mb-3 text-slate-200 dark:text-slate-700" />
              <p className="text-sm font-semibold text-slate-400 dark:text-slate-500">No transferred files found</p>
              <p className="text-xs text-slate-300 dark:text-slate-600 mt-1">
                {dateFrom || dateTo ? "Try adjusting the date filter" : "Transfer pending files to see them here"}
              </p>
            </div>
          ) : (
            transferredByDate.map(([date, files]) => {
              const isOpen = expandedDate === date;
              const recipients = [...new Set(files.map((f) => f.af_transferred_to).filter(Boolean))];
              return (
                <div key={date} className="rounded-2xl border border-slate-100 dark:border-slate-800 overflow-hidden">
                  {/* Date header row — clickable */}
                  <button
                    onClick={() => setExpandedDate(isOpen ? null : date)}
                    className="w-full flex items-center gap-4 px-5 py-4 bg-white dark:bg-slate-900 hover:bg-emerald-50 dark:hover:bg-emerald-900/10 transition-colors text-left"
                  >
                    {/* Date icon */}
                    <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center shrink-0">
                      <Calendar className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                    </div>

                    {/* Date + meta */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-slate-800 dark:text-slate-100">{date}</p>
                      <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                        <span className="text-[10px] text-slate-400">
                          {files.length} file{files.length !== 1 ? "s" : ""} transferred
                        </span>
                        {recipients.length > 0 && (
                          <div className="flex items-center gap-1">
                            <span className="text-[10px] text-slate-400">→</span>
                            {recipients.slice(0, 3).map((name, i) => (
                              <span key={i} className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 text-[10px] font-semibold rounded-md">
                                <User className="h-2 w-2" />
                                {name}
                              </span>
                            ))}
                            {recipients.length > 3 && (
                              <span className="text-[10px] text-slate-400">+{recipients.length - 3} more</span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* File count badge + chevron */}
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-xs font-black text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 px-2.5 py-1 rounded-lg tabular-nums">
                        {files.length}
                      </span>
                      {isOpen
                        ? <ChevronUp className="h-4 w-4 text-emerald-400" />
                        : <ChevronDown className="h-4 w-4 text-slate-400" />
                      }
                    </div>
                  </button>

                  {/* Expanded file table */}
                  {isOpen && (
                    <div className="border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/20">
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-slate-100/70 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800">
                              <th className="text-left px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">File Name</th>
                              <th className="text-left px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">Data Type</th>
                              <th className="text-left px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">Upload Date</th>
                              <th className="text-left px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">Files</th>
                              <th className="text-left px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">Checked By</th>
                              <th className="text-left px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">Department</th>
                              <th className="text-left px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">Transferred To</th>
                              <th className="text-left px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">Transferred By</th>
                              <th className="text-left px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">Time</th>
                              <th className="text-left px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">Notes</th>
                              <th className="text-left px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">History</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {files.map((r) => (
                              <React.Fragment key={r.id}>
                                <tr className="hover:bg-white dark:hover:bg-slate-800/40 transition-colors">
                                  <td className="px-4 py-3">
                                    <p className="font-semibold text-slate-700 dark:text-slate-200 truncate max-w-[160px]">{r.file_name}</p>
                                  </td>
                                  <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">{r.data_type}</td>
                                  <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">{normalizeDateStr(r.upload_date)}</td>
                                  <td className="px-4 py-3 text-xs font-semibold text-slate-600 dark:text-slate-300">{r.files_count}</td>
                                  <td className="px-4 py-3">
                                    <div className="flex items-center gap-1.5">
                                      <div className="w-5 h-5 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center shrink-0">
                                        <User className="h-2.5 w-2.5 text-indigo-500" />
                                      </div>
                                      <span className="text-xs text-slate-600 dark:text-slate-300 truncate max-w-[100px]">{r.checked_by || "-"}</span>
                                    </div>
                                  </td>
                                  <td className="px-4 py-3">
                                    {r.af_transfer_department ? (
                                      <span className="inline-flex items-center px-1.5 py-0.5 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 text-[10px] font-semibold rounded-md truncate max-w-[110px]">
                                        {r.af_transfer_department}
                                      </span>
                                    ) : (
                                      <span className="text-xs text-slate-300">-</span>
                                    )}
                                  </td>
                                  <td className="px-4 py-3">
                                    <div className="flex items-center gap-1.5">
                                      <div className="w-5 h-5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center shrink-0">
                                        <User className="h-2.5 w-2.5 text-emerald-500" />
                                      </div>
                                      <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 truncate max-w-[100px]">{r.af_transferred_to || "-"}</span>
                                    </div>
                                  </td>
                                  <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400 truncate max-w-[100px]">{r.af_transferred_by || "-"}</td>
                                  <td className="px-4 py-3">
                                    {r.af_transfer_time
                                      ? <span className="text-xs text-slate-500 dark:text-slate-400">{r.af_transfer_time}</span>
                                      : <span className="text-xs text-slate-300">-</span>
                                    }
                                  </td>
                                  <td className="px-4 py-3 text-xs text-slate-400 italic max-w-[120px] truncate">{r.af_transfer_notes || "-"}</td>
                                  <td className="px-4 py-3">
                                    <button
                                      onClick={() => fetchTransferHistory(r.id)}
                                      className="flex items-center gap-1 px-2 py-1 text-[10px] font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/20 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 rounded-lg transition-colors"
                                    >
                                      {historyLoading === r.id
                                        ? <Clock className="h-3 w-3 animate-spin" />
                                        : <History className="h-3 w-3" />
                                      }
                                      {expandedHistoryId === r.id ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                                    </button>
                                  </td>
                                </tr>
                                {expandedHistoryId === r.id && (
                                  <tr className="bg-indigo-50/30 dark:bg-indigo-900/5">
                                    <td colSpan={11} className="px-6 py-4 bg-indigo-50/40 dark:bg-indigo-900/10">
                                      <TransferHistoryPanel
                                        recordId={r.id}
                                        fileName={r.file_name}
                                        history={historyMap[r.id] || []}
                                      />
                                    </td>
                                  </tr>
                                )}
                              </React.Fragment>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Transfer modal */}
      {isTransferModalOpen && (
        <TransferModal
          records={pendingTransfer}
          currentUser={currentUser}
          allEmployees={allEmployees}
          onConfirm={handleTransferConfirm}
          onClose={() => setIsTransferModalOpen(false)}
        />
      )}
    </div>
  );
};

export default AccountsTransferTab;