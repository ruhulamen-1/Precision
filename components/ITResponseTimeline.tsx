import React, { useState, useMemo, useRef } from "react";
import FeedbackMessage from "./FeedbackMessage";
import _ from "lodash";
import Papa from "papaparse";
import { parseCSVRobustly } from "../utils/csvUtils";
import { ITAssignedIssue, ITResponseTimelineTab, User } from "../types";
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

  const filteredIssues = useMemo(() => {
    return assignedIssues.filter((assignedIssue) => {
      const statusMatch =
        !statusFilter || assignedIssue.status === statusFilter;
      const searchMatch =
        !searchQuery ||
        assignedIssue.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        assignedIssue.issue.toLowerCase().includes(searchQuery.toLowerCase()) ||
        assignedIssue.projectName
          .toLowerCase()
          .includes(searchQuery.toLowerCase()) ||
        assignedIssue.zone.toLowerCase().includes(searchQuery.toLowerCase()) ||
        assignedIssue.assignedTo
          .toLowerCase()
          .includes(searchQuery.toLowerCase());

      let monthMatch = true;
      if (monthFilter !== "all") {
        const issueDate = assignedIssue.reportedAt;
        const issueMonth = `${issueDate.getUTCFullYear()}-${String(issueDate.getUTCMonth() + 1).padStart(2, "0")}`;
        monthMatch = issueMonth === monthFilter;
      }

      return statusMatch && searchMatch && monthMatch;
    });
  }, [assignedIssues, statusFilter, searchQuery, monthFilter]);

  const analysisData = useMemo(() => {
    if (filteredIssues.length === 0) return null;

    const mostRecentDateInDataset = _.maxBy(
      filteredIssues,
      "reportedAt",
    )?.reportedAt;

    // Build a set of issue+project keys that appear in months AFTER the selected month.
    // If an "Ongoing" issue has NO record in any future month, it was actually resolved
    // by end of the selected month — we treat it as Resolved.
    const nextMonthIssueKeys = new Set(
      assignedIssues
        .filter((i) => {
          const m = `${i.reportedAt.getUTCFullYear()}-${String(i.reportedAt.getUTCMonth() + 1).padStart(2, "0")}`;
          return m > monthFilter;
        })
        .map((i) => `${i.issue}|${i.projectName}`)
    );
    // Last calendar day of the selected month (used as implied resolution date)
    const [_selYear, _selMon] = monthFilter.split("-").map(Number);
    const lastDayOfMonth = new Date(Date.UTC(_selYear, _selMon, 0)); // day=0 trick

    const zoneDetails = _.chain(filteredIssues)
      .groupBy("zone")
      .map((issuesInZone, zoneName) => {
        return {
          zone: zoneName,
          count: issuesInZone.length,
          projects: _.uniq(
            issuesInZone.map((issue) => issue.projectName),
          ).sort(),
        };
      })
      .orderBy(["count"], ["desc"])
      .value();

    const statusSummary = _.countBy(filteredIssues, "status");
    const projectSummary = _.countBy(filteredIssues, "projectName");

    // New calculation for top 5 common problems with details
    const issuesByDescription = _.groupBy(filteredIssues, "issue");
    const top5CommonProblems = _.chain(Object.entries(issuesByDescription))
      .map(([issue, issues]) => {
        const latestIssue = _.maxBy(issues, "reportedAt");
        const latestProjectName = latestIssue?.projectName || "N/A";
        const projectSpecificCount = issues.filter(
          (i) => i.projectName === latestProjectName,
        ).length;
        return {
          issue: issue,
          count: issues.length,
          latestProject: latestProjectName,
          latestDate: latestIssue?.reportedAt || null,
          projectSpecificCount: projectSpecificCount,
        };
      })
      .orderBy(["count"], ["desc"])
      .slice(0, 5)
      .value();

    const issueTimelineData = _.chain(filteredIssues)
      .groupBy((t) => `${t.issue}|${t.projectName}`)
      .map((groupedIssues, issueAndProject) => {
        const [issue, projectName] = issueAndProject.split("|");

        const uniqueDates = _.uniqBy(groupedIssues, (t) =>
          t.reportedAt.getTime(),
        )
          .map((t) => t.reportedAt)
          .sort((a, b) => a.getTime() - b.getTime());

        const timelines: { start: Date; end: Date }[] = [];
        let totalActiveDays = 0;

        if (uniqueDates.length > 0) {
          let currentTimeline = { start: uniqueDates[0], end: uniqueDates[0] };
          for (let i = 1; i < uniqueDates.length; i++) {
            const prevDate = uniqueDates[i - 1];
            const currentDate = uniqueDates[i];
            const diffDays =
              (currentDate.getTime() - prevDate.getTime()) / (1000 * 3600 * 24);
            if (diffDays === 1) {
              currentTimeline.end = currentDate;
            } else {
              timelines.push(currentTimeline);
              currentTimeline = { start: currentDate, end: currentDate };
            }
          }
          timelines.push(currentTimeline);
          totalActiveDays = timelines.reduce(
            (sum, tl) =>
              sum +
              ((tl.end.getTime() - tl.start.getTime()) / (1000 * 3600 * 24) +
                1),
            0,
          );
        }

        let solutionDate: Date | string | null = null;
        let resolutionTimeInDays: number | null = null;

        if (timelines.length > 0 && mostRecentDateInDataset) {
          const latestTimeline = timelines[timelines.length - 1];
          const isOngoing =
            latestTimeline.end.getTime() === mostRecentDateInDataset.getTime();

          if (isOngoing) {
            solutionDate = "Ongoing";
            resolutionTimeInDays =
              Math.ceil(
                (mostRecentDateInDataset.getTime() -
                  latestTimeline.start.getTime()) /
                  (1000 * 3600 * 24),
              ) + 1;
          } else {
            const resolvedDate = new Date(latestTimeline.end.getTime());
            resolvedDate.setUTCDate(resolvedDate.getUTCDate() + 1);
            solutionDate = resolvedDate;
            resolutionTimeInDays = Math.ceil(
              (solutionDate.getTime() - latestTimeline.start.getTime()) /
                (1000 * 3600 * 24),
            );
          }
        }

        return {
          issue,
          projectName,
          count: groupedIssues.length,
          timelines,
          totalActiveDays,
          firstReported: uniqueDates.length > 0 ? uniqueDates[0] : null,
          lastReported:
            uniqueDates.length > 0 ? uniqueDates[uniqueDates.length - 1] : null,
          solutionDate,
          resolutionTimeInDays,
        };
      })
      .orderBy("count", "desc")
      .value();

    // --- New Summary Metrics ---
    const resolvedIssues = issueTimelineData.filter(
      (t) =>
        typeof t.resolutionTimeInDays === "number" &&
        t.solutionDate !== "Ongoing",
    );
    const averageResolutionTime =
      resolvedIssues.length > 0
        ? _.meanBy(resolvedIssues, "resolutionTimeInDays")
        : 0;

    const ongoingIssues = issueTimelineData.filter(
      (t) => t.solutionDate === "Ongoing",
    );
    const longestOpenIssue = _.maxBy(ongoingIssues, "resolutionTimeInDays");

    const mostFrequentIssue =
      issueTimelineData.length > 0 ? issueTimelineData[0] : null;

    return {
      totalAssignedIssues: filteredIssues.length,
      issueCount: statusSummary["Issue"] || 0,
      offlineCount: statusSummary["Offline"] || 0,
      zoneSummary: zoneDetails,
      projectSummary: _.orderBy(
        Object.entries(projectSummary),
        ([_project, count]) => count,
        ["desc"],
      ),
      top5CommonProblems,
      issueTimeline: issueTimelineData,
      // New summary data
      averageResolutionTime,
      longestOpenIssue,
      mostFrequentIssue,
    };
  }, [filteredIssues]);

  const handleDownloadTemplate = () => {
    const headers = [
      "SL No",
      "Date",
      "Project Name",
      "Zone",
      "Status",
      "Assigned Issue",
      "Assigned To",
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
      ],
      [
        "IT-102",
        "02-Sep-2025",
        "Gladiolus",
        "Banani",
        "Offline",
        "Outlook is crashing",
        "IT Support",
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
      message: "Template downloaded successfully!",
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

        for (const [index, row] of results.data.entries()) {
          if (errorOccurred) break;

          for (const field of requiredHeaders) {
            if (!row[field]) {
              setFeedback({
                message: `Row ${index + 2}: Missing data for required field "${field}".`,
                type: "error",
              });
              errorOccurred = true;
              break;
            }
          }
          if (errorOccurred) continue;

          const reportedAt = parseDateFromCSV(row["Date"]);
          if (!reportedAt) {
            setFeedback({
              message: `Row ${index + 2}: Invalid or unsupported 'Date' format: "${row["Date"]}".`,
              type: "error",
            });
            errorOccurred = true;
            continue;
          }

          const status = row["Status"];
          if (!validStatuses.includes(status)) {
            setFeedback({
              message: `Row ${index + 2}: Invalid status "${status}". Must be one of: Issue, Offline.`,
              type: "error",
            });
            errorOccurred = true;
            continue;
          }

          newAssignedIssues.push({
            id: row["SL No"],
            issue: row["Assigned Issue"],
            reportedAt,
            assignedTo: row["Assigned To"],
            status,
            projectName: row["Project Name"],
            zone: row["Zone"],
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

            const updatedIssues = _.orderBy(
              [...assignedIssues, ...newAssignedIssues],
              ["reportedAt"],
              ["desc"],
            );
            onUpdateAssignedIssues(updatedIssues);
            setFeedback({
              message: `Successfully imported and saved ${newAssignedIssues.length} assigned issues.`,
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
      assignedIssues.map((issue) => {
        const d = issue.reportedAt;
        return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
      }),
    )
      .sort()
      .reverse();
    return months;
  }, [assignedIssues]);

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
                assignedIssuesCount={assignedIssues.length}
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
                  allIssues={assignedIssues}
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