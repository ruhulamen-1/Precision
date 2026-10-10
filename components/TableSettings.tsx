/**
 * TableSettings.tsx
 * Full-page settings panel for AllDepartmentSummary.
 * Replaces the two popup modals (Custom Sorting & Visibility, Department Target/Day).
 *
 * Usage:
 *   <TableSettings
 *     isOpen={showSettingsPage}
 *     onClose={() => setShowSettingsPage(false)}
 *     initialTab="sorting"          // "sorting" | "targets"
 *     // --- sorting props ---
 *     customDepartmentOrder={customDepartmentOrder}
 *     hiddenDepartments={hiddenDepartments}
 *     hiddenEmployees={hiddenEmployees}
 *     employeeSortOrder={employeeSortOrder}
 *     summaryData={summaryData}
 *     multiMonthSummaryData={multiMonthSummaryData}
 *     analysisMode={analysisMode}
 *     inventoryConfig={inventoryConfig}
 *     visits={visits}
 *     PROJECT_SIDE_INVENTORY_DESIGNATIONS={PROJECT_SIDE_INVENTORY_DESIGNATIONS}
 *     departmentOrder={departmentOrder}
 *     onMoveDept={handleMoveDept}
 *     onReorderDepts={setCustomDepartmentOrder}
 *     onToggleDept={toggleDepartmentVisibility}
 *     onToggleEmployee={toggleEmployeeVisibility}
 *     onMoveEmployee={handleMoveEmployee}
 *     onReorderEmployees={(dept, newOrder) => setEmployeeSortOrder(prev => ({...prev, [dept]: newOrder}))}
 *     onUpdateInventorySide={handleUpdateInventorySide}
 *     onResetAll={...}
 *     // --- target props ---
 *     customDurations={customDurations}
 *     EXEMPT_DEPARTMENTS={EXEMPT_DEPARTMENTS}
 *     onDurationChange={handleCustomDurationChange}
 *     onSaveDurations={handleSaveCustomDurations}
 *     onResetDurations={...}
 *   />
 */

import React, { useState, useRef, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { Clock, X, Settings, GripVertical } from "lucide-react";
import { EmployeeVisit } from "../types";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type SettingsTab = "sorting" | "targets";

interface TableSettingsProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: SettingsTab;

  // sorting
  customDepartmentOrder: string[];
  hiddenDepartments: Set<string>;
  hiddenEmployees: Set<string>;
  employeeSortOrder: Record<string, string[]>;
  summaryData: Array<{ department: string; visitorName: string; designation?: string }>;
  multiMonthSummaryData: Array<{ department: string; visitorName: string; designation?: string }>;
  analysisMode: "single-month-comparison" | "multi-month";
  inventoryConfig: Record<string, string>;
  visits: EmployeeVisit[];
  projectSideDesignations: Set<string>;
  departmentOrder: string[];
  onReorderDepts: (newOrder: string[]) => void;
  onToggleDept: (dept: string) => void;
  onToggleEmployee: (emp: string) => void;
  onReorderEmployees: (dept: string, newOrder: string[]) => void;
  onUpdateInventorySide: (name: string, side: string) => void;
  onResetAll: () => void;

  // targets
  customDurations: Record<string, string>;
  exemptDepartments: Set<string>;
  onDurationChange: (dept: string, val: string) => void;
  onSaveDurations: () => void;
  onResetDurations: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tiny drag-and-drop hook (native HTML5, no library needed)
// ─────────────────────────────────────────────────────────────────────────────

function useDragSort(
  items: string[],
  onReorder: (newItems: string[]) => void,
  getKey: (item: string) => string,
) {
  const dragIndexRef = useRef<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const handleDragStart = useCallback(
    (index: number) => (e: React.DragEvent<HTMLElement>) => {
      dragIndexRef.current = index;
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setDragImage(e.currentTarget as HTMLElement, 16, 20);
    },
    [],
  );

  const handleDragOver = useCallback(
    (index: number) => (e: React.DragEvent<HTMLElement>) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      if (dragIndexRef.current !== null && dragIndexRef.current !== index) {
        setDragOverIndex(index);
      }
    },
    [],
  );

  const handleDrop = useCallback(
    (index: number) => (e: React.DragEvent<HTMLElement>) => {
      e.preventDefault();
      if (dragIndexRef.current === null || dragIndexRef.current === index) {
        setDragOverIndex(null);
        return;
      }
      const next = [...items];
      const [moved] = next.splice(dragIndexRef.current, 1);
      next.splice(index, 0, moved);
      onReorder(next);
      dragIndexRef.current = null;
      setDragOverIndex(null);
    },
    [items, onReorder],
  );

  const handleDragEnd = useCallback(() => {
    dragIndexRef.current = null;
    setDragOverIndex(null);
  }, []);

  return { handleDragStart, handleDragOver, handleDrop, handleDragEnd, dragOverIndex };
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

const TableSettings: React.FC<TableSettingsProps> = ({
  isOpen,
  onClose,
  initialTab = "sorting",
  customDepartmentOrder,
  hiddenDepartments,
  hiddenEmployees,
  employeeSortOrder,
  summaryData,
  multiMonthSummaryData,
  analysisMode,
  inventoryConfig,
  visits,
  projectSideDesignations,
  departmentOrder,
  onReorderDepts,
  onToggleDept,
  onToggleEmployee,
  onReorderEmployees,
  onUpdateInventorySide,
  onResetAll,
  customDurations,
  exemptDepartments,
  onDurationChange,
  onSaveDurations,
  onResetDurations,
}) => {
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab);
  const [focusDept, setFocusDept] = useState<string | null>(null);
  const [empSearch, setEmpSearch] = useState("");

  // Sync initialTab when panel opens
  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
      setFocusDept(null);
      setEmpSearch("");
    }
  }, [isOpen, initialTab]);

  // ── Department drag sort ──
  const deptDrag = useDragSort(
    customDepartmentOrder,
    onReorderDepts,
    (d) => d,
  );

  // ── Employee drag sort per department ──
  // NOTE: summaryData / multiMonthSummaryData only contain rows for the
  // currently selected month(s). If an employee has zero visits across all
  // of those months, they disappear from that data entirely — which used to
  // make them vanish from this sort list too, so they could never be
  // reordered. We fall back to the raw `visits` (all-time, unfiltered by
  // month) to make sure every employee ever recorded under a department
  // always shows up here.
  const normalizeDeptName = (d: string) => {
    if (d === "Inventory Mgt." || d === "Inventory Mgt. (Project Side)") {
      return "Inventory Management";
    }
    // Legacy records may still have the old plain name saved before the
    // canonical department list was updated to "Information Technology (IT)".
    if (d === "Information Technology") {
      return "Information Technology (IT)";
    }
    return d;
  };

  const getEmployeeList = (dept: string): string[] => {
    const allKnownEmployees = Array.from(
      new Set([
        ...(analysisMode === "multi-month" ? multiMonthSummaryData : summaryData)
          .filter((row) => row.department === dept)
          .map((row) => row.visitorName),
        ...visits
          .filter((v) => normalizeDeptName(v.department) === dept)
          .map((v) => v.visitorName),
      ]),
    );

    const savedOrder = employeeSortOrder[dept];
    if (!savedOrder) return allKnownEmployees;

    // Preserve the saved order first, then append any employee that isn't
    // part of it yet (newly added, or previously missing due to no data).
    const extras = allKnownEmployees.filter((e) => !savedOrder.includes(e));
    return [...savedOrder, ...extras];
  };

  const [empListForDrag, setEmpListForDrag] = useState<string[]>([]);

  useEffect(() => {
    if (focusDept) {
      setEmpListForDrag(getEmployeeList(focusDept));
    }
  }, [focusDept, employeeSortOrder, summaryData, multiMonthSummaryData]);

  const empDrag = useDragSort(
    empListForDrag,
    (newOrder) => {
      if (!focusDept) return;
      setEmpListForDrag(newOrder);
      onReorderEmployees(focusDept, newOrder);
    },
    (e) => e,
  );

  if (!isOpen || typeof document === "undefined") return null;

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  const filteredEmps = empListForDrag.filter(
    (e) => !empSearch || e.toLowerCase().includes(empSearch.toLowerCase()),
  );

  return createPortal(
    <div className="fixed inset-0 z-[200] flex" style={{ animation: "tsPanel 0.22s cubic-bezier(.4,0,.2,1)" }}>
      <style>{`
        @keyframes tsPanel { from { opacity:0; transform:translateX(-18px) } to { opacity:1; transform:translateX(0) } }
        .ts-grip { cursor: grab; }
        .ts-grip:active { cursor: grabbing; }
        .ts-drag-over { border-color: #f97316 !important; background-color: #fff7ed !important; }
        .ts-dragging { opacity: 0.4; }
      `}</style>

      {/* Backdrop */}
      <div className="absolute inset-0 bg-slate-900/55 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="relative flex w-full max-w-4xl mx-auto my-6 shadow-2xl rounded-2xl overflow-hidden bg-white">

        {/* ── Left sidebar ── */}
        <aside className="w-56 bg-slate-900 flex flex-col shrink-0">
          <div className="px-5 py-5 border-b border-slate-700/60">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 bg-orange-600 rounded-lg shrink-0">
                <Settings size={15} className="text-white" />
              </div>
              <div>
                <p className="text-white font-bold text-sm leading-tight">Table Settings</p>
                <p className="text-slate-400 text-[10px]">Dept. Summary</p>
              </div>
            </div>
          </div>

          <nav className="flex-1 px-3 pt-4 space-y-1">
            {(
              [
                {
                  id: "sorting" as SettingsTab,
                  label: "Custom Sorting",
                  sub: "Dept & employee order",
                  icon: (
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h7" />
                    </svg>
                  ),
                },
                {
                  id: "targets" as SettingsTab,
                  label: "Target / Day",
                  sub: "Hours per department",
                  icon: <Clock size={15} className="shrink-0" />,
                },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                onClick={() => { setActiveTab(tab.id); setFocusDept(null); }}
                className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left text-sm font-medium transition-all ${
                  activeTab === tab.id
                    ? "bg-orange-600 text-white shadow-lg shadow-orange-600/25"
                    : "text-slate-400 hover:text-white hover:bg-slate-800"
                }`}
              >
                {tab.icon}
                <div>
                  <div className="leading-tight">{tab.label}</div>
                  <div className={`text-[10px] font-normal leading-tight mt-0.5 ${activeTab === tab.id ? "text-orange-200" : "text-slate-500"}`}>{tab.sub}</div>
                </div>
              </button>
            ))}
          </nav>

          {/* Hidden stats */}
          {(hiddenDepartments.size > 0 || hiddenEmployees.size > 0) && (
            <div className="mx-3 mb-3 px-3 py-2.5 bg-amber-900/25 border border-amber-700/30 rounded-xl">
              <p className="text-amber-300 text-[9px] font-bold uppercase tracking-wider mb-1">Hidden</p>
              {hiddenDepartments.size > 0 && <p className="text-amber-200 text-xs">{hiddenDepartments.size} dept(s)</p>}
              {hiddenEmployees.size > 0 && <p className="text-amber-200 text-xs">{hiddenEmployees.size} employee(s)</p>}
            </div>
          )}

          <div className="px-3 pb-4">
            <button
              onClick={onClose}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-700 hover:bg-slate-600 text-white rounded-xl text-sm font-semibold transition-colors"
            >
              <X size={15} />
              Close
            </button>
          </div>
        </aside>

        {/* ── Main content ── */}
        <div className="flex-1 flex flex-col min-w-0 bg-white">

          {/* Content header */}
          <div className="px-7 py-5 border-b border-slate-100 bg-slate-50 shrink-0 flex items-center justify-between">
            <div>
              {activeTab === "sorting" ? (
                focusDept ? (
                  <div>
                    <button
                      onClick={() => { setFocusDept(null); setEmpSearch(""); }}
                      className="flex items-center gap-1.5 text-xs font-bold text-orange-600 hover:text-orange-700 mb-1 transition-colors"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                      </svg>
                      Back to Departments
                    </button>
                    <h1 className="text-lg font-bold text-slate-800">{focusDept}</h1>
                    <p className="text-xs text-slate-500 mt-0.5">Drag rows to reorder employees. Toggle checkbox to show/hide.</p>
                  </div>
                ) : (
                  <div>
                    <h1 className="text-lg font-bold text-slate-800">Custom Sorting & Visibility</h1>
                    <p className="text-xs text-slate-500 mt-0.5">Drag rows to reorder departments. Click "Employees" to sort staff within a department.</p>
                  </div>
                )
              ) : (
                <div>
                  <h1 className="text-lg font-bold text-slate-800">Department Target / Day</h1>
                  <p className="text-xs text-slate-500 mt-0.5">Set custom target hours per day. Leave blank to use system default.</p>
                </div>
              )}
            </div>
            {activeTab === "sorting" && !focusDept && (
              <button
                onClick={onResetAll}
                className="text-xs text-slate-400 hover:text-red-500 transition-colors underline"
              >
                Reset All
              </button>
            )}
            {activeTab === "targets" && (
              <div className="flex gap-2">
                <button
                  onClick={onResetDurations}
                  className="text-xs text-slate-400 hover:text-red-500 transition-colors underline"
                >
                  Reset All
                </button>
                <button
                  onClick={onSaveDurations}
                  className="px-4 py-1.5 bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold rounded-lg shadow transition-all"
                >
                  Save Changes
                </button>
              </div>
            )}
          </div>

          {/* Scrollable body */}
          <div className="flex-1 overflow-y-auto px-7 py-5">

            {/* ──────────── SORTING TAB ──────────── */}
            {activeTab === "sorting" && (
              <>
                {/* Department list */}
                {!focusDept && (
                  <div className="space-y-2 max-w-xl">
                    {customDepartmentOrder.map((dept, idx) => (
                      <div
                        key={dept}
                        draggable
                        onDragStart={deptDrag.handleDragStart(idx)}
                        onDragOver={deptDrag.handleDragOver(idx)}
                        onDrop={deptDrag.handleDrop(idx)}
                        onDragEnd={deptDrag.handleDragEnd}
                        className={`flex items-center justify-between p-3.5 bg-white border-2 rounded-xl transition-all select-none ${
                          deptDrag.dragOverIndex === idx ? "ts-drag-over border-orange-400 bg-orange-50" : "border-slate-100 hover:border-slate-200 hover:shadow-sm"
                        }`}
                      >
                        {/* Grip + checkbox + name */}
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="ts-grip text-slate-300 hover:text-slate-500 transition-colors shrink-0">
                            <GripVertical size={18} />
                          </span>
                          <input
                            type="checkbox"
                            checked={!hiddenDepartments.has(dept)}
                            onChange={() => onToggleDept(dept)}
                            onClick={(e) => e.stopPropagation()}
                            className="w-4 h-4 text-orange-600 border-slate-300 rounded focus:ring-orange-500 shrink-0 cursor-pointer"
                          />
                          <div className="min-w-0">
                            <span className={`text-sm font-semibold block truncate ${hiddenDepartments.has(dept) ? "text-slate-400 line-through" : "text-slate-700"}`}>
                              {dept}
                            </span>
                            <span className="text-[10px] text-slate-400">
                              {summaryData.filter((d) => d.department === dept).length} employees
                            </span>
                          </div>
                        </div>

                        {/* Employees button */}
                        <button
                          onClick={() => { setFocusDept(dept); setEmpSearch(""); }}
                          className="ml-3 shrink-0 text-[10px] uppercase font-bold text-slate-400 hover:text-orange-600 px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg hover:border-orange-300 hover:bg-orange-50 transition-colors flex items-center gap-1.5"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                          Employees
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Employee list for a department */}
                {focusDept && (
                  <div className="max-w-xl">
                    {/* Search */}
                    <div className="relative mb-4">
                      <svg xmlns="http://www.w3.org/2000/svg" className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
                      </svg>
                      <input
                        autoFocus
                        type="text"
                        placeholder="Search employees..."
                        value={empSearch}
                        onChange={(e) => setEmpSearch(e.target.value)}
                        className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none bg-white"
                      />
                    </div>

                    {empSearch ? (
                      /* Filtered — no drag (drag requires stable indices) */
                      <div className="space-y-1.5">
                        {filteredEmps.map((emp) => (
                          <EmployeeRow
                            key={emp}
                            emp={emp}
                            deptName={focusDept}
                            hidden={hiddenEmployees.has(emp)}
                            inventoryConfig={inventoryConfig}
                            visits={visits}
                            projectSideDesignations={projectSideDesignations}
                            onToggle={() => onToggleEmployee(emp)}
                            onSideChange={(side) => onUpdateInventorySide(emp, side)}
                            dragHandlers={null}
                            isDragOver={false}
                          />
                        ))}
                      </div>
                    ) : (
                      /* Full list with drag */
                      <div className="space-y-1.5">
                        {empListForDrag.map((emp, idx) => (
                          <EmployeeRow
                            key={emp}
                            emp={emp}
                            deptName={focusDept}
                            hidden={hiddenEmployees.has(emp)}
                            inventoryConfig={inventoryConfig}
                            visits={visits}
                            projectSideDesignations={projectSideDesignations}
                            onToggle={() => onToggleEmployee(emp)}
                            onSideChange={(side) => onUpdateInventorySide(emp, side)}
                            dragHandlers={{
                              onDragStart: empDrag.handleDragStart(idx),
                              onDragOver: empDrag.handleDragOver(idx),
                              onDrop: empDrag.handleDrop(idx),
                              onDragEnd: empDrag.handleDragEnd,
                            }}
                            isDragOver={empDrag.dragOverIndex === idx}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}

            {/* ──────────── TARGETS TAB ──────────── */}
            {activeTab === "targets" && (
              <div className="max-w-xl space-y-2">
                {customDepartmentOrder.map((deptName) => {
                  if (deptName === "Inventory Management") {
                    return (
                      <React.Fragment key={deptName}>
                        {(["Head Office", "Project Side"] as const).map((side) => {
                          const key = `Inventory Management (${side})`;
                          const defaultVal = side === "Project Side" ? "6.0" : "4.0";
                          const hasCustom = !!customDurations[key]?.trim();
                          return (
                            <TargetRow
                              key={key}
                              label="Inventory Management"
                              sublabel={side}
                              defaultVal={defaultVal}
                              value={customDurations[key] || ""}
                              hasCustom={hasCustom}
                              isExempt={false}
                              onChange={(v) => onDurationChange(key, v)}
                              onClear={() => onDurationChange(key, "")}
                            />
                          );
                        })}
                      </React.Fragment>
                    );
                  }

                  const isExempt = exemptDepartments.has(deptName);
                  const isSecurity = deptName.toLowerCase().includes("security");
                  const defaultVal = isExempt ? "0.0" : isSecurity ? "7.0" : "4.0";
                  const hasCustom = !!customDurations[deptName]?.trim();

                  return (
                    <TargetRow
                      key={deptName}
                      label={deptName}
                      defaultVal={defaultVal}
                      value={customDurations[deptName] || ""}
                      hasCustom={hasCustom}
                      isExempt={isExempt}
                      onChange={(v) => onDurationChange(deptName, v)}
                      onClear={() => onDurationChange(deptName, "")}
                    />
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

interface EmployeeRowProps {
  emp: string;
  deptName: string;
  hidden: boolean;
  inventoryConfig: Record<string, string>;
  visits: EmployeeVisit[];
  projectSideDesignations: Set<string>;
  onToggle: () => void;
  onSideChange: (side: string) => void;
  dragHandlers: {
    onDragStart: (e: React.DragEvent) => void;
    onDragOver: (e: React.DragEvent) => void;
    onDrop: (e: React.DragEvent) => void;
    onDragEnd: () => void;
  } | null;
  isDragOver: boolean;
}

const EmployeeRow: React.FC<EmployeeRowProps> = ({
  emp,
  deptName,
  hidden,
  inventoryConfig,
  visits,
  projectSideDesignations,
  onToggle,
  onSideChange,
  dragHandlers,
  isDragOver,
}) => {
  const isInventory = deptName === "Inventory Management";
  const empDesignation = visits.find((v) => v.visitorName === emp)?.designation || "";
  const currentSide =
    inventoryConfig[emp] ||
    (projectSideDesignations.has(empDesignation) ? "Project Side" : "Head Office");

  return (
    <div
      draggable={!!dragHandlers}
      onDragStart={dragHandlers?.onDragStart}
      onDragOver={dragHandlers?.onDragOver}
      onDrop={dragHandlers?.onDrop}
      onDragEnd={dragHandlers?.onDragEnd}
      className={`flex items-center justify-between px-3.5 py-3 bg-white border-2 rounded-xl transition-all select-none ${
        isDragOver
          ? "border-orange-400 bg-orange-50"
          : "border-slate-100 hover:border-slate-200 hover:shadow-sm"
      }`}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        {dragHandlers && (
          <span className="ts-grip text-slate-300 hover:text-slate-400 shrink-0 transition-colors">
            <GripVertical size={16} />
          </span>
        )}
        <input
          type="checkbox"
          checked={!hidden}
          onChange={onToggle}
          onClick={(e) => e.stopPropagation()}
          className="w-3.5 h-3.5 text-orange-600 border-slate-300 rounded focus:ring-orange-500 shrink-0 cursor-pointer"
        />
        <span className={`text-sm font-medium truncate ${hidden ? "text-slate-400 line-through" : "text-slate-700"}`} title={empDesignation ? `${emp} — ${empDesignation}` : emp}>
          {emp}
          {empDesignation && (
            <span className={`ml-1.5 font-normal text-xs ${hidden ? "text-slate-300" : "text-slate-400"}`}>
              ({empDesignation})
            </span>
          )}
        </span>
      </div>
      {isInventory && (
        <select
          value={currentSide}
          onChange={(e) => { e.stopPropagation(); onSideChange(e.target.value); }}
          className="ml-2 shrink-0 text-[10px] px-1.5 py-1 border border-slate-200 rounded-lg bg-white text-slate-600 focus:ring-1 focus:ring-orange-500 cursor-pointer"
        >
          <option value="Head Office">Head Office</option>
          <option value="Project Side">Project Side</option>
        </select>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────

interface TargetRowProps {
  label: string;
  sublabel?: string;
  defaultVal: string;
  value: string;
  hasCustom: boolean;
  isExempt: boolean;
  onChange: (v: string) => void;
  onClear: () => void;
}

const TargetRow: React.FC<TargetRowProps> = ({
  label,
  sublabel,
  defaultVal,
  value,
  hasCustom,
  isExempt,
  onChange,
  onClear,
}) => (
  <div
    className={`flex items-center justify-between p-4 rounded-xl border-2 transition-all hover:shadow-sm ${
      hasCustom
        ? "bg-orange-50 border-orange-300"
        : sublabel
          ? "bg-amber-50/50 border-amber-100"
          : "bg-white border-slate-100 hover:border-slate-200"
    }`}
  >
    <div className="min-w-0">
      <span className="font-semibold text-sm text-slate-800 block truncate">{label}</span>
      {sublabel && <span className="text-xs text-orange-600 font-medium">{sublabel}</span>}
      <span className="text-[10px] text-slate-400 block mt-0.5">
        Default: {defaultVal} hrs/day{isExempt && <span className="ml-1 text-blue-500">(exempt)</span>}
      </span>
    </div>
    <div className="flex items-center gap-2 ml-3 shrink-0">
      {hasCustom && (
        <button
          onClick={onClear}
          className="text-slate-400 hover:text-red-500 transition-colors p-1"
          title="Reset to default"
        >
          <X size={13} />
        </button>
      )}
      <input
        type="text"
        placeholder={defaultVal}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-20 px-3 py-2 text-sm border border-slate-300 bg-white rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 text-center font-mono"
      />
      <span className="text-sm text-slate-400 font-medium w-7">hrs</span>
    </div>
  </div>
);

export default TableSettings;