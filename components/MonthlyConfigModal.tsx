import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { History } from "lucide-react";

interface MonthlyConfig {
  month_year: string;
  default_wd: number;
  security_wd: number;
  office_wd: number;
}

interface MonthlyConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUpdate: () => void;
}

const MonthlyConfigModal: React.FC<MonthlyConfigModalProps> = ({
  isOpen,
  onClose,
  onUpdate,
}) => {
  const [configs, setConfigs] = useState<MonthlyConfig[]>([]);
  const [searchTerm, setSearchTerm] = useState("");

  const fetchAllConfigs = async () => {
    const resp = await fetch("/api/all-monthly-configs");
    if (resp.ok) {
      const data: MonthlyConfig[] = await resp.json();
      const seen = new Map<string, MonthlyConfig>();
      data.forEach((c) => seen.set(c.month_year, c));
      setConfigs(Array.from(seen.values()));
    }
  };

  useEffect(() => {
    if (isOpen) fetchAllConfigs();
  }, [isOpen]);

  const handleUpdate = async (config: MonthlyConfig) => {
    await fetch("/api/monthly-config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    });
    fetchAllConfigs();
    onUpdate();
  };

  const handleDelete = async (month_year: string) => {
    if (!window.confirm(`Delete working days config for ${month_year}?`)) return;
    await fetch(`/api/monthly-config/${encodeURIComponent(month_year)}`, {
      method: "DELETE",
    });
    fetchAllConfigs();
    onUpdate();
  };

  if (!isOpen || typeof document === "undefined") return null;

  const sorted = [...configs].sort((a, b) =>
    b.month_year.localeCompare(a.month_year),
  );
  const filtered = sorted.filter((c) => c.month_year.includes(searchTerm));

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in duration-200 flex flex-col max-h-[85vh]">

        {/* ── Header ── */}
        <div className="bg-slate-800 px-6 py-4 flex justify-between items-center text-white shrink-0">
          <h3 className="text-lg font-bold flex items-center gap-2">
            <History size={20} />
            Monthly Working Days History
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
            View and edit monthly working day configurations across all months.
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
              placeholder="Search by month (e.g. 2025-06)..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 bg-slate-50"
            />
          </div>
        </div>

        {/* ── Table ── */}
        <div className="px-6 pb-2 overflow-y-auto flex-1 min-h-0">
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm border-collapse">
              <thead className="sticky top-0 z-10">
                <tr className="bg-slate-100">
                  <th className="px-4 py-2.5 text-left text-xs font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200">
                    Month
                  </th>
                  <th className="px-4 py-2.5 text-center text-xs font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200">
                    Default WD
                  </th>
                  <th className="px-4 py-2.5 text-center text-xs font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200">
                    Security WD
                  </th>
                  <th className="px-4 py-2.5 text-center text-xs font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200">
                    Office WD
                  </th>
                  <th className="px-4 py-2.5 text-center text-xs font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((c) => (
                  <EditableRow
                    key={c.month_year}
                    config={c}
                    onSave={handleUpdate}
                    onDelete={handleDelete}
                  />
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-slate-400 italic text-sm">
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
  config: MonthlyConfig;
  onSave: (c: MonthlyConfig) => void;
  onDelete: (month_year: string) => void;
}> = ({ config, onSave, onDelete }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [values, setValues] = useState<MonthlyConfig>({
    month_year: config.month_year,
    default_wd: config.default_wd ?? 25,
    security_wd: config.security_wd ?? 0,
    office_wd: config.office_wd ?? 0,
  });

  // Sync from props only when NOT actively editing
  useEffect(() => {
    if (!isEditing) {
      setValues({
        month_year: config.month_year,
        default_wd: config.default_wd ?? 25,
        security_wd: config.security_wd ?? 0,
        office_wd: config.office_wd ?? 0,
      });
    }
  }, [config.month_year, config.default_wd, config.security_wd, config.office_wd, isEditing]);

  const handleSave = () => {
    onSave(values);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setValues({
      month_year: config.month_year,
      default_wd: config.default_wd ?? 25,
      security_wd: config.security_wd ?? 0,
      office_wd: config.office_wd ?? 0,
    });
    setIsEditing(false);
  };

  const inputCls =
    "w-16 px-2 py-1 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-400 text-center font-mono bg-white";

  // Format month for display: "2025-06" → "Jun 2025"
  const displayMonth = (() => {
    try {
      const [y, m] = config.month_year.split("-");
      return new Date(parseInt(y), parseInt(m) - 1).toLocaleString("en-US", {
        month: "short", year: "numeric",
      });
    } catch {
      return config.month_year;
    }
  })();

  return (
    <tr className={`transition-colors ${isEditing ? "bg-blue-50" : "hover:bg-slate-50"}`}>
      {/* Month */}
      <td className="px-4 py-3">
        <div className="flex flex-col">
          <span className="font-semibold text-slate-700 text-sm">{displayMonth}</span>
          <span className="text-[10px] text-slate-400 font-mono">{config.month_year}</span>
        </div>
      </td>

      {/* Default WD */}
      <td className="px-4 py-3 text-center">
        {isEditing ? (
          <input
            type="number"
            value={values.default_wd}
            onChange={(e) =>
              setValues({ ...values, default_wd: parseInt(e.target.value) || 0 })
            }
            className={inputCls}
            min={0} max={31}
          />
        ) : (
          <span className="inline-flex items-center justify-center w-10 h-7 rounded-md bg-blue-50 text-blue-700 font-bold text-sm">
            {config.default_wd}
          </span>
        )}
      </td>

      {/* Security WD */}
      <td className="px-4 py-3 text-center">
        {isEditing ? (
          <input
            type="number"
            value={values.security_wd}
            onChange={(e) =>
              setValues({ ...values, security_wd: parseInt(e.target.value) || 0 })
            }
            className={inputCls}
            min={0} max={31}
          />
        ) : (
          <span className={`inline-flex items-center justify-center w-10 h-7 rounded-md font-bold text-sm ${config.security_wd ? "bg-orange-50 text-orange-700" : "bg-slate-50 text-slate-400"}`}>
            {config.security_wd || "—"}
          </span>
        )}
      </td>

      {/* Office WD */}
      <td className="px-4 py-3 text-center">
        {isEditing ? (
          <input
            type="number"
            value={values.office_wd}
            onChange={(e) =>
              setValues({ ...values, office_wd: parseInt(e.target.value) || 0 })
            }
            className={inputCls}
            min={0} max={31}
          />
        ) : (
          <span className={`inline-flex items-center justify-center w-10 h-7 rounded-md font-bold text-sm ${config.office_wd ? "bg-purple-50 text-purple-700" : "bg-slate-50 text-slate-400"}`}>
            {config.office_wd || "—"}
          </span>
        )}
      </td>

      {/* Actions */}
      <td className="px-4 py-3">
        <div className="flex gap-1.5 justify-center">
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
                onClick={() => onDelete(config.month_year)}
                className="text-xs bg-red-100 text-red-600 px-3 py-1.5 rounded-md hover:bg-red-500 hover:text-white font-semibold transition-colors"
              >
                Delete
              </button>
            </>
          )}
        </div>
      </td>
    </tr>
  );
};

export default MonthlyConfigModal;
