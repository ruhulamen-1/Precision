import React, { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { ProjectVisitConfig, ProjectDeptRule, VisitFrequency, ProjectComplianceResult, DeptComplianceResult, EmployeeVisit } from "../types";
import { DEPARTMENTS } from "../constants";
import _ from "lodash";

// ─── helpers ────────────────────────────────────────────────────────────────

const FREQ_LABEL: Record<VisitFrequency, string> = {
  daily: "Daily (প্রতিদিন)",
  weekly: "Weekly (সপ্তাহে ১ বার)",
  monthly: "Monthly (মাসে ১ বার)",
};

const FREQ_SHORT: Record<VisitFrequency, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
};

function calcExpected(freq: VisitFrequency, workingDays: number): number {
  if (freq === "daily") return workingDays;
  if (freq === "weekly") return Math.ceil(workingDays / 5);
  return 1; // monthly
}

function statusOf(pct: number): DeptComplianceResult["status"] {
  if (pct >= 90) return "compliant";
  if (pct >= 50) return "partial";
  return "missing";
}

const STATUS_STYLE: Record<DeptComplianceResult["status"], string> = {
  compliant: "bg-green-100 text-green-700",
  partial: "bg-amber-100 text-amber-700",
  missing: "bg-red-100 text-red-700",
};

const STATUS_LABEL: Record<DeptComplianceResult["status"], string> = {
  compliant: "✓ Compliant",
  partial: "⚠ Partial",
  missing: "✕ Missing",
};

const STORAGE_KEY = "pvc_configs_v1";

function loadConfigs(): ProjectVisitConfig[] {
  try {
    if (typeof window === "undefined" || !window.localStorage) return [];
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveConfigs(configs: ProjectVisitConfig[]) {
  try {
    if (typeof window === "undefined" || !window.localStorage) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(configs));
  } catch { /* silent fail in sandboxed envs */ }
}

function genId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

// ─── sub-components ──────────────────────────────────────────────────────────

const PctBar: React.FC<{ pct: number }> = ({ pct }) => {
  const clamped = Math.min(100, Math.max(0, pct));
  const color = pct >= 90 ? "bg-green-500" : pct >= 50 ? "bg-amber-400" : "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all duration-500`} style={{ width: `${clamped}%` }} />
      </div>
      <span className={`text-xs font-bold w-10 text-right ${pct >= 90 ? "text-green-700" : pct >= 50 ? "text-amber-600" : "text-red-600"}`}>
        {Math.round(pct)}%
      </span>
    </div>
  );
};

// ─── ConfigModal ─────────────────────────────────────────────────────────────

interface ConfigModalProps {
  initial: ProjectVisitConfig | null;
  onSave: (cfg: ProjectVisitConfig) => void;
  onClose: () => void;
}

const ConfigModal: React.FC<ConfigModalProps> = ({ initial, onSave, onClose }) => {
  const [projectName, setProjectName] = useState(initial?.projectName ?? "");
  const [isUnderConstruction, setIsUnderConstruction] = useState(initial?.isUnderConstruction ?? true);
  const [rules, setRules] = useState<ProjectDeptRule[]>(initial?.rules ?? []);
  const [addDept, setAddDept] = useState(DEPARTMENTS[0]);
  const [addFreq, setAddFreq] = useState<VisitFrequency>("weekly");
  const [error, setError] = useState("");

  const availableDepts = DEPARTMENTS.filter((d) => !rules.some((r) => r.department === d));

  const handleAddRule = () => {
    if (rules.some((r) => r.department === addDept)) return;
    setRules((prev) => [...prev, { department: addDept, frequency: addFreq }]);
    const next = DEPARTMENTS.find((d) => d !== addDept && !rules.some((r) => r.department === d));
    if (next) setAddDept(next);
  };

  const handleRemoveRule = (dept: string) => {
    setRules((prev) => prev.filter((r) => r.department !== dept));
  };

  const handleFreqChange = (dept: string, freq: VisitFrequency) => {
    setRules((prev) => prev.map((r) => r.department === dept ? { ...r, frequency: freq } : r));
  };

  const handleSave = () => {
    if (!projectName.trim()) { setError("Project name is required."); return; }
    if (rules.length === 0) { setError("Add at least one department rule."); return; }
    onSave({
      id: initial?.id ?? genId(),
      projectName: projectName.trim(),
      isUnderConstruction,
      rules,
      createdAt: initial?.createdAt ?? new Date().toISOString(),
    });
  };

  const modalContent = (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="bg-slate-800 px-6 py-4 flex justify-between items-center text-white shrink-0">
          <h3 className="text-base font-bold">{initial ? "Edit Project Config" : "Add Project Config"}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-lg leading-none">✕</button>
        </div>

        <div className="overflow-y-auto flex-1 p-6 space-y-5">
          {/* Project name */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Project Name *</label>
            <input
              value={projectName}
              onChange={(e) => { setProjectName(e.target.value); setError(""); }}
              placeholder="e.g. Green Valley Phase-2"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>

          {/* Under construction toggle */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsUnderConstruction((v) => !v)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${isUnderConstruction ? "bg-orange-500" : "bg-slate-300"}`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${isUnderConstruction ? "translate-x-6" : "translate-x-1"}`} />
            </button>
            <span className="text-sm text-slate-700">Under Construction</span>
          </div>

          {/* Add rule row */}
          <div className="border border-slate-200 rounded-lg p-4 space-y-3">
            <p className="text-sm font-semibold text-slate-700">Department Visit Rules</p>
            <div className="flex gap-2 flex-wrap">
              <select
                value={addDept}
                onChange={(e) => setAddDept(e.target.value)}
                disabled={availableDepts.length === 0}
                className="flex-1 min-w-[180px] px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
              >
                {availableDepts.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
              <select
                value={addFreq}
                onChange={(e) => setAddFreq(e.target.value as VisitFrequency)}
                className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
              >
                {(["daily", "weekly", "monthly"] as VisitFrequency[]).map((f) => (
                  <option key={f} value={f}>{FREQ_LABEL[f]}</option>
                ))}
              </select>
              <button
                onClick={handleAddRule}
                disabled={availableDepts.length === 0}
                className="px-4 py-2 bg-orange-500 text-white text-sm font-semibold rounded-lg hover:bg-orange-600 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                + Add
              </button>
            </div>

            {/* Rules list */}
            {rules.length === 0 ? (
              <p className="text-xs text-slate-400 italic text-center py-2">কোনো rule যোগ করা হয়নি।</p>
            ) : (
              <div className="space-y-2 max-h-52 overflow-y-auto">
                {rules.map((r) => (
                  <div key={r.department} className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                    <span className="flex-1 text-sm text-slate-800 truncate">{r.department}</span>
                    <select
                      value={r.frequency}
                      onChange={(e) => handleFreqChange(r.department, e.target.value as VisitFrequency)}
                      className="text-xs border border-slate-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-orange-500"
                    >
                      {(["daily", "weekly", "monthly"] as VisitFrequency[]).map((f) => (
                        <option key={f} value={f}>{FREQ_SHORT[f]}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => handleRemoveRule(r.department)}
                      className="text-slate-400 hover:text-red-500 transition-colors text-base leading-none"
                    >✕</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        {/* Footer */}
        <div className="bg-slate-50 px-6 py-4 flex justify-end gap-3 border-t shrink-0">
          <button onClick={onClose} className="px-4 py-2 text-slate-500 hover:text-slate-700 text-sm font-medium">Cancel</button>
          <button onClick={handleSave} className="px-6 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 text-sm font-bold shadow">
            Save Config
          </button>
        </div>
      </div>
    </div>
  );

  return typeof document !== "undefined"
    ? createPortal(modalContent, document.body)
    : modalContent;
};

// ─── Main Component ───────────────────────────────────────────────────────────

interface ProjectVisitComplianceProps {
  visits: EmployeeVisit[];
}

const ProjectVisitCompliance: React.FC<ProjectVisitComplianceProps> = ({ visits }) => {
  const today = new Date();
  const defaultMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;

  const [configs, setConfigs] = useState<ProjectVisitConfig[]>(loadConfigs);
  const [selectedMonth, setSelectedMonth] = useState(defaultMonth);
  const [workingDays, setWorkingDays] = useState("25");
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ProjectVisitConfig | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<"compliance" | "config">("compliance");

  // Persist configs
  useEffect(() => { saveConfigs(configs); }, [configs]);

  const handleSaveConfig = useCallback((cfg: ProjectVisitConfig) => {
    setConfigs((prev) => {
      const exists = prev.find((c) => c.id === cfg.id);
      return exists ? prev.map((c) => c.id === cfg.id ? cfg : c) : [...prev, cfg];
    });
    setModalOpen(false);
    setEditTarget(null);
  }, []);

  const handleDelete = (id: string) => {
    setConfigs((prev) => prev.filter((c) => c.id !== id));
    setDeleteTarget(null);
    if (selectedProject) {
      const deleted = configs.find((c) => c.id === id);
      if (deleted && deleted.projectName === selectedProject) setSelectedProject(null);
    }
  };

  // Filter visits for selected month
  const monthVisits = useMemo(() => {
    const [year, month] = selectedMonth.split("-").map(Number);
    return visits.filter((v) => {
      if (!v.date || !/^\d{4}-\d{2}-\d{2}$/.test(v.date)) return false;
      const [vy, vm] = v.date.split("-").map(Number);
      return vy === year && vm === month;
    });
  }, [visits, selectedMonth]);

  // Compute compliance for all configs
  const complianceResults = useMemo<ProjectComplianceResult[]>(() => {
    const wd = parseInt(workingDays, 10) || 25;

    return configs
      .filter((cfg) => cfg.isUnderConstruction)
      .map((cfg) => {
        const projectVisits = monthVisits.filter(
          (v) => v.projectName.trim().toLowerCase() === cfg.projectName.trim().toLowerCase()
        );

        const deptResults: DeptComplianceResult[] = cfg.rules.map((rule) => {
          const deptVisits = projectVisits.filter((v) => v.department === rule.department);
          const expected = calcExpected(rule.frequency, wd);
          const actual = deptVisits.length;
          const pct = expected > 0 ? Math.min(100, (actual / expected) * 100) : 0;
          const dates = deptVisits.map((v) => v.date).sort();
          return {
            department: rule.department,
            frequency: rule.frequency,
            expectedVisits: expected,
            actualVisits: actual,
            compliancePct: pct,
            lastVisitDate: dates.length > 0 ? dates[dates.length - 1] : null,
            status: statusOf(pct),
          };
        });

        const overallPct = deptResults.length > 0
          ? _.meanBy(deptResults, "compliancePct")
          : 0;

        return { projectName: cfg.projectName, overallPct, deptResults };
      })
      .sort((a, b) => a.overallPct - b.overallPct); // worst first
  }, [configs, monthVisits, workingDays]);

  const selectedResult = complianceResults.find((r) => r.projectName === selectedProject);

  // Summary counts
  const summary = useMemo(() => {
    const all = complianceResults.flatMap((r) => r.deptResults);
    return {
      total: all.length,
      compliant: all.filter((d) => d.status === "compliant").length,
      partial: all.filter((d) => d.status === "partial").length,
      missing: all.filter((d) => d.status === "missing").length,
    };
  }, [complianceResults]);

  return (
    <div className="space-y-4">

      {/* ── Top bar ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-slate-800">Project Visit Compliance</h2>
          <p className="text-xs text-slate-500">কোন project-এ কোন department ঠিকমতো visit করছে কিনা</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* View toggle */}
          <div className="flex rounded-lg border border-slate-200 overflow-hidden text-xs font-semibold">
            <button
              onClick={() => setActiveView("compliance")}
              className={`px-3 py-1.5 transition-colors ${activeView === "compliance" ? "bg-slate-800 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}
            >
              Compliance
            </button>
            <button
              onClick={() => setActiveView("config")}
              className={`px-3 py-1.5 transition-colors ${activeView === "config" ? "bg-slate-800 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}
            >
              Config
            </button>
          </div>
          <input
            type="month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:border-orange-500"
          />
          <div className="flex items-center gap-1">
            <span className="text-xs text-slate-500 whitespace-nowrap">Working Days</span>
            <input
              type="number"
              value={workingDays}
              onChange={(e) => setWorkingDays(e.target.value)}
              min="1" max="31"
              className="w-14 px-2 py-1.5 border border-slate-300 rounded-lg text-sm text-center focus:outline-none focus:border-orange-500"
            />
          </div>
        </div>
      </div>

      {/* ══════════════ CONFIG VIEW ══════════════ */}
      {activeView === "config" && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button
              onClick={() => { setEditTarget(null); setModalOpen(true); }}
              className="px-4 py-2 bg-orange-500 text-white text-sm font-semibold rounded-lg hover:bg-orange-600 shadow flex items-center gap-2"
            >
              <span>+</span> Add Project
            </button>
          </div>

          {configs.length === 0 ? (
            <div className="border-2 border-dashed border-slate-200 rounded-xl p-12 text-center">
              <p className="text-slate-400 text-sm">কোনো project config নেই।</p>
              <p className="text-slate-400 text-xs mt-1">"Add Project" বাটনে ক্লিক করে শুরু করুন।</p>
            </div>
          ) : (
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <table className="min-w-full divide-y divide-slate-100">
                <thead className="bg-slate-50">
                  <tr>
                    {["Project Name", "Status", "Departments", "Actions"].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-[11px] font-black text-slate-500 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-100">
                  {configs.map((cfg) => (
                    <tr key={cfg.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium text-slate-800 text-sm">{cfg.projectName}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${cfg.isUnderConstruction ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600"}`}>
                          {cfg.isUnderConstruction ? "🚧 Under Construction" : "Completed"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {cfg.rules.map((r) => (
                            <span key={r.department} className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded">
                              {r.department.split(" ")[0]}
                              <span className="text-slate-400">·</span>
                              <span className="text-orange-600 font-semibold">{FREQ_SHORT[r.frequency]}</span>
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => { setEditTarget(cfg); setModalOpen(true); }}
                            className="text-xs text-slate-600 hover:text-orange-600 font-medium transition-colors"
                          >
                            Edit
                          </button>
                          <span className="text-slate-300">|</span>
                          <button
                            onClick={() => setDeleteTarget(cfg.id)}
                            className="text-xs text-slate-600 hover:text-red-600 font-medium transition-colors"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ══════════════ COMPLIANCE VIEW ══════════════ */}
      {activeView === "compliance" && (
        <div className="space-y-4">

          {complianceResults.length === 0 ? (
            <div className="border-2 border-dashed border-slate-200 rounded-xl p-12 text-center">
              <p className="text-slate-400 text-sm">কোনো under-construction project config নেই।</p>
              <p className="text-slate-400 text-xs mt-1">"Config" tab-এ গিয়ে project যোগ করুন।</p>
              <button
                onClick={() => setActiveView("config")}
                className="mt-4 px-4 py-2 bg-orange-500 text-white text-sm font-semibold rounded-lg hover:bg-orange-600"
              >
                Go to Config
              </button>
            </div>
          ) : (
            <>
              {/* Summary cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: "Total Rules", value: summary.total, color: "text-slate-700", bg: "bg-slate-50" },
                  { label: "Compliant ✓", value: summary.compliant, color: "text-green-700", bg: "bg-green-50" },
                  { label: "Partial ⚠", value: summary.partial, color: "text-amber-700", bg: "bg-amber-50" },
                  { label: "Missing ✕", value: summary.missing, color: "text-red-700", bg: "bg-red-50" },
                ].map((c) => (
                  <div key={c.label} className={`${c.bg} rounded-xl p-4 border border-slate-200`}>
                    <p className="text-xs text-slate-500">{c.label}</p>
                    <p className={`text-2xl font-black mt-1 ${c.color}`}>{c.value}</p>
                  </div>
                ))}
              </div>

              {/* Two-panel layout */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

                {/* Left: project list */}
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <div className="bg-slate-50 px-4 py-3 border-b border-slate-200">
                    <p className="text-xs font-black text-slate-500 uppercase tracking-wider">Projects ({complianceResults.length})</p>
                  </div>
                  <div className="divide-y divide-slate-100 max-h-[520px] overflow-y-auto">
                    {complianceResults.map((r) => {
                      const pct = Math.round(r.overallPct);
                      const isSelected = selectedProject === r.projectName;
                      return (
                        <button
                          key={r.projectName}
                          onClick={() => setSelectedProject(isSelected ? null : r.projectName)}
                          className={`w-full text-left px-4 py-3 hover:bg-orange-50 transition-colors ${isSelected ? "bg-orange-50 border-l-2 border-orange-500" : ""}`}
                        >
                          <div className="flex items-center justify-between gap-2 mb-1.5">
                            <span className="text-sm font-medium text-slate-800 truncate">{r.projectName}</span>
                            <span className={`text-xs font-bold shrink-0 ${pct >= 90 ? "text-green-700" : pct >= 50 ? "text-amber-600" : "text-red-600"}`}>
                              {pct}%
                            </span>
                          </div>
                          <PctBar pct={r.overallPct} />
                          <p className="text-[10px] text-slate-400 mt-1">
                            {r.deptResults.filter((d) => d.status === "missing").length} missing ·{" "}
                            {r.deptResults.filter((d) => d.status === "partial").length} partial ·{" "}
                            {r.deptResults.filter((d) => d.status === "compliant").length} ok
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Right: dept breakdown */}
                <div className="lg:col-span-2 border border-slate-200 rounded-xl overflow-hidden">
                  {!selectedResult ? (
                    <div className="flex items-center justify-center h-full min-h-[300px] text-slate-400 text-sm">
                      ← বাম থেকে একটা project সিলেক্ট করুন
                    </div>
                  ) : (
                    <>
                      <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex items-center justify-between">
                        <p className="text-sm font-bold text-slate-800">{selectedResult.projectName}</p>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-slate-500">Overall</span>
                          <span className={`text-sm font-black ${selectedResult.overallPct >= 90 ? "text-green-700" : selectedResult.overallPct >= 50 ? "text-amber-600" : "text-red-600"}`}>
                            {Math.round(selectedResult.overallPct)}%
                          </span>
                        </div>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-slate-100">
                          <thead className="bg-white">
                            <tr>
                              {["Department", "Frequency", "Expected", "Actual", "Compliance", "Last Visit", "Status"].map((h) => (
                                <th key={h} className="px-3 py-2.5 text-left text-[10px] font-black text-slate-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-slate-100">
                            {selectedResult.deptResults
                              .sort((a, b) => a.compliancePct - b.compliancePct)
                              .map((dr) => (
                                <tr key={dr.department} className={`hover:bg-slate-50 ${dr.status === "missing" ? "border-l-2 border-red-400" : dr.status === "partial" ? "border-l-2 border-amber-400" : "border-l-2 border-green-400"}`}>
                                  <td className="px-3 py-2.5 text-sm text-slate-800 font-medium max-w-[160px] truncate" title={dr.department}>{dr.department}</td>
                                  <td className="px-3 py-2.5">
                                    <span className="text-[11px] px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded font-medium">{FREQ_SHORT[dr.frequency]}</span>
                                  </td>
                                  <td className="px-3 py-2.5 text-sm text-center font-mono text-slate-700">{dr.expectedVisits}</td>
                                  <td className="px-3 py-2.5 text-sm text-center font-mono font-bold text-slate-800">{dr.actualVisits}</td>
                                  <td className="px-3 py-2.5 min-w-[120px]"><PctBar pct={dr.compliancePct} /></td>
                                  <td className="px-3 py-2.5 text-xs font-mono text-slate-500 whitespace-nowrap">{dr.lastVisitDate ?? "—"}</td>
                                  <td className="px-3 py-2.5">
                                    <span className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full ${STATUS_STYLE[dr.status]}`}>
                                      {STATUS_LABEL[dr.status]}
                                    </span>
                                  </td>
                                </tr>
                              ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Config Modal ── */}
      {modalOpen && (
        <ConfigModal
          initial={editTarget}
          onSave={handleSaveConfig}
          onClose={() => { setModalOpen(false); setEditTarget(null); }}
        />
      )}

      {/* ── Delete Confirm ── */}
      {deleteTarget && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-2xl p-6 max-w-sm w-full text-center">
            <p className="text-base font-bold text-slate-800 mb-2">Delete this config?</p>
            <p className="text-sm text-slate-500 mb-6">এই project-এর সব rules মুছে যাবে। Visit data মুছবে না।</p>
            <div className="flex justify-center gap-3">
              <button onClick={() => setDeleteTarget(null)} className="px-5 py-2 border border-slate-300 rounded-lg text-sm text-slate-600 hover:bg-slate-50">Cancel</button>
              <button onClick={() => handleDelete(deleteTarget)} className="px-5 py-2 bg-red-600 text-white rounded-lg text-sm font-semibold hover:bg-red-700">Delete</button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default ProjectVisitCompliance;