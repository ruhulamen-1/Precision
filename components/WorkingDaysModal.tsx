import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { CalendarDays } from "lucide-react";

interface WorkingDayEntry {
  id: number;
  visitorName: string;
  month_year: string;
  working_days: number;
}

interface WorkingDaysModalProps {
  isOpen: boolean;
  onClose: () => void;
  month: string;
  refresh: () => void;
  departmentMap: Record<string, string>;
}

const WorkingDaysModal: React.FC<WorkingDaysModalProps> = ({
  isOpen,
  onClose,
  month,
  refresh,
  departmentMap,
}) => {
  const [entries, setEntries] = useState<WorkingDayEntry[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [duplicateKeys, setDuplicateKeys] = useState<Set<string>>(new Set());

  const fetchEntries = async () => {
    const resp = await fetch(`/api/working-days?month=${month}`);
    if (resp.ok) {
      const data: WorkingDayEntry[] = await resp.json();
      setEntries(data);

      // Detect duplicates: same visitorName appearing more than once
      const counts = new Map<string, number>();
      data.forEach((e) => counts.set(e.visitorName, (counts.get(e.visitorName) || 0) + 1));
      const dups = new Set<string>();
      counts.forEach((count, name) => { if (count > 1) dups.add(name); });
      setDuplicateKeys(dups);
    }
  };

  useEffect(() => {
    if (isOpen) fetchEntries();
  }, [isOpen, month]);

  const handleSave = async (visitorName: string, working_days: number) => {
    await fetch("/api/working-days", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ visitorName, month_year: month, working_days }),
    });
    fetchEntries();
    refresh();
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm("Delete this working days entry?")) return;
    await fetch(`/api/working-days/${id}`, { method: "DELETE" });
    fetchEntries();
    refresh();
  };

  // Delete ALL entries for a duplicate visitor, then re-add with latest value
  const handleDeleteAllDuplicates = async (visitorName: string) => {
    if (!window.confirm(`"${visitorName}" has multiple entries for ${month}. Delete all duplicates and keep only the latest?`)) return;
    const dupes = entries.filter((e) => e.visitorName === visitorName);
    const latest = dupes.reduce((a, b) => (a.id > b.id ? a : b));
    // Delete all except latest
    await Promise.all(
      dupes
        .filter((e) => e.id !== latest.id)
        .map((e) => fetch(`/api/working-days/${e.id}`, { method: "DELETE" }))
    );
    fetchEntries();
    refresh();
  };

  if (!isOpen || typeof document === "undefined") return null;

  const filtered = entries
    .filter((e) => e.visitorName.toLowerCase().includes(searchTerm.toLowerCase()))
    .sort((a, b) => {
      const deptA = departmentMap[a.visitorName] || "Unassigned";
      const deptB = departmentMap[b.visitorName] || "Unassigned";
      if (deptA !== deptB) return deptA.localeCompare(deptB);
      return a.visitorName.localeCompare(b.visitorName);
    });

  const hasDuplicates = duplicateKeys.size > 0;

  // Format month for display: "2025-06" → "Jun 2025"
  const displayMonth = (() => {
    try {
      const [y, m] = month.split("-");
      return new Date(parseInt(y), parseInt(m) - 1).toLocaleString("en-US", {
        month: "short", year: "numeric",
      });
    } catch {
      return month;
    }
  })();

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in duration-200 flex flex-col max-h-[85vh]">

        {/* ── Header ── */}
        <div className="bg-slate-800 px-6 py-4 flex justify-between items-center text-white shrink-0">
          <h3 className="text-lg font-bold flex items-center gap-2">
            <CalendarDays size={20} />
            Individual Working Days — {displayMonth}
          </h3>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors text-xl leading-none"
          >
            ✕
          </button>
        </div>

        {/* ── Search ── */}
        <div className="px-6 pt-4 pb-2 shrink-0">
          <p className="text-sm text-slate-500 mb-3 font-medium">
            View and edit individual working days for this month.
          </p>
          <div className="relative">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search by visitor..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 bg-slate-50"
            />
          </div>

          {hasDuplicates && (
            <div className="mt-3 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              <span className="text-amber-500 mt-0.5 shrink-0">⚠</span>
              <p className="text-xs text-amber-700">
                <strong>{duplicateKeys.size}</strong> visitor(s) have duplicate entries for this month:{" "}
                {Array.from(duplicateKeys).join(", ")}. Use <strong>Fix Dups</strong> to keep only the latest entry.
              </p>
            </div>
          )}
        </div>

        {/* ── Table ── */}
        <div className="px-6 pb-2 overflow-y-auto flex-1 min-h-0">
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm border-collapse">
              <thead className="sticky top-0 z-10">
                <tr className="bg-slate-100">
                  <th className="px-4 py-2.5 text-left text-xs font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200">
                    Visitor
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200">
                    Department
                  </th>
                  <th className="px-4 py-2.5 text-center text-xs font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200">
                    Working Days
                  </th>
                  <th className="px-4 py-2.5 text-center text-xs font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((e) => (
                  <EditableRow
                    key={e.id}
                    entry={e}
                    department={departmentMap[e.visitorName] || "Unassigned"}
                    isDup={duplicateKeys.has(e.visitorName)}
                    onSave={handleSave}
                    onDelete={handleDelete}
                    onFixDuplicates={handleDeleteAllDuplicates}
                  />
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-slate-400 italic text-sm">
                      No records found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="bg-slate-50 px-6 py-4 flex justify-between items-center border-t border-slate-200 shrink-0">
          <span className="text-xs text-slate-400">
            {filtered.length} record{filtered.length !== 1 ? "s" : ""}
            {searchTerm ? ` matching "${searchTerm}"` : " total"}
          </span>
          <button
            onClick={onClose}
            className="px-6 py-2 bg-slate-800 text-white rounded-lg hover:bg-slate-900 font-bold text-sm shadow-md transition-all"
          >
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

/* ── Editable Row ─────────────────────────────────────────────────────────── */
const EditableRow: React.FC<{
  entry: WorkingDayEntry;
  department: string;
  isDup: boolean;
  onSave: (visitorName: string, working_days: number) => void;
  onDelete: (id: number) => void;
  onFixDuplicates: (visitorName: string) => void;
}> = ({ entry, department, isDup, onSave, onDelete, onFixDuplicates }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [value, setValue] = useState(entry.working_days);

  // Sync from props only when NOT actively editing
  useEffect(() => {
    if (!isEditing) setValue(entry.working_days);
  }, [entry.working_days, isEditing]);

  const handleSave = () => {
    onSave(entry.visitorName, value);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setValue(entry.working_days);
    setIsEditing(false);
  };

  return (
    <tr className={`transition-colors ${isEditing ? "bg-blue-50" : isDup ? "bg-amber-50" : "hover:bg-slate-50"}`}>
      {/* Visitor */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-1.5">
          <span className="font-semibold text-slate-700 text-sm">{entry.visitorName}</span>
          {isDup && (
            <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">
              DUP
            </span>
          )}
        </div>
      </td>

      {/* Department */}
      <td className="px-4 py-3">
        <span className="text-xs text-slate-500">{department}</span>
      </td>

      {/* Working Days */}
      <td className="px-4 py-3 text-center">
        {isEditing ? (
          <input
            type="number"
            value={value}
            onChange={(ev) => setValue(parseInt(ev.target.value) || 0)}
            className="w-16 px-2 py-1 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-400 text-center font-mono bg-white"
            min={0} max={31}
          />
        ) : (
          <span className="inline-flex items-center justify-center w-10 h-7 rounded-md bg-blue-50 text-blue-700 font-bold text-sm">
            {entry.working_days}
          </span>
        )}
      </td>

      {/* Actions */}
      <td className="px-4 py-3">
        <div className="flex gap-1.5 justify-center flex-wrap">
          {isEditing ? (
            <>
              <button
                onClick={handleSave}
                className="text-xs bg-green-500 text-white px-3 py-1.5 rounded-md hover:bg-green-600 font-semibold transition-colors"
              >
                Save
              </button>
              <button
                onClick={handleCancel}
                className="text-xs bg-slate-200 text-slate-600 px-3 py-1.5 rounded-md hover:bg-slate-300 font-semibold transition-colors"
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setIsEditing(true)}
                className="text-xs bg-blue-500 text-white px-3 py-1.5 rounded-md hover:bg-blue-600 font-semibold transition-colors"
              >
                Edit
              </button>
              <button
                onClick={() => onDelete(entry.id)}
                className="text-xs bg-red-100 text-red-600 px-3 py-1.5 rounded-md hover:bg-red-500 hover:text-white font-semibold transition-colors"
              >
                Delete
              </button>
              {isDup && (
                <button
                  onClick={() => onFixDuplicates(entry.visitorName)}
                  className="text-xs bg-amber-100 text-amber-700 px-3 py-1.5 rounded-md hover:bg-amber-500 hover:text-white font-semibold transition-colors"
                >
                  Fix Dups
                </button>
              )}
            </>
          )}
        </div>
      </td>
    </tr>
  );
};

export default WorkingDaysModal;