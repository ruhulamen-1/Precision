import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import _ from "lodash";
import { RefreshCw, Save, Printer, Loader2, Check, AlertCircle, ClipboardCopy } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { CameraStatusEntry, DeviceCredential, User } from "../types";
import FeedbackMessage from "./FeedbackMessage";

interface CameraStatusTabProps {
  currentUser: User;
}

type StatusValue = "Online" | "Offline" | "Issue";
type RowSaveState = "idle" | "pending" | "saving" | "saved" | "error";

interface RowState {
  projectName: string;
  zone: string;
  onlineStatus: StatusValue;
  issueType: string;
}

const STATUS_STYLES: Record<StatusValue, string> = {
  Online: "bg-green-100 text-green-700 border-green-200",
  Offline: "bg-rose-100 text-rose-700 border-rose-200",
  Issue: "bg-amber-100 text-amber-700 border-amber-200",
};

const todayStr = () => new Date().toISOString().slice(0, 10);

const formatDateDDMonYYYY = (isoDate: string): string => {
  if (!isoDate) return "";
  const d = new Date(`${isoDate}T00:00:00Z`);
  if (isNaN(d.getTime())) return isoDate;
  const day = String(d.getUTCDate()).padStart(2, "0");
  const month = d.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
  const year = d.getUTCFullYear();
  return `${day}-${month}-${year}`;
};

const CameraStatusTab: React.FC<CameraStatusTabProps> = ({ currentUser }) => {
  const [selectedDate, setSelectedDate] = useState(todayStr());
  const [rows, setRows] = useState<RowState[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [rowSaveState, setRowSaveState] = useState<Record<string, RowSaveState>>({});
  const [feedback, setFeedback] = useState<{
    message: string;
    type: "success" | "error" | "info";
  } | null>(null);

  const debounceTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const rowsRef = useRef<RowState[]>([]);
  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  // Warn before leaving the page if a debounced auto-save hasn't fired yet.
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      const hasPending = Object.keys(debounceTimers.current).length > 0;
      if (hasPending) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  const canEdit =
    currentUser.permissions?.itResponseTimeline?.edit ||
    currentUser.role === "super_admin" ||
    currentUser.role === "admin";

  const loadData = useCallback(async (date: string) => {
    setIsLoading(true);
    setRowSaveState({});
    try {
      const credRes = await fetch("/api/device-credentials");
      const credentials: DeviceCredential[] = credRes.ok ? await credRes.json() : [];

      // Build a de-duplicated Project -> Zone list from the device credentials module,
      // preserving zone/project order as it appears there.
      const projectMap = new Map<string, string>();
      credentials.forEach((c) => {
        if (c.projectName && !projectMap.has(c.projectName)) {
          projectMap.set(c.projectName, c.zone || "");
        }
      });

      const baseRows: RowState[] = Array.from(projectMap.entries())
        .map(([projectName, zone]) => ({
          projectName,
          zone,
          onlineStatus: "Online" as StatusValue,
          issueType: "",
        }))
        .sort((a, b) =>
          a.zone === b.zone
            ? a.projectName.localeCompare(b.projectName)
            : a.zone.localeCompare(b.zone),
        );

      const statusRes = await fetch(`/api/camera-status?date=${date}`);
      const savedEntries: CameraStatusEntry[] = statusRes.ok ? await statusRes.json() : [];
      const savedMap = new Map(savedEntries.map((e) => [e.projectName, e]));

      const merged = baseRows.map((r) => {
        const saved = savedMap.get(r.projectName);
        return saved
          ? {
              ...r,
              zone: saved.zone || r.zone,
              onlineStatus: (saved.onlineStatus as StatusValue) || "Online",
              issueType: saved.issueType || "",
            }
          : r;
      });

      setRows(merged);
    } catch (error) {
      console.error("Error loading camera status:", error);
      setFeedback({ message: "Failed to load camera status data.", type: "error" });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData(selectedDate);
  }, [selectedDate, loadData]);

  // Persists a single row to the backend immediately (used by auto-save).
  const saveRow = useCallback(
    async (row: RowState) => {
      setRowSaveState((prev) => ({ ...prev, [row.projectName]: "saving" }));
      try {
        const response = await fetch("/api/camera-status/bulk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify([
            {
              date: selectedDate,
              projectName: row.projectName,
              zone: row.zone,
              onlineStatus: row.onlineStatus,
              issueType: row.issueType,
              updatedBy: currentUser.name,
            },
          ]),
        });
        if (!response.ok) {
          const errTxt = await response.text();
          throw new Error(errTxt || "Failed to save");
        }
        setRowSaveState((prev) => ({ ...prev, [row.projectName]: "saved" }));
      } catch (error) {
        console.error("Error auto-saving row:", row.projectName, error);
        setRowSaveState((prev) => ({ ...prev, [row.projectName]: "error" }));
        setFeedback({
          message: `"${row.projectName}"-এর পরিবর্তন সেভ করা যায়নি। ইন্টারনেট/সার্ভার চেক করে আবার চেষ্টা করুন।`,
          type: "error",
        });
      }
    },
    [selectedDate, currentUser.name],
  );

  // Debounced auto-save: fires ~700ms after the last edit to a given row, per project.
  const scheduleAutoSave = useCallback(
    (projectName: string) => {
      setRowSaveState((prev) => ({ ...prev, [projectName]: "pending" }));
      if (debounceTimers.current[projectName]) {
        clearTimeout(debounceTimers.current[projectName]);
      }
      debounceTimers.current[projectName] = setTimeout(() => {
        delete debounceTimers.current[projectName];
        const latestRow = rowsRef.current.find((r) => r.projectName === projectName);
        if (latestRow) saveRow(latestRow);
      }, 700);
    },
    [saveRow],
  );

  // Flush any pending debounced edits immediately, e.g. before switching date/unmounting,
  // so nothing sits un-saved and gets overwritten by the next loadData().
  const flushPendingSaves = useCallback(() => {
    const pendingProjects = Object.keys(debounceTimers.current);
    pendingProjects.forEach((projectName) => {
      clearTimeout(debounceTimers.current[projectName]);
      delete debounceTimers.current[projectName];
      const latestRow = rowsRef.current.find((r) => r.projectName === projectName);
      if (latestRow) saveRow(latestRow);
    });
  }, [saveRow]);

  useEffect(() => {
    return () => flushPendingSaves();
  }, [flushPendingSaves]);

  const handleDateChange = (newDate: string) => {
    flushPendingSaves();
    setSelectedDate(newDate);
  };

  const handleStatusChange = (projectName: string, value: StatusValue) => {
    setRows((prev) =>
      prev.map((r) =>
        r.projectName === projectName
          ? { ...r, onlineStatus: value, issueType: value === "Online" ? "" : r.issueType }
          : r,
      ),
    );
    // Status is a dropdown (deliberate choice) — save right away, no need to debounce.
    setTimeout(() => {
      const latestRow = rowsRef.current.find((r) => r.projectName === projectName);
      if (latestRow) saveRow(latestRow);
    }, 0);
  };

  const handleIssueTypeChange = (projectName: string, value: string) => {
    setRows((prev) =>
      prev.map((r) => (r.projectName === projectName ? { ...r, issueType: value } : r)),
    );
    scheduleAutoSave(projectName);
  };

  // Manual "Save all" — useful right after opening a date with unsaved defaults,
  // or as a fallback if someone doesn't trust the auto-save indicator.
  const handleSaveAll = async () => {
    if (!canEdit || rows.length === 0) return;
    setIsSaving(true);
    try {
      const payload = rows.map((r) => ({
        date: selectedDate,
        projectName: r.projectName,
        zone: r.zone,
        onlineStatus: r.onlineStatus,
        issueType: r.issueType,
        updatedBy: currentUser.name,
      }));
      const response = await fetch("/api/camera-status/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const errTxt = await response.text();
        throw new Error(errTxt || "Failed to save");
      }
      const savedState: Record<string, RowSaveState> = {};
      rows.forEach((r) => (savedState[r.projectName] = "saved"));
      setRowSaveState((prev) => ({ ...prev, ...savedState }));
      setFeedback({ message: "Camera status saved successfully!", type: "success" });
    } catch (error: any) {
      console.error("Error saving camera status:", error);
      setFeedback({ message: error.message || "Failed to save camera status.", type: "error" });
    } finally {
      setIsSaving(false);
    }
  };

  // Zone rowSpan map for the on-screen table (visual grouping like the reference sheet)
  const zoneSpans = useMemo(() => {
    const spans = new Map<number, number>(); // rowIndex -> span, only set on first row of a zone group
    let i = 0;
    while (i < rows.length) {
      let span = 1;
      while (i + span < rows.length && rows[i + span].zone === rows[i].zone) span++;
      spans.set(i, span);
      i += span;
    }
    return spans;
  }, [rows]);

  const handleCopyForExcel = async () => {
    const issueRows = rows.filter((r) => r.onlineStatus !== "Online");
    if (issueRows.length === 0) {
      setFeedback({ message: "কোনো Offline/Issue এন্ট্রি নেই এই তারিখে — কপি করার কিছু নেই।", type: "info" });
      return;
    }

    const header = ["Date", "Project Name", "Zone", "Status", "Issue details"];
    const lines = [header.join("\t")];
    issueRows.forEach((r) => {
      lines.push(
        [
          formatDateDDMonYYYY(selectedDate),
          r.projectName,
          r.zone,
          r.onlineStatus,
          r.issueType,
        ].join("\t"),
      );
    });
    const tsv = lines.join("\n");

    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(tsv);
      } else {
        // Fallback for older browsers / non-HTTPS contexts.
        const textarea = document.createElement("textarea");
        textarea.value = tsv;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      setFeedback({
        message: "টেবিলের ডেটা কপি হয়েছে — এখন Excel বা Google Sheet-এ পেস্ট (Ctrl+V) করো।",
        type: "success",
      });
    } catch (error) {
      console.error("Copy failed:", error);
      setFeedback({ message: "কপি করা যায়নি, আবার চেষ্টা করো।", type: "error" });
    }
  };

  const handleExportPDF = () => {
    const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();

    doc.setFillColor(15, 42, 82);
    doc.rect(0, 0, pageWidth, 40, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text("CAMERA ISSUES", pageWidth / 2, 25, { align: "center" });

    doc.setTextColor(0, 0, 0);
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`Date: ${formatDateDDMonYYYY(selectedDate)}`, pageWidth / 2, 55, { align: "center" });

    // Build body with zone rowSpan merging
    const body: any[] = rows.map((r, idx) => {
      const rowArr: any[] = [idx + 1, r.projectName];
      const span = zoneSpans.get(idx);
      if (span) {
        rowArr.push({ content: r.zone, rowSpan: span, styles: { valign: "middle", halign: "center" } });
      }
      // else: this row is covered by a previous rowSpan, omit the zone cell entirely
      rowArr.push(r.onlineStatus);
      rowArr.push(r.onlineStatus === "Online" ? "" : r.issueType);
      return rowArr;
    });

    autoTable(doc, {
      startY: 65,
      head: [["SL", "Project Name", "Zone", "Online Status", "Issue Type"]],
      body,
      theme: "grid",
      headStyles: { fillColor: [15, 42, 82], textColor: 255, fontStyle: "bold", halign: "center" },
      styles: { fontSize: 9, cellPadding: 5, valign: "middle" },
      columnStyles: {
        0: { halign: "center", cellWidth: 30 },
        2: { halign: "center", cellWidth: 60 },
        3: { halign: "center", cellWidth: 80 },
      },
      didParseCell: (data) => {
        if (data.section === "body" && data.column.index === 3) {
          const val = String(data.cell.raw);
          if (val === "Online") data.cell.styles.textColor = [0, 128, 0];
          else if (val === "Offline") data.cell.styles.textColor = [200, 0, 0];
          else if (val === "Issue") data.cell.styles.textColor = [180, 120, 0];
          data.cell.styles.fontStyle = "bold";
        }
      },
    });

    doc.save(`Camera_Issues_${selectedDate}.pdf`);
  };

  return (
    <div className="fade-in">
      <div className="p-6 border-b border-slate-200 flex flex-col sm:flex-row justify-between sm:items-center gap-4">
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium text-slate-600" htmlFor="camera-status-date">
            Date
          </label>
          <input
            id="camera-status-date"
            type="date"
            value={selectedDate}
            onChange={(e) => handleDateChange(e.target.value)}
            className="px-3 py-2 bg-white border border-slate-300 rounded-md text-sm shadow-sm focus:outline-none focus:border-orange-500"
          />
          <button
            onClick={() => loadData(selectedDate)}
            className="inline-flex items-center gap-1.5 px-3 py-2 border border-slate-300 text-sm font-medium rounded-md text-slate-600 bg-white hover:bg-slate-50"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleCopyForExcel}
            disabled={rows.length === 0}
            className="inline-flex items-center gap-2 px-4 py-2 border border-slate-300 text-sm font-medium rounded-md shadow-sm text-slate-700 bg-white hover:bg-slate-50 disabled:opacity-50"
          >
            <ClipboardCopy className="h-4 w-4" />
            Copy for Excel
          </button>
          <button
            onClick={handleExportPDF}
            disabled={rows.length === 0}
            className="inline-flex items-center gap-2 px-4 py-2 border border-slate-300 text-sm font-medium rounded-md shadow-sm text-slate-700 bg-white hover:bg-slate-50 disabled:opacity-50"
          >
            <Printer className="h-4 w-4" />
            Export PDF
          </button>
          {canEdit && (
            <button
              onClick={handleSaveAll}
              disabled={isSaving || rows.length === 0}
              title="Changes auto-save as you edit — use this to force-save everything at once"
              className="inline-flex items-center gap-2 px-4 py-2 border border-orange-500 text-sm font-medium rounded-md shadow-sm text-white bg-orange-500 hover:bg-orange-600 disabled:opacity-60"
            >
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {isSaving ? "Saving..." : "Save All"}
            </button>
          )}
        </div>
      </div>

      <div className="overflow-x-auto">
        {isLoading ? (
          <p className="p-6 text-center text-slate-500">Loading...</p>
        ) : rows.length > 0 ? (
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50/80 backdrop-blur-sm sticky top-0">
              <tr>
                <th className="p-1 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">SL</th>
                <th className="p-1 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Project Name</th>
                <th className="p-1 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Zone</th>
                <th className="p-1 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Online Status</th>
                <th className="p-1 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Issue Type</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-200">
              {rows.map((r, idx) => (
                <tr key={r.projectName} className="hover:bg-slate-50 transition-colors">
                  <td className="p-1 whitespace-nowrap text-sm text-slate-500">{idx + 1}</td>
                  <td className="p-1 whitespace-nowrap text-sm font-medium text-slate-900">{r.projectName}</td>
                  <td className="p-1 whitespace-nowrap text-sm text-slate-500">{r.zone}</td>
                  <td className="p-1 whitespace-nowrap text-sm">
                    {canEdit ? (
                      <select
                        value={r.onlineStatus}
                        onChange={(e) => handleStatusChange(r.projectName, e.target.value as StatusValue)}
                        className={`px-2.5 py-1 rounded-full text-xs font-semibold border focus:outline-none ${STATUS_STYLES[r.onlineStatus]}`}
                      >
                        <option value="Online">Online</option>
                        <option value="Offline">Offline</option>
                        <option value="Issue">Issue</option>
                      </select>
                    ) : (
                      <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold border ${STATUS_STYLES[r.onlineStatus]}`}>
                        {r.onlineStatus}
                      </span>
                    )}
                  </td>
                  <td className="p-1 whitespace-nowrap text-sm text-slate-500">
                    <div className="flex items-center gap-2">
                      {canEdit ? (
                        <input
                          type="text"
                          value={r.issueType}
                          onChange={(e) => handleIssueTypeChange(r.projectName, e.target.value)}
                          onBlur={() => {
                            // If the user tabs/clicks away before the debounce fires, save now.
                            if (debounceTimers.current[r.projectName]) {
                              clearTimeout(debounceTimers.current[r.projectName]);
                              delete debounceTimers.current[r.projectName];
                              const latestRow = rowsRef.current.find(
                                (row) => row.projectName === r.projectName,
                              );
                              if (latestRow) saveRow(latestRow);
                            }
                          }}
                          disabled={r.onlineStatus === "Online"}
                          placeholder={r.onlineStatus === "Online" ? "" : "e.g. Main gate Channel Offline"}
                          className="w-full px-2 py-1 border border-slate-200 rounded-md text-sm disabled:bg-slate-50 disabled:text-slate-300 focus:outline-none focus:border-orange-500"
                        />
                      ) : (
                        r.issueType
                      )}
                      {canEdit && rowSaveState[r.projectName] === "saving" && (
                        <Loader2 className="h-3.5 w-3.5 text-slate-400 animate-spin shrink-0" />
                      )}
                      {canEdit && rowSaveState[r.projectName] === "saved" && (
                        <Check className="h-3.5 w-3.5 text-green-500 shrink-0" />
                      )}
                      {canEdit && rowSaveState[r.projectName] === "error" && (
                        <AlertCircle
                          className="h-3.5 w-3.5 text-rose-500 shrink-0 cursor-pointer"
                          onClick={() => saveRow(r)}
                        />
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="p-6 text-center text-slate-500">
            No projects found. Add projects in the "Device Credentials" tab first.
          </p>
        )}
      </div>

      {feedback && (
        <FeedbackMessage
          message={feedback.message}
          type={feedback.type}
          onDismiss={() => setFeedback(null)}
        />
      )}
    </div>
  );
};

export default CameraStatusTab;