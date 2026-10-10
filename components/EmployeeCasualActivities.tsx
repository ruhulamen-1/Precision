import React, { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { User, AllEmployee } from "../types";
import { getEffectivePermissions } from "../utils/permissionUtils";
import { DEPARTMENTS } from "../constants";
import {
  Clock, ChevronDown, ChevronUp, Search, X, Image as ImageIcon,
  BarChart2, FileText, PenLine, RefreshCw, Plus, ArrowRight, Trash2, ShoppingCart, Shield,
} from "lucide-react";

import CasualActivityForm from "./CasualActivityForm";
import CasualActionPanel from "./CasualActionPanel";
import RecycleBinModal from "./RecycleBinModal";
import SpecialObservationForm from "./SpecialObservationForm";
import ScrollingActivityImages from "./ScrollingActivityImages";
import TimelineImageModal from "./TimelineImageModal";
import CasualAdminPanel from "./CasualAdminPanel";
import CasualReportModal from "./CasualReportModal";
import CasualPreview from "./CasualPreview";
import CasualBatchReportGenerator from "./CasualBatchReportGenerator";
import SpecialObsReportModal from "./SpecialObsReportModal";
import SpecialObsPreview from "./SpecialObsPreview";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CasualActivityEntry {
  id: string | number;
  date: string;
  time?: string;
  employeeIds: string[];
  remarks?: string;
  screenshots?: string[];
  is_deleted?: boolean;
  isNew?: boolean;
  isTemporary?: boolean;
  user_id?: string | number;
}

interface EmployeeCasualActivitiesProps {
  currentUser: User;
  allEmployees: AllEmployee[];
  allUsers?: User[];
  onNewActivity?: (activity: CasualActivityEntry) => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const getTimeZoneName = (time: string): string => {
  if (!time) return "Outside Office Hours";
  const [h, m] = time.split(":").map(Number);
  const t = h + m / 60;
  if (t >= 9  && t < 11) return "Morning Drive";
  if (t >= 11 && t < 14) return "Core Hours";
  if (t >= 14 && t < 15) return "Lunch Block";
  if (t >= 15 && t <= 18) return "Evening Shift";
  return "Outside Office Hours";
};

const formatDateShort = (dateStr: string): string => {
  if (!dateStr) return "";
  const d = new Date(`${dateStr.split("T")[0]}T00:00:00`);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
};

const getCurrentTime = (): string => {
  const n = new Date();
  return `${String(n.getHours()).padStart(2, "0")}:${String(n.getMinutes()).padStart(2, "0")}`;
};

const generateId = (): number => Date.now() + Math.random();

// ─── Stat Card ────────────────────────────────────────────────────────────────

const StatCard: React.FC<{
  label: string; value: string | number; sub: string;
  color: "sky"|"emerald"|"amber"|"purple"|"rose"|"orange"|"indigo";
  onClick?: () => void; children?: React.ReactNode;
}> = ({ label, value, sub, color, onClick, children }) => {
  const base: Record<string, string> = {
    sky:"bg-sky-50 border-sky-100 text-sky-600", emerald:"bg-emerald-50 border-emerald-100 text-emerald-600",
    amber:"bg-amber-50 border-amber-100 text-amber-600", purple:"bg-purple-50 border-purple-100 text-purple-600",
    rose:"bg-rose-50 border-rose-100 text-rose-600", orange:"bg-orange-50 border-orange-100 text-orange-600",
    indigo:"bg-indigo-50 border-indigo-100 text-indigo-600",
  };
  const val: Record<string, string> = {
    sky:"text-sky-900", emerald:"text-emerald-900", amber:"text-amber-900", purple:"text-purple-900",
    rose:"text-rose-900", orange:"text-orange-900", indigo:"text-indigo-900",
  };
  const s: Record<string, string> = {
    sky:"text-sky-400", emerald:"text-emerald-400", amber:"text-amber-400", purple:"text-purple-400",
    rose:"text-rose-400", orange:"text-orange-400", indigo:"text-indigo-400",
  };
  return (
    <div className={`${base[color]} border rounded-2xl p-4 flex flex-col justify-between ${onClick ? "cursor-pointer hover:brightness-95 transition-all" : ""}`} onClick={onClick}>
      <div>
        <p className={`text-[10px] font-semibold uppercase tracking-wider ${base[color].split(" ")[2]}`}>{label}</p>
        {children ? <div className="mt-2">{children}</div> : <p className={`mt-1 text-2xl font-bold truncate ${val[color]}`}>{value}</p>}
      </div>
      <p className={`mt-2 text-[10px] ${s[color]}`}>{sub}</p>
    </div>
  );
};

// ─── Logger Modal ─────────────────────────────────────────────────────────────

const LoggerModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  currentUser: User;
  allEmployees: AllEmployee[];
  allUsers?: User[];
  onEntrySaved?: (entry: CasualActivityEntry) => void;
}> = ({ isOpen, onClose, currentUser, allEmployees, allUsers = [], onEntrySaved }) => {

  const isAdmin = ["Admin", "Super Admin", "admin", "super_admin"].includes(currentUser.role ?? "");
  const [globalDate, setGlobalDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [entries, setEntries] = useState<CasualActivityEntry[]>([]);
  const [allEntries, setAllEntries] = useState<CasualActivityEntry[]>([]);
  const [lastFocusedRowId, setLastFocusedRowId] = useState<string | number | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [remarksList, setRemarksList] = useState<string[]>([]);
  const addRowBtnRef = useRef<HTMLButtonElement>(null);

  // ── Log search (name / date / department) ──────────────────────────────────
  const [searchName, setSearchName] = useState("");
  const [searchDept, setSearchDept] = useState("");
  const [searchDate, setSearchDate] = useState("");
  const isSearchActive = searchName.trim() !== "" || searchDept !== "" || searchDate !== "";

  const employeeLookup = useMemo(() => {
    const map = new Map<string, { name: string; department: string }>();
    allEmployees.forEach((e) => map.set(e.employee_id, { name: e.name, department: e.department }));
    return map;
  }, [allEmployees]);

  const searchResults = useMemo(() => {
    if (!isSearchActive) return [];
    const nameQuery = searchName.trim().toLowerCase();
    return allEntries
      .filter((e) => !e.is_deleted)
      .filter((e) => {
        const matchedEmployees = (e.employeeIds ?? []).map((id) => employeeLookup.get(id)).filter(Boolean) as { name: string; department: string }[];
        const nameMatch =
          nameQuery === "" ||
          matchedEmployees.some((emp) => emp.name.toLowerCase().includes(nameQuery)) ||
          (e.remarks ?? "").toLowerCase().includes(nameQuery);
        const deptMatch = searchDept === "" || matchedEmployees.some((emp) => emp.department === searchDept);
        const dateMatch = searchDate === "" || e.date?.split("T")[0] === searchDate;
        return nameMatch && deptMatch && dateMatch;
      })
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  }, [isSearchActive, allEntries, employeeLookup, searchName, searchDept, searchDate]);

  const clearSearch = () => {
    setSearchName("");
    setSearchDept("");
    setSearchDate("");
  };

  const jumpToEntryDate = (date: string) => {
    setGlobalDate(date.split("T")[0]);
    clearSearch();
  };

  // map allEmployees to format expected by ActivityRow
  // Only active employees should be selectable when logging a new entry;
  // inactive (offboarded) employees from System Management must not appear here.
  const employeesForForm = useMemo(() =>
    allEmployees.filter(e => e.is_active).map(e => ({ id: e.employee_id, name: e.name, department: e.department, designation: e.designation })),
    [allEmployees]
  );

  // Fetch today's entries and remarks on open
  useEffect(() => {
    if (!isOpen) return;
    const fetchData = async () => {
      try {
        const [entriesRes, remarksRes] = await Promise.all([
          fetch("/api/activity_entries"),
          fetch("/api/remarks"),
        ]);
        if (entriesRes.ok) {
          const data: CasualActivityEntry[] = await entriesRes.json();
          const todayEntries = data.filter((e) => !e.is_deleted && e.date?.split("T")[0] === globalDate);
          setEntries(todayEntries);
          setAllEntries(data);
        }
        if (remarksRes.ok) {
          const rData = await remarksRes.json();
          setRemarksList(Array.isArray(rData) ? rData.map((r: any) => r.name || r) : []);
        }
      } catch (err) {
        console.error("Failed to fetch logger data", err);
      }
    };
    fetchData();
  }, [isOpen, globalDate]);

  const handleAddRow = useCallback(() => {
    const newEntry: CasualActivityEntry = {
      id: generateId(),
      date: globalDate,
      employeeIds: [],
      time: getCurrentTime(),
      remarks: "",
      screenshots: [],
      isNew: true,
      isTemporary: true,
      user_id: currentUser.id,
    };
    setEntries((prev) => [...prev, newEntry]);
    setAllEntries((prev) => [...prev, newEntry]);
    setLastFocusedRowId(newEntry.id);
  }, [globalDate, currentUser.id]);

  const handleUpdateRow = useCallback((updated: CasualActivityEntry) => {
    setEntries((prev) => prev.map((e) => String(e.id) === String(updated.id) ? updated : e));
    setAllEntries((prev) => prev.map((e) => String(e.id) === String(updated.id) ? updated : e));
  }, []);

  const handleRemoveRow = useCallback((id: string | number) => {
    const strId = String(id);
    // A row that was already auto-saved to the backend (isTemporary/isNew cleared
    // once handleSaveRow persists it) must be soft-deleted server-side too, or a
    // page reload will re-fetch it from /api/activity_entries and it'll reappear.
    const target = entries.find((e) => String(e.id) === strId);
    const alreadySaved = target && !target.isTemporary && !target.isNew;

    setEntries((prev) => prev.filter((e) => String(e.id) !== strId));
    setAllEntries((prev) => prev.filter((e) => String(e.id) !== strId));

    if (alreadySaved) {
      fetch(`/api/activity_entries/${strId}/soft-delete`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deleted_by: currentUser.id }),
      })
        .then(() => window.dispatchEvent(new CustomEvent("casual-activity-updated")))
        .catch((err) => console.error("Soft-delete failed", err));
    }
  }, [entries, currentUser.id]);

  const handleSaveRow = useCallback(async (entryToSave: CasualActivityEntry) => {
    const clean = { ...entryToSave };
    delete clean.isTemporary;
    delete clean.isNew;
    setEntries((prev) => prev.map((e) => String(e.id) === String(clean.id) ? clean : e));
    setAllEntries((prev) => prev.map((e) => String(e.id) === String(clean.id) ? clean : e));
    // Save to backend
    try {
      await fetch("/api/activity_entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(clean),
      });
      // Let the Dashboard's activity photo strip know immediately, instead of
      // it having to wait for its own next mount/poll to pick this up.
      window.dispatchEvent(new CustomEvent("casual-activity-updated"));
      onEntrySaved?.(clean);
    } catch (err) {
      console.error("Save failed", err);
    }
  }, [onEntrySaved]);

  const handleManualSync = async () => {
    setIsSyncing(true);
    try {
      const toSync = entries.filter((e) => !e.isTemporary && !e.is_deleted);
      await fetch("/api/activity_entries/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toSync),
      });
      window.dispatchEvent(new CustomEvent("casual-activity-updated"));
    } catch (err) {
      console.error("Sync failed", err);
    } finally {
      setIsSyncing(false);
    }
  };

  const hasPermission = (perm: string) => {
    if (isAdmin) return true;
    const p = currentUser.permissions as any;
    // flat key (e.g. can_edit_activity)
    if (p?.[perm]) return true;
    // nested key (e.g. employeeCasualActivities.edit / view)
    if (p?.employeeCasualActivities?.edit) return true;
    return false;
  };

  const canEditActivity = isAdmin || hasPermission("can_edit_activity") || hasPermission("can_edit_data");
  const canDeleteActivity = isAdmin || hasPermission("can_delete_activity") || hasPermission("can_edit_data");

  const getImage = async (key: string) => {
    if (!key) return null;
    if (key.startsWith('data:')) return key;
    try {
      const res = await fetch(`/api/media/${key}`);
      if (res.ok) {
        const json = await res.json();
        return json.data || null;
      }
    } catch {}
    return null;
  };

  const deleteImage = async (key: string) => {
    try { await fetch(`/api/media/${key}`, { method: "DELETE" }); } catch {}
  };

  if (!isOpen) return null;

  return (
    <div className="min-h-screen bg-transparent">
      {/* ── Full-page Header ── */}
      <div className="bg-white border-b border-slate-100 shadow-sm sticky top-0 z-30">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14 gap-4">
            <div className="flex items-center gap-3">
              <button
                onClick={onClose}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors"
              >
                <ArrowRight className="h-4 w-4 rotate-180" />
                Back
              </button>
              <div className="w-px h-5 bg-slate-200" />
              <div className="h-8 w-8 rounded-xl bg-orange-100 flex items-center justify-center">
                <PenLine className="h-4 w-4 text-orange-600" />
              </div>
              <div>
                <p className="text-sm font-extrabold text-slate-800 leading-none">Open Logger</p>
                <p className="text-[10px] text-slate-400 leading-none mt-0.5">Employee Casual Activity Entry</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-xl px-2 py-1.5">
                <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Date:</label>
                <div className="flex flex-col">
                  <button
                    type="button"
                    onClick={() => {
                      const [y, m, day] = globalDate.split("-").map(Number);
                      const d = new Date(y, m - 1, day + 1);
                      const yy = d.getFullYear();
                      const mm = String(d.getMonth() + 1).padStart(2, "0");
                      const dd = String(d.getDate()).padStart(2, "0");
                      setGlobalDate(`${yy}-${mm}-${dd}`);
                    }}
                    className="p-0 text-slate-400 hover:text-orange-500 hover:bg-orange-50 rounded transition-colors leading-none"
                    title="Next day"
                  >
                    <ChevronUp className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const [y, m, day] = globalDate.split("-").map(Number);
                      const d = new Date(y, m - 1, day - 1);
                      const yy = d.getFullYear();
                      const mm = String(d.getMonth() + 1).padStart(2, "0");
                      const dd = String(d.getDate()).padStart(2, "0");
                      setGlobalDate(`${yy}-${mm}-${dd}`);
                    }}
                    className="p-0 text-slate-400 hover:text-orange-500 hover:bg-orange-50 rounded transition-colors leading-none"
                    title="Previous day"
                  >
                    <ChevronDown className="h-3 w-3" />
                  </button>
                </div>
                <input
                  type="date"
                  value={globalDate}
                  onChange={(e) => setGlobalDate(e.target.value)}
                  className="text-xs font-bold text-slate-700 bg-transparent outline-none"
                />
              </div>
              <button
                onClick={handleManualSync}
                disabled={isSyncing}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500 text-white text-xs font-bold rounded-xl hover:bg-emerald-600 transition-all disabled:opacity-60"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? "animate-spin" : ""}`} />
                {isSyncing ? "Syncing…" : "Sync"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Log Search Bar ── */}
      <div className="bg-slate-50 border-b border-slate-100">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-2.5 flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 flex-1 min-w-[180px]">
            <Search className="h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              value={searchName}
              onChange={(e) => setSearchName(e.target.value)}
              placeholder="Name বা remarks দিয়ে খুঁজুন..."
              className="text-xs font-medium text-slate-700 bg-transparent outline-none w-full"
            />
          </div>
          <select
            value={searchDept}
            onChange={(e) => setSearchDept(e.target.value)}
            className="text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 outline-none"
          >
            <option value="">সব Department</option>
            {DEPARTMENTS.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
          <input
            type="date"
            value={searchDate}
            onChange={(e) => setSearchDate(e.target.value)}
            className="text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 outline-none"
          />
          {isSearchActive && (
            <button
              type="button"
              onClick={clearSearch}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-bold text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors"
            >
              <X className="h-3.5 w-3.5" />
              Clear
            </button>
          )}
        </div>
      </div>

      {/* ── Full-page Body ── */}
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-6">

        {isSearchActive ? (
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-4 py-2.5 border-b border-slate-100 bg-slate-50">
              <p className="text-xs font-bold text-slate-600">{searchResults.length}টি entry পাওয়া গেছে</p>
            </div>
            {searchResults.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-slate-300">
                <Search className="h-10 w-10 mb-3 opacity-30" />
                <p className="text-sm font-semibold text-slate-400">কোনো entry পাওয়া যায়নি</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 text-slate-500 uppercase text-[10px]">
                    <tr>
                      <th className="px-4 py-2 text-left">Date</th>
                      <th className="px-4 py-2 text-left">Time</th>
                      <th className="px-4 py-2 text-left">Employee(s)</th>
                      <th className="px-4 py-2 text-left">Department</th>
                      <th className="px-4 py-2 text-left">Remarks</th>
                      <th className="px-4 py-2 text-left"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {searchResults.map((entry) => {
                      const matched = (entry.employeeIds ?? []).map((id) => employeeLookup.get(id)).filter(Boolean) as { name: string; department: string }[];
                      return (
                        <tr key={entry.id} className="hover:bg-orange-50/40">
                          <td className="px-4 py-2.5 font-semibold text-slate-700 whitespace-nowrap">{formatDateShort(entry.date)}</td>
                          <td className="px-4 py-2.5 text-slate-500 whitespace-nowrap">{entry.time || "—"}</td>
                          <td className="px-4 py-2.5 text-slate-700">{matched.map((m) => m.name).join(", ") || "—"}</td>
                          <td className="px-4 py-2.5 text-slate-500">{[...new Set(matched.map((m) => m.department))].join(", ") || "—"}</td>
                          <td className="px-4 py-2.5 text-slate-600 max-w-xs truncate" title={entry.remarks}>{entry.remarks || "—"}</td>
                          <td className="px-4 py-2.5 text-right whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => jumpToEntryDate(entry.date)}
                              className="text-orange-600 font-bold hover:underline"
                            >
                              Open Day
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : (
        <>
          <CasualActivityForm
            entries={entries.filter((e) => !e.is_deleted)}
            allEntries={allEntries}
            onUpdateRow={handleUpdateRow}
            onRemoveRow={handleRemoveRow}
            onSaveRow={handleSaveRow}
            isEditing={false}
            onRowFocus={setLastFocusedRowId}
            lastFocusedRowId={lastFocusedRowId}
            employees={employeesForForm}
            availableRemarks={remarksList}
            isAdmin={isAdmin}
            allProfiles={allUsers}
            showDate={false}
            currentUserId={currentUser.id}
            getImage={getImage}
            deleteImage={deleteImage}
            hasPermission={hasPermission}
          />

          <CasualActionPanel
            ref={addRowBtnRef}
            onAddRow={handleAddRow}
            onClearAll={() => {
              if (window.confirm("Clear all rows for today?")) {
                setEntries([]);
              }
            }}
            canEditActivity={canEditActivity}
            canDeleteActivity={canDeleteActivity}
          />


        {entries.filter((e) => !e.is_deleted).length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-slate-300">
            <PenLine className="h-12 w-12 mb-3 opacity-30" />
            <p className="text-sm font-semibold text-slate-400">No entries for {formatDateShort(globalDate)}</p>
            <p className="text-xs text-slate-300 mt-1">Click "Add New Row" below to start logging</p>
          </div>
        )}
        </>
        )}

        {/* Activity Images Marquee */}
        {(() => {
          const allImages = entries
            .filter((e) => !e.is_deleted && (e.screenshots?.length ?? 0) > 0)
            .flatMap((e) =>
              (e.screenshots ?? []).map((key) => ({
                key,
                remark: e.remarks ?? "",
                date: e.date,
              }))
            );
          return null;
        })()}
      </div>
    </div>
  );
};


// ─── Special Observations Logger (full-page, mirrors LoggerModal design) ──────

const SpecialObsLogger: React.FC<{
  onClose: () => void;
  currentUser: User;
  allEmployees: AllEmployee[];
  allUsers?: User[];
  isAdmin: boolean;
}> = ({ onClose, currentUser, allEmployees, allUsers = [], isAdmin }) => {
  const [globalDate, setGlobalDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [entries, setEntries] = useState<any[]>([]);
  const [lastFocusedRowId, setLastFocusedRowId] = useState<any>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [remarksList, setRemarksList] = useState<string[]>([]);
  const [isSpecialReportModalOpen, setIsSpecialReportModalOpen] = useState(false);
  const [isSpecialPreviewing, setIsSpecialPreviewing] = useState(false);
  const [specialPreviewData, setSpecialPreviewData] = useState<{ entries: any[]; date: string } | null>(null);
  const [allSpecialObsForReport, setAllSpecialObsForReport] = useState<any[]>([]);

  // Only active employees should be selectable when logging a new entry;
  // inactive (offboarded) employees from System Management must not appear here.
  const employeesForForm = useMemo(() =>
    allEmployees.filter(e => e.is_active).map(e => ({ id: e.employee_id, name: e.name, department: e.department, designation: e.designation })),
    [allEmployees]
  );

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [entriesRes, remarksRes] = await Promise.all([
          fetch("/api/special_observations"),
          fetch("/api/remarks"),
        ]);
        if (entriesRes.ok) {
          const data: any[] = await entriesRes.json();
          const notDeleted = data.filter((e) => !e.is_deleted);
          setAllSpecialObsForReport(notDeleted);
          setEntries(notDeleted.filter((e) => e.date?.split("T")[0] === globalDate));
        }
        if (remarksRes.ok) {
          const rData = await remarksRes.json();
          setRemarksList(Array.isArray(rData) ? rData.map((r: any) => r.name || r) : []);
        }
      } catch (err) {
        console.error("Failed to fetch special obs data", err);
      }
    };
    fetchData();
  }, [globalDate]);

  const handleAddRow = useCallback(() => {
    const newEntry = {
      id: Date.now() + Math.random(),
      date: globalDate,
      employeeIds: [],
      time: getCurrentTime(),
      remarks: "",
      observation_details: "",
      screenshots: [],
      isNew: true,
      isTemporary: true,
      user_id: currentUser.id,
    };
    setEntries((prev) => [...prev, newEntry]);
    setLastFocusedRowId(newEntry.id);
  }, [globalDate, currentUser.id]);

  const handleUpdateRow = useCallback((updated: any) => {
    setEntries((prev) => prev.map((e) => String(e.id) === String(updated.id) ? updated : e));
  }, []);

  const handleRemoveRow = useCallback((id: any) => {
    setEntries((prev) => prev.filter((e) => String(e.id) !== String(id)));
  }, []);

  const handleSaveRow = useCallback(async (entryToSave: any) => {
    const clean = { ...entryToSave };
    delete clean.isTemporary;
    delete clean.isNew;
    setEntries((prev) => prev.map((e) => String(e.id) === String(clean.id) ? clean : e));
    try {
      await fetch("/api/special_observations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(clean),
      });
    } catch (err) {
      console.error("Save failed", err);
    }
  }, []);

  const handleManualSync = async () => {
    setIsSyncing(true);
    try {
      const toSync = entries.filter((e) => !e.isTemporary && !e.is_deleted);
      await fetch("/api/special_observations/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toSync),
      });
    } catch (err) {
      console.error("Sync failed", err);
    } finally {
      setIsSyncing(false);
    }
  };

  const hasPermission = (perm: string) => {
    if (isAdmin) return true;
    const p = currentUser.permissions as any;
    if (p?.[perm]) return true;
    if (p?.specialObservations?.edit) return true;
    return false;
  };

  const canEdit = isAdmin || hasPermission("can_edit_activity") || hasPermission("can_edit_data");
  const canDelete = isAdmin || hasPermission("can_delete_activity") || hasPermission("can_edit_data");

  const getImage = async (key: string) => {
    if (!key) return null;
    if (key.startsWith("data:")) return key;
    try {
      const res = await fetch(`/api/media/${key}`);
      if (res.ok) { const json = await res.json(); return json.data || null; }
    } catch {}
    return null;
  };

  const deleteImage = async (key: string) => {
    try { await fetch(`/api/media/${key}`, { method: "DELETE" }); } catch {}
  };

  const handleGenerateSpecialReport = useCallback((startDate: string, endDate: string, filters: any) => {
    let filtered = allSpecialObsForReport.filter((s: any) => {
      const d = s.date?.split("T")[0];
      return d >= startDate && d <= endDate;
    });
    if (filters.department) {
      const empIds = allEmployees.filter(e => e.department === filters.department).map(e => e.employee_id);
      filtered = filtered.filter((s: any) =>
        !s.employeeIds?.length || s.employeeIds.some((id: string) => empIds.includes(id))
      );
    }
    if (filters.employeeIds?.length > 0) {
      filtered = filtered.filter((s: any) =>
        s.employeeIds?.some((id: string) => filters.employeeIds.includes(id))
      );
    }
    if (filtered.length === 0) { alert("No special observations found for selected filters."); return; }
    const dateRange = startDate === endDate ? startDate : `${startDate} to ${endDate}`;
    setSpecialPreviewData({ entries: filtered, date: dateRange });
    setIsSpecialReportModalOpen(false);
    setIsSpecialPreviewing(true);
  }, [allSpecialObsForReport, allEmployees]);

  // ── Special Obs Preview (full-page) ─────────────────────────────────────────
  if (isSpecialPreviewing && specialPreviewData) {
    return (
      <SpecialObsPreview
        entries={specialPreviewData.entries}
        date={specialPreviewData.date}
        onClose={() => { setIsSpecialPreviewing(false); setSpecialPreviewData(null); }}
        employees={allEmployees.map(e => ({ id: e.employee_id, name: e.name, designation: e.designation, department: e.department }))}
      />
    );
  }

  return (
    <div className="min-h-screen bg-transparent">
      {/* ── Header ── */}
      <div className="bg-white border-b border-slate-100 shadow-sm sticky top-0 z-30">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14 gap-4">
            <div className="flex items-center gap-3">
              <button
                onClick={onClose}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors"
              >
                <ArrowRight className="h-4 w-4 rotate-180" />
                Back
              </button>
              <div className="w-px h-5 bg-slate-200" />
              <div className="h-8 w-8 rounded-xl bg-amber-100 flex items-center justify-center">
                <ShoppingCart className="h-4 w-4 text-amber-600" />
              </div>
              <div>
                <p className="text-sm font-extrabold text-slate-800 leading-none">Special Observations</p>
                <p className="text-[10px] text-slate-400 leading-none mt-0.5">Special Observation Entry Logger</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5">
                <label className="text-[10px] font-bold text-slate-400 uppercase">Date:</label>
                <input
                  type="date"
                  value={globalDate}
                  onChange={(e) => setGlobalDate(e.target.value)}
                  className="text-xs font-bold text-slate-700 bg-transparent outline-none dark:[color-scheme:dark]"
                />
              </div>
              <button
                onClick={handleManualSync}
                disabled={isSyncing}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500 text-white text-xs font-bold rounded-xl hover:bg-emerald-600 transition-all disabled:opacity-60"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? "animate-spin" : ""}`} />
                {isSyncing ? "Syncing…" : "Sync"}
              </button>
              <button
                onClick={() => setIsSpecialReportModalOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 text-white text-xs font-bold rounded-xl hover:bg-amber-600 transition-all"
              >
                <FileText className="h-3.5 w-3.5" />
                Report
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Special Obs Report Modal ── */}
      {isSpecialReportModalOpen && (
        <SpecialObsReportModal
          onClose={() => setIsSpecialReportModalOpen(false)}
          onGenerate={handleGenerateSpecialReport}
          employees={allEmployees.map(e => ({ employee_id: e.employee_id, id: e.employee_id, name: e.name, department: e.department, designation: e.designation }))}
        />
      )}

      {/* ── Body ── */}
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <SpecialObservationForm
          entries={entries.filter((e) => !e.is_deleted)}
          onUpdateRow={handleUpdateRow}
          onRemoveRow={handleRemoveRow}
          onSaveRow={handleSaveRow}
          isEditing={isAdmin}
          onRowFocus={setLastFocusedRowId}
          lastFocusedRowId={lastFocusedRowId}
          employees={employeesForForm}
          availableRemarks={remarksList}
          isAdmin={isAdmin}
          allProfiles={allUsers}
          showDate={false}
          currentUserId={currentUser.id}
          getImage={getImage}
          deleteImage={deleteImage}
          hasPermission={hasPermission}
        />

        <CasualActionPanel
          onAddRow={handleAddRow}
          onClearAll={() => {
            if (window.confirm("Clear all rows for today?")) setEntries([]);
          }}
          canEditActivity={canEdit}
          canDeleteActivity={canDelete}
        />

        {entries.filter((e) => !e.is_deleted).length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-slate-300">
            <ShoppingCart className="h-12 w-12 mb-3 opacity-30" />
            <p className="text-sm font-semibold text-slate-400">No special observations for {formatDateShort(globalDate)}</p>
            <p className="text-xs text-slate-300 mt-1">Click "Add New Row" below to start logging</p>
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────

const EmployeeCasualActivities: React.FC<EmployeeCasualActivitiesProps> = ({
  currentUser,
  allEmployees,
  allUsers = [],
  onNewActivity,
}) => {
  const permissions = getEffectivePermissions(currentUser);
  const isAdmin = ["Admin", "Super Admin", "admin", "super_admin"].includes(currentUser.role ?? "");

  // ── Access Control ────────────────────────────────────────────────────────
  const canViewCasualActivities = isAdmin || !!(permissions as any)?.employeeCasualActivities?.view;

  // ── Data ─────────────────────────────────────────────────────────────────
  const allActivityEntries: CasualActivityEntry[] = useMemo(() => [], []);

  // ── State ─────────────────────────────────────────────────────────────────
  const [isLoggerOpen, setIsLoggerOpen] = useState(false);
  const [isRecycleBinOpen, setIsRecycleBinOpen] = useState(false);
  const [isSpecialObsOpen, setIsSpecialObsOpen] = useState(false);
  const [isAdminPanelOpen, setIsAdminPanelOpen] = useState(false);
  const [specialObsEntries, setSpecialObsEntries] = useState<any[]>([]);
  const [specialObsLastFocused, setSpecialObsLastFocused] = useState<any>(null);
  const [recycleBinEntries, setRecycleBinEntries] = useState<CasualActivityEntry[]>([]);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [entriesForPreview, setEntriesForPreview] = useState<{ groupedEntries: any[]; date: string; departmentName?: string } | null>(null);
  const [batchReports, setBatchReports] = useState<{ department: string; originalEntries: CasualActivityEntry[]; groupedEntries: any[]; date: string }[] | null>(null);
  const [headerSlot, setHeaderSlot] = useState<HTMLElement | null>(null);

  // Locate the toolbar slot rendered by the global Header for this view.
  useEffect(() => {
    const el = document.getElementById("casual-activities-header-slot");
    setHeaderSlot(el);
  }, []);

  const [allEntriesForReport, setAllEntriesForReport] = useState<CasualActivityEntry[]>([]);
  const [remarksList, setRemarksList] = useState<string[]>([]);

  const fetchRecycleBin = useCallback(async () => {
    try {
      const res = await fetch("/api/activity_entries/deleted");
      if (res.ok) {
        const data: CasualActivityEntry[] = await res.json();
        setRecycleBinEntries(data);
      }
    } catch (err) {
      console.error("Failed to fetch recycle bin", err);
    }
  }, []);

  const handleOpenRecycleBin = () => {
    fetchRecycleBin();
    setIsRecycleBinOpen(true);
  };

  const handleRestoreEntry = useCallback(async (entry: CasualActivityEntry) => {
    try {
      await fetch(`/api/activity_entries/${entry.id}/restore`, { method: "PATCH" });
      setRecycleBinEntries((prev) => prev.filter((e) => String(e.id) !== String(entry.id)));
    } catch (err) {
      console.error("Restore failed", err);
    }
  }, []);

  const handleDeletePermanently = useCallback(async (id: string | number) => {
    if (!window.confirm("এই activity টি চিরতরে মুছে ফেলবেন? এটি আর ফিরিয়ে আনা যাবে না।")) return;
    try {
      await fetch(`/api/activity_entries/${id}`, { method: "DELETE" });
      setRecycleBinEntries((prev) => prev.filter((e) => String(e.id) !== String(id)));
    } catch (err) {
      console.error("Permanent delete failed", err);
    }
  }, []);
  const [trendDays, setTrendDays] = useState<number | "this_month">(7);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedTimelineImage, setSelectedTimelineImage] = useState<{ screenshotKey: string; remark: string; date: string } | null>(null);
  const [isDeptDropdownOpen, setIsDeptDropdownOpen] = useState(false);
  const [deptSearchQuery, setDeptSearchQuery] = useState("");
  const [selectedDepts, setSelectedDepts] = useState<string[]>(["All"]);

  const deptDropdownRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const lastSeenIdRef = useRef<string | null>(null);

  // ── Detect new entries ────────────────────────────────────────────────────
  useEffect(() => {
    if (!onNewActivity || allActivityEntries.length === 0) return;
    const sorted = [...allActivityEntries].filter((e) => !e.is_deleted).sort((a, b) => {
      const da = `${a.date}T${a.time ?? "00:00"}`;
      const db = `${b.date}T${b.time ?? "00:00"}`;
      return db.localeCompare(da);
    });
    const latest = sorted[0];
    if (!latest) return;
    const key = String(latest.id ?? `${latest.date}-${latest.time}`);
    if (lastSeenIdRef.current === null) { lastSeenIdRef.current = key; return; }
    if (key !== lastSeenIdRef.current) { lastSeenIdRef.current = key; onNewActivity(latest); }
  }, [allActivityEntries, onNewActivity]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (deptDropdownRef.current && !deptDropdownRef.current.contains(e.target as Node)) {
        setIsDeptDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const toggleDepartment = (dept: string) => {
    setSelectedDepts((prev) => {
      if (dept === "All") return ["All"];
      let next = prev.filter((d) => d !== "All");
      if (next.includes(dept)) { next = next.filter((d) => d !== dept); if (next.length === 0) return ["All"]; return next; }
      return [...next, dept];
    });
  };

  // ── Trend dates ───────────────────────────────────────────────────────────
  const trendDates = useMemo(() => {
    const today = new Date();
    const dates: string[] = [];
    if (trendDays === "this_month") {
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      const diffDays = Math.ceil((today.getTime() - startOfMonth.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      for (let i = diffDays - 1; i >= 0; i--) { const d = new Date(today); d.setDate(today.getDate() - i); dates.push(d.toISOString().split("T")[0]); }
    } else {
      for (let i = (trendDays as number) - 1; i >= 0; i--) { const d = new Date(today); d.setDate(today.getDate() - i); dates.push(d.toISOString().split("T")[0]); }
    }
    return dates;
  }, [trendDays]);

  // ── Stats ─────────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    // Step 1: dept-filtered base (no date filter) — used only for timeline source
    const deptFiltered = allEntriesForReport.filter((e) => {
      if (e.is_deleted) return false;
      if (selectedDepts.includes("All")) return true;
      return (e.employeeIds || []).some((id) => {
        const emp = allEmployees.find((em) => em.employee_id === id);
        return emp && selectedDepts.includes(emp.department);
      });
    });

    // Step 2: period-filtered entries (dept + date range) — source of truth for all stat cards
    const periodEntries = deptFiltered.filter((e) => {
      const d = (e.date || "").split("T")[0];
      return trendDates.includes(d);
    });

    // Chart: count per date
    const entriesByDate: Record<string, number> = {};
    trendDates.forEach((d) => (entriesByDate[d] = 0));
    periodEntries.forEach((e) => {
      const d = e.date.split("T")[0];
      entriesByDate[d] = (entriesByDate[d] || 0) + 1;
    });

    // Peak Time — from periodEntries only (fix: was using all-time deptFiltered)
    const timeOfDayStats: Record<string, number> = {
      "Morning Drive": 0, "Core Hours": 0, "Lunch Block": 0,
      "Evening Shift": 0, "Outside Office Hours": 0,
    };
    // Peak Period — from periodEntries only (fix: was using all-time deptFiltered)
    const monthPeriodStats = { beginning: 0, middle: 0, end: 0 };
    // Top Remark — from periodEntries only
    const remarkStats: Record<string, number> = {};
    // Top Performer — from periodEntries only
    const empWorkload: Record<string, number> = {};

    periodEntries.forEach((e) => {
      // Peak time
      if (e.time) {
        const name = getTimeZoneName(e.time);
        timeOfDayStats[name] = (timeOfDayStats[name] || 0) + 1;
      }
      // Peak period: use T00:00:00 suffix to avoid UTC timezone day-shift bug
      const day = new Date(`${e.date.split("T")[0]}T00:00:00`).getDate();
      if (day <= 10) monthPeriodStats.beginning++;
      else if (day <= 20) monthPeriodStats.middle++;
      else monthPeriodStats.end++;
      // Top remark
      if (e.remarks) remarkStats[e.remarks] = (remarkStats[e.remarks] || 0) + 1;
      // Top performer
      (e.employeeIds || []).forEach((id) => {
        empWorkload[id] = (empWorkload[id] || 0) + 1;
      });
    });

    const busiestDayPart =
      Object.entries(timeOfDayStats).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "N/A";
    const monthPeriodLabels: Record<string, string> = {
      beginning: "Beginning (শুরুতে)", middle: "Middle (মাঝখানে)", end: "End (শেষের দিকে)",
    };
    const busiestMonthPeriod =
      monthPeriodLabels[Object.entries(monthPeriodStats).sort((a, b) => b[1] - a[1])[0]?.[0]] ?? "N/A";
    const topRemark =
      Object.entries(remarkStats).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "N/A";
    const sortedEmps = Object.entries(empWorkload)
      .map(([id, count]) => {
        const emp = allEmployees.find((e) => e.employee_id === id);
        return { id, name: emp?.name ?? "Unknown", count };
      })
      .sort((a, b) => b.count - a.count);
    const topPerformerName = sortedEmps[0]?.name ?? "N/A";

    // Chart data
    const chartData = trendDates.map((date) => {
      const d = new Date(`${date}T00:00:00`);
      return {
        fullDate: date,
        date: date.split("-").slice(1).join("/"),
        dayName: d.toLocaleDateString("en-US", { weekday: "short" }),
        count: entriesByDate[date] ?? 0,
      };
    });
    const maxCount = Math.max(...chartData.map((d) => d.count), 1);

    // Timeline: dept filtered, then date-filtered if selected
    // Fix: parentheses around condition to avoid operator precedence bug
    let filteredTimeline = deptFiltered;
    if (selectedDate) {
      filteredTimeline = deptFiltered.filter((e) => e.date.split("T")[0] === selectedDate);
    } else if (startDate && endDate) {
      filteredTimeline = deptFiltered.filter((e) => {
        const d = e.date.split("T")[0];
        return d >= startDate && d <= endDate;
      });
    }
    const timelineEntries = [...filteredTimeline]
      .sort((a, b) => {
        const dc = (b.date || "").localeCompare(a.date || "");
        if (dc !== 0) return dc;
        return (b.time || "").localeCompare(a.time || "");
      })
      .slice(0, (selectedDate || (startDate && endDate)) ? undefined : 15); // fix: parentheses

    // Active employees count
    const activeEmployees = new Set<string>();
    periodEntries.forEach((e) => (e.employeeIds || []).forEach((id) => activeEmployees.add(id)));

    // Collect images for scrolling marquee (from period entries)
    const activityImages: { key: string; remark: string; date: string }[] = [];
    periodEntries.forEach((e) => {
      if (e.screenshots && e.screenshots.length > 0) {
        e.screenshots.forEach((key) => {
          activityImages.push({ key, remark: e.remarks ?? "", date: e.date });
        });
      }
    });

    return {
      totalEntries: periodEntries.length,
      activeEmployees: activeEmployees.size,
      chartData,
      maxCount,
      timelineEntries,
      activityImages,
      busiestDayPart,
      busiestMonthPeriod,
      topRemark,
      topPerformerName,
      topEmployees: sortedEmps.slice(0, 5),
    };
  }, [trendDates, selectedDepts, selectedDate, startDate, endDate, allEntriesForReport, allEmployees]);

  // ── Auto-scroll timeline ──────────────────────────────────────────────────
  useEffect(() => {
    const container = timelineRef.current;
    if (!container) return;
    let interval: ReturnType<typeof setInterval>;
    const startScroll = () => { interval = setInterval(() => { if (container.scrollTop + container.clientHeight >= container.scrollHeight - 10) { container.scrollTo({ top: 0, behavior: "smooth" }); } else { container.scrollBy({ top: 60, behavior: "smooth" }); } }, 2500); };
    const t = setTimeout(startScroll, 1000);
    const pause = () => clearInterval(interval);
    const resume = () => startScroll();
    container.addEventListener("mouseenter", pause);
    container.addEventListener("mouseleave", resume);
    return () => { clearTimeout(t); clearInterval(interval); container.removeEventListener("mouseenter", pause); container.removeEventListener("mouseleave", resume); };
  }, [stats.timelineEntries]);

  const getEmployeeNames = (ids: string[]): string => {
    if (!ids?.length) return "Unknown";
    return ids.map((id) => allEmployees.find((e) => e.employee_id === id)?.name ?? id).join(", ");
  };

  const availableDepts = DEPARTMENTS;
  const filteredDepts = availableDepts.filter((d) => d.toLowerCase().includes(deptSearchQuery.toLowerCase()));

  // ── Group entries by employee (for Preview/Report) ──────────────────────────
  const groupEntries = useCallback((entriesToGroup: CasualActivityEntry[]) => {
    if (!entriesToGroup || entriesToGroup.length === 0) return [];
    const expandedEntries = entriesToGroup.flatMap(entry =>
      entry.employeeIds && entry.employeeIds.length > 0
        ? entry.employeeIds.map(empId => ({ ...entry, employeeId: empId }))
        : []
    );
    const groupedMap = new Map<string, any>();
    for (const entry of expandedEntries) {
      const activity = { date: entry.date, time: entry.time, remarks: entry.remarks, observation_details: (entry as any).observation_details, screenshots: entry.screenshots, id: entry.id };
      if (groupedMap.has(entry.employeeId)) {
        groupedMap.get(entry.employeeId).activities.push(activity);
      } else {
        groupedMap.set(entry.employeeId, { employeeId: entry.employeeId, id: `group-${entry.employeeId}`, activities: [activity], count: 0 });
      }
    }
    const finalGroups = Array.from(groupedMap.values());
    finalGroups.forEach(g => { g.count = g.activities.length; });
    return finalGroups;
  }, []);

  // Fetch all entries for reports
  const fetchAllEntries = useCallback(async () => {
    try {
      const [entriesRes, remarksRes] = await Promise.all([
        fetch("/api/activity_entries"),
        fetch("/api/remarks"),
      ]);
      if (entriesRes.ok) {
        const data: CasualActivityEntry[] = await entriesRes.json();
        setAllEntriesForReport(data.filter(e => !e.is_deleted));
      }
      if (remarksRes.ok) {
        const rData = await remarksRes.json();
        setRemarksList(Array.isArray(rData) ? rData.map((r: any) => r.name || r) : []);
      }
    } catch (err) {
      console.error("Failed to fetch entries for report", err);
    }
  }, []);

  useEffect(() => {
    fetchAllEntries();
    // Refetch the moment an entry is saved (from the logger modal, on this
    // page or another tab of it) so the stat cards, chart, timeline, and
    // photo strip below update immediately instead of needing a reload.
    window.addEventListener("casual-activity-updated", fetchAllEntries);
    return () => window.removeEventListener("casual-activity-updated", fetchAllEntries);
  }, [fetchAllEntries]);

  const getImage = async (key: string) => {
    if (!key) return null;
    if (key.startsWith("data:")) return key;
    try {
      const res = await fetch(`/api/media/${key}`);
      if (res.ok) { const json = await res.json(); return json.data || null; }
    } catch {}
    return null;
  };

  const handlePreviewToday = () => {
    const today = new Date().toISOString().split("T")[0];
    const todayEntries = allEntriesForReport.filter(e => e.date?.split("T")[0] === today && e.employeeIds?.length > 0 && e.remarks);
    if (todayEntries.length === 0) { alert("No complete entries found for today."); return; }
    setEntriesForPreview({ groupedEntries: groupEntries(todayEntries), date: today });
    setIsPreviewing(true);
  };

  const handleGenerateReport = useCallback((startDate: string, endDate: string, filters: any) => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const allEntries: CasualActivityEntry[] = [];
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dateString = d.toISOString().split("T")[0];
      const daily = allEntriesForReport.filter(e => e.date?.split("T")[0] === dateString && !e.is_deleted && e.employeeIds?.some(id => id) && e.remarks);
      allEntries.push(...daily.map(e => ({ ...e, date: dateString })));
    }
    const uniqueMap = new Map<string, CasualActivityEntry>();
    allEntries.forEach(e => {
      const key = `${e.date}|${e.time}|${(e.employeeIds || []).sort().join(",")}|${(e.remarks || "").trim()}`;
      if (!uniqueMap.has(key)) uniqueMap.set(key, e);
    });
    // ── Generate separate PDF for each department ──
    if (filters.isSeparateByDept) {
      const allUnique = Array.from(uniqueMap.values());
      const selectedDepts: string[] = filters.selectedDepartments?.length > 0
        ? filters.selectedDepartments
        : [...new Set(allEmployees.map(e => e.department))].sort();
      const excluded: string[] = filters.excludedDepartments || [];
      const depts = selectedDepts.filter(d => !excluded.includes(d));

      const dateRange = startDate === endDate ? startDate : `${startDate} to ${endDate}`;
      const reports: { department: string; originalEntries: CasualActivityEntry[]; groupedEntries: any[]; date: string }[] = [];

      for (const dept of depts) {
        const empIdsInDept = allEmployees.filter(e => e.department === dept).map(e => e.employee_id);
        empIdsInDept.push(`DEP_${dept}`);

        let deptEntries = allUnique
          .filter(e => e.employeeIds?.some(id => empIdsInDept.includes(id)))
          .map(e => ({ ...e, employeeIds: e.employeeIds!.filter(id => empIdsInDept.includes(id)) }));

        if (filters.customEmployeeIds?.length > 0) {
          deptEntries = deptEntries.filter(e => e.employeeIds?.some(id => filters.customEmployeeIds.includes(id)));
        }
        if (filters.remarksText) {
          const term = filters.remarksText.toLowerCase();
          deptEntries = deptEntries.filter(e => (e.remarks || "").toLowerCase().includes(term));
        }

        if (deptEntries.length > 0) {
          reports.push({
            department: dept,
            originalEntries: deptEntries,
            groupedEntries: groupEntries(deptEntries),
            date: dateRange,
          });
        }
      }

      if (reports.length === 0) { alert("No activity data found for the selected departments."); return; }
      setBatchReports(reports);
      setIsReportModalOpen(false);
      return;
    }

    let filtered = Array.from(uniqueMap.values());
    if (filters.department) {
      const empIds = allEmployees.filter(e => e.department === filters.department).map(e => e.employee_id);
      empIds.push(`DEP_${filters.department}`);
      filtered = filtered.filter(e => e.employeeIds?.some(id => empIds.includes(id)));
    }
    if (filters.customEmployeeIds?.length > 0) {
      filtered = filtered.filter(e => e.employeeIds?.some(id => filters.customEmployeeIds.includes(id)));
    }
    if (filters.remarksText) {
      const term = filters.remarksText.toLowerCase();
      filtered = filtered.filter(e => (e.remarks || "").toLowerCase().includes(term));
    }
    if (filtered.length === 0) { alert("No activity data found for the selected filters."); return; }
    const dateRange = startDate === endDate ? startDate : `${startDate} to ${endDate}`;
    setEntriesForPreview({ groupedEntries: groupEntries(filtered), date: dateRange });
    setIsReportModalOpen(false);
    setIsPreviewing(true);
  }, [allEntriesForReport, allEmployees, groupEntries]);

  const canOpenLogger = isAdmin || (permissions as any)?.employeeCasualActivities?.edit;

  // ─── Render ────────────────────────────────────────────────────────────────

  // Departmental (separate PDF per department) batch report
  if (batchReports) {
    return (
      <CasualBatchReportGenerator
        reports={batchReports}
        logo={null}
        employees={allEmployees.map(e => ({ id: e.employee_id, name: e.name, designation: e.designation, department: e.department, email: (e as any).email }))}
        onComplete={() => setBatchReports(null)}
        isAdmin={isAdmin}
        allProfiles={allUsers}
        getImage={getImage}
        hasPermission={(perm: string) => isAdmin || !!(currentUser.permissions as any)?.[perm]}
      />
    );
  }

  // Preview full-page
  if (isPreviewing && entriesForPreview) {
    return (
      <CasualPreview
        groupedEntries={entriesForPreview.groupedEntries}
        date={entriesForPreview.date}
        departmentName={entriesForPreview.departmentName}
        onClose={() => { setIsPreviewing(false); setEntriesForPreview(null); }}
        logo={null}
        employees={allEmployees.map(e => ({ id: e.employee_id, name: e.name, designation: e.designation, department: e.department, email: (e as any).email }))}
        isBatchMode={false}
        onReady={() => {}}
        isAdmin={isAdmin}
        allProfiles={allUsers}
        getImage={getImage}
        hasPermission={(perm: string) => isAdmin || !!(currentUser.permissions as any)?.[perm]}
      />
    );
  }

  // Open Logger click হলে dashboard সরে full-page logger দেখায়
  if (isLoggerOpen) {
    return (
      <LoggerModal
        isOpen={true}
        onClose={() => setIsLoggerOpen(false)}
        currentUser={currentUser}
        allEmployees={allEmployees}
        allUsers={allUsers}
        onEntrySaved={(entry) => onNewActivity?.(entry)}
      />
    );
  }

  // Special Observations full-page view
  if (isSpecialObsOpen) {
    return (
      <SpecialObsLogger
        onClose={() => setIsSpecialObsOpen(false)}
        currentUser={currentUser}
        allEmployees={allEmployees}
        allUsers={allUsers}
        isAdmin={isAdmin}
      />
    );
  }

  // ── Access Denied gate ────────────────────────────────────────────────────
  if (!canViewCasualActivities) {
    return (
      <div className="min-h-screen bg-transparent flex flex-col items-center justify-center text-slate-400 gap-4">
        <Shield className="h-14 w-14 opacity-20" />
        <div className="text-center">
          <p className="text-lg font-black text-slate-600 uppercase tracking-widest">Access Denied</p>
          <p className="text-sm mt-1">You don't have permission to view Casual Activities.</p>
          <p className="text-xs mt-1 text-slate-400">Contact an Admin to request access.</p>
        </div>
      </div>
    );
  }

  // Compact toolbar rendered into the global Header's tab-ribbon slot for
  // this view (Open Logger, Preview, Report, Recycle Bin, Admin, Dept, Date).
  const casualToolbar = (
    <>
      {/* Open Logger Button */}
      {canOpenLogger && (
        <button
          onClick={() => setIsLoggerOpen(true)}
          className="flex items-center gap-1.5 px-3.5 py-1.5 bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold rounded-lg shadow-sm shadow-orange-500/25 transition-all active:scale-95"
        >
          <PenLine className="h-3.5 w-3.5" />
          Open Logger
        </button>
      )}

      {/* Report Buttons */}
      <button
        onClick={handlePreviewToday}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-50 hover:bg-sky-100 text-sky-700 text-xs font-bold rounded-lg border border-sky-200 transition-all active:scale-95"
        title="Preview today's activities"
      >
        <FileText className="h-3.5 w-3.5" />
        Preview
      </button>
      <button
        onClick={() => setIsReportModalOpen(true)}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-bold rounded-lg border border-emerald-200 transition-all active:scale-95"
        title="Generate custom report"
      >
        <BarChart2 className="h-3.5 w-3.5" />
        Report
      </button>

      {/* Recycle Bin Button (admin only) */}
      {isAdmin && (
        <button
          onClick={handleOpenRecycleBin}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 text-xs font-bold rounded-lg border border-red-200 transition-all active:scale-95"
          title="Recycle Bin"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Recycle Bin
        </button>
      )}

      {/* Admin Panel Button (admin only) */}
      {isAdmin && (
        <button
          onClick={() => setIsAdminPanelOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-50 hover:bg-purple-100 text-purple-700 text-xs font-bold rounded-lg border border-purple-200 transition-all active:scale-95"
          title="User Management"
        >
          <Shield className="h-3.5 w-3.5" />
          Admin
        </button>
      )}

      {/* Dept filter */}
      <div className="relative" ref={deptDropdownRef}>
        <button onClick={() => setIsDeptDropdownOpen((v) => !v)} className="flex items-center gap-1.5 bg-white px-2.5 py-1.5 rounded-lg border border-slate-200 shadow-sm hover:bg-slate-50 transition-all text-xs">
          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Dept:</span>
          <span className="font-bold text-orange-600 max-w-[110px] truncate text-xs">
            {selectedDepts.includes("All") ? "All Departments" : selectedDepts.length === 1 ? selectedDepts[0] : `${selectedDepts.length} Selected`}
          </span>
          <ChevronDown className={`h-3.5 w-3.5 text-slate-400 transition-transform ${isDeptDropdownOpen ? "rotate-180" : ""}`} />
        </button>

        {isDeptDropdownOpen && (
          <div className="absolute top-full right-0 mt-2 w-64 bg-white rounded-2xl shadow-2xl border border-slate-100 z-[110] overflow-hidden">
            <div className="p-3 border-b border-slate-50 flex justify-between items-center bg-slate-50/50">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Select Departments</span>
              <button onClick={() => { setSelectedDepts(["All"]); setDeptSearchQuery(""); }} className="text-[10px] font-bold text-orange-600 hover:text-orange-700">Reset</button>
            </div>
            <div className="p-2 border-b border-slate-50">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                <input type="text" placeholder="Search departments..." value={deptSearchQuery} onChange={(e) => setDeptSearchQuery(e.target.value)} className="w-full pl-8 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400" />
              </div>
            </div>
            <div className="max-h-56 overflow-y-auto p-2">
              <label className="flex items-center gap-3 p-2 hover:bg-slate-50 rounded-lg cursor-pointer">
                <input type="checkbox" checked={selectedDepts.includes("All")} onChange={() => toggleDepartment("All")} className="w-4 h-4 rounded border-slate-300 text-orange-500 focus:ring-orange-400" />
                <span className={`text-sm font-medium ${selectedDepts.includes("All") ? "text-orange-600" : "text-slate-700"}`}>All Departments</span>
              </label>
              <div className="my-1 border-t border-slate-50" />
              {filteredDepts.length === 0 ? (
                <p className="p-2 text-xs text-slate-400 text-center">No departments found</p>
              ) : (
                filteredDepts.map((dept) => (
                  <label key={dept} className="flex items-center gap-3 p-2 hover:bg-slate-50 rounded-lg cursor-pointer">
                    <input type="checkbox" checked={selectedDepts.includes(dept)} onChange={() => toggleDepartment(dept)} className="w-4 h-4 rounded border-slate-300 text-orange-500 focus:ring-orange-400" />
                    <span className={`text-sm font-medium ${selectedDepts.includes(dept) ? "text-orange-600" : "text-slate-700"}`}>{dept}</span>
                  </label>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      <div className="text-right hidden sm:block ml-1">
        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest leading-tight">Today</p>
        <p className="text-[11px] font-bold text-slate-700 leading-tight">{new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</p>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-transparent text-slate-900">
      <div className="max-w-[1400px] mx-auto px-4 py-6 sm:px-6 lg:px-8">

        {/* Toolbar: portaled into the global Header when its slot is present, otherwise shown in-page as a fallback */}
        {headerSlot
          ? createPortal(casualToolbar, headerSlot)
          : (
            <div className="flex items-center gap-3 flex-wrap justify-end mb-4">
              {casualToolbar}
            </div>
          )}

        {/* ── Stat Cards ── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-6">
          <StatCard label="Total Casual Activities" value={stats.totalEntries} sub={trendDays === "this_month" ? "This Month" : `Last ${trendDays} days`} color="sky" />
          <StatCard label="Casual Active Employees" value={stats.activeEmployees} sub="Involved this period" color="emerald" />
          <StatCard label="Peak Time (Day)" value={stats.busiestDayPart} sub="Most active part of day" color="rose" />
          <StatCard label="Peak Period (Month)" value={stats.busiestMonthPeriod} sub="Most active part of month" color="purple" />
          <StatCard label="Top Casual Activity" value={stats.topPerformerName} sub={`Top Remark: ${stats.topRemark}`} color="orange" />
          <StatCard label="Historical Data" value="Sync Active" sub="Live data sync" color="amber" />
          <StatCard label="Quick Actions" value="" sub="Quick Tools" color="indigo">
            <div className="flex gap-2 mt-1">
              <button
                onClick={() => setIsReportModalOpen(true)}
                className="flex-1 text-[10px] font-bold py-1.5 px-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors flex items-center justify-center gap-1"
              >
                <FileText className="h-3 w-3" /> Report
              </button>
              <button
                onClick={handlePreviewToday}
                className="flex-1 text-[10px] font-bold py-1.5 px-2 bg-white text-indigo-600 border border-indigo-200 rounded-lg hover:bg-indigo-50 transition-colors flex items-center justify-center gap-1"
              >
                <BarChart2 className="h-3 w-3" /> Preview
              </button>
            </div>
          </StatCard>

          {/* Special Observations Card */}
          <StatCard label="Special Obs." value="" sub="Log special events" color="amber">
            <button
              onClick={() => setIsSpecialObsOpen(true)}
              className="mt-1 w-full flex items-center justify-center gap-1.5 py-2 bg-amber-500 text-white text-xs font-bold rounded-xl hover:bg-amber-600 transition-all"
            >
              <ShoppingCart className="h-3.5 w-3.5" /> Open Logger
            </button>
          </StatCard>

        </div>

        {/* ── Chart + Timeline ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">

          {/* Bar Chart */}
          <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-slate-100 p-5 flex flex-col">
            <div className="flex items-center gap-2 mb-4 flex-wrap">
              <BarChart2 className="h-4 w-4 text-sky-500" />
              <span className="text-sm font-bold text-slate-800">Casual Activity Trend</span>
              <div className="flex items-center bg-slate-100 p-1 rounded-lg ml-auto">
                {([7, 15, 30, "this_month"] as (number | "this_month")[]).map((days) => (
                  <button key={String(days)} onClick={() => setTrendDays(days)} className={`px-2 py-0.5 text-[10px] font-bold rounded-md transition-all ${trendDays === days ? "bg-white shadow-sm text-orange-600" : "text-slate-400 hover:text-slate-700"}`}>
                    {days === "this_month" ? "Month" : `${days}d`}
                  </button>
                ))}
              </div>
              {selectedDate && (
                <button onClick={() => setSelectedDate(null)} className="text-[10px] font-bold text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full hover:bg-orange-100 transition-colors">Clear</button>
              )}
            </div>

            <div className="flex-1 flex items-end justify-between gap-1 px-1">
              
                {stats.chartData.map((data) => {
                  const ratio = stats.maxCount > 0 ? data.count / stats.maxCount : 0;
                  const r = Math.round(14 + (239 - 14) * ratio);
                  const g = Math.round(165 + (68 - 165) * ratio);
                  const b = Math.round(233 + (68 - 233) * ratio);
                  const barColor = `rgba(${r},${g},${b},${0.3 + ratio * 0.6})`;
                  const borderColor = `rgba(${r},${g},${b},${0.6 + ratio * 0.4})`;
                  return (
                    <div key={data.fullDate}
                      onClick={() => { setSelectedDate(data.fullDate); setStartDate(""); setEndDate(""); }}
                      className={`flex-1 flex flex-col justify-end group cursor-pointer origin-bottom pb-2 ${selectedDate === data.fullDate ? "opacity-100" : selectedDate ? "opacity-40 grayscale" : ""}`}
                    >
                      <div className="relative w-full flex flex-col justify-end h-32 sm:h-40 md:h-48 lg:h-52">
                        <div
                          style={{ height: `${Math.max(ratio * 100, 2)}%`, backgroundColor: barColor, borderColor: borderColor }}
                          className={`w-full relative rounded-t-lg border-t-2 ${selectedDate === data.fullDate ? "shadow-lg ring-2 ring-white z-10" : "group-hover:brightness-110"}`}
                        >
                          {data.count > 0 && (
                            <span className={`absolute left-1/2 -translate-x-1/2 text-[12px] font-black tracking-tighter transition-all duration-300 ${ratio * 100 > 30 ? "top-2 text-white drop-shadow-sm" : "-top-7 text-slate-600"}`}>{data.count}</span>
                          )}
                        </div>
                      </div>
                      <div className={`flex flex-col items-center mt-2 pt-1.5 border-t border-slate-100 ${trendDays === "this_month" || (typeof trendDays === "number" && trendDays > 15) ? "hidden sm:flex" : "flex"}`}>
                        <span className={`text-[10px] font-black uppercase tracking-wider ${selectedDate === data.fullDate ? "text-orange-600" : ratio > 0.5 ? "text-rose-500/70" : "text-slate-400"}`}>{data.dayName}</span>
                      </div>
                    </div>
                  );
                })}
              
            </div>
          </div>

          {/* Timeline */}
          <div className="lg:col-span-1 bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
            <h2 className="text-sm font-bold mb-3 flex items-center gap-2 text-slate-800">
              <Clock className="h-4 w-4 text-emerald-500" />
              Timeline
            </h2>
            <div className="mb-3 flex flex-col sm:flex-row gap-2">
              <div className="flex-1">
                <label className="block text-[9px] font-bold text-slate-400 uppercase mb-1">From</label>
                <input type="date" value={startDate} onChange={(e) => { setStartDate(e.target.value); setSelectedDate(null); }} className="w-full text-xs p-2 rounded-lg border border-slate-200 bg-slate-50 outline-none focus:ring-2 focus:ring-orange-400" />
              </div>
              <div className="flex-1">
                <label className="block text-[9px] font-bold text-slate-400 uppercase mb-1">To</label>
                <input type="date" value={endDate} onChange={(e) => { setEndDate(e.target.value); setSelectedDate(null); }} className="w-full text-xs p-2 rounded-lg border border-slate-200 bg-slate-50 outline-none focus:ring-2 focus:ring-orange-400" />
              </div>
              {(startDate || endDate || selectedDate) && (
                <button onClick={() => { setStartDate(""); setEndDate(""); setSelectedDate(null); }} className="self-end p-2 text-slate-400 hover:text-red-500 transition-colors"><X className="h-4 w-4" /></button>
              )}
            </div>
            <div ref={timelineRef} className="space-y-3 max-h-[260px] overflow-y-auto pr-1">
              {stats.timelineEntries.length > 0 ? (
                stats.timelineEntries.map((entry, i) => {
                  const hasImage = (entry.screenshots?.length ?? 0) > 0;
                  return (
                    <div key={String(entry.id) || String(i)} className={`relative pl-5 border-l-2 border-slate-100 pb-1 ${hasImage ? "cursor-pointer hover:bg-slate-50 rounded-r-lg transition-colors" : ""}`}
                      onClick={() => {
                        if (hasImage) {
                          setSelectedTimelineImage({
                            screenshotKey: entry.screenshots![0],
                            remark: entry.remarks ?? "",
                            date: entry.date,
                          });
                        }
                      }}
                    >
                      <div className="absolute -left-[9px] top-0 h-4 w-4 rounded-full bg-white border-2 border-orange-400" />
                      <div className="flex justify-between items-start mb-0.5">
                        <span className="text-xs font-bold text-orange-500">{entry.time || "00:00"}</span>
                        <div className="flex items-center gap-1.5">
                          {hasImage && <ImageIcon className="h-3.5 w-3.5 text-sky-400" />}
                          <span className="text-[10px] text-slate-400">{formatDateShort(entry.date)}</span>
                        </div>
                      </div>
                      <p className="text-xs font-semibold text-slate-800 line-clamp-1">{getEmployeeNames(entry.employeeIds)}</p>
                      {entry.remarks && <p className="text-[10px] text-slate-400 line-clamp-2 mt-0.5 italic">"{entry.remarks}"</p>}
                    </div>
                  );
                })
              ) : (
                <div className="flex flex-col items-center justify-center h-48 text-slate-300">
                  <Clock className="h-12 w-12 mb-2 opacity-30" />
                  <p className="text-sm">No activities found</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Scrolling Activity Images ── */}
        <ScrollingActivityImages images={stats.activityImages} getImage={getImage} />

        {/* ── Timeline Image Modal ── */}
        {selectedTimelineImage && (
          <TimelineImageModal
            screenshotKey={selectedTimelineImage.screenshotKey}
            remark={selectedTimelineImage.remark}
            date={selectedTimelineImage.date}
            onClose={() => setSelectedTimelineImage(null)}
            getImage={getImage}
          />
        )}

      </div>

      {/* Report Modal */}
      {isReportModalOpen && (
        <CasualReportModal
          onClose={() => setIsReportModalOpen(false)}
          onGenerate={handleGenerateReport}
          employees={allEmployees.map(e => ({ id: e.employee_id, name: e.name, designation: e.designation, department: e.department, email: (e as any).email }))}
          activityEntries={allEntriesForReport}
          availableRemarks={remarksList}
        />
      )}

      {/* Recycle Bin Modal */}
      {isRecycleBinOpen && (
        <RecycleBinModal
          entries={recycleBinEntries}
          onClose={() => setIsRecycleBinOpen(false)}
          onRestore={handleRestoreEntry}
          onDeletePermanently={handleDeletePermanently}
          employees={allEmployees.map((e) => ({ id: e.employee_id, name: e.name }))}
          isAdmin={isAdmin}
        />
      )}

      {/* Casual Admin Panel */}
      <CasualAdminPanel
        isOpen={isAdminPanelOpen}
        onClose={() => setIsAdminPanelOpen(false)}
        currentUser={{ id: currentUser.id, role: currentUser.role ?? "", name: currentUser.name, email: currentUser.email }}
        allEmployees={allEmployees}
        onRecycleBin={() => { setIsAdminPanelOpen(false); handleOpenRecycleBin(); }}
      />

    </div>
  );
};

export default EmployeeCasualActivities;