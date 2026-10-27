import React, { useState, useMemo, useRef } from "react";
import FeedbackMessage from "./FeedbackMessage";
import _ from "lodash";
import Papa from "papaparse";
import { parseCSVRobustly } from "../utils/csvUtils";
import { ITAssignedIssue, ITResponseTimelineTab, User } from "../types";
import {
  analyzeIncidents,
  dedupeIssues,
  hydrateITIssue,
  summarizePreviousMonth,
} from "../utils/itAnalytics";
import ITRecordsTab from "./ITRecordsTab";
import ITAnalysisTab from "./ITAnalysisTab";
import DeviceCredentialsTab from "./DeviceCredentialsTab";
import CameraStatusTab from "./CameraStatusTab";

/**
 * Robustly parses a date string from a CSV file into a Date object, treating it as UTC.
 * Handles DD-MMM-YYYY, DD-MMM-YY, YYYY-MM-DD, and other common formats.
 * @param dateStr The date string from the CSV.
 * @returns A Date object representing UTC midnight, or null if parsing fails.
 */
const parseDateFromCSV = (dateStr: string): Date | null => {
  if (!dateStr || typeof dateStr !== "string") return null;
  const s = dateStr.trim();

  // 1. Try DD-MMM-YYYY or DD-MMM-YY (e.g., 01-Sep-2025 or 01-Sep-25)
  const dmyMatch = s.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4}|\d{2})$/);
  if (dmyMatch) {
    const day = parseInt(dmyMatch[1], 10);
    const monthStr = dmyMatch[2];
    let year = parseInt(dmyMatch[3], 10);

    if (year < 100) year += 2000;

    const monthNames = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];
    const monthIndex = monthNames.findIndex(
      (m) => m.toLowerCase() === monthStr.toLowerCase(),
    );

    if (monthIndex > -1) {
      const date = new Date(Date.UTC(year, monthIndex, day));
      if (!isNaN(date.getTime())) return date;
    }
  }

  // 2. Try YYYY-MM-DD (ISO format without time)
  const ymdMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (ymdMatch) {
    const year = parseInt(ymdMatch[1], 10);
    const month = parseInt(ymdMatch[2], 10) - 1; // month is 0-indexed
    const day = parseInt(ymdMatch[3], 10);
    const date = new Date(Date.UTC(year, month, day));
    if (!isNaN(date.getTime())) return date;
  }

  // 3. Try MM/DD/YYYY or M/D/YYYY (common US format)
  const mdyMatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdyMatch) {
    const month = parseInt(mdyMatch[1], 10) - 1;
    const day = parseInt(mdyMatch[2], 10);
    const year = parseInt(mdyMatch[3], 10);
    const date = new Date(Date.UTC(year, month, day));
    if (!isNaN(date.getTime())) return date;
  }

  // 4. Last resort: Generic parsing (can be unreliable due to timezone)
  // We convert to UTC components to strip local timezone information.
  const fallbackDate = new Date(s);
  if (!isNaN(fallbackDate.getTime())) {
    return new Date(
      Date.UTC(
        fallbackDate.getFullYear(),
        fallbackDate.getMonth(),
        fallbackDate.getDate(),
      ),
    );
  }

  console.warn(`Could not parse date: "${s}"`);
  return null;
};

/**
 * Parses "YYYY-MM-DD HH:MM", "DD-MMM-YYYY HH:MM" or a bare date (→ 00:00) into a UTC-based Date.
 * Wall-clock values are kept as written (no timezone conversion), like the date-only columns.
 */
const parseDateTimeFromCSV = (value: string): Date | null => {
  if (!value || typeof value !== "string") return null;
  const m = value.trim().match(/^(\S+?)(?:[T\s]+(\d{1,2}):(\d{2}))?$/);
  if (!m) return null;
  const date = parseDateFromCSV(m[1]);
  if (!date) return null;
  if (m[2] === undefined) return date;
  const h = parseInt(m[2], 10);
  const min = parseInt(m[3], 10);
  if (h > 23 || min > 59) return null;
  return new Date(date.getTime() + (h * 60 + min) * 60_000);
};

const OPTIONAL_HEADERS = [
  "Reported Time",
  "Acknowledged At",
  "Resolved At",
  "Category",
  "Priority",
  "Root Cause",
  "Resolved By",
  "Device Count",
] as const;

interface ITResponseTimelineProps {
  currentUser: User;
  assignedIssues: ITAssignedIssue[];
  onUpdateAssignedIssues: (issues: ITAssignedIssue[]) => void;
  activeTab: ITResponseTimelineTab;
  onTabChange: (tab: ITResponseTimelineTab) => void;
}

const ITResponseTimeline: React.FC<ITResponseTimelineProps> = ({
  currentUser,
  assignedIssues,
  onUpdateAssignedIssues,
  activeTab,
}) => {
  const [statusFilter, setStatusFilter] = useState("");
  const currentMonth = new Date().toISOString().slice(0, 7);
  const [monthFilter, setMonthFilter] = useState(currentMonth);
  const [searchQuery, setSearchQuery] = useState("");
  const [feedback, setFeedback] = useState<{
    message: string;
    type: "success" | "error" | "info";
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // The log is de-duplicated once up-front so every view (records, KPIs) agrees.
  const cleanIssues = useMemo(() => dedupeIssues(assignedIssues).rows, [assignedIssues]);

  const rowMatches = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return (row: ITAssignedIssue) =>
      (!statusFilter || row.status === statusFilter) &&
      (!q ||
        row.id.toLowerCase().includes(q) ||
        row.issue.toLowerCase().includes(q) ||
        row.projectName.toLowerCase().includes(q) ||
        row.zone.toLowerCase().includes(q) ||
        row.assignedTo.toLowerCase().includes(q));
  }, [statusFilter, searchQuery]);

  const filteredIssues = useMemo(() => {
    return cleanIssues.filter((assignedIssue) => {
      let monthMatch = true;
      if (monthFilter !== "all") {
        const issueDate = assignedIssue.reportedAt;
        const issueMonth = `${issueDate.getUTCFullYear()}-${String(issueDate.getUTCMonth() + 1).padStart(2, "0")}`;
        monthMatch = issueMonth === monthFilter;
      }
      return rowMatches(assignedIssue) && monthMatch;
    });
  }, [cleanIssues, rowMatches, monthFilter]);

  // Incident-based analysis. It deliberately reads the *whole* log (not only the selected
  // month) so an issue that runs across a month boundary keeps its real start and end.
  const analysisData = useMemo(
    () => analyzeIncidents(assignedIssues, { month: monthFilter, rowMatches }),
    [assignedIssues, monthFilter, rowMatches],
  );

  const prevMonthSummary = useMemo(
    () => summarizePreviousMonth(assignedIssues, monthFilter, rowMatches),
    [assignedIssues, monthFilter, rowMatches],
  );

  const handleDownloadTemplate = () => {
    const headers = [
      "SL No",
      "Date",
      "Project Name",
      "Zone",
      "Status",
      "Assigned Issue",
      "Assigned To",
      ...OPTIONAL_HEADERS,
    ];
    const exampleData = [
      [
        "IT-101",
        "01-Sep-2025",
        "Lake Lofts",
        "Dhanmondi",
        "Issue",
        "Cannot access shared folder",
        "IT Support",
        "09:15",
        "01-Sep-2025 10:00",
        "02-Sep-2025 16:30",
        "Network",
        "High",
        "Switch port fault",
        "IT Support",
        "48",
      ],
      [
        "IT-102",
        "02-Sep-2025",
        "Gladiolus",
        "Banani",
        "Offline",
        "Outlook is crashing",
        "IT Support",
        "",
        "",
        "",
        "Software",
        "Low",
        "",
        "",
        "",
      ],
    ];
    const csv = Papa.unparse({ fields: headers, data: exampleData });
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", "it_timeline_template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setFeedback({
      message:
        "Template downloaded. The first 7 columns are required; the rest (Reported Time … Device Count) are optional but unlock response-time, SLA-style and per-device metrics.",
      type: "success",
    });
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setFeedback({ message: "Parsing and uploading data...", type: "info" });

    parseCSVRobustly(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results: any) => {
        const requiredHeaders = [
          "SL No",
          "Date",
          "Project Name",
          "Zone",
          "Status",
          "Assigned Issue",
          "Assigned To",
        ];
        const headers = results.meta.fields;

        if (!requiredHeaders.every((h) => headers.includes(h))) {
          setFeedback({
            message:
              "CSV is missing required headers. Please use the new template.",
            type: "error",
          });
          if (event.target) event.target.value = "";
          return;
        }

        const newAssignedIssues: ITAssignedIssue[] = [];
        let errorOccurred = false;
        const validStatuses: ITAssignedIssue["status"][] = ["Issue", "Offline"];
        const priorities = ["High", "Medium", "Low"] as const;
        const fail = (message: string) => {
          setFeedback({ message, type: "error" });
          errorOccurred = true;
        };

        for (const [index, row] of results.data.entries()) {
          if (errorOccurred) break;
          const rowNo = index + 2;

          for (const field of requiredHeaders) {
            if (!row[field]) {
              fail(`Row ${rowNo}: Missing data for required field "${field}".`);
              break;
            }
          }
          if (errorOccurred) continue;

          const reportedAt = parseDateFromCSV(row["Date"]);
          if (!reportedAt) {
            fail(`Row ${rowNo}: Invalid or unsupported 'Date' format: "${row["Date"]}".`);
            continue;
          }

          const status = row["Status"];
          if (!validStatuses.includes(status)) {
            fail(`Row ${rowNo}: Invalid status "${status}". Must be one of: Issue, Offline.`);
            continue;
          }

          // ── optional lifecycle columns ──
          const get = (h: string): string => (row[h] ?? "").toString().trim();

          const reportedTime = get("Reported Time");
          if (reportedTime && !/^([01]?\d|2[0-3]):[0-5]\d$/.test(reportedTime)) {
            fail(`Row ${rowNo}: 'Reported Time' must be HH:MM (24h), got "${reportedTime}".`);
            continue;
          }

          let acknowledgedAt: Date | null = null;
          if (get("Acknowledged At")) {
            acknowledgedAt = parseDateTimeFromCSV(get("Acknowledged At"));
            if (!acknowledgedAt) {
              fail(`Row ${rowNo}: Invalid 'Acknowledged At' value: "${get("Acknowledged At")}".`);
              continue;
            }
            if (acknowledgedAt.getTime() < reportedAt.getTime()) {
              fail(`Row ${rowNo}: 'Acknowledged At' is earlier than 'Date'.`);
              continue;
            }
          }

          let resolvedAt: Date | null = null;
          if (get("Resolved At")) {
            resolvedAt = parseDateTimeFromCSV(get("Resolved At"));
            if (!resolvedAt) {
              fail(`Row ${rowNo}: Invalid 'Resolved At' value: "${get("Resolved At")}".`);
              continue;
            }
            if (resolvedAt.getTime() < reportedAt.getTime()) {
              fail(`Row ${rowNo}: 'Resolved At' is earlier than 'Date'.`);
              continue;
            }
          }

          let priority: ITAssignedIssue["priority"] = null;
          if (get("Priority")) {
            priority = priorities.find((p) => p.toLowerCase() === get("Priority").toLowerCase()) ?? null;
            if (!priority) {
              fail(`Row ${rowNo}: Invalid 'Priority' "${get("Priority")}". Must be High, Medium or Low.`);
              continue;
            }
          }

          let deviceCount: number | null = null;
          if (get("Device Count")) {
            deviceCount = Number(get("Device Count"));
            if (!Number.isInteger(deviceCount) || deviceCount < 0) {
              fail(`Row ${rowNo}: 'Device Count' must be a whole number, got "${get("Device Count")}".`);
              continue;
            }
          }

          newAssignedIssues.push({
            id: row["SL No"],
            issue: row["Assigned Issue"],
            reportedAt,
            assignedTo: row["Assigned To"],
            status,
            projectName: row["Project Name"],
            zone: row["Zone"],
            reportedTime: reportedTime || null,
            acknowledgedAt,
            resolvedAt,
            category: get("Category") || null,
            priority,
            rootCause: get("Root Cause") || null,
            resolvedBy: get("Resolved By") || null,
            deviceCount,
          });
        }

        if (!errorOccurred && newAssignedIssues.length > 0) {
          try {
            const response = await fetch("/api/it-issues/bulk", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(
                newAssignedIssues.map((i) => ({
                  ...i,
                  reportedAt: i.reportedAt.toISOString(),
                  acknowledgedAt: i.acknowledgedAt ? i.acknowledgedAt.toISOString() : null,
                  resolvedAt: i.resolvedAt ? i.resolvedAt.toISOString() : null,
                })),
              ),
            });

            if (!response.ok) {
              const errTxt = await response.text();
              console.error("Server error response:", response.status, errTxt);
              throw new Error(
                `Failed to save to database: ${response.status} ${errTxt}`,
              );
            }

            const result = await response.json().catch(() => ({}));

            // Re-read from the server: rows that already existed were not inserted again, only enriched.
            const reload = await fetch("/api/it-issues");
            if (reload.ok) {
              const data = await reload.json();
              onUpdateAssignedIssues(
                _.orderBy(data.map(hydrateITIssue), ["reportedAt"], ["desc"]),
              );
            } else {
              onUpdateAssignedIssues(
                _.orderBy([...assignedIssues, ...newAssignedIssues], ["reportedAt"], ["desc"]),
              );
            }

            const inserted = result.inserted ?? newAssignedIssues.length;
            const parts = [`${inserted} new`];
            if (result.updated) parts.push(`${result.updated} existing updated with new details`);
            if (result.skipped) parts.push(`${result.skipped} already present (skipped)`);
            setFeedback({
              message: `Import complete: ${parts.join(", ")}.`,
              type: "success",
            });
          } catch (error) {
            setFeedback({
              message:
                error instanceof Error
                  ? error.message
                  : "Error saving imported records to database.",
              type: "error",
            });
            console.error(error);
          }
        }
      },
      error: (err: any) => {
        setFeedback({
          message: `Error parsing CSV: ${err.message}`,
          type: "error",
        });
      },
    });

    if (event.target) event.target.value = ""; // Reset file input
  };

  const handleClearRecords = async () => {
    if (
      window.confirm(
        "Are you sure you want to delete all IT timeline records? This action cannot be undone.",
      )
    ) {
      try {
        const response = await fetch("/api/it-issues", { method: "DELETE" });
        if (response.ok) {
          onUpdateAssignedIssues([]);
          setFeedback({
            message: "All records have been cleared from the database.",
            type: "info",
          });
        } else {
          setFeedback({
            message: "Error clearing database records.",
            type: "error",
          });
        }
      } catch (error) {
        setFeedback({
          message: "Network error while clearing records.",
          type: "error",
        });
        console.error(error);
      }
    }
  };

  const availableMonths = useMemo(() => {
    const months = _.uniq(
      cleanIssues.map((issue) => {
        const d = issue.reportedAt;
        return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
      }),
    )
      .sort()
      .reverse();
    return months;
  }, [cleanIssues]);

  return (
    <>
      <div className="px-4 sm:px-6 lg:px-8 pb-4 sm:pb-6 lg:pb-8">
        <div className="bg-white/40 backdrop-blur-md rounded-xl border border-white shadow-sm overflow-hidden text-slate-800">
          <div className="bg-transparent">
            {activeTab === "records" && (
              <ITRecordsTab
                currentUser={currentUser}
                filteredIssues={filteredIssues}
                statusFilter={statusFilter}
                onStatusFilterChange={setStatusFilter}
                monthFilter={monthFilter}
                onMonthFilterChange={setMonthFilter}
                availableMonths={availableMonths}
                searchQuery={searchQuery}
                onSearchQueryChange={setSearchQuery}
                fileInputRef={fileInputRef}
                onFileUpload={handleFileUpload}
                onDownloadTemplate={handleDownloadTemplate}
                onClearRecords={handleClearRecords}
                assignedIssuesCount={cleanIssues.length}
              />
            )}

            {activeTab === "analysis" && (
              <div className="fade-in">
                <ITAnalysisTab
                  analysisData={analysisData}
                  currentUser={currentUser}
                  availableMonths={availableMonths}
                  selectedMonth={monthFilter}
                  onMonthChange={setMonthFilter}
                  prevMonthSummary={prevMonthSummary}
                />
              </div>
            )}

            {activeTab === "credentials" && (
              <DeviceCredentialsTab currentUser={currentUser} />
            )}

            {activeTab === "camera-status" && (
              <CameraStatusTab currentUser={currentUser} />
            )}
          </div>
        </div>
      </div>
      {feedback && (
        <FeedbackMessage
          message={feedback.message}
          type={feedback.type}
          onDismiss={() => setFeedback(null)}
        />
      )}
    </>
  );
};

export default ITResponseTimeline;